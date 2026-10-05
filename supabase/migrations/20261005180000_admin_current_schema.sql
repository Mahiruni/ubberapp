begin;

create index if not exists ride_requests_assigned_driver_idx
  on public.ride_requests(assigned_driver_id, created_at desc)
  where assigned_driver_id is not null;

create index if not exists support_requests_ride_idx
  on public.support_requests(ride_request_id)
  where ride_request_id is not null;

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
    if old.status='in_trip' and new.status='completed' then
      new.completed_at := coalesce(old.completed_at,now());
      new.final_fare_etb := coalesce(new.final_fare_etb,old.final_fare_etb,old.estimated_trip_fare_etb);
      if new.payment_method='cash' and new.payment_status='unknown' then
        new.payment_status := 'pending';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if private.is_admin() then
    if new.status='cancelled'
       and old.status not in ('completed','cancelled','withdrawn') then
      new.cancelled_at := coalesce(old.cancelled_at,now());
      new.cancellation_reason := coalesce(nullif(new.cancellation_reason,''),'admin_intervention');
      new.updated_at := now();
      return new;
    end if;
    raise exception 'INVALID_ADMIN_TRIP_TRANSITION';
  end if;

  if old.status='pending' and new.status='accepted'
     and new.assigned_driver_id is not null and new.assigned_driver_id=actor then
    new.accepted_at:=coalesce(old.accepted_at,now());
    new.updated_at:=now();
    return new;
  end if;

  if new.status='cancelled' and actor=old.rider_id and old.status in ('pending','accepted') then
    new.cancelled_at:=coalesce(old.cancelled_at,now());
    new.updated_at:=now();
    return new;
  end if;

  if old.assigned_driver_id is distinct from actor then
    raise exception 'TRIP_NOT_ASSIGNED_TO_DRIVER';
  end if;

  if old.status='accepted' and new.status='arrived_pickup' then
    new.pickup_arrived_at:=coalesce(old.pickup_arrived_at,now());
  elsif old.status='arrived_pickup' and new.status='in_trip' then
    new.started_at:=coalesce(old.started_at,now());
  elsif old.status='in_trip' and new.status='completed' then
    new.completed_at:=coalesce(old.completed_at,now());
    new.final_fare_etb:=coalesce(new.final_fare_etb,old.final_fare_etb,old.estimated_trip_fare_etb);
    if new.payment_method='cash' and new.payment_status='unknown' then
      new.payment_status:='pending';
    end if;
  else
    raise exception 'INVALID_TRIP_STAGE_TRANSITION';
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function private.enforce_driver_trip_transition() from public,anon,authenticated;

drop function if exists public.admin_dashboard_summary(uuid,timestamptz,timestamptz);
drop function if exists public.admin_dashboard_summary(timestamptz,timestamptz);

create function public.admin_dashboard_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  from_time timestamptz := coalesce(p_from,date_trunc('day',now()));
  to_time timestamptz := coalesce(p_to,now());
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return jsonb_build_object(
    'trips',(
      select count(*) from public.ride_requests
      where created_at between from_time and to_time
    ),
    'active_rides',(
      select count(*) from public.ride_requests
      where status in ('accepted','arrived_pickup','in_trip')
    ),
    'completed_trips',(
      select count(*) from public.ride_requests
      where status='completed'
        and completed_at between from_time and to_time
    ),
    'revenue_etb',(
      select coalesce(sum(coalesce(final_fare_etb,estimated_trip_fare_etb)),0)
      from public.ride_requests
      where status='completed'
        and completed_at between from_time and to_time
    ),
    'online_drivers',(
      select count(*) from public.drivers d
      join public.profiles p on p.id=d.id
      where d.is_online=true
        and d.review_status='approved'
        and p.role='driver'
        and p.account_status='active'
    ),
    'riders',(
      select count(*) from public.profiles
      where role='rider' and account_status='active'
    ),
    'pending_driver_reviews',(
      select count(*) from public.drivers
      where review_status='pending'
    ),
    'open_safety',(
      select count(*) from public.safety_reports
      where status in ('submitted','reviewing')
    ),
    'open_support',(
      select count(*) from public.support_requests
      where status in ('submitted','reviewing')
    ),
    'paid_online_etb',(
      select coalesce(sum(amount_etb),0)
      from public.payment_transactions
      where status='paid'
        and paid_at between from_time and to_time
    ),
    'payouts_paid_etb',(
      select coalesce(sum(amount_etb),0)
      from public.driver_payout_requests
      where status='paid'
        and processed_at between from_time and to_time
    )
  );
end;
$$;

revoke all on function public.admin_dashboard_summary(timestamptz,timestamptz)
  from public,anon;
grant execute on function public.admin_dashboard_summary(timestamptz,timestamptz)
  to authenticated;

create or replace function public.admin_cancel_ride_request(
  p_ride_request_id uuid,
  p_reason text default 'admin_intervention'
) returns public.ride_requests
language plpgsql
security definer
set search_path=''
as $$
declare
  result public.ride_requests;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.ride_requests
     set status='cancelled',
         cancellation_reason=left(coalesce(nullif(trim(p_reason),''),'admin_intervention'),250)
   where id=p_ride_request_id
     and status not in ('completed','cancelled','withdrawn')
  returning * into result;

  if result.id is null then
    raise exception 'RIDE_NOT_CANCELLABLE';
  end if;

  insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    'ride_cancelled',
    'ride_request',
    result.id,
    jsonb_build_object('reason',result.cancellation_reason)
  );

  return result;
end;
$$;

revoke all on function public.admin_cancel_ride_request(uuid,text)
  from public,anon;
grant execute on function public.admin_cancel_ride_request(uuid,text)
  to authenticated;

create or replace function public.admin_safety_update(
  p_report_id uuid,
  p_status text
) returns public.safety_reports
language plpgsql
security definer
set search_path=''
as $$
declare
  result public.safety_reports;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('submitted','reviewing','resolved') then
    raise exception 'INVALID_SAFETY_STATUS';
  end if;

  update public.safety_reports
     set status=p_status
   where id=p_report_id
  returning * into result;

  if result.id is null then
    raise exception 'SAFETY_REPORT_NOT_FOUND';
  end if;

  insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    'safety_status_changed',
    'safety_report',
    result.id,
    jsonb_build_object('status',p_status)
  );

  return result;
end;
$$;

revoke all on function public.admin_safety_update(uuid,text)
  from public,anon;
grant execute on function public.admin_safety_update(uuid,text)
  to authenticated;

create or replace function public.admin_support_update(
  p_request_id uuid,
  p_status text
) returns public.support_requests
language plpgsql
security definer
set search_path=''
as $$
declare
  result public.support_requests;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('submitted','reviewing','resolved') then
    raise exception 'INVALID_SUPPORT_STATUS';
  end if;

  update public.support_requests
     set status=p_status
   where id=p_request_id
  returning * into result;

  if result.id is null then
    raise exception 'SUPPORT_REQUEST_NOT_FOUND';
  end if;

  insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    'support_status_changed',
    'support_request',
    result.id,
    jsonb_build_object('status',p_status)
  );

  return result;
end;
$$;

revoke all on function public.admin_support_update(uuid,text)
  from public,anon;
grant execute on function public.admin_support_update(uuid,text)
  to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ride_requests',
    'payment_transactions',
    'driver_payout_requests',
    'safety_reports',
    'support_requests'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename=table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end
$$;

commit;
