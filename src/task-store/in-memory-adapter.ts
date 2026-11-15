import type { List, StorageAdapter, Task } from "./types";

export interface InMemoryAdapter extends StorageAdapter {
  /** Test control: make the next writes fail (simulates a failed save). */
  failWrites(fail: boolean): void;
}

/** In-memory fake of the storage adapter, seeded with the Inbox List like the database. */
export function createInMemoryAdapter(): InMemoryAdapter {
  const lists: List[] = [{ id: "list-inbox", name: "Inbox" }];
  const tasks: Task[] = [];
  let failing = false;
  let clock = 0;

  return {
    failWrites(fail) {
      failing = fail;
    },
    async listLists() {
      return lists.map((l) => ({ ...l }));
    },
    async listTasks(listId) {
      return tasks.filter((t) => t.listId === listId).map((t) => ({ ...t }));
    },
    async insertTask({ listId, title }) {
      if (failing) throw new Error("save failed");
      const task: Task = {
        id: `task-${tasks.length + 1}`,
        listId,
        title,
        dueDate: null,
        note: null,
        done: false,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString(),
      };
      tasks.push(task);
      return { ...task };
    },
  };
}
