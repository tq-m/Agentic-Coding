import { useCallback, useState, type FormEvent } from "react";
import { useLiveReload, useOnline } from "./live";
import type { TaskStore, TaskView } from "./task-store/task-store";
import type { List } from "./task-store/types";

const SAVE_ERROR = "Couldn't save. What you typed is kept; try again.";

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  moveTargets,
  onMove,
  online,
}: {
  task: TaskView;
  onToggle: (t: TaskView) => Promise<void>;
  onEdit: (t: TaskView, c: { title: string; dueDate: string; note: string }) => Promise<boolean>;
  onDelete: (t: TaskView) => Promise<void>;
  moveTargets: List[];
  onMove: (t: TaskView, listId: string) => Promise<void>;
  online: boolean;
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
          <input aria-label="Title" disabled={!online} value={title} onChange={(e) => setTitle(e.target.value)} />{" "}
          <input aria-label="Due date" type="date" disabled={!online} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />{" "}
          <input aria-label="Note" disabled={!online} value={note} onChange={(e) => setNote(e.target.value)} />{" "}
          <button type="submit" disabled={!online}>
            Save
          </button>{" "}
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
        disabled={!online}
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
      <button type="button" disabled={!online} onClick={() => setEditing(true)}>
        Edit
      </button>{" "}
      <button type="button" disabled={!online} onClick={() => void onDelete(task)}>
        Delete
      </button>{" "}
      <select
        aria-label={`Move "${task.title}" to`}
        value=""
        disabled={!online}
        onChange={(e) => e.target.value && void onMove(task, e.target.value)}
      >
        <option value="">Move to...</option>
        {moveTargets.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </li>
  );
}

/** Tasks of the List being viewed. New Tasks go into this List. */
export function InboxScreen({ store, list, lists }: { store: TaskStore; list: List; lists: List[] }) {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [done, setDone] = useState<TaskView[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setTasks(await store.openTasks(list.id));
    setDone(await store.doneTasks(list.id));
  }, [store, list.id]);

  const load = useCallback(async () => {
    try {
      await refresh();
      setError(null);
    } catch {
      setError("Couldn't load your Tasks.");
    }
  }, [refresh]);

  useLiveReload(store, () => void load());
  const online = useOnline(store);

  /** Run a save; on failure show the error and report false so the caller keeps the input. */
  async function save(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      setError(null);
    } catch {
      setError(SAVE_ERROR);
      return false;
    }
    try {
      await refresh();
    } catch {
      setError("Saved, but couldn't reload your Tasks.");
    }
    return true;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await save(() => store.addTask(list.id, title, { dueDate, note }))) {
      setTitle("");
      setDueDate("");
      setNote("");
    }
  }

  const toggle = (t: TaskView) => save(() => (t.done ? store.untick(t.id) : store.tick(t.id))).then(() => {});
  const edit = (t: TaskView, c: { title: string; dueDate: string; note: string }) =>
    save(() => store.editTask(t.id, c));
  const remove = (t: TaskView) => save(() => store.deleteTask(t.id)).then(() => {});
  const move = (t: TaskView, listId: string) => save(() => store.moveTask(t.id, listId)).then(() => {});
  const moveTargets = lists.filter((l) => l.id !== list.id);
  const row = (t: TaskView) => (
    <TaskRow
      key={t.id}
      task={t}
      onToggle={toggle}
      onEdit={edit}
      onDelete={remove}
      moveTargets={moveTargets}
      onMove={move}
      online={online}
    />
  );

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
      await refresh();
      </form>
      {error && <p role="alert">{error}</p>}
      {tasks.length === 0 ? (
        <p>No Tasks yet.</p>
      ) : (
        <ul>
          {tasks.map(row)}
        </ul>
      )}
      <details>
        <summary>Done ({done.length})</summary>
        <ul>
          {done.map(row)}
        </ul>
      </details>
    </section>
  );
}
