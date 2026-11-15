import { useState, type FormEvent } from "react";

export function Gate({ error, onSubmit }: { error?: string; onSubmit: (passphrase: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    await onSubmit(value);
    setBusy(false);
  }

  return (
    <form onSubmit={handle}>
      <label>
        Passphrase
        <br />
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>{" "}
      <button type="submit" disabled={busy}>
        Enter
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
