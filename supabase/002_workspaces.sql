-- IT Ticket Board: company workspaces. Run AFTER schema.sql.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. It is safe to run again.
--
-- A workspace is a company (or IT team). Tickets, deleted tickets, assets and stock belong to a
-- workspace, not to one person, so several IT staff can share them. Each member has a role:
--   admin  - can rename the workspace, invite people, change roles and remove members
--   agent  - can see and change the workspace's tickets, assets and stock
-- Settings (screen pattern, Home layout, saved views) stay personal: the settings table is unchanged.
--
-- Existing rows are kept: each person who already has data gets a workspace called "My workspace",
-- with them as admin, and their rows are moved into it.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'agent')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- The member's email, so the members list can show who is who (Supabase keeps logins in a protected table).
alter table public.workspace_members add column if not exists email text;
-- The access rules look up "which workspaces is this person in?" on every request; keep it fast.
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

-- People invited by email who haven't signed in yet. They join when they first sign in with that email.
create table if not exists public.workspace_invites (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null check (role in ('admin', 'agent')),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (workspace_id, email)
);

-- Membership checks used by the access rules. "security definer" lets them read workspace_members
-- without the rules on that table calling themselves in a loop.
create or replace function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid())
$$;

create or replace function public.is_workspace_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'admin')
$$;

-- Move the data tables from "belongs to a person" to "belongs to a workspace".
do $$
declare
  t text;
  person uuid;
  ws uuid;
begin
  -- Give everyone who already has data their own workspace, as admin.
  for person in
    select owner from public.tickets union select owner from public.deleted_tickets
    union select owner from public.assets union select owner from public.stock_items
  loop
    if not exists (select 1 from public.workspace_members where user_id = person) then
      insert into public.workspaces (name, created_by) values ('My workspace', person) returning id into ws;
      insert into public.workspace_members (workspace_id, user_id, role) values (ws, person, 'admin');
    end if;
  end loop;
  update public.workspace_members m set email = lower(u.email) from auth.users u where u.id = m.user_id and m.email is null;

  foreach t in array array['tickets', 'deleted_tickets', 'assets', 'stock_items'] loop
    execute format('alter table public.%I add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade', t);
    -- Rows from before workspaces go into their owner's (first) workspace.
    execute format($f$update public.%I r set workspace_id = (
        select m.workspace_id from public.workspace_members m where m.user_id = r.owner order by m.created_at limit 1)
      where r.workspace_id is null$f$, t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    -- "owner" now means "last changed by"; the row is identified by workspace + id.
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pkey');
    execute format('alter table public.%I add constraint %I primary key (workspace_id, id)', t, t || '_pkey');
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('drop policy if exists "workspace members" on public.%I', t);
    execute format($f$create policy "workspace members" on public.%I for all to authenticated
      using (public.is_workspace_member(workspace_id))
      with check (public.is_workspace_member(workspace_id))$f$, t);
  end loop;
end $$;

-- Access rules for the workspace tables themselves. Creating a workspace and joining one go through
-- the functions below, so there are no insert rules here.
alter table public.workspaces enable row level security;
drop policy if exists "members read" on public.workspaces;
create policy "members read" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
drop policy if exists "admins rename" on public.workspaces;
create policy "admins rename" on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

alter table public.workspace_members enable row level security;
drop policy if exists "members read" on public.workspace_members;
create policy "members read" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "admins change roles" on public.workspace_members;
create policy "admins change roles" on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
drop policy if exists "admins remove, anyone leaves" on public.workspace_members;
create policy "admins remove, anyone leaves" on public.workspace_members for delete to authenticated
  using (public.is_workspace_admin(workspace_id) or user_id = auth.uid());

alter table public.workspace_invites enable row level security;
drop policy if exists "admins manage invites" on public.workspace_invites;
create policy "admins manage invites" on public.workspace_invites for all to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- A workspace always keeps at least one admin.
create or replace function public.keep_an_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     -- (not when the whole workspace, or the person's login, is being deleted)
     and exists (select 1 from workspaces where id = old.workspace_id)
     and exists (select 1 from auth.users where id = old.user_id)
     and not exists (select 1 from workspace_members
                     where workspace_id = old.workspace_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'A workspace needs at least one admin. Make someone else an admin first.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists keep_an_admin on public.workspace_members;
create trigger keep_an_admin before update or delete on public.workspace_members
  for each row execute function public.keep_an_admin();

-- Creates a workspace with the caller as its admin, and returns its id.
create or replace function public.create_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into workspaces (name, created_by) values (trim(workspace_name), auth.uid()) returning id into ws;
  insert into workspace_members (workspace_id, user_id, role, email) values (ws, auth.uid(), 'admin', lower(auth.jwt() ->> 'email'));
  return ws;
end $$;

-- Joins every workspace that invited the caller's email address, then removes those invites.
-- Returns how many workspaces were joined.
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text := lower(auth.jwt() ->> 'email');
  joined integer;
begin
  if auth.uid() is null or me is null then return 0; end if;
  insert into workspace_members (workspace_id, user_id, role, email)
    select workspace_id, auth.uid(), role, me from workspace_invites where email = me
    on conflict (workspace_id, user_id) do nothing;
  get diagnostics joined = row_count;
  delete from workspace_invites where email = me;
  return joined;
end $$;

revoke all on function public.create_workspace(text), public.accept_invites() from public, anon;
grant execute on function public.create_workspace(text), public.accept_invites() to authenticated;
