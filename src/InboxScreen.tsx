import { useCallback, useState, type FormEvent } from "react";
import { useLiveReload, useOnline } from "./live";
import type { TaskStore } from "./task-store/task-store";
import type { List, Task } from "./task-store/types";

/** Tasks of the List being viewed. New Tasks go into this List. */
export function InboxScreen({ store, list, lists }: { store: TaskStore; list: List; lists: List[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await store.openTasks(list.id));
      setError(null);
    } catch {
      setError("Couldn't load your Tasks.");
    }
  }, [store, list.id]);

  useLiveReload(store, () => void load());
  const online = useOnline(store);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await store.addTask(list.id, title);
      setTitle("");
      setError(null);
      await load();
    } catch {
      setError("Couldn't save the Task. What you typed is kept; try again.");
    }
  }

  async function move(task: Task, listId: string) {
    try {
      await store.moveTask(task.id, listId);
      setError(null);
      await load();
    } catch {
      setError("Couldn't move the Task. Try again.");
    }
  }

  return (
    <section>
      <form onSubmit={add}>
        <input
          aria-label="New Task title"
          placeholder="Add a Task"
          value={title}
          disabled={!online}
          onChange={(e) => setTitle(e.target.value)}
        />{" "}
        <button type="submit" disabled={!online}>
          Add
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {tasks.length === 0 ? (
        <p>No Tasks yet.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              {t.title}{" "}
              <select
                aria-label={`Move "${t.title}" to`}
                value=""
                onChange={(e) => e.target.value && void move(t, e.target.value)}
              >
                <option value="">Move to...</option>
                {lists
                  .filter((l) => l.id !== list.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
