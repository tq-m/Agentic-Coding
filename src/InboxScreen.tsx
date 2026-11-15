import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TaskStore } from "./task-store/task-store";
import type { List, Task } from "./task-store/types";

export function InboxScreen({ store }: { store: TaskStore }) {
  const [inbox, setInbox] = useState<List | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await store.inbox();
      setInbox(list);
      setTasks(await store.openTasks(list.id));
    } catch {
      setError("Couldn't load your Tasks.");
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!inbox || !title.trim()) return;
    try {
      await store.addTask(inbox.id, title);
      setTitle("");
      setError(null);
      setTasks(await store.openTasks(inbox.id));
    } catch {
      setError("Couldn't save the Task. What you typed is kept; try again.");
    }
  }

  return (
    <section>
      <h2>Inbox</h2>
      <form onSubmit={add}>
        <input
          aria-label="New Task title"
          placeholder="Add a Task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />{" "}
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {tasks.length === 0 ? (
        <p>No Tasks yet.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
