-- ======================================================================
-- Pizza Denfert · Supabase setup
-- Run this ONCE in: Supabase dashboard → SQL editor → New query → paste → Run.
-- Idempotent: safe to re-run.
-- ======================================================================

create extension if not exists pgcrypto;

-- ---------- 1. Helper: updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- 2. Admin membership table ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Anyone authenticated can read the admins table only to check their own row.
drop policy if exists admins_self_select on public.admins;
create policy admins_self_select on public.admins
  for select to authenticated using (auth.uid() = user_id);

-- ---------- 3. Categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_active_sort_idx on public.categories (is_active, sort_order);
drop trigger if exists set_updated_at on public.categories;
create trigger set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
alter table public.categories enable row level security;

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (is_active = true);

drop policy if exists categories_admin_read_all on public.categories;
create policy categories_admin_read_all on public.categories
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- ---------- 4. Menu items ----------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  ingredients text[] not null default '{}',
  prices jsonb not null default '{}'::jsonb,
  image_url text,
  category_id uuid references public.categories(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_category_idx on public.menu_items (category_id);
create index if not exists menu_items_active_sort_idx on public.menu_items (is_active, sort_order);
drop trigger if exists set_updated_at on public.menu_items;
create trigger set_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();
alter table public.menu_items enable row level security;

drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read on public.menu_items
  for select using (is_active = true);

drop policy if exists menu_items_admin_read_all on public.menu_items;
create policy menu_items_admin_read_all on public.menu_items
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists menu_items_admin_write on public.menu_items;
create policy menu_items_admin_write on public.menu_items
  for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- ---------- 5. Restaurant settings (single-row enforced via RLS) ----------
create table if not exists public.restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  opening_hours jsonb not null default '{}'::jsonb,
  phone text,
  address text,
  updated_at timestamptz not null default now()
);
drop trigger if exists set_updated_at on public.restaurant_settings;
create trigger set_updated_at before update on public.restaurant_settings
  for each row execute function public.set_updated_at();
alter table public.restaurant_settings enable row level security;

-- Seed exactly one row if none exists.
insert into public.restaurant_settings (opening_hours, phone, address)
select
  '{"mon":"12:00-14:30, 19:00-22:30","tue":"12:00-14:30, 19:00-22:30","wed":"12:00-14:30, 19:00-22:30","thu":"12:00-14:30, 19:00-22:30","fri":"12:00-14:30, 19:00-23:00","sat":"12:00-23:00","sun":"closed"}'::jsonb,
  '+33 4 78 00 00 00',
  '12 place Denfert-Rochereau, 69004 Lyon'
where not exists (select 1 from public.restaurant_settings);

drop policy if exists settings_public_read on public.restaurant_settings;
create policy settings_public_read on public.restaurant_settings
  for select using (true);

drop policy if exists settings_admin_update on public.restaurant_settings;
create policy settings_admin_update on public.restaurant_settings
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists settings_no_insert on public.restaurant_settings;
create policy settings_no_insert on public.restaurant_settings
  for insert with check (false);
drop policy if exists settings_no_delete on public.restaurant_settings;
create policy settings_no_delete on public.restaurant_settings
  for delete using (false);

-- ---------- 6. Storage bucket: menu-images (public read, admin write) ----------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read on storage.objects
  for select using (bucket_id = 'menu-images');

drop policy if exists menu_images_admin_write on storage.objects;
create policy menu_images_admin_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'menu-images'
    and exists (select 1 from public.admins a where a.user_id = auth.uid())
  )
  with check (
    bucket_id = 'menu-images'
    and exists (select 1 from public.admins a where a.user_id = auth.uid())
  );

-- ---------- 7. After-setup checklist (do this in the Dashboard, NOT in SQL) ----------
-- a) Authentication → Users → Add user → enter your owner email + password.
-- b) Copy the new user's UUID, then run:
--    insert into public.admins (user_id) values ('<paste-uuid-here>');
-- c) Authentication → Providers → Email → disable "Enable email confirmations"
--    (optional, but lets you log in immediately).
-- d) Settings → API → copy the URL + anon key + service_role key (you already have).
-- All done.
