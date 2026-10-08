-- Server-only handoff of pending ride offers. Authenticated drivers can
-- transfer only their own pending offer; riders are never cancelled.
CREATE OR REPLACE FUNCTION public.driver_pass_ride_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  offered public.ride_request_offers%rowtype;
  ride public.ride_requests%rowtype;
  next_driver uuid;
  other_pending integer := 0;
  inserted_count integer := 0;
  pickup_km numeric;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  -- The driver cannot act on an offer belonging to someone else.
  select * into offered from public.ride_request_offers
    where id=p_offer_id and driver_id=actor for update;
  if not found then raise exception 'RIDE_OFFER_NOT_OWNED'; end if;
  if offered.status <> 'pending' then
    return jsonb_build_object('status','already_resolved','currentStatus',offered.status);
  end if;
  if offered.expires_at is not null and offered.expires_at<=now() then
    return jsonb_build_object('status','expired');
  end if;
  select * into ride from public.ride_requests
    where id=offered.request_id for update;
  if not found or ride.status <> 'pending' then
    return jsonb_build_object('status','unavailable');
  end if;

  -- Trigger sets declined_at, checks immutable fields and actor ownership.
  update public.ride_request_offers set status='declined'
    where id=offered.id and status='pending';

  -- Do not cycle this request to a driver who has already seen it.
  -- Only approved, online, unoccupied, active driver accounts qualify.
  select d.id,
    case when d.location is not null
       and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
       and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
      then round(private.nexride_distance_km(
           ride.pickup_lat,ride.pickup_lng,
           (d.location->>'latitude')::double precision,
           (d.location->>'longitude')::double precision)::numeric,2)
      else null end
  into next_driver,pickup_km
  from public.drivers d
  join public.profiles p on p.id=d.id
  where d.id<>actor
    and d.review_status='approved' and d.is_online=true
    and p.role='driver' and p.account_status='active'
    and not exists(select 1 from public.ride_request_offers o
      where o.request_id=ride.id and o.driver_id=d.id)
    and not exists(select 1 from public.ride_requests assigned
      where assigned.assigned_driver_id=d.id
        and assigned.status in ('accepted','arrived_pickup','in_trip'))
  order by
    case when d.location is not null
       and (d.location->>'latitude') ~ '^-?[0-9]+([.][0-9]+)?$'
       and (d.location->>'longitude') ~ '^-?[0-9]+([.][0-9]+)?$'
      then private.nexride_distance_km(
           ride.pickup_lat,ride.pickup_lng,
           (d.location->>'latitude')::double precision,
           (d.location->>'longitude')::double precision)
      else null end nulls last,
    d.updated_at desc
  limit 1;

  if next_driver is not null then
    insert into public.ride_request_offers
      (request_id,driver_id,pickup_distance_km,pickup_eta_minutes,expires_at)
    values (ride.id,next_driver,pickup_km,null,now()+interval '45 seconds')
    on conflict(request_id,driver_id) do nothing;
    get diagnostics inserted_count=row_count;
  end if;

  select count(*) into other_pending from public.ride_request_offers o
    where o.request_id=ride.id and o.status='pending'
      and (o.expires_at is null or o.expires_at>now());

  update public.ride_requests set
    dispatch_state=case when other_pending>0 then 'searching' else 'no_drivers' end,
    updated_at=now()
    where id=ride.id and status='pending';

  return jsonb_build_object(
    'status','passed','requestId',ride.id,
    'forwarded',inserted_count>0,
    'anotherOfferActive',other_pending>0,
    'newOfferCount',inserted_count);
end;
$function$
;
revoke all on function public.driver_pass_ride_offer(uuid) from public,anon,authenticated;
grant execute on function public.driver_pass_ride_offer(uuid) to authenticated;
grant execute on function public.driver_pass_ride_offer(uuid) to service_role;
