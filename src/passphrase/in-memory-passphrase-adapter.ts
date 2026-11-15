import { WrongCurrentPassphraseError, type PassphraseAdapter } from "./passphrase-change";

export interface InMemoryPassphraseAdapter extends PassphraseAdapter {
  /** Test control: make writes fail (simulates an unreachable database). */
  failWrites(fail: boolean): void;
  /** Whether the database rule would accept this Passphrase right now. */
  grantsAccess(passphrase: string): boolean;
  /** What the gate asks the database about a saved Passphrase. */
  checkPassphrase(passphrase: string): Promise<boolean>;
}

/** In-memory fake of the database's Passphrase rule. */
export function createInMemoryPassphraseAdapter(initial: string): InMemoryPassphraseAdapter {
  let stored = initial;
  let failing = false;
  return {
    failWrites(fail) {
      failing = fail;
    },
    grantsAccess: (p) => p === stored,
    async checkPassphrase(p) {
      return p === stored;
    },
    async changePassphrase(current, next) {
      if (failing) throw new Error("save failed");
      if (current !== stored) throw new WrongCurrentPassphraseError();
      stored = next;
    },
  };
}
