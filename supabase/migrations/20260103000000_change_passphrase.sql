-- Change Passphrase from the app (ticket #7, docs/adr/0001-passphrase-instead-of-login.md).
-- Requires the current Passphrase as an argument, so a request that only carries the
-- x-passphrase header cannot be turned into a lock-out by someone who merely sees the app open.
-- The new hash replaces the old one at once, so the old Passphrase stops passing public.passphrase_ok().

create function public.change_passphrase(current_passphrase text, new_passphrase text)
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
         -- keep in step with private.set_passphrase (realtime_nudges migration)
         realtime_topic = encode(extensions.digest('todo-realtime:' || new_passphrase, 'sha256'), 'hex')
   where id;
end;
$$;
revoke all on function public.change_passphrase(text, text) from public;
grant execute on function public.change_passphrase(text, text) to anon, authenticated;
