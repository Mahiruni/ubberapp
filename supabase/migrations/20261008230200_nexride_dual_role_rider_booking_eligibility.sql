-- Same NexRide Auth identity may hold both Rider/Driver roles. Offline and
-- active-trip safety checks restrict booking from dual-role Driver accounts.
CREATE OR REPLACE FUNCTION public.rider_create_ride_request_server(p_actor uuid, p_pickup_location text, p_destination_location text, p_pickup_lat double precision, p_pickup_lng double precision, p_destination_lat double precision, p_destination_lng double precision, p_category text, p_payment_method text, p_client_request_key text, p_pricing_revision text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := p_actor;
  existing public.ride_requests%rowtype;
  active public.ride_requests%rowtype;
  direct_km double precision;
  road_km numeric;
  duration_mins integer;
  fare numeric;
  new_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=actor and p.account_status='active' and
      (p.role='rider' or
       (p.role='driver' and
        exists(select 1 from public.account_roles ar
          where ar.user_id=actor and ar.role='rider') and
        not exists(select 1 from public.drivers d
          where d.id=actor and d.is_online=true) and
        not exists(select 1 from public.ride_requests assigned
          where assigned.assigned_driver_id=actor
            and assigned.status in ('accepted','arrived_pickup','in_trip'))))
  ) then
    raise exception 'RIDER_NOT_ELIGIBLE';
  end if;

  if p_category <> 'economy' then raise exception 'CATEGORY_UNAVAILABLE'; end if;
  if p_payment_method <> 'cash' then raise exception 'PAYMENT_METHOD_UNAVAILABLE'; end if;
  if p_client_request_key is null
     or length(p_client_request_key)<16
     or length(p_client_request_key)>120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_pickup_location is null or p_destination_location is null
     or length(btrim(p_pickup_location))<1
     or length(btrim(p_destination_location))<1
     or length(p_pickup_location)>160
     or length(p_destination_location)>160 then
    raise exception 'INVALID_LOCATION_LABEL';
  end if;

  if p_pickup_lat not between 8.84 and 9.11
     or p_destination_lat not between 8.84 and 9.11
     or p_pickup_lng not between 38.66 and 38.91
     or p_destination_lng not between 38.66 and 38.91 then
    raise exception 'OUTSIDE_SERVICE_AREA';
  end if;

  select * into existing
  from public.ride_requests
  where rider_id=actor and client_request_key=p_client_request_key
  limit 1;
  if found then
    return jsonb_build_object(
      'requestId',existing.id,
      'status','accepted',
      'idempotent',true
    );
  end if;

  select * into active
  from public.ride_requests
  where rider_id=actor
    and status in ('pending','accepted','arrived_pickup','in_trip')
  limit 1
  for update;

  if found then
    if active.status='pending' and active.dispatch_state='no_drivers' then
      update public.ride_requests
         set status='cancelled',
             cancellation_reason='superseded_by_new_request'
       where id=active.id;
    else
      raise exception 'ACTIVE_RIDE_EXISTS';
    end if;
  end if;

  direct_km := private.nexride_distance_km(
    p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng
  );
  if direct_km < 0.03 then raise exception 'JOURNEY_TOO_SHORT'; end if;

  road_km := greatest(0.5,direct_km*1.28)::numeric;
  duration_mins := greatest(4,ceil((road_km::double precision/22.0)*60.0)::integer);
  fare := greatest(100,round(70 + 25*road_km + 3*duration_mins));

  insert into public.ride_requests(
    rider_id,
    pickup_location,destination_location,
    pickup_lat,pickup_lng,destination_lat,destination_lng,
    ride_category,
    estimated_trip_fare_etb,
    estimated_trip_distance_km,
    estimated_trip_duration_minutes,
    payment_method,payment_status,
    status,dispatch_state,dispatch_started_at,
    client_request_key,pricing_revision
  ) values (
    actor,
    btrim(p_pickup_location),btrim(p_destination_location),
    p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,
    'economy',
    fare,round(road_km,2),duration_mins,
    'cash','pending',
    'pending','searching',now(),
    p_client_request_key,coalesce(p_pricing_revision,'pricing-v1')
  )
  returning id into new_id;

  perform private.dispatch_ride_request(new_id);

  return jsonb_build_object(
    'requestId',new_id,
    'status','accepted',
    'idempotent',false
  );
exception
  when unique_violation then
    select * into existing
    from public.ride_requests
    where rider_id=actor and client_request_key=p_client_request_key
    limit 1;
    if found then
      return jsonb_build_object(
        'requestId',existing.id,
        'status','accepted',
        'idempotent',true
      );
    end if;
    raise;
end;
$function$
;
