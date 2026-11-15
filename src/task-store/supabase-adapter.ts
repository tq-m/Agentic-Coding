import { createClient } from "@supabase/supabase-js";
import type { List, StorageAdapter, Task, TaskPatch } from "./types";

export const PASSPHRASE_HEADER = "x-passphrase";

interface TaskRow {
  id: string;
  list_id: string;
  title: string;
  due_date: string | null;
  note: string | null;
  done: boolean;
  created_at: string;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  listId: r.list_id,
  title: r.title,
  dueDate: r.due_date,
  note: r.note,
  done: r.done,
  createdAt: r.created_at,
});

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Supabase-backed adapter. Every request carries the Passphrase in a header. */
export function createSupabaseAdapter(config: SupabaseConfig, passphrase: string) {
  const client = createClient(config.url, config.anonKey, {
    global: { headers: { [PASSPHRASE_HEADER]: passphrase } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adapter: StorageAdapter & { checkPassphrase(): Promise<boolean> } = {
    /** True when the database accepts the Passphrase. Throws if the server can't be reached. */
    async checkPassphrase() {
      const { data, error } = await client.rpc("passphrase_ok");
      if (error) throw new Error(error.message);
      return data === true;
    },

    async listLists() {
      const { data, error } = await client
        .from("lists")
        .select("id, name")
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as List[];
    },

    async listTasks(listId) {
      const { data, error } = await client
        .from("tasks")
        .select("*")
        .eq("list_id", listId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return ((data ?? []) as TaskRow[]).map(toTask);
    },

    async insertTask({ listId, title, dueDate = null, note = null }) {
      const { data, error } = await client
        .from("tasks")
        .insert({ list_id: listId, title, due_date: dueDate, note })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toTask(data as TaskRow);
    },

    async updateTask(id, patch: TaskPatch) {
      const row: Partial<TaskRow> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
      if (patch.note !== undefined) row.note = patch.note;
      if (patch.done !== undefined) row.done = patch.done;
      const { data, error } = await client
        .from("tasks")
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return toTask(data as TaskRow);
    },

    async deleteTask(id) {
      const { error } = await client.from("tasks").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
  return adapter;
}
