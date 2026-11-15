import { useEffect, useState } from "react";
import { createSupabaseAdapter, type SupabaseConfig } from "./task-store/supabase-adapter";
import { createTaskStore, type TaskStore } from "./task-store/task-store";
import { passphraseMemory } from "./passphrase-memory";
import { Gate } from "./Gate";
import { ListsScreen } from "./ListsScreen";

const config: SupabaseConfig | null = import.meta.env.VITE_SUPABASE_URL
  ? { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" }
  : null;

type Phase =
  | { kind: "checking" }
  | { kind: "gate"; error?: string }
  | { kind: "open"; store: TaskStore };

/** Returns a store if the database accepts the Passphrase, null if it is wrong. Throws if unreachable. */
async function tryPassphrase(cfg: SupabaseConfig, passphrase: string): Promise<TaskStore | null> {
  const adapter = createSupabaseAdapter(cfg, passphrase);
  if (!(await adapter.checkPassphrase())) return null;
  return createTaskStore(adapter);
}

export function App() {
  const [phase, setPhase] = useState<Phase>(() =>
    config && passphraseMemory.get() ? { kind: "checking" } : { kind: "gate" },
  );

  useEffect(() => {
    const saved = passphraseMemory.get();
    if (!config || !saved) return;
    tryPassphrase(config, saved)
      .then((store) => {
        if (store) setPhase({ kind: "open", store });
        else {
          passphraseMemory.clear();
          setPhase({ kind: "gate", error: "The saved Passphrase no longer works. Enter it again." });
        }
      })
      .catch(() => setPhase({ kind: "gate", error: "Can't reach the server. Try again." }));
  }, []);

  async function submit(passphrase: string) {
    if (!config) return;
    try {
      const store = await tryPassphrase(config, passphrase);
      if (!store) return setPhase({ kind: "gate", error: "Wrong Passphrase. Try again." });
      passphraseMemory.set(passphrase);
      setPhase({ kind: "open", store });
    } catch {
      setPhase({ kind: "gate", error: "Can't reach the server. Try again." });
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 560, margin: "0 auto" }}>
      <h1>To-do</h1>
      {!config ? (
        <p>Not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).</p>
      ) : phase.kind === "checking" ? (
        <p>Loading...</p>
      ) : phase.kind === "gate" ? (
        <Gate error={phase.error} onSubmit={submit} />
      ) : (
        <ListsScreen store={phase.store} />
      )}
    </main>
  );
}
