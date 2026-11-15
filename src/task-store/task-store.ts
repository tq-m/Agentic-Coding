import type { List, StorageAdapter, Task } from "./types";

export const INBOX_NAME = "Inbox";

export function createTaskStore(adapter: StorageAdapter) {
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

    async addTask(listId: string, title: string): Promise<Task> {
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
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;
