import type { List, StorageAdapter, Task } from "./types";

export const INBOX_NAME = "Inbox";

/** Thrown by an edit while the connection is down. Nothing was saved. */
export class OfflineError extends Error {
  constructor() {
    super("Offline, can't save");
    this.name = "OfflineError";
  }
}

/** A Task as shown to the owner: with its Overdue state worked out. */
export interface TaskView extends Task {
  /** An open Task whose due date is before today (see GLOSSARY.md). */
  overdue: boolean;
}

export interface TaskInput {
  title?: string;
  /** `YYYY-MM-DD`, or null/"" for none. */
  dueDate?: string | null;
  note?: string | null;
}

export interface TaskStoreOptions {
  /** Today's date as `YYYY-MM-DD`. Injected so Overdue is testable. */
  today?: () => string;
}

const localToday = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function cleanDueDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.toISOString().slice(0, 10) !== value) {
    throw new Error("A due date must be a real date (YYYY-MM-DD)");
  }
  return value;
}

const cleanNote = (value: string | null | undefined): string | null =>
  value?.trim() ? value.trim() : null;

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("A Task needs a title");
  return trimmed;
}

/** Due date ascending, undated last, then creation time. */
function byDueThenCreated(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

export function createTaskStore(adapter: StorageAdapter, options: TaskStoreOptions = {}) {
  const today = options.today ?? localToday;
  const view = (t: Task): TaskView => ({
    ...t,
    overdue: !t.done && t.dueDate !== null && t.dueDate < today(),
  });

  let online = true;
  const listeners = new Set<() => void>();
  let stopListening: (() => void) | null = null;

  const notify = () => listeners.forEach((l) => l());
  const requireOnline = () => {
    if (!online) throw new OfflineError();
  };

  /** Trimmed List name; rejects blank names and names already used by another List. */
  async function validListName(name: string, exceptListId?: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A List needs a name");
    const taken = (await adapter.listLists()).some(
      (l) => l.id !== exceptListId && l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) throw new Error("A List with that name already exists");
    return trimmed;
  }

  return {
    lists(): Promise<List[]> {
      return adapter.listLists();
    },

    /** The default List that exists from the start. */
    async inbox(): Promise<List> {
      const inbox = (await adapter.listLists()).find((l) => l.name === INBOX_NAME);
      if (!inbox) throw new Error("Inbox List is missing");
      return inbox;
    },

    async createList(name: string): Promise<List> {
      requireOnline();
      const trimmed = await validListName(name);
      return adapter.insertList(trimmed);
    },

    /** The Inbox cannot be renamed: it is found by its name. */
    async renameList(listId: string, name: string): Promise<void> {
      requireOnline();
      const trimmed = await validListName(name, listId);
      const list = (await adapter.listLists()).find((l) => l.id === listId);
      if (!list) throw new Error("List not found");
      if (list.name === INBOX_NAME) throw new Error("The Inbox cannot be renamed");
      await adapter.updateListName(listId, trimmed);
    },

    /** Deletes a List and its Tasks. The Inbox cannot be deleted. */
    async deleteList(listId: string): Promise<void> {
      requireOnline();
      const list = (await adapter.listLists()).find((l) => l.id === listId);
      if (!list) throw new Error("List not found");
      if (list.name === INBOX_NAME) throw new Error("The Inbox cannot be deleted");
      await adapter.deleteList(listId);
    },

    /** True when the List holds any Task, open or Done (screens confirm before deleting it). */
    async listHasTasks(listId: string): Promise<boolean> {
      return (await adapter.listTasks(listId)).length > 0;
    },

    async moveTask(taskId: string, listId: string): Promise<void> {
      requireOnline();
      if (!(await adapter.listLists()).some((l) => l.id === listId)) {
        throw new Error("List not found");
      }
      await adapter.updateTaskList(taskId, listId);
    },

    async addTask(listId: string, title: string, extras: Omit<TaskInput, "title"> = {}): Promise<Task> {
      requireOnline();
      const clean = cleanTitle(title);
      const dueDate = cleanDueDate(extras.dueDate);
      return adapter.insertTask({ listId, title: clean, dueDate, note: cleanNote(extras.note) });
    },

    /** Change a Task's title, due date or note. Fields left out stay as they are. */
    async editTask(id: string, changes: TaskInput): Promise<Task> {
      requireOnline();
      const patch: { title?: string; dueDate?: string | null; note?: string | null } = {};
      if (changes.title !== undefined) patch.title = cleanTitle(changes.title);
      if (changes.dueDate !== undefined) patch.dueDate = cleanDueDate(changes.dueDate);
      if (changes.note !== undefined) patch.note = cleanNote(changes.note);
      return adapter.updateTask(id, patch);
    },

    /** Mark a Task Done. It is kept, not deleted. */
    async tick(id: string): Promise<Task> {
      requireOnline();
      return adapter.updateTask(id, { done: true });
    },

    /** Reopen a Done Task. */
    async untick(id: string): Promise<Task> {
      requireOnline();
      return adapter.updateTask(id, { done: false });
    },

    /** Permanently remove a Task, open or Done. */
    async deleteTask(id: string): Promise<void> {
      requireOnline();
      return adapter.deleteTask(id);
    },

    /** Open Tasks of a List: due date soonest first, undated last, then creation time. */
    async openTasks(listId: string): Promise<TaskView[]> {
      const tasks = await adapter.listTasks(listId);
      return tasks
        .filter((t) => !t.done)
        .sort(byDueThenCreated)
        .map(view);
    },

    /** Done Tasks of a List, in creation order. */
    async doneTasks(listId: string): Promise<TaskView[]> {
      const tasks = await adapter.listTasks(listId);
      return tasks
        .filter((t) => t.done)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(view);
    },

    /** False while the connection is down: edits are blocked and the offline banner should show. */
    isOnline(): boolean {
      return online;
    },

    /**
     * Be told when Tasks or Lists changed elsewhere, and when the connection
     * drops or returns (re-read then to see the current state). Returns an unsubscribe.
     */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      stopListening ??= adapter.subscribe({
        onChange: notify,
        onConnection(next) {
          online = next;
          notify();
        },
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopListening?.();
          stopListening = null;
        }
      };
    },
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;
