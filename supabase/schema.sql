-- IT Ticket Board: database setup for Supabase.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. It is safe to run again.
--
-- Each table holds the same records the backup file holds (see "Backup and restore" in the README):
-- one row per ticket / deleted ticket / asset / stock item, with the whole record in `data`.
-- Every row belongs to the signed-in user (`owner`), and row level security means a user can only
-- ever see or change their own rows.

create table if not exists public.tickets (
  id text not null,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create table if not exists public.deleted_tickets (
  id text not null,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create table if not exists public.assets (
  id text not null,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create table if not exists public.stock_items (
  id text not null, -- the item's sku
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

-- Settings (screen pattern, Home cards, saved views, ...): one row per setting, value kept as text like the backup file.
create table if not exists public.settings (
  key text not null,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);

do $$
declare t text;
begin
  foreach t in array array['tickets', 'deleted_tickets', 'assets', 'stock_items', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;
