import { useCallback, useState, type FormEvent } from "react";
import type { TaskStore } from "./task-store/task-store";
import type { List } from "./task-store/types";
import { InboxScreen } from "./InboxScreen";
import { OfflineBanner, useLiveReload, useOnline } from "./live";

/** List switcher and List management. Rules live in the task store. */
export function ListsScreen({ store }: { store: TaskStore }) {
  const [lists, setLists] = useState<List[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (select?: string) => {
      try {
        const all = await store.lists();
        setLists(all);
        setCurrentId((cur) => {
          const wanted = select ?? cur;
          return all.some((l) => l.id === wanted) ? wanted : (all[0]?.id ?? null);
        });
      } catch {
        setError("Couldn't load your Lists.");
      }
    },
    [store],
  );

  useLiveReload(store, () => void reload());
  const online = useOnline(store);

  const current = lists.find((l) => l.id === currentId) ?? null;
  const isInbox = current?.isInbox === true;

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? `${failure} ${e.message}.` : failure);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await run(async () => {
      const list = await store.createList(newName);
      setNewName("");
      await reload(list.id);
    }, "Couldn't create the List.");
  }

  async function rename() {
    if (!current) return;
    const name = window.prompt("Rename List", current.name);
    if (name === null) return;
    await run(async () => {
      await store.renameList(current.id, name);
      await reload();
    }, "Couldn't rename the List.");
  }

  async function remove() {
    if (!current) return;
    await run(async () => {
      if (
        (await store.listHasTasks(current.id)) &&
        !window.confirm(`Delete "${current.name}" and all its Tasks? This can't be undone.`)
      ) {
        return;
      }
      await store.deleteList(current.id);
      await reload();
    }, "Couldn't delete the List.");
  }

  return (
    <div>
      {!online && <OfflineBanner />}
      <nav aria-label="Lists">
        {lists.map((l) => (
          <button
            key={l.id}
            aria-pressed={l.id === currentId}
            onClick={() => setCurrentId(l.id)}
            style={{ fontWeight: l.id === currentId ? "bold" : "normal", marginRight: 4 }}
          >
            {l.name}
          </button>
        ))}
      </nav>
      <form onSubmit={create}>
        <input
          aria-label="New List name"
          placeholder="New List"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />{" "}
        <button type="submit">Create List</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {current && (
        <>
          <h2>
            {current.name}{" "}
            {!isInbox && (
              <>
                <button onClick={() => void rename()}>Rename</button>{" "}
                <button onClick={() => void remove()}>Delete List</button>
              </>
            )}
          </h2>
          <InboxScreen key={current.id} store={store} list={current} lists={lists} />
        </>
      )}
    </div>
  );
}
