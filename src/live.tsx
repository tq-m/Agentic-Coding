import { useEffect, useState } from "react";
import type { TaskStore } from "./task-store/task-store";

/** Calls `reload` now and whenever the store reports a change or the connection returns. */
export function useLiveReload(store: TaskStore, reload: () => void) {
  useEffect(() => {
    reload();
    return store.subscribe(() => {
      if (store.isOnline()) reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
}

/** Whether the connection is up; re-renders when it changes. */
export function useOnline(store: TaskStore): boolean {
  const [online, setOnline] = useState(store.isOnline());
  useEffect(() => {
    setOnline(store.isOnline());
    return store.subscribe(() => setOnline(store.isOnline()));
  }, [store]);
  return online;
}

export function OfflineBanner() {
  return (
    <p role="alert" style={{ background: "#b00020", color: "#fff", padding: "0.5rem 0.75rem" }}>
      Offline, can't save
    </p>
  );
}
