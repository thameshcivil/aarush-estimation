-- =====================================================================
--  Aarush Estimation – cloud database setup (Supabase / PostgreSQL)
--  Run once: Supabase dashboard → SQL Editor → New query → paste → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- Workspaces (your firm; one per company that uses the app)
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Who belongs to which workspace
create table if not exists public.members (
  org_id   uuid not null references public.orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  email    text,
  role     text not null default 'editor' check (role in ('admin','editor','viewer')),
  primary key (org_id, user_id)
);

-- All app data (contractors, projects, measurement sections, bills) as JSON documents
create table if not exists public.records (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  id          text not null,
  kind        text not null,
  data        jsonb not null,
  updated_at  timestamptz not null,
  updated_by  uuid default auth.uid(),
  deleted     boolean not null default false,
  server_ts   timestamptz not null default clock_timestamp(),
  primary key (org_id, id)
);
create index if not exists records_org_ts on public.records (org_id, server_ts);

-- server timestamp is the sync cursor
create or replace function public.touch_record() returns trigger language plpgsql as $$
begin
  new.server_ts := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

-- membership check used by the security policies
create or replace function public.is_member(p_org uuid, p_roles text[] default array['admin','editor','viewer'])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles));
$$;

alter table public.orgs    enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;

drop policy if exists orgs_read on public.orgs;
create policy orgs_read on public.orgs for select using (public.is_member(id));

drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (public.is_member(org_id));

drop policy if exists records_read on public.records;
create policy records_read on public.records for select using (public.is_member(org_id));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert with check (public.is_member(org_id, array['admin','editor']));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update using (public.is_member(org_id, array['admin','editor']))
  with check (public.is_member(org_id, array['admin','editor']));

-- create a workspace; the creator becomes admin
create or replace function public.create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.orgs(name, created_by) values (coalesce(nullif(trim(p_name),''),'Aarush Estimation'), auth.uid()) returning id into v_id;
  insert into public.members(org_id, user_id, email, role) values (v_id, auth.uid(), auth.jwt()->>'email', 'admin');
  return v_id;
end $$;

-- add a team member (they must have created an account first)
create or replace function public.add_member(p_org uuid, p_email text, p_role text default 'editor') returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.is_member(p_org, array['admin']) then raise exception 'Only workspace admins can add members'; end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'Invalid role'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'No account with this email yet – ask them to open the app and create an account first'; end if;
  insert into public.members(org_id, user_id, email, role) values (p_org, v_user, lower(trim(p_email)), p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_org, array['admin']) then raise exception 'Only workspace admins can remove members'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  delete from public.members where org_id = p_org and user_id = p_user;
end $$;

-- push changes from a device; a newer copy on the server is never overwritten by an older one
create or replace function public.upsert_records(p_org uuid, p_rows jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  insert into public.records(org_id, id, kind, data, updated_at, deleted)
  select p_org, r->>'id', r->>'kind', r->'data', (r->>'updated_at')::timestamptz, coalesce((r->>'deleted')::boolean, false)
  from jsonb_array_elements(p_rows) r
  on conflict (org_id, id) do update
    set kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.records.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.create_org(text) to authenticated;
grant execute on function public.add_member(uuid, text, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.upsert_records(uuid, jsonb) to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.orgs, public.members to authenticated;
