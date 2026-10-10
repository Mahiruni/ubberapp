-- Rider GPS is shared only with the rider and the driver assigned to an active ride.
-- Apply this migration to the NexRide Supabase project before enabling live tracking.
begin;

create table if not exists public.ride_rider_locations (
  ride_request_id uuid primary key references public.ride_requests(id) on delete cascade,
  rider_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or (accuracy_meters >= 0 and accuracy_meters <= 100000)),
  recorded_at timestamptz not null default now()
);

alter table public.ride_rider_locations enable row level security;
grant select, insert, update on public.ride_rider_locations to authenticated;
revoke delete on public.ride_rider_locations from authenticated, anon;

drop policy if exists rider_gps_active_participants_select on public.ride_rider_locations;
create policy rider_gps_active_participants_select
on public.ride_rider_locations for select to authenticated
using (
  exists (
    select 1 from public.ride_requests r
    where r.id = ride_rider_locations.ride_request_id
      and r.rider_id = ride_rider_locations.rider_id
      and r.status in ('accepted', 'arrived_pickup', 'in_trip')
      and (
        r.rider_id = (select auth.uid())
        or r.assigned_driver_id = (select auth.uid())
      )
  )
);

drop policy if exists rider_gps_owner_insert on public.ride_rider_locations;
create policy rider_gps_owner_insert
on public.ride_rider_locations for insert to authenticated
with check (
  rider_id = (select auth.uid())
  and exists (
    select 1 from public.ride_requests r
    where r.id = ride_request_id
      and r.rider_id = (select auth.uid())
      and r.assigned_driver_id is not null
      and r.status in ('accepted', 'arrived_pickup', 'in_trip')
  )
);

drop policy if exists rider_gps_owner_update on public.ride_rider_locations;
create policy rider_gps_owner_update
on public.ride_rider_locations for update to authenticated
using (
  rider_id = (select auth.uid())
  and exists (
    select 1 from public.ride_requests r
    where r.id = ride_request_id
      and r.rider_id = (select auth.uid())
      and r.assigned_driver_id is not null
      and r.status in ('accepted', 'arrived_pickup', 'in_trip')
  )
)
with check (
  rider_id = (select auth.uid())
  and exists (
    select 1 from public.ride_requests r
    where r.id = ride_request_id
      and r.rider_id = (select auth.uid())
      and r.assigned_driver_id is not null
      and r.status in ('accepted', 'arrived_pickup', 'in_trip')
  )
);

create or replace function private.enforce_ride_rider_location()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or actor is distinct from new.rider_id then
    raise exception 'RIDER_LOCATION_NOT_OWNED' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and
    (new.ride_request_id is distinct from old.ride_request_id
    or new.rider_id is distinct from old.rider_id) then
    raise exception 'RIDER_LOCATION_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ride_requests r
    where r.id = new.ride_request_id
      and r.rider_id = actor
      and r.assigned_driver_id is not null
      and r.status in ('accepted', 'arrived_pickup', 'in_trip')
  ) then
    raise exception 'RIDER_LOCATION_TRIP_NOT_ACTIVE' using errcode = '42501';
  end if;
  new.recorded_at := now();
  return new;
end;
$$;

drop trigger if exists ride_rider_location_enforce on public.ride_rider_locations;
create trigger ride_rider_location_enforce
before insert or update on public.ride_rider_locations
for each row execute function private.enforce_ride_rider_location();

create or replace function private.clear_terminal_rider_location()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('completed', 'cancelled', 'withdrawn') then
    delete from public.ride_rider_locations where ride_request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ride_request_clear_terminal_rider_location on public.ride_requests;
create trigger ride_request_clear_terminal_rider_location
after update of status on public.ride_requests
for each row execute function private.clear_terminal_rider_location();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_rider_locations'
  ) then
    alter publication supabase_realtime add table public.ride_rider_locations;
  end if;
end $$;

revoke all on function private.enforce_ride_rider_location() from public;
revoke all on function private.clear_terminal_rider_location() from public;

commit;
