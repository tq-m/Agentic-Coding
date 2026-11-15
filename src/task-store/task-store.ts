import type { List, StorageAdapter, Task } from "./types";

export const INBOX_NAME = "Inbox";

/** Thrown by an edit while the connection is down. Nothing was saved. */
export class OfflineError extends Error {
  constructor() {
    super("Offline, can't save");
    this.name = "OfflineError";
  }
}

export function createTaskStore(adapter: StorageAdapter) {
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

    async addTask(listId: string, title: string): Promise<Task> {
      requireOnline();
      const trimmed = title.trim();
      if (!trimmed) throw new Error("A Task needs a title");
      return adapter.insertTask({ listId, title: trimmed });
    },

    /** Open Tasks of a List, in creation order. */
    async openTasks(listId: string): Promise<Task[]> {
      const tasks = await adapter.listTasks(listId);
      return tasks
        .filter((t) => !t.done)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
