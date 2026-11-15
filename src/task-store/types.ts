/** A named group of Tasks (see GLOSSARY.md). */
export interface List {
  id: string;
  name: string;
  /** True for the default List that cannot be renamed or deleted. */
  isInbox: boolean;
}

/** A single thing to do. Belongs to exactly one List. */
export interface Task {
  id: string;
  listId: string;
  title: string;
  /** Date only, `YYYY-MM-DD`. */
  dueDate: string | null;
  note: string | null;
  done: boolean;
  /** ISO timestamp, assigned by the storage adapter. */
  createdAt: string;
}

/**
 * Thin storage boundary. No rules live behind it: it only reads and writes
 * rows. Implementations throw when a read or write fails.
 */
export interface ChangeHandlers {
  /** Something changed on another device (or this one). Re-read to see it. */
  onChange(): void;
  /** The live connection came up (true) or dropped (false). */
  onConnection(online: boolean): void;
}

export interface StorageAdapter {
  /**
   * Start listening for live changes. Reports the connection state as it
   * changes and re-establishes the listening itself after a drop; reports
   * `onConnection(true)` once it is back. Returns a function that stops it.
   */
  subscribe(handlers: ChangeHandlers): () => void;
  listLists(): Promise<List[]>;
  /** One List by id, or null when it does not exist. */
  getList(listId: string): Promise<List | null>;
  listTasks(listId: string): Promise<Task[]>;
  /** How many Tasks (open or Done) a List holds, without downloading them. */
  countTasks(listId: string): Promise<number>;
  insertTask(input: {
    listId: string;
    title: string;
    dueDate?: string | null;
    note?: string | null;
  }): Promise<Task>;
  /** Apply a partial change to one Task and return the saved Task. */
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  /** Permanently remove one Task. */
  deleteTask(id: string): Promise<void>;
  insertList(name: string): Promise<List>;
  updateListName(listId: string, name: string): Promise<void>;
  /** Deletes the List and, by cascade, all of its Tasks. */
  deleteList(listId: string): Promise<void>;
  updateTaskList(taskId: string, listId: string): Promise<void>;
}

export interface TaskPatch {
  title?: string;
  dueDate?: string | null;
  note?: string | null;
  done?: boolean;
}
