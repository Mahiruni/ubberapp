alter table public.ride_requests
  drop constraint if exists ride_requests_status_check;

alter table public.ride_requests
  add constraint ride_requests_status_check
  check (status in ('pending','accepted','arrived_pickup','in_trip','withdrawn','cancelled','completed'));

alter table public.ride_requests
  add column if not exists estimated_trip_duration_minutes integer,
  add column if not exists estimated_trip_distance_km numeric(8,2),
  add column if not exists pickup_arrived_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.ride_requests
  drop constraint if exists ride_requests_estimated_trip_duration_minutes_check;

alter table public.ride_requests
  add constraint ride_requests_estimated_trip_duration_minutes_check
  check (estimated_trip_duration_minutes is null or estimated_trip_duration_minutes >= 0);

alter table public.ride_requests
  drop constraint if exists ride_requests_estimated_trip_distance_km_check;

alter table public.ride_requests
  add constraint ride_requests_estimated_trip_distance_km_check
  check (estimated_trip_distance_km is null or estimated_trip_distance_km >= 0);

grant update (status) on public.ride_requests to authenticated;

drop policy if exists "driver_updates_assigned_trip_stage" on public.ride_requests;
create policy "driver_updates_assigned_trip_stage"
on public.ride_requests
for update
to authenticated
using ((select auth.uid()) = assigned_driver_id)
with check ((select auth.uid()) = assigned_driver_id);

create or replace function private.enforce_driver_trip_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  if actor is null then new.updated_at := now(); return new; end if;
  if old.assigned_driver_id is distinct from actor then raise exception 'TRIP_NOT_ASSIGNED_TO_DRIVER'; end if;

  if old.status = 'accepted' and new.status = 'arrived_pickup' then
    new.pickup_arrived_at := coalesce(old.pickup_arrived_at, now());
  elsif old.status = 'arrived_pickup' and new.status = 'in_trip' then
    new.started_at := coalesce(old.started_at, now());
  elsif old.status = 'in_trip' and new.status = 'completed' then
    new.completed_at := coalesce(old.completed_at, now());
  else
    raise exception 'INVALID_TRIP_STAGE_TRANSITION';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.enforce_driver_trip_transition() from public, anon, authenticated;

drop trigger if exists ride_request_enforce_driver_transition on public.ride_requests;
create trigger ride_request_enforce_driver_transition
before update of status on public.ride_requests
for each row execute function private.enforce_driver_trip_transition();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_requests'
  ) then
    alter publication supabase_realtime add table public.ride_requests;
  end if;
end
$$;
