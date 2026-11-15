# Supabase setup and manual checks

## One-time setup

1. Create a Supabase project (free tier).
2. In the SQL editor, run `supabase/migrations/20260101000000_lists_tasks_passphrase.sql`. It creates the lists and tasks tables, seeds the "Inbox" List, and turns on row-level security.
3. Set the initial Passphrase (at least 8 characters). In the SQL editor run:

   ```sql
   select private.set_passphrase('your passphrase here');
   ```

   Only a bcrypt hash is stored (in `private.passphrase`, not exposed by the API). Until you run this, every request is rejected. Run the same statement again any time to change the Passphrase (this is also the hook for the future change-Passphrase ticket). Avoid leaving the passphrase in the SQL editor's query history if that matters to you.
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings > API). In Vercel, add the same two variables. Never commit real keys.

## How the rule works

The browser sends the Passphrase in the `x-passphrase` header on every request. Row-level security policies on `lists` and `tasks` call `public.passphrase_ok()`, which compares the header to the stored hash. No match (or no Passphrase set) means no rows and no writes.

## Manual checks (need a real project)

**Requests without the correct Passphrase are rejected**

```sh
curl "$URL/rest/v1/lists?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# expect: []
curl "$URL/rest/v1/lists?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "x-passphrase: wrong"
# expect: []
curl -X POST "$URL/rest/v1/tasks" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"title":"x","list_id":"00000000-0000-0000-0000-000000000000"}'
# expect: an error (row-level security violation)
curl "$URL/rest/v1/lists?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "x-passphrase: <correct>"
# expect: [{"id":"...","name":"Inbox",...}]
```

**Gate screen**: open the app, enter a wrong Passphrase (error shows), then the correct one (Inbox opens). Reload: no prompt. Change the Passphrase in SQL and reload: the saved one is dropped and the gate shows again.

**Same Tasks visible from two devices**: add a Task on the phone, reload the laptop (or vice versa); the Task appears in the Inbox on both.

## Live updates and the offline banner

Run `supabase/migrations/20260102000000_realtime_nudges.sql` after the first migration, then **run `select private.set_passphrase('...')` again** (existing installs have no channel name stored until you do; the notifier stays silent until then). Realtime must allow public channels (Project Settings > Realtime > "Allow public access", on by default).

**How the Passphrase reaches realtime subscriptions.** Realtime evaluates row-level security with the connection's JWT, not the `x-passphrase` header, so subscribing to `postgres_changes` on `lists`/`tasks` would deliver nothing (`passphrase_ok()` is false there). This is why the tables are *not* added to the `supabase_realtime` publication. Instead a statement-level trigger on both tables calls `realtime.send` with a payload-free "nudge" (table name and operation only) on a public broadcast channel named `sha256('todo-realtime:' || Passphrase)`, stored in `private.passphrase.realtime_topic` by `set_passphrase`. The browser computes the same name from its Passphrase (`realtimeTopic` in `src/task-store/supabase-adapter.ts`), listens, and on a nudge re-reads through the normal guarded API. Task data never travels over the broadcast. Changing the Passphrase changes the channel; other devices get the gate screen on their next request.

**Offline.** The store reports offline when the browser fires `offline` or the channel errors/closes, shows the "Offline, can't save" banner and blocks adding. On the browser's `online` event the channel is dropped and re-created and the screen re-reads, with no reload.

**Not verified without a live project** (only the in-memory fake is tested automatically): the trigger/`realtime.send` call, that the browser receives the nudge, and the exact channel status values on a real drop. Manual check: with the app open on two devices, add a Task on one (appears on the other within a second or two); then switch one device to airplane mode (banner shows, Add disabled), add a Task from the other device, turn the network back on (banner disappears, the missed Task appears, no reload). If nothing arrives, confirm `select realtime_topic from private.passphrase` is non-null.
