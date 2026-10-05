-- NexRide live driver verification
-- Mirrors the production schema applied to Supabase project eyyvvwecpyctttiueban.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'rider' check (role in ('rider','driver','admin')),
  admin_role text,
  account_status text not null default 'active' check (account_status in ('active','suspended','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  city_id uuid,
  license_number text,
  license_expiry date,
  vehicle text,
  vehicle_plate text,
  license_document_path text,
  vehicle_registration_path text,
  is_online boolean not null default false,
  location jsonb,
  rating numeric(3,2) check (rating is null or (rating >= 0 and rating <= 5)),
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected','suspended')),
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.admin_action_log enable row level security;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

drop trigger if exists drivers_touch_updated_at on public.drivers;
create trigger drivers_touch_updated_at
before update on public.drivers
for each row execute function private.touch_updated_at();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists drivers_select_own_or_admin on public.drivers;
create policy drivers_select_own_or_admin
on public.drivers for select to authenticated
using (id = (select auth.uid()) or private.is_admin());

drop policy if exists drivers_update_own on public.drivers;
create policy drivers_update_own
on public.drivers for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists drivers_update_admin on public.drivers;
create policy drivers_update_admin
on public.drivers for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists admin_action_log_admin_select on public.admin_action_log;
create policy admin_action_log_admin_select
on public.admin_action_log for select to authenticated
using (private.is_admin());

drop policy if exists admin_action_log_admin_insert on public.admin_action_log;
create policy admin_action_log_admin_insert
on public.admin_action_log for insert to authenticated
with check (private.is_admin() and actor_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
revoke all on public.drivers from anon, authenticated;
revoke all on public.admin_action_log from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.drivers to authenticated;
grant update (
  license_number,
  license_expiry,
  vehicle_plate,
  license_document_path,
  vehicle_registration_path,
  is_online,
  review_status,
  rejection_reason,
  reviewed_at
) on public.drivers to authenticated;
grant select, insert on public.admin_action_log to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_role text;
begin
  resolved_role := case when new.raw_user_meta_data->>'role' = 'driver' then 'driver' else 'rider' end;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone','')), ''),
    resolved_role
  )
  on conflict (id) do nothing;

  if resolved_role = 'driver' then
    insert into public.drivers (id, vehicle, vehicle_plate)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'vehicle','')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data->>'vehicle_plate','')), '')
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created_nexride on auth.users;
create trigger on_auth_user_created_nexride
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, full_name, phone, role)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name','')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data->>'phone','')), ''),
  case when u.raw_user_meta_data->>'role' = 'driver' then 'driver' else 'rider' end
from auth.users u
on conflict (id) do nothing;

insert into public.drivers (id, vehicle, vehicle_plate)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data->>'vehicle','')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data->>'vehicle_plate','')), '')
from auth.users u
where u.raw_user_meta_data->>'role' = 'driver'
on conflict (id) do nothing;

drop function if exists public.submit_driver_verification(text,date,text,text,text);
drop function if exists public.driver_set_online(boolean);

create or replace function private.enforce_driver_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  verification_changed boolean;
  review_changed boolean;
begin
  if new.id <> old.id then
    raise exception 'Driver identity cannot be changed' using errcode = '42501';
  end if;

  review_changed :=
    new.review_status is distinct from old.review_status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.reviewed_at is distinct from old.reviewed_at;

  if review_changed and not private.is_admin() then
    raise exception 'Only an administrator can change driver review state' using errcode = '42501';
  end if;

  verification_changed :=
    new.license_number is distinct from old.license_number
    or new.license_expiry is distinct from old.license_expiry
    or new.vehicle_plate is distinct from old.vehicle_plate
    or new.license_document_path is distinct from old.license_document_path
    or new.vehicle_registration_path is distinct from old.vehicle_registration_path;

  if verification_changed then
    if old.review_status not in ('draft','pending','rejected') then
      raise exception 'Approved or suspended driver verification cannot be changed';
    end if;
    if nullif(trim(coalesce(new.license_number,'')), '') is null then
      raise exception 'License number is required';
    end if;
    if new.license_expiry is null or new.license_expiry <= current_date then
      raise exception 'Driver license must have a future expiry date';
    end if;
    if nullif(trim(coalesce(new.vehicle_plate,'')), '') is null then
      raise exception 'Vehicle plate is required';
    end if;
    if new.license_document_path not like new.id::text || '/%'
       or new.vehicle_registration_path not like new.id::text || '/%' then
      raise exception 'Invalid verification document path' using errcode = '42501';
    end if;

    new.review_status := 'pending';
    new.rejection_reason := null;
    new.submitted_at := now();
    new.reviewed_at := null;
    new.is_online := false;
  end if;

  if new.is_online is distinct from old.is_online and new.is_online and old.review_status <> 'approved' then
    raise exception 'Driver approval is required before going online' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists drivers_enforce_update on public.drivers;
create trigger drivers_enforce_update
before update on public.drivers
for each row execute function private.enforce_driver_update();

create or replace function public.admin_driver_review(p_driver_id uuid, p_status text)
returns public.drivers
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  result public.drivers;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_status not in ('pending','approved','rejected','suspended') then
    raise exception 'Invalid driver review status';
  end if;

  update public.drivers
  set review_status = p_status,
      reviewed_at = now(),
      is_online = case when p_status = 'approved' then is_online else false end,
      rejection_reason = case when p_status = 'approved' then null else rejection_reason end
  where id = p_driver_id
  returning * into result;

  if result.id is null then
    raise exception 'Driver not found';
  end if;

  insert into public.admin_action_log(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'driver_review', 'driver', p_driver_id, jsonb_build_object('status', p_status));

  return result;
end;
$$;

revoke all on function public.admin_driver_review(uuid,text) from public, anon;
grant execute on function public.admin_driver_review(uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-verification',
  'driver-verification',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists driver_verification_insert_own on storage.objects;
create policy driver_verification_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'driver-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists driver_verification_select_own_or_admin on storage.objects;
create policy driver_verification_select_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'driver-verification'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_admin()
  )
);

drop policy if exists driver_verification_update_own on storage.objects;
create policy driver_verification_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'driver-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'driver-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists driver_verification_delete_own on storage.objects;
create policy driver_verification_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'driver-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drivers'
  ) then
    alter publication supabase_realtime add table public.drivers;
  end if;
end
$$;
