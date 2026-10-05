begin;

alter table public.ride_requests
  add column if not exists client_request_key text,
  add column if not exists pricing_revision text,
  add column if not exists dispatch_state text not null default 'searching',
  add column if not exists dispatch_started_at timestamptz not null default now(),
  add column if not exists match_version bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='ride_requests_dispatch_state_check'
      and conrelid='public.ride_requests'::regclass
  ) then
    alter table public.ride_requests
      add constraint ride_requests_dispatch_state_check
      check (dispatch_state in ('searching','no_drivers'));
  end if;
end $$;

create unique index if not exists ride_requests_rider_client_key_idx
  on public.ride_requests(rider_id,client_request_key)
  where rider_id is not null and client_request_key is not null;

create unique index if not exists ride_requests_one_active_per_rider_idx
  on public.ride_requests(rider_id)
  where rider_id is not null
    and status in ('pending','accepted','arrived_pickup','in_trip');

create or replace function private.nexride_distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
) returns double precision
language sql
immutable
set search_path=''
as $$
  select 6371.0 * 2.0 * asin(
    least(
      1.0,
      sqrt(
        power(sin(radians(p_lat2-p_lat1)/2.0),2) +
        cos(radians(p_lat1))*cos(radians(p_lat2))*
        power(sin(radians(p_lng2-p_lng1)/2.0),2)
      )
    )
  )
$$;

create or replace function private.bump_ride_request_version()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.match_version := old.match_version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ride_request_bump_match_version on public.ride_requests;
create trigger ride_request_bump_match_version
before update on public.ride_requests
for each row execute function private.bump_ride_request_version();

create or replace function private.enforce_driver_trip_transition()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'pending'
     and new.status = 'accepted'
     and new.assigned_driver_id is not null
     and new.assigned_driver_id = actor then
    new.accepted_at := coalesce(old.accepted_at, now());
    new.updated_at := now();
    return new;
  end if;

  if new.status = 'cancelled'
     and actor = old.rider_id
     and old.status in ('pending','accepted') then
    new.cancelled_at := coalesce(old.cancelled_at, now());
    new.updated_at := now();
    return new;
  end if;

  if old.assigned_driver_id is distinct from actor then
    raise exception 'TRIP_NOT_ASSIGNED_TO_DRIVER';
  end if;

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

create or replace function private.dispatch_ride_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
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
    now()+interval '30 seconds'
  from public.drivers d
  join public.profiles p on p.id=d.id
  where d.review_status='approved'
    and d.is_online=true
    and p.role='driver'
    and p.account_status='active'
    and not exists (
      select 1
      from public.ride_requests active
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
$$;

create or replace function public.rider_create_ride_request_server(
  p_actor uuid,
  p_pickup_location text,
  p_destination_location text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_category text,
  p_payment_method text,
  p_client_request_key text,
  p_pricing_revision text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    where p.id=actor and p.role='rider' and p.account_status='active'
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
$$;

create or replace function public.rider_match_snapshot_server(
  p_actor uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

  return jsonb_strip_nulls(jsonb_build_object(
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
  ));
end;
$$;

create or replace function public.rider_request_action_server(
  p_actor uuid,
  p_request_id uuid,
  p_expected_version bigint,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := p_actor;
  ride public.ride_requests%rowtype;
  snap jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into ride
  from public.ride_requests
  where id=p_request_id and rider_id=actor
  for update;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if ride.match_version<>p_expected_version then
    snap := public.rider_match_snapshot_server(actor,p_request_id);
    return jsonb_build_object('conflict',true,'snapshot',snap);
  end if;

  if p_action='cancel' then
    if ride.status not in ('pending','accepted') then
      snap := public.rider_match_snapshot_server(actor,p_request_id);
      return jsonb_build_object('conflict',true,'snapshot',snap);
    end if;

    update public.ride_requests
       set status='cancelled',
           cancelled_at=coalesce(cancelled_at,now()),
           cancellation_reason='rider_cancelled'
     where id=ride.id;
  elsif p_action='retry' then
    if ride.status<>'pending' or ride.dispatch_state<>'no_drivers' then
      snap := public.rider_match_snapshot_server(actor,p_request_id);
      return jsonb_build_object('conflict',true,'snapshot',snap);
    end if;

    delete from public.ride_request_offers
    where request_id=ride.id;

    update public.ride_requests
       set dispatch_state='searching',
           dispatch_started_at=now()
     where id=ride.id;

    perform private.dispatch_ride_request(ride.id);
  else
    raise exception 'INVALID_ACTION';
  end if;

  snap := public.rider_match_snapshot_server(actor,p_request_id);
  return jsonb_build_object('conflict',false,'snapshot',snap);
end;
$$;

drop function if exists public.rider_request_action(uuid,bigint,text);
drop function if exists public.rider_match_snapshot(uuid);
drop function if exists public.rider_create_ride_request(
  text,text,double precision,double precision,double precision,double precision,
  text,text,text,text
);

revoke all on function public.rider_create_ride_request_server(
  uuid,text,text,double precision,double precision,double precision,double precision,
  text,text,text,text
) from public,anon,authenticated;
grant execute on function public.rider_create_ride_request_server(
  uuid,text,text,double precision,double precision,double precision,double precision,
  text,text,text,text
) to service_role;

revoke all on function public.rider_match_snapshot_server(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.rider_match_snapshot_server(uuid,uuid)
  to service_role;

revoke all on function public.rider_request_action_server(uuid,uuid,bigint,text)
  from public,anon,authenticated;
grant execute on function public.rider_request_action_server(uuid,uuid,bigint,text)
  to service_role;

revoke all on function private.dispatch_ride_request(uuid) from public;
revoke all on function private.nexride_distance_km(double precision,double precision,double precision,double precision) from public;
revoke all on function private.bump_ride_request_version() from public;

commit;
