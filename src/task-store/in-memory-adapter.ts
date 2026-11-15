import type { ChangeHandlers, List, StorageAdapter, Task } from "./types";

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

  function insert(listId: string, title: string): Task {
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
    return task;
  }
  const requireConnection = () => {
    if (!connected) throw new Error("offline");
  };

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
    async insertTask({ listId, title }) {
      requireConnection();
      if (failing) throw new Error("save failed");
      return { ...insert(listId, title) };
    },
  };
}
