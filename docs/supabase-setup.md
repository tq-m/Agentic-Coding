# Supabase setup and manual checks

## One-time setup

1. Create a Supabase project (free tier).
2. In the SQL editor, run `supabase/migrations/20260101000000_lists_tasks_passphrase.sql`, then `20260102000000_realtime_nudges.sql` (live updates), then `20260103000000_change_passphrase.sql` (adds the in-app change-Passphrase function), then `20260104000000_random_realtime_topic.sql` (random secret realtime channel name, `public.realtime_topic()`) and `20260105000000_inbox_flag_unique_names.sql` (`lists.is_inbox` flag plus unique List names; if two Lists already differ only by case, rename one first). Run them in timestamp order. The first creates the lists and tasks tables, seeds the "Inbox" List, and turns on row-level security.
3. Set the initial Passphrase (at least 8 characters). In the SQL editor run:

   ```sql
   select private.set_passphrase('your passphrase here');
   ```

   Only a bcrypt hash is stored (in `private.passphrase`, not exposed by the API). Until you run this, every request is rejected. You can also change it from the app (see "Changing the Passphrase" below), or run the same statement again to reset it if it is forgotten. Avoid leaving the passphrase in the SQL editor's query history if that matters to you.
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

## Changing the Passphrase

In the app, press "Change Passphrase", enter the current Passphrase and the new one twice (at least 8 characters, different from the current one). This calls `public.change_passphrase(current_passphrase, new_passphrase)`, which checks the current Passphrase against the stored hash and replaces the hash in one statement; a wrong current Passphrase raises SQLSTATE 28000 and changes nothing. The changing device remembers the new Passphrase; other devices are asked again (the gate drops a saved Passphrase the database no longer accepts).

Automated tests cover the rules (length, same-as-current, wrong current, failed save, remembering on the changing device) against an in-memory fake. The SQL function and the live behavior are NOT tested automatically; check them by hand against a real project:

**Change from the app**: on device A, change the Passphrase. The Inbox stays open and Tasks can still be added. Reload A: no prompt (new Passphrase remembered).

**Old Passphrase stops working**: rerun the curl checks above with `x-passphrase: <old>` (expect `[]`) and `<new>` (expect the Inbox row).

**Other device is prompted again**: on device B (holding the old Passphrase), reload. Expect the gate with "The saved Passphrase no longer works. Enter it again."; the new Passphrase opens the Inbox.

**Wrong current / too short**: in the dialog, a wrong current Passphrase shows an error and the old one still works; a 5-character new Passphrase is rejected without calling the database.

**Function guards**:

```sh
curl -X POST "$URL/rest/v1/rpc/change_passphrase" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"current_passphrase":"wrong","new_passphrase":"whatever long"}'
# expect: an error with code 28000, Passphrase unchanged
```

Known limit: the function can be called by anyone with the public key, so a guessed current Passphrase is the only protection (same as every other request; there is no rate limiting).

## Live updates and the offline banner

Run `supabase/migrations/20260102000000_realtime_nudges.sql` after the first migration, then **run `select private.set_passphrase('...')` again** (existing installs have no channel name stored until you do; the notifier stays silent until then). Realtime must allow public channels (Project Settings > Realtime > "Allow public access", on by default).

**How the Passphrase reaches realtime subscriptions.** Realtime evaluates row-level security with the connection's JWT, not the `x-passphrase` header, so subscribing to `postgres_changes` on `lists`/`tasks` would deliver nothing (`passphrase_ok()` is false there). This is why the tables are *not* added to the `supabase_realtime` publication. Instead a statement-level trigger on both tables calls `realtime.send` with a payload-free "nudge" (table name and operation only) on a public broadcast channel whose name is a random secret (`encode(gen_random_bytes(32), 'hex')`, unrelated to the Passphrase), stored in `private.passphrase.realtime_topic`. `set_passphrase` and `change_passphrase` generate a new one each time. The browser asks for it with `public.realtime_topic()` (a SECURITY DEFINER function that raises 28000 unless `passphrase_ok()`), listens, and on a nudge re-reads through the normal guarded API. Task data never travels over the broadcast. Changing the Passphrase changes the channel; other devices get the gate screen on their next request. Because the name is random, a leaked channel name does not allow guessing the Passphrase offline (the earlier unsalted SHA-256 name did). The `20260104` migration replaces any hash-derived name already stored, so no `set_passphrase` rerun is needed after it.

**Offline.** The store reports offline when the browser fires `offline` or the channel errors/closes, shows the "Offline, can't save" banner and blocks adding. On the browser's `online` event the channel is dropped and re-created and the screen re-reads, with no reload.

**Not verified without a live project** (only the in-memory fake is tested automatically): the trigger/`realtime.send` call, that the browser receives the nudge, and the exact channel status values on a real drop. Manual check: with the app open on two devices, add a Task on one (appears on the other within a second or two); then switch one device to airplane mode (banner shows, Add disabled), add a Task from the other device, turn the network back on (banner disappears, the missed Task appears, no reload). If nothing arrives, confirm `select realtime_topic from private.passphrase` is non-null and that `curl -X POST "$URL/rest/v1/rpc/realtime_topic" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "x-passphrase: <correct>"` returns it (and fails with 28000 for a wrong Passphrase).

**Inbox flag.** The Inbox is the List with `is_inbox = true` (at most one, enforced by a partial unique index); List names are unique ignoring case (`lower(name)` index). Check: `select name, is_inbox from lists` shows exactly one `true`, and creating a second List named `inbox` fails.
