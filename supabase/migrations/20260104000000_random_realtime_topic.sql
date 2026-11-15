-- Random secret Realtime channel name (code-review fix).
--
-- Before: the channel name was an unsalted SHA-256 of the Passphrase, so anyone who saw the
-- name could guess the Passphrase offline. Now the name is random, generated server-side,
-- regenerated whenever the Passphrase changes, and handed only to callers who present the
-- Passphrase (public.realtime_topic). It is unrelated to the Passphrase.

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
    encode(extensions.gen_random_bytes(32), 'hex')
  )
  on conflict (id) do update
    set hash = excluded.hash, realtime_topic = excluded.realtime_topic;
end;
$$;
revoke all on function private.set_passphrase(text) from public, anon, authenticated;

create or replace function public.change_passphrase(current_passphrase text, new_passphrase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  select p.hash into stored from private.passphrase p where p.id;
  if stored is null
     or stored <> extensions.crypt(coalesce(current_passphrase, ''), stored) then
    raise exception 'Wrong current Passphrase' using errcode = '28000';
  end if;
  if coalesce(length(new_passphrase), 0) < 8 then
    raise exception 'Passphrase must be at least 8 characters' using errcode = '22023';
  end if;
  update private.passphrase
     set hash = extensions.crypt(new_passphrase, extensions.gen_salt('bf')),
         realtime_topic = encode(extensions.gen_random_bytes(32), 'hex')
   where id;
end;
$$;
revoke all on function public.change_passphrase(text, text) from public;
grant execute on function public.change_passphrase(text, text) to anon, authenticated;

-- Replace any hash-derived name already stored, so the old guessable one stops being used.
update private.passphrase set realtime_topic = encode(extensions.gen_random_bytes(32), 'hex') where id;

-- The channel name, for callers whose x-passphrase header is correct.
create function public.realtime_topic()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  topic text;
begin
  if not public.passphrase_ok() then
    raise exception 'Wrong Passphrase' using errcode = '28000';
  end if;
  select p.realtime_topic into topic from private.passphrase p where p.id;
  return topic;
end;
$$;
revoke all on function public.realtime_topic() from public;
grant execute on function public.realtime_topic() to anon, authenticated;
