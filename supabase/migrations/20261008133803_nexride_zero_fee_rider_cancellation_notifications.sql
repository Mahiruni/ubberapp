-- Server-side rider cancellation and durable driver notification event (applied in production).
alter table public.ride_requests add column if not exists cancelled_by text;
do $block$
begin
 if not exists (select 1 from pg_constraint where conname='nexride_cancelled_by_check' and conrelid='public.ride_requests'::regclass) then
   alter table public.ride_requests add constraint nexride_cancelled_by_check
     check (cancelled_by is null or cancelled_by in ('rider','driver','admin','system'));
 end if;
end $block$;

create table if not exists public.ride_cancellation_events (
 ride_request_id uuid primary key references public.ride_requests(id) on delete cascade,
 rider_id uuid not null references auth.users(id),
 driver_id uuid not null references auth.users(id),
 previous_status text not null,
 cancelled_at timestamptz not null default now(),
 cancelled_by text not null default 'rider' check(cancelled_by='rider')
);
create index if not exists ride_cancellation_events_driver_recent_idx
 on public.ride_cancellation_events(driver_id,cancelled_at desc);
alter table public.ride_cancellation_events enable row level security;
revoke all on public.ride_cancellation_events from public,anon,authenticated;
grant select on public.ride_cancellation_events to authenticated;
grant all on public.ride_cancellation_events to service_role;
drop policy if exists "cancelled_ride_participants_read_events" on public.ride_cancellation_events;
create policy "cancelled_ride_participants_read_events" on public.ride_cancellation_events
 for select to authenticated using ((select auth.uid())=driver_id or (select auth.uid())=rider_id);
do $block$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ride_cancellation_events')
 then alter publication supabase_realtime add table public.ride_cancellation_events; end if;
end $block$;

CREATE OR REPLACE FUNCTION private.record_rider_cancellation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status is distinct from new.status
     and new.status='cancelled'
     and new.cancellation_reason='rider_cancelled'
     and new.assigned_driver_id is not null then
    insert into public.ride_cancellation_events
      (ride_request_id,rider_id,driver_id,previous_status,cancelled_at)
    values (new.id,new.rider_id,new.assigned_driver_id,old.status,coalesce(new.cancelled_at,now()))
    on conflict (ride_request_id) do nothing;
  end if;
  return new;
end;
$function$

revoke all on function private.record_rider_cancellation_event() from public,anon,authenticated;
drop trigger if exists ride_request_rider_cancellation_notice on public.ride_requests;
create trigger ride_request_rider_cancellation_notice after update of status on public.ride_requests
 for each row execute function private.record_rider_cancellation_event();

CREATE OR REPLACE FUNCTION public.rider_cancel_active_trip_server(p_actor uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ride public.ride_requests%rowtype;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into ride from public.ride_requests
   where id=p_request_id and rider_id=p_actor for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if ride.status='cancelled' and ride.cancellation_reason='rider_cancelled' then
    return jsonb_build_object('status','cancelled','requestId',ride.id,'idempotent',true,'cancelledAt',ride.cancelled_at,'driverNotified',ride.assigned_driver_id is not null);
  end if;

  if ride.status not in ('pending','accepted','arrived_pickup','in_trip') then
    return jsonb_build_object('status','conflict','requestId',ride.id,'currentStatus',ride.status);
  end if;

  update public.ride_requests set
    status='cancelled',
    cancelled_at=coalesce(cancelled_at,now()),
    cancelled_by='rider',
    cancellation_reason='rider_cancelled'
   where id=ride.id;

  return jsonb_build_object(
    'status','cancelled','requestId',ride.id,'idempotent',false,
    'cancelledAt',coalesce(ride.cancelled_at,now()),
    'driverNotified',ride.assigned_driver_id is not null,
    'previousStatus',ride.status
  );
end;
$function$

revoke all on function public.rider_cancel_active_trip_server(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rider_cancel_active_trip_server(uuid,uuid) to service_role;
