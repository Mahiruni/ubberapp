begin;

create table if not exists public.ride_driver_locations (
  ride_request_id uuid primary key references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading_degrees double precision check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees <= 360)),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ride_driver_locations enable row level security;

grant select, insert, update on public.ride_driver_locations to authenticated;
revoke delete on public.ride_driver_locations from authenticated;

drop policy if exists ride_location_participants_read on public.ride_driver_locations;
create policy ride_location_participants_read
on public.ride_driver_locations
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin())
  or exists (
    select 1
    from public.ride_requests r
    where r.id = ride_driver_locations.ride_request_id
      and r.rider_id = (select auth.uid())
      and r.assigned_driver_id = ride_driver_locations.driver_id
      and r.status in ('accepted','arrived_pickup','in_trip')
  )
);

drop policy if exists ride_location_driver_insert on public.ride_driver_locations;
create policy ride_location_driver_insert
on public.ride_driver_locations
for insert
to authenticated
with check (
  driver_id = (select auth.uid())
  and exists (
    select 1
    from public.ride_requests r
    where r.id = ride_driver_locations.ride_request_id
      and r.assigned_driver_id = (select auth.uid())
      and r.status in ('accepted','arrived_pickup','in_trip')
  )
);

drop policy if exists ride_location_driver_update on public.ride_driver_locations;
create policy ride_location_driver_update
on public.ride_driver_locations
for update
to authenticated
using (
  driver_id = (select auth.uid())
  and exists (
    select 1
    from public.ride_requests r
    where r.id = ride_driver_locations.ride_request_id
      and r.assigned_driver_id = (select auth.uid())
      and r.status in ('accepted','arrived_pickup','in_trip')
  )
)
with check (
  driver_id = (select auth.uid())
  and exists (
    select 1
    from public.ride_requests r
    where r.id = ride_driver_locations.ride_request_id
      and r.assigned_driver_id = (select auth.uid())
      and r.status in ('accepted','arrived_pickup','in_trip')
  )
);

create or replace function private.enforce_ride_driver_location()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or actor is distinct from new.driver_id then
    raise exception 'LOCATION_NOT_OWNED' using errcode='42501';
  end if;

  if tg_op='UPDATE' and new.ride_request_id is distinct from old.ride_request_id then
    raise exception 'LOCATION_RIDE_IMMUTABLE' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.ride_requests r
    where r.id=new.ride_request_id
      and r.assigned_driver_id=actor
      and r.status in ('accepted','arrived_pickup','in_trip')
  ) then
    raise exception 'LOCATION_TRIP_NOT_ACTIVE' using errcode='42501';
  end if;

  new.recorded_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ride_driver_location_enforce on public.ride_driver_locations;
create trigger ride_driver_location_enforce
before insert or update on public.ride_driver_locations
for each row execute function private.enforce_ride_driver_location();

create or replace function private.clear_terminal_driver_location()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('completed','cancelled','withdrawn') then
    delete from public.ride_driver_locations where ride_request_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ride_request_clear_terminal_location on public.ride_requests;
create trigger ride_request_clear_terminal_location
after update of status on public.ride_requests
for each row execute function private.clear_terminal_driver_location();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='ride_driver_locations'
  ) then
    alter publication supabase_realtime add table public.ride_driver_locations;
  end if;
end $$;

revoke all on function private.enforce_ride_driver_location() from public;
revoke all on function private.clear_terminal_driver_location() from public;

commit;
