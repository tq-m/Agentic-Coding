import type { List, StorageAdapter, Task } from "./types";

export const INBOX_NAME = "Inbox";

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

    async addTask(listId: string, title: string, extras: Omit<TaskInput, "title"> = {}): Promise<Task> {
      const clean = cleanTitle(title);
      const dueDate = cleanDueDate(extras.dueDate);
      return adapter.insertTask({ listId, title: clean, dueDate, note: cleanNote(extras.note) });
    },

    /** Change a Task's title, due date or note. Fields left out stay as they are. */
    async editTask(id: string, changes: TaskInput): Promise<Task> {
      const patch: { title?: string; dueDate?: string | null; note?: string | null } = {};
      if (changes.title !== undefined) patch.title = cleanTitle(changes.title);
      if (changes.dueDate !== undefined) patch.dueDate = cleanDueDate(changes.dueDate);
      if (changes.note !== undefined) patch.note = cleanNote(changes.note);
      return adapter.updateTask(id, patch);
    },

    /** Mark a Task Done. It is kept, not deleted. */
    tick(id: string): Promise<Task> {
      return adapter.updateTask(id, { done: true });
    },

    /** Reopen a Done Task. */
    untick(id: string): Promise<Task> {
      return adapter.updateTask(id, { done: false });
    },

    /** Permanently remove a Task, open or Done. */
    deleteTask(id: string): Promise<void> {
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
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;
