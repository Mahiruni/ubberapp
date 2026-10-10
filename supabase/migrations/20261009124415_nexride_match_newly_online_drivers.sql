-- NexRide: match a Rider with a Driver who comes Online during an active search.
-- Extend existing sequential dispatch; do not fan out or create duplicate offers.
-- Search window: 4 minutes from the original ride creation, not reset on retries.
CREATE OR REPLACE FUNCTION private.dispatch_ride_request(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ride public.ride_requests%rowtype;
  candidate uuid;
  distance_km numeric;
  inserted_count integer := 0;
begin
  -- Called with the ride lock already held from the decision/snapshot RPC,
  -- or obtains it here when creating a new booking.
  select * into ride from public.ride_requests where id=p_request_id for update;
  if not found or ride.status<>'pending' then return 0; end if;

  update public.ride_request_offers
    set status='expired'
    where request_id=ride.id and status='pending'
      and expires_at is not null and expires_at<=now();

  if exists(select 1 from public.ride_request_offers
    where request_id=ride.id and status='pending') then
    return 0; -- An active driver is already responding. Do not fan out.
  end if;

  -- A Rider remains eligible while actively searching. Stop matching
  -- an abandoned/persisted request after four minutes; never resurrect a
  -- cancelled, accepted, or expired search when a Driver appears later.
  if ride.created_at <= now() - interval '4 minutes' then
    if ride.dispatch_state is distinct from 'no_drivers' then
      update public.ride_requests
        set dispatch_state='no_drivers', updated_at=now()
        where id=ride.id and status='pending';
    end if;
    return 0;
  end if;

  select d.id,
    case when d.location is not null
     and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
     and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
    then round(private.nexride_distance_km(
      ride.pickup_lat,ride.pickup_lng,
      (d.location->>'latitude')::double precision,
      (d.location->>'longitude')::double precision)::numeric,2)
    else null end
  into candidate,distance_km
  from public.drivers d
  join public.profiles p on p.id=d.id
  where d.is_online=true and d.review_status='approved'
    and p.role='driver' and p.account_status='active'
    -- Never recycle a previously declined, passed, expired or withdrawn
    -- offer during the same booking.
    and not exists(select 1 from public.ride_request_offers o
      where o.request_id=ride.id and o.driver_id=d.id)
    -- A driver cannot be offered two bookings simultaneously.
    and not exists(select 1 from public.ride_request_offers o
      where o.driver_id=d.id and o.status='pending')
    and not exists(select 1 from public.ride_requests a
      where a.assigned_driver_id=d.id
      and a.status in ('accepted','arrived_pickup','in_trip'))
  order by
    case when d.location is not null
     and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
     and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
    then private.nexride_distance_km(ride.pickup_lat,ride.pickup_lng,
      (d.location->>'latitude')::double precision,
      (d.location->>'longitude')::double precision)
    else null end nulls last,
    d.updated_at desc
  limit 1 for update of d skip locked;

  if candidate is not null then
    insert into public.ride_request_offers
      (request_id,driver_id,pickup_distance_km,pickup_eta_minutes,expires_at)
    values (ride.id,candidate,distance_km,null,now()+interval '45 seconds')
    on conflict do nothing;
    get diagnostics inserted_count=row_count;
  end if;

  -- A temporarily empty Driver pool is not a terminal dispatch result.
  -- Keep searching so Rider polls and the 10-second pg_cron worker
  -- can discover a Driver who comes Online after the booking was placed.
  -- Avoid rewriting an unchanged ride on every poll (match_version churn).
  if inserted_count=1 or ride.dispatch_state is distinct from 'searching' then
    update public.ride_requests
      set dispatch_state='searching',
          dispatch_started_at=coalesce(dispatch_started_at,now()),
          updated_at=now()
      where id=ride.id and status='pending';
  end if;

  return inserted_count;
end;
$function$
;

revoke all on function private.dispatch_ride_request(uuid) from public,anon,authenticated;

-- Server-only kick to offer a newly created, verified Rider request.
create or replace function public.rider_dispatch_pending_server(p_actor uuid,p_request_id uuid)
returns integer language plpgsql security definer set search_path=''
as $body$
begin
  if p_actor is null or not exists (
    select 1 from public.ride_requests r
    where r.id=p_request_id and r.rider_id=p_actor and r.status='pending'
  ) then return 0; end if;
  return private.dispatch_ride_request(p_request_id);
end;
$body$;
revoke all on function public.rider_dispatch_pending_server(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rider_dispatch_pending_server(uuid,uuid) to service_role;

-- Fast path: when Driver availability PATCH confirms Online, immediately look
-- for the oldest eligible, still-searching Rider. pg_cron and Rider polling
-- remain the safe fallback when a concurrent request lock is busy.
create or replace function public.nexride_dispatch_waiting_for_driver_server(p_driver_id uuid)
returns integer language plpgsql security definer set search_path=''
as $body$
declare waiting_request uuid;
begin
  if p_driver_id is null or not exists (
    select 1 from public.drivers d
    join public.profiles p on p.id=d.id
    where d.id=p_driver_id and d.is_online=true
      and d.review_status='approved' and p.role='driver'
      and p.account_status='active'
  ) then return 0; end if;

  if exists (
    select 1 from public.ride_requests r
    where r.assigned_driver_id=p_driver_id
      and r.status in ('accepted','arrived_pickup','in_trip')
  ) or exists (
    select 1 from public.ride_request_offers o
    where o.driver_id=p_driver_id and o.status='pending'
      and (o.expires_at is null or o.expires_at>now())
  ) then return 0; end if;

  select r.id into waiting_request
  from public.ride_requests r
  where r.status='pending' and r.dispatch_state='searching'
    and r.created_at>now()-interval '4 minutes'
    and not exists(
      select 1 from public.ride_request_offers o
      where o.request_id=r.id and o.status='pending'
        and (o.expires_at is null or o.expires_at>now())
    )
    and not exists(
      select 1 from public.ride_request_offers o
      where o.request_id=r.id and o.driver_id=p_driver_id
    )
  order by r.created_at,r.id
  limit 1 for update of r skip locked;
  if waiting_request is null then return 0; end if;
  return private.dispatch_ride_request(waiting_request);
end;
$body$;
revoke all on function public.nexride_dispatch_waiting_for_driver_server(uuid) from public,anon,authenticated;
grant execute on function public.nexride_dispatch_waiting_for_driver_server(uuid) to service_role;

-- Existing pg_cron runs private.nexride_advance_expired_offers every 10 seconds.
-- No additional cron job or duplicate trigger is installed.
