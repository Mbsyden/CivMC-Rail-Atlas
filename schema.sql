create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer','contributor','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  x double precision not null,
  z double precision not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.lines enable row level security;

create or replace function public.is_contributor()
returns boolean language sql security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('contributor','admin')); $$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;

-- Profiles: users can see their own role. Admins can see/manage all profiles.
create policy "users read own profile" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public map read access.
create policy "public read stations" on public.stations for select using (true);
create policy "public read lines" on public.lines for select using (true);

-- Only contributors/admins may create.
create policy "contributors add stations" on public.stations for insert to authenticated
with check (public.is_contributor() and created_by=auth.uid());
create policy "contributors add lines" on public.lines for insert to authenticated
with check (public.is_contributor() and created_by=auth.uid());

-- Contributors may edit/delete their own; admins can edit/delete everything.
create policy "contributors edit stations" on public.stations for update to authenticated
using (public.is_admin() or (public.is_contributor() and created_by=auth.uid()))
with check (public.is_admin() or (public.is_contributor() and created_by=auth.uid()));
create policy "contributors delete stations" on public.stations for delete to authenticated
using (public.is_admin() or (public.is_contributor() and created_by=auth.uid()));

create policy "contributors edit lines" on public.lines for update to authenticated
using (public.is_admin() or (public.is_contributor() and created_by=auth.uid()))
with check (public.is_admin() or (public.is_contributor() and created_by=auth.uid()));
create policy "contributors delete lines" on public.lines for delete to authenticated
using (public.is_admin() or (public.is_contributor() and created_by=auth.uid()));

grant select on public.profiles, public.stations, public.lines to anon, authenticated;
grant insert, update, delete on public.profiles, public.stations, public.lines to authenticated;

-- After creating your own account, run:
-- update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';
-- Then add trusted users with:
-- insert into public.profiles (id, display_name, role)
-- values ('TRUSTED_USER_UUID', 'PlayerName', 'contributor');



create table if not exists public.base_stations (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  name text not null,
  x double precision not null,
  z double precision not null
);

create table if not exists public.base_lines (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  name text not null,
  color text default '#c5c5c5',
  lines jsonb not null
);

alter table public.base_stations enable row level security;
alter table public.base_lines enable row level security;
create policy "public read base stations" on public.base_stations for select using (true);
create policy "public read base lines" on public.base_lines for select using (true);
create policy "admins add base stations" on public.base_stations for insert to authenticated with check (public.is_admin());
create policy "admins edit base stations" on public.base_stations for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete base stations" on public.base_stations for delete to authenticated using (public.is_admin());
create policy "admins add base lines" on public.base_lines for insert to authenticated with check (public.is_admin());
create policy "admins edit base lines" on public.base_lines for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete base lines" on public.base_lines for delete to authenticated using (public.is_admin());
grant select on public.base_stations, public.base_lines to anon, authenticated;
grant insert, update, delete on public.base_stations, public.base_lines to authenticated;

-- Automatically create a viewer profile for every newly registered account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.email,''), 'viewer')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(),
 target_type text not null check (target_type in ('station','line')),
 target_id uuid not null,
 report_type text not null,
 comment text default '',
 reporter_id uuid references auth.users(id) on delete set null,
 status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "authenticated users submit reports" on public.reports for insert to authenticated with check (reporter_id=auth.uid());
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());
create policy "admins manage reports" on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert on public.reports to authenticated;
grant select, update on public.reports to authenticated;
