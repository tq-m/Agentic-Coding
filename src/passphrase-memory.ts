const KEY = "todo.passphrase";

/** The correct Passphrase is remembered per device (browser localStorage). */
export const passphraseMemory = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(passphrase: string) {
    try {
      localStorage.setItem(KEY, passphrase);
    } catch {
      /* private mode: just ask again next time */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
