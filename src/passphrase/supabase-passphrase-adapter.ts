import { createClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "../task-store/supabase-adapter";
import { WrongCurrentPassphraseError, type PassphraseAdapter } from "./passphrase-change";

/** Calls the `change_passphrase` database function (see supabase/migrations). */
export function createSupabasePassphraseAdapter(config: SupabaseConfig): PassphraseAdapter {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async changePassphrase(current, next) {
      const { error } = await client.rpc("change_passphrase", {
        current_passphrase: current,
        new_passphrase: next,
      });
      if (!error) return;
      if (error.code === "28000") throw new WrongCurrentPassphraseError();
      throw new Error(error.message);
    },
  };
}
