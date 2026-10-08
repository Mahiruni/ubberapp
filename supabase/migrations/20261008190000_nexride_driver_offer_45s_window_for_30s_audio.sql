-- Deployed to NexRide Supabase: allow enough response time to hear
-- a 30-second ringtone despite normal realtime delivery/network latency.
-- Audio still stops at 30 seconds (or earlier when the offer resolves).
CREATE OR REPLACE FUNCTION private.dispatch_ride_request(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ride public.ride_requests%rowtype;
  offered integer := 0;
begin
  select * into ride
  from public.ride_requests
  where id=p_request_id
  for update;

  if not found or ride.status <> 'pending' then
    return 0;
  end if;

  insert into public.ride_request_offers(
    request_id,driver_id,pickup_distance_km,pickup_eta_minutes,expires_at
  )
  select
    ride.id,
    d.id,
    case
      when d.location is not null
       and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
       and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
      then round(
        private.nexride_distance_km(
          ride.pickup_lat,
          ride.pickup_lng,
          (d.location->>'latitude')::double precision,
          (d.location->>'longitude')::double precision
        )::numeric,
        2
      )
      else null
    end,
    null,
    now()+interval '45 seconds'
  from public.drivers d
  join public.profiles p on p.id=d.id
  where d.review_status='approved'
    and d.is_online=true
    and p.role='driver'
    and p.account_status='active'
    and not exists (
      select 1 from public.ride_requests active
      where active.assigned_driver_id=d.id
        and active.status in ('accepted','arrived_pickup','in_trip')
    )
  order by
    case
      when d.location is not null
       and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
       and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
      then private.nexride_distance_km(
        ride.pickup_lat,
        ride.pickup_lng,
        (d.location->>'latitude')::double precision,
        (d.location->>'longitude')::double precision
      )
      else null
    end nulls last,
    d.updated_at desc
  limit 8
  on conflict (request_id,driver_id) do nothing;

  get diagnostics offered = row_count;

  update public.ride_requests
     set dispatch_state=case when offered>0 then 'searching' else 'no_drivers' end,
         dispatch_started_at=now()
   where id=p_request_id;

  return offered;
end;
$function$
;
