-- Lists, Tasks and the Passphrase rule (docs/adr/0001-passphrase-instead-of-login.md).
-- The browser sends the Passphrase in the `x-passphrase` header on every request.
-- Row-level security lets a request through only if that header matches the stored hash.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Passphrase storage: a private schema that the API (PostgREST) does not expose.
-- Only a bcrypt hash is stored, never the Passphrase itself.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.passphrase (
  id   boolean primary key default true check (id),  -- single row
  hash text not null
);
alter table private.passphrase enable row level security;  -- no policies: API roles see nothing
revoke all on private.passphrase from public, anon, authenticated;

-- Change the Passphrase (owner runs this in the SQL editor; ticket #7 can wrap it).
create function private.set_passphrase(new_passphrase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(length(new_passphrase), 0) < 8 then
    raise exception 'Passphrase must be at least 8 characters';
  end if;
  insert into private.passphrase (id, hash)
  values (true, extensions.crypt(new_passphrase, extensions.gen_salt('bf')))
  on conflict (id) do update set hash = excluded.hash;
end;
$$;
revoke all on function private.set_passphrase(text) from public, anon, authenticated;

-- True only when the request's x-passphrase header matches the stored hash.
-- Fails closed: if no Passphrase has been set yet, nothing is allowed.
create function public.passphrase_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.hash = extensions.crypt(
              coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-passphrase', ''),
              p.hash)
       from private.passphrase p
      where p.id),
    false);
$$;
revoke all on function public.passphrase_ok() from public;
grant execute on function public.passphrase_ok() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lists and Tasks
-- ---------------------------------------------------------------------------
create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,  -- deleting a List deletes its Tasks
  title      text not null check (length(btrim(title)) > 0),
  due_date   date,                       -- date only, no time
  note       text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_list_id_idx on public.tasks (list_id);

-- The default List.
insert into public.lists (name) values ('Inbox');

-- ---------------------------------------------------------------------------
-- Row-level security: every operation requires the correct Passphrase.
-- ---------------------------------------------------------------------------
alter table public.lists enable row level security;
alter table public.tasks enable row level security;

create policy "passphrase guards lists" on public.lists
  for all to anon, authenticated
  using ((select public.passphrase_ok()))
  with check ((select public.passphrase_ok()));

create policy "passphrase guards tasks" on public.tasks
  for all to anon, authenticated
  using ((select public.passphrase_ok()))
  with check ((select public.passphrase_ok()));
