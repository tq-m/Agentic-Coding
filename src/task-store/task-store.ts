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
      if (!online) throw new OfflineError();
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
