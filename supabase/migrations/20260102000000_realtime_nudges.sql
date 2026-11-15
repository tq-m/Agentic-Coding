-- Live updates (ticket #6).
--
-- Why not plain postgres_changes on the tables: Realtime checks row-level security
-- with the connection's JWT, and the browser's `x-passphrase` header does not reach
-- that check, so passphrase_ok() would be false and no change would ever be delivered.
-- Instead, a statement-level trigger sends a payload-free Realtime broadcast "nudge"
-- on a channel whose name is derived from the Passphrase. Only a device that knows the
-- Passphrase can compute the channel name; on a nudge it re-reads through the normal
-- guarded API. The nudge carries only the table name and operation, never Task data.
--
-- Requires "Allow public access" for Realtime (Project Settings > Realtime; on by default).

alter table private.passphrase add column if not exists realtime_topic text;

-- Same as before, plus it stores the channel name derived from the Passphrase.
-- Must match realtimeTopic() in src/task-store/supabase-adapter.ts.
create or replace function private.set_passphrase(new_passphrase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(length(new_passphrase), 0) < 8 then
    raise exception 'Passphrase must be at least 8 characters';
  end if;
  insert into private.passphrase (id, hash, realtime_topic)
  values (
    true,
    extensions.crypt(new_passphrase, extensions.gen_salt('bf')),
    encode(extensions.digest('todo-realtime:' || new_passphrase, 'sha256'), 'hex')
  )
  on conflict (id) do update
    set hash = excluded.hash, realtime_topic = excluded.realtime_topic;
end;
$$;
revoke all on function private.set_passphrase(text) from public, anon, authenticated;

create function private.notify_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic text;
begin
  select p.realtime_topic into topic from private.passphrase p where p.id;
  if topic is not null then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'change',
      topic,
      false  -- public channel; the unguessable name is the guard
    );
  end if;
  return null;
end;
$$;
revoke all on function private.notify_change() from public, anon, authenticated;

create trigger lists_notify_change
  after insert or update or delete on public.lists
  for each statement execute function private.notify_change();

create trigger tasks_notify_change
  after insert or update or delete on public.tasks
  for each statement execute function private.notify_change();
