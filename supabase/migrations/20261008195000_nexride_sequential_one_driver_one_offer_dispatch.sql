-- NexRide one-driver-at-a-time dispatch (deployed to production).
-- Allow only one pending request per booking AND one pending request per driver.
update public.ride_request_offers set status='expired'
where status='pending' and expires_at is not null and expires_at<=now();
with ranked as (
 select id,row_number() over(partition by request_id order by created_at,id) request_rank,
 row_number() over(partition by driver_id order by created_at,id) driver_rank
 from public.ride_request_offers where status='pending'
)
update public.ride_request_offers o set status='withdrawn' from ranked r
where o.id=r.id and (r.request_rank>1 or r.driver_rank>1);
create unique index if not exists nexride_one_pending_offer_per_request
 on public.ride_request_offers(request_id) where status='pending';
create unique index if not exists nexride_one_pending_offer_per_driver
 on public.ride_request_offers(driver_id) where status='pending';

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

  update public.ride_requests
    set dispatch_state=case when inserted_count=1 then 'searching' else 'no_drivers' end,
        dispatch_started_at=case when inserted_count=1 then now() else dispatch_started_at end,
        updated_at=now()
    where id=ride.id and status='pending';

  return inserted_count;
end;
$function$
;
revoke all on function private.dispatch_ride_request(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.driver_decide_ride_offer(p_offer_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  offer_request uuid;
  owner_id uuid;
  offered public.ride_request_offers%rowtype;
  ride public.ride_requests%rowtype;
  forwarded_count integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('accept','decline','pass','expire') then
    raise exception 'INVALID_OFFER_ACTION';
  end if;

  select request_id,driver_id into offer_request,owner_id
    from public.ride_request_offers where id=p_offer_id;
  if not found or owner_id is distinct from actor then
    raise exception 'RIDE_OFFER_NOT_OWNED';
  end if;

  select * into ride from public.ride_requests
    where id=offer_request for update;
  if not found or ride.status<>'pending' then
    return jsonb_build_object('status','unavailable');
  end if;

  select * into offered from public.ride_request_offers
    where id=p_offer_id and driver_id=actor for update;
  if not found or offered.status<>'pending' then
    return jsonb_build_object('status','already_resolved','currentStatus',offered.status);
  end if;

  if offered.expires_at is not null and offered.expires_at<=now() then
    update public.ride_request_offers set status='expired' where id=offered.id;
    forwarded_count := private.dispatch_ride_request(ride.id);
    return jsonb_build_object('status','expired','forwarded',forwarded_count>0);
  end if;
  if p_action='expire' then
    return jsonb_build_object('status','not_expired','expiresAt',offered.expires_at);
  end if;

  if p_action='accept' then
    -- Existing triggers enforce driver eligibility, assign the ride and
    -- withdraw other offers (there should be none under the new constraint).
    update public.ride_request_offers set status='accepted' where id=offered.id;
    return jsonb_build_object('status','accepted','requestId',ride.id,'offerId',offered.id);
  end if;

  update public.ride_request_offers set status='declined' where id=offered.id;
  forwarded_count := private.dispatch_ride_request(ride.id);
  return jsonb_build_object(
    'status',case when p_action='pass' then 'passed' else 'declined' end,
    'requestId',ride.id,
    'forwarded',forwarded_count>0,
    'anotherOfferActive',forwarded_count>0,
    'newOfferCount',forwarded_count);
end;
$function$
;
revoke all on function public.driver_decide_ride_offer(uuid,text) from public,anon,authenticated;
grant execute on function public.driver_decide_ride_offer(uuid,text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.driver_pass_ride_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.driver_decide_ride_offer(p_offer_id,'pass');
$function$
;
revoke all on function public.driver_pass_ride_offer(uuid) from public,anon,authenticated;
grant execute on function public.driver_pass_ride_offer(uuid) to authenticated,service_role;

revoke update on public.ride_request_offers from authenticated;

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

    if active_offers=0 and ride.dispatch_state='searching' then
      perform private.dispatch_ride_request(ride.id);
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
;
revoke all on function public.rider_match_snapshot_server(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rider_match_snapshot_server(uuid,uuid) to service_role;
