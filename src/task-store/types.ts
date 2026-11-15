/** A named group of Tasks (see GLOSSARY.md). */
export interface List {
  id: string;
  name: string;
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
export interface StorageAdapter {
  listLists(): Promise<List[]>;
  listTasks(listId: string): Promise<Task[]>;
  insertTask(input: { listId: string; title: string }): Promise<Task>;
  insertList(name: string): Promise<List>;
  updateListName(listId: string, name: string): Promise<void>;
  /** Deletes the List and, by cascade, all of its Tasks. */
  deleteList(listId: string): Promise<void>;
  updateTaskList(taskId: string, listId: string): Promise<void>;
}
