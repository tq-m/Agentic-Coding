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

interface ListRow {
  id: string;
  name: string;
  is_inbox: boolean;
}

const LIST_COLUMNS = "id, name, is_inbox";
const toList = (r: ListRow): List => ({ id: r.id, name: r.name, isInbox: r.is_inbox });

/** The server rejected the request (bad key, missing function, ...), as opposed to being unreachable. */
export class RequestRejectedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestRejectedError";
  }
}

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
    /**
     * Live changes arrive as Realtime broadcast "nudges" on a channel with a
     * random secret name that the database hands out to Passphrase holders
     * (public.realtime_topic, see docs/supabase-setup.md). The browser
     * going offline/online drops and re-creates the channel, so recovery needs no reload.
     */
    subscribe({ onChange, onConnection }) {
      let channel: ReturnType<typeof client.channel> | null = null;
      let stopped = false;
      // Bumped whenever the channel is dropped or replaced, so status callbacks
      // from a channel that is no longer current are ignored.
      let generation = 0;

      async function listen() {
        const mine = ++generation;
        const { data: topic, error } = await client.rpc("realtime_topic");
        if (stopped || mine !== generation) return;
        if (error || typeof topic !== "string") {
          onConnection(false);
          return;
        }
        channel = client
          .channel(topic)
          .on("broadcast", { event: "change" }, () => {
            if (mine === generation) onChange();
          })
          .subscribe((status) => {
            if (stopped || mine !== generation) return;
            if (status === "SUBSCRIBED") onConnection(true);
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
              onConnection(false);
          });
      }
      async function drop() {
        generation++;
        const old = channel;
        channel = null;
        if (old) await client.removeChannel(old);
      }
      const goOffline = () => onConnection(false);
      const goOnline = () => {
        void drop().then(listen);
      };

      window.addEventListener("offline", goOffline);
      window.addEventListener("online", goOnline);
      if (navigator.onLine) void listen();
      else goOffline();

      return () => {
        stopped = true;
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
        void drop();
      };
    },

    /** True when the database accepts the Passphrase. Throws if the server can't be reached. */
    async checkPassphrase() {
      const { data, error, status } = await client.rpc("passphrase_ok");
      if (error) {
        if (status >= 400) throw new RequestRejectedError(status, error.message);
        throw new Error(error.message);
      }
      return data === true;
    },

    async listLists() {
      const { data, error } = await client
        .from("lists")
        .select(LIST_COLUMNS)
        .order("created_at");
      if (error) throw new Error(error.message);
      return ((data ?? []) as ListRow[]).map(toList);
    },

    async getList(listId) {
      const { data, error } = await client.from("lists").select(LIST_COLUMNS).eq("id", listId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toList(data as ListRow) : null;
    },

    async countTasks(listId) {
      const { count, error } = await client
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("list_id", listId);
      if (error) throw new Error(error.message);
      return count ?? 0;
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

    async insertList(name) {
      const { data, error } = await client.from("lists").insert({ name }).select(LIST_COLUMNS).single();
      if (error) throw new Error(error.message);
      return toList(data as ListRow);
    },

    async updateListName(listId, name) {
      const { error } = await client.from("lists").update({ name }).eq("id", listId);
      if (error) throw new Error(error.message);
    },

    /** Tasks go with the List via the tasks.list_id ON DELETE CASCADE foreign key. */
    async deleteList(listId) {
      const { error } = await client.from("lists").delete().eq("id", listId);
      if (error) throw new Error(error.message);
    },

    async updateTaskList(taskId, listId) {
      const { error } = await client.from("tasks").update({ list_id: listId }).eq("id", taskId);
      if (error) throw new Error(error.message);
    },
  };
  return adapter;
}
