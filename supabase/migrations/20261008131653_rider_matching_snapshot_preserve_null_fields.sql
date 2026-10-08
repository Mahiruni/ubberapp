-- Preserve nullable cancellation and driver fields in match snapshots.
-- Applied to NexRide production on 2026-10-08.
CREATE OR REPLACE FUNCTION public.rider_match_snapshot_server(p_actor uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := p_actor;
  ride public.ride_requests%rowtype;
  driver_name text;
  vehicle_name text;
  plate text;
  pickup_minutes integer;
  active_offers integer;
  match_status text;
  cancel_allowed boolean;
  cancel_confirm boolean;
  cancel_reason text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into ride
  from public.ride_requests
  where id=p_request_id and rider_id=actor
  for update;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  update public.ride_request_offers
     set status='expired'
   where request_id=ride.id
     and status='pending'
     and expires_at is not null
     and expires_at<=now();

  if ride.status='pending' then
    select count(*) into active_offers
    from public.ride_request_offers
    where request_id=ride.id
      and status='pending'
      and (expires_at is null or expires_at>now());

    if active_offers=0 and ride.dispatch_state<>'no_drivers' then
      update public.ride_requests
         set dispatch_state='no_drivers'
       where id=ride.id;
    end if;
  end if;

  select * into ride
  from public.ride_requests
  where id=p_request_id and rider_id=actor;

  if ride.status in ('accepted','arrived_pickup','in_trip','completed') then
    match_status := 'assigned';
  elsif ride.status in ('cancelled','withdrawn') then
    match_status := 'cancelled';
  elsif ride.dispatch_state='no_drivers' then
    match_status := 'no_drivers';
  elsif now()-ride.dispatch_started_at > interval '12 seconds' then
    match_status := 'delayed';
  else
    match_status := 'searching';
  end if;

  if match_status='assigned' and ride.assigned_driver_id is not null then
    select p.full_name,d.vehicle,d.vehicle_plate,o.pickup_eta_minutes
      into driver_name,vehicle_name,plate,pickup_minutes
    from public.drivers d
    join public.profiles p on p.id=d.id
    left join public.ride_request_offers o
      on o.request_id=ride.id
     and o.driver_id=d.id
     and o.status='accepted'
    where d.id=ride.assigned_driver_id;
  end if;

  cancel_allowed := ride.status in ('pending','accepted');
  cancel_confirm := ride.status='accepted';
  cancel_reason := case
    when ride.status in ('arrived_pickup','in_trip','completed') then 'Trip already started'
    else null
  end;

  return jsonb_build_object(
    'requestId',ride.id,
    'version',ride.match_version,
    'status',match_status,
    'cancellation',jsonb_build_object(
      'allowed',cancel_allowed,
      'requiresConfirmation',cancel_confirm,
      'fee',0,
      'reason',cancel_reason
    ),
    'canRetry',match_status='no_drivers',
    'canChangeCategory',match_status in ('no_drivers','cancelled'),
    'driver',case
      when match_status='assigned' and driver_name is not null
      then jsonb_build_object(
        'name',driver_name,
        'vehicle',coalesce(vehicle_name,'Vehicle'),
        'plate',coalesce(plate,'Plate unavailable'),
        'pickupMinutes',pickup_minutes
      )
      else null
    end
  );
end;
$function$
