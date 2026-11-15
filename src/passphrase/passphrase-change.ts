export const MIN_PASSPHRASE_LENGTH = 8;

/** Thrown by an adapter when the current Passphrase it was given is not the right one. */
export class WrongCurrentPassphraseError extends Error {
  constructor() {
    super("Wrong current Passphrase");
  }
}

/** Thin boundary to the database rule. Throws on failure; no rules live behind it. */
export interface PassphraseAdapter {
  /** Sets a new Passphrase if `current` is right. Throws WrongCurrentPassphraseError otherwise. */
  changePassphrase(current: string, next: string): Promise<void>;
}

/** Where the changing device remembers the Passphrase (see passphrase-memory.ts). */
export interface PassphraseMemory {
  set(passphrase: string): void;
}

export type ChangeResult =
  | { ok: true }
  | { ok: false; reason: "too-short" | "same-as-current" | "wrong-current" | "failed" };

export function createPassphraseChanger(adapter: PassphraseAdapter, memory: PassphraseMemory) {
  return {
    /** Changes the Passphrase. The new one is remembered only after the database accepted it. */
    async change(current: string, next: string): Promise<ChangeResult> {
      if (next.length < MIN_PASSPHRASE_LENGTH) return { ok: false, reason: "too-short" };
      if (next === current) return { ok: false, reason: "same-as-current" };
      try {
        await adapter.changePassphrase(current, next);
      } catch (e) {
        return { ok: false, reason: e instanceof WrongCurrentPassphraseError ? "wrong-current" : "failed" };
      }
      memory.set(next);
      return { ok: true };
    },
  };
}
