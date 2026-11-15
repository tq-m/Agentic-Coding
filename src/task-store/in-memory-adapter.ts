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
  let listSeq = 1;

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
    async insertList(name) {
      if (failing) throw new Error("save failed");
      const list: List = { id: `list-${++listSeq}`, name };
      lists.push(list);
      return { ...list };
    },
    async updateListName(listId, name) {
      if (failing) throw new Error("save failed");
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error("List not found");
      list.name = name;
    },
    async deleteList(listId) {
      if (failing) throw new Error("save failed");
      const i = lists.findIndex((l) => l.id === listId);
      if (i < 0) throw new Error("List not found");
      lists.splice(i, 1);
      // Mirrors the database's ON DELETE CASCADE.
      for (let j = tasks.length - 1; j >= 0; j--) if (tasks[j].listId === listId) tasks.splice(j, 1);
    },
    async updateTaskList(taskId, listId) {
      if (failing) throw new Error("save failed");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("Task not found");
      if (!lists.some((l) => l.id === listId)) throw new Error("List not found");
      task.listId = listId;
    },
  };
}
