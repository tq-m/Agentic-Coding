import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TaskStore, TaskView } from "./task-store/task-store";
import type { List } from "./task-store/types";

const SAVE_ERROR = "Couldn't save. What you typed is kept; try again.";

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  onToggle: (t: TaskView) => Promise<void>;
  onEdit: (t: TaskView, c: { title: string; dueDate: string; note: string }) => Promise<boolean>;
  onDelete: (t: TaskView) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [note, setNote] = useState(task.note ?? "");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (await onEdit(task, { title, dueDate, note })) setEditing(false);
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={save}>
          <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />{" "}
          <input aria-label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />{" "}
          <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />{" "}
          <button type="submit">Save</button>{" "}
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li style={task.overdue ? { color: "#b00020", fontWeight: 600 } : undefined}>
      <input
        type="checkbox"
        aria-label={`Done: ${task.title}`}
        checked={task.done}
        onChange={() => void onToggle(task)}
      />{" "}
      <span style={task.done ? { textDecoration: "line-through" } : undefined}>{task.title}</span>
      {task.dueDate && (
        <small>
          {" "}
          · due {task.dueDate}
          {task.overdue && " (Overdue)"}
        </small>
      )}
      {task.note && <small> · {task.note}</small>}{" "}
      <button type="button" onClick={() => setEditing(true)}>
        Edit
      </button>{" "}
      <button type="button" onClick={() => void onDelete(task)}>
        Delete
      </button>
    </li>
  );
}

export function InboxScreen({ store }: { store: TaskStore }) {
  const [inbox, setInbox] = useState<List | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [done, setDone] = useState<TaskView[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (list: List) => {
      setTasks(await store.openTasks(list.id));
      setDone(await store.doneTasks(list.id));
    },
    [store],
  );

  const load = useCallback(async () => {
    try {
      const list = await store.inbox();
      setInbox(list);
      await refresh(list);
    } catch {
      setError("Couldn't load your Tasks.");
    }
  }, [store, refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a save; on failure show the error and report false so the caller keeps the input. */
  async function save(action: () => Promise<unknown>): Promise<boolean> {
    if (!inbox) return false;
    try {
      await action();
      setError(null);
    } catch {
      setError(SAVE_ERROR);
      return false;
    }
    try {
      await refresh(inbox);
    } catch {
      setError("Saved, but couldn't reload your Tasks.");
    }
    return true;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!inbox || !title.trim()) return;
    if (await save(() => store.addTask(inbox.id, title, { dueDate, note }))) {
      setTitle("");
      setDueDate("");
      setNote("");
    }
  }

  const toggle = (t: TaskView) => save(() => (t.done ? store.untick(t.id) : store.tick(t.id))).then(() => {});
  const edit = (t: TaskView, c: { title: string; dueDate: string; note: string }) =>
    save(() => store.editTask(t.id, c));
  const remove = (t: TaskView) => save(() => store.deleteTask(t.id)).then(() => {});

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
        <input aria-label="New Task due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />{" "}
        <input
          aria-label="New Task note"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />{" "}
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {tasks.length === 0 ? (
        <p>No Tasks yet.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={edit} onDelete={remove} />
          ))}
        </ul>
      )}
      <details>
        <summary>Done ({done.length})</summary>
        <ul>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={toggle} onEdit={edit} onDelete={remove} />
          ))}
        </ul>
      </details>
    </section>
  );
}
