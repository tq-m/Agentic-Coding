import type { ChangeHandlers, List, StorageAdapter, Task, TaskPatch } from "./types";

export interface InMemoryAdapter extends StorageAdapter {
  /** Test control: make the next writes fail (simulates a failed save). */
  failWrites(fail: boolean): void;
  /** Test control: the connection drops (false) or returns (true). Reads and writes fail while it is down. */
  setConnected(connected: boolean): void;
  /** Test control: things another device does. Changes made while the connection is down are not announced live. */
  otherDevice: { addTask(listId: string, title: string): void };
}

/** In-memory fake of the storage adapter, seeded with the Inbox List like the database. */
export function createInMemoryAdapter(): InMemoryAdapter {
  const lists: List[] = [{ id: "list-inbox", name: "Inbox" }];
  const tasks: Task[] = [];
  let failing = false;
  let clock = 0;
  let connected = true;
  const subscribers = new Set<ChangeHandlers>();
  let nextId = 1;

  function insert(listId: string, title: string, dueDate: string | null = null, note: string | null = null): Task {
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
    return task;
  }
  const requireConnection = () => {
    if (!connected) throw new Error("offline");
  };
  let listSeq = 1;

  return {
    failWrites(fail) {
      failing = fail;
    },
    setConnected(next) {
      if (next === connected) return;
      connected = next;
      subscribers.forEach((h) => h.onConnection(next));
    },
    otherDevice: {
      addTask(listId, title) {
        insert(listId, title);
        if (connected) subscribers.forEach((h) => h.onChange());
      },
    },
    subscribe(handlers) {
      subscribers.add(handlers);
      return () => void subscribers.delete(handlers);
    },
    async listLists() {
      requireConnection();
      return lists.map((l) => ({ ...l }));
    },
    async listTasks(listId) {
      requireConnection();
      return tasks.filter((t) => t.listId === listId).map((t) => ({ ...t }));
    },
    async insertTask({ listId, title, dueDate = null, note = null }) {
      requireConnection();
      if (failing) throw new Error("save failed");
      return { ...insert(listId, title, dueDate, note) };
    },
    async updateTask(id, patch: TaskPatch) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error("Task not found");
      Object.assign(task, patch);
      return { ...task };
    },
    async deleteTask(id) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const i = tasks.findIndex((t) => t.id === id);
      if (i < 0) throw new Error("Task not found");
      tasks.splice(i, 1);
    },
    async insertList(name) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const list: List = { id: `list-${++listSeq}`, name };
      lists.push(list);
      return { ...list };
    },
    async updateListName(listId, name) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const list = lists.find((l) => l.id === listId);
      if (!list) throw new Error("List not found");
      list.name = name;
    },
    async deleteList(listId) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const i = lists.findIndex((l) => l.id === listId);
      if (i < 0) throw new Error("List not found");
      lists.splice(i, 1);
      // Mirrors the database's ON DELETE CASCADE.
      for (let j = tasks.length - 1; j >= 0; j--) if (tasks[j].listId === listId) tasks.splice(j, 1);
    },
    async updateTaskList(taskId, listId) {
      requireConnection();
      if (failing) throw new Error("save failed");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("Task not found");
      if (!lists.some((l) => l.id === listId)) throw new Error("List not found");
      task.listId = listId;
    },
  };
}
