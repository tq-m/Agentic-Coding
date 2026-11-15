import { useEffect, useState } from "react";
import { createSupabaseAdapter, type SupabaseConfig } from "./task-store/supabase-adapter";
import { createTaskStore, type TaskStore } from "./task-store/task-store";
import { passphraseMemory } from "./passphrase-memory";
import { Gate } from "./Gate";
import { ListsScreen } from "./ListsScreen";
import { ChangePassphrase } from "./ChangePassphrase";
import { createPassphraseChanger } from "./passphrase/passphrase-change";
import { createSupabasePassphraseAdapter } from "./passphrase/supabase-passphrase-adapter";

const config: SupabaseConfig | null = import.meta.env.VITE_SUPABASE_URL
  ? { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" }
  : null;

type Phase =
  | { kind: "checking" }
  | { kind: "gate"; error?: string }
  | { kind: "open"; store: TaskStore; changing?: boolean };

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

  async function changePassphrase(current: string, next: string) {
    const result = await createPassphraseChanger(createSupabasePassphraseAdapter(config!), passphraseMemory).change(
      current,
      next,
    );
    if (result.ok) {
      // The old store still sends the old Passphrase; open a new one with the new Passphrase.
      setPhase({ kind: "open", store: createTaskStore(createSupabaseAdapter(config!, next)) });
    }
    return result;
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
      ) : phase.changing ? (
        <ChangePassphrase
          onChange={changePassphrase}
          onDone={() => setPhase({ kind: "open", store: phase.store })}
        />
      ) : (
        <>
          <ListsScreen store={phase.store} />
          <p>
            <button type="button" onClick={() => setPhase({ ...phase, changing: true })}>
              Change Passphrase
            </button>
          </p>
        </>
      )}
    </main>
  );
}
