-- Identify the Inbox by a flag instead of its name, and keep List names unique (code-review fix).
-- If two existing Lists already share a name ignoring case, rename one before running this.

alter table public.lists add column is_inbox boolean not null default false;

-- Backfill: the seeded 'Inbox' row (oldest if several).
update public.lists
   set is_inbox = true
 where id = (select l.id from public.lists l where l.name = 'Inbox' order by l.created_at limit 1);

-- At most one Inbox.
create unique index lists_single_inbox on public.lists (is_inbox) where is_inbox;

-- List names are unique ignoring case (the app already checks; the database now enforces it).
create unique index lists_name_lower_key on public.lists (lower(name));
