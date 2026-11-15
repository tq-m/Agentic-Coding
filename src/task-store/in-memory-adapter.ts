import type { List, StorageAdapter, Task, TaskPatch } from "./types";

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
  let nextId = 1;

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
    async insertTask({ listId, title, dueDate = null, note = null }) {
      if (failing) throw new Error("save failed");
      const task: Task = {
        id: `task-${nextId++}`,
        listId,
        title,
        dueDate,
        note,
        done: false,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString(),
      };
      tasks.push(task);
      return { ...task };
    },
    async updateTask(id, patch: TaskPatch) {
      if (failing) throw new Error("save failed");
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error("Task not found");
      Object.assign(task, patch);
      return { ...task };
    },
    async deleteTask(id) {
      if (failing) throw new Error("save failed");
      const i = tasks.findIndex((t) => t.id === id);
      if (i < 0) throw new Error("Task not found");
      tasks.splice(i, 1);
    },
  };
}
