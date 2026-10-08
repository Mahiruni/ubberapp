-- Add vehicle color as a first-class Driver identity field.
-- Safe for existing rows: legacy Drivers may remain null until they update
-- verification, while online availability requires complete vehicle identity.

alter table public.drivers
  add column if not exists vehicle_color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'drivers_vehicle_color_length'
      and conrelid = 'public.drivers'::regclass
  ) then
    alter table public.drivers
      add constraint drivers_vehicle_color_length
      check (
        vehicle_color is null
        or char_length(trim(vehicle_color)) between 2 and 32
      );
  end if;
end
$$;

grant update (vehicle_color) on public.drivers to authenticated;

-- Backfill older Driver rows from the non-authoritative presentation metadata
-- captured during signup. This metadata is not used for authorization.
update public.drivers d
set
  vehicle = coalesce(
    nullif(trim(d.vehicle), ''),
    nullif(trim(u.raw_user_meta_data->>'vehicle'), '')
  ),
  vehicle_plate = coalesce(
    nullif(trim(d.vehicle_plate), ''),
    nullif(trim(u.raw_user_meta_data->>'vehicle_plate'), '')
  ),
  vehicle_color = coalesce(
    nullif(trim(d.vehicle_color), ''),
    nullif(trim(u.raw_user_meta_data->>'vehicle_color'), '')
  )
from auth.users u
where u.id = d.id
  and (
    nullif(trim(d.vehicle), '') is null
    or nullif(trim(d.vehicle_plate), '') is null
    or nullif(trim(d.vehicle_color), '') is null
  );

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_role text;
begin
  resolved_role := case
    when new.raw_user_meta_data->>'role' = 'driver' then 'driver'
    else 'rider'
  end;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone','')), ''),
    resolved_role
  )
  on conflict (id) do nothing;

  if resolved_role = 'driver' then
    insert into public.drivers (id, vehicle, vehicle_color, vehicle_plate)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'vehicle','')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data->>'vehicle_color','')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data->>'vehicle_plate','')), '')
    )
    on conflict (id) do update
      set vehicle = coalesce(
            nullif(trim(public.drivers.vehicle), ''),
            excluded.vehicle
          ),
          vehicle_color = coalesce(
            nullif(trim(public.drivers.vehicle_color), ''),
            excluded.vehicle_color
          ),
          vehicle_plate = coalesce(
            nullif(trim(public.drivers.vehicle_plate), ''),
            excluded.vehicle_plate
          );
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create or replace function private.enforce_driver_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog'
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
    raise exception 'Only an administrator can change driver review state'
      using errcode = '42501';
  end if;

  verification_changed :=
    new.license_number is distinct from old.license_number
    or new.license_expiry is distinct from old.license_expiry
    or new.vehicle is distinct from old.vehicle
    or new.vehicle_color is distinct from old.vehicle_color
    or new.vehicle_plate is distinct from old.vehicle_plate
    or new.license_document_path is distinct from old.license_document_path
    or new.vehicle_registration_path is distinct from old.vehicle_registration_path;

  if verification_changed then
    if old.review_status = 'suspended' then
      raise exception 'Suspended driver verification cannot be changed';
    end if;

    if old.review_status not in ('draft','pending','rejected','approved') then
      raise exception 'Driver verification cannot be changed in the current state';
    end if;

    if nullif(trim(coalesce(new.license_number,'')), '') is null then
      raise exception 'License number is required';
    end if;

    if new.license_expiry is null or new.license_expiry <= current_date then
      raise exception 'Driver license must have a future expiry date';
    end if;

    if nullif(trim(coalesce(new.vehicle,'')), '') is null then
      raise exception 'Vehicle model is required';
    end if;

    if nullif(trim(coalesce(new.vehicle_color,'')), '') is null then
      raise exception 'Vehicle color is required';
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

  if new.is_online is distinct from old.is_online
     and new.is_online
     and old.review_status <> 'approved' then
    raise exception 'Driver approval is required before going online'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_driver_update()
  from public, anon, authenticated;
