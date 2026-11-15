import { useState, type FormEvent } from "react";
import type { ChangeResult } from "./passphrase/passphrase-change";

const MESSAGES: Record<Exclude<ChangeResult, { ok: true }>["reason"], string> = {
  "too-short": "The new Passphrase must be at least 8 characters.",
  "same-as-current": "The new Passphrase must differ from the current one.",
  "wrong-current": "The current Passphrase is wrong.",
  failed: "Couldn't change the Passphrase. Nothing was changed; try again.",
};

export function ChangePassphrase({
  onChange,
  onDone,
}: {
  onChange: (current: string, next: string) => Promise<ChangeResult>;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) return setError("The new Passphrase doesn't match the repeat.");
    setBusy(true);
    const result = await onChange(current, next);
    setBusy(false);
    if (result.ok) onDone();
    else setError(MESSAGES[result.reason]);
  }

  return (
    <form onSubmit={submit}>
      <h2>Change Passphrase</h2>
      <p>
        <label>
          Current Passphrase <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      </p>
      <p>
        <label>
          New Passphrase <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
      </p>
      <p>
        <label>
          Repeat new Passphrase <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
      </p>
      <button type="submit" disabled={busy}>
        Change
      </button>{" "}
      <button type="button" onClick={onDone}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
