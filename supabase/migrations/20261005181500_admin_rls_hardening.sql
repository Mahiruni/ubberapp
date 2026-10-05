begin;

grant update (status) on public.ride_requests to authenticated;
grant update (status) on public.safety_reports to authenticated;
grant update (status) on public.support_requests to authenticated;

drop policy if exists admin_updates_ride_requests on public.ride_requests;
create policy admin_updates_ride_requests
on public.ride_requests
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists admin_updates_safety_reports on public.safety_reports;
create policy admin_updates_safety_reports
on public.safety_reports
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists admin_updates_support_requests on public.support_requests;
create policy admin_updates_support_requests
on public.support_requests
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create or replace function public.admin_dashboard_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql
security invoker
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

create or replace function public.admin_cancel_ride_request(
  p_ride_request_id uuid,
  p_reason text default 'admin_intervention'
) returns public.ride_requests
language plpgsql
security invoker
set search_path=''
as $$
declare
  result public.ride_requests;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.ride_requests
     set status='cancelled'
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
    jsonb_build_object('reason',left(coalesce(nullif(trim(p_reason),''),'admin_intervention'),250))
  );

  return result;
end;
$$;

create or replace function public.admin_safety_update(
  p_report_id uuid,
  p_status text
) returns public.safety_reports
language plpgsql
security invoker
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

create or replace function public.admin_support_update(
  p_request_id uuid,
  p_status text
) returns public.support_requests
language plpgsql
security invoker
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

revoke all on function public.admin_dashboard_summary(timestamptz,timestamptz)
  from public,anon;
grant execute on function public.admin_dashboard_summary(timestamptz,timestamptz)
  to authenticated;

revoke all on function public.admin_cancel_ride_request(uuid,text)
  from public,anon;
grant execute on function public.admin_cancel_ride_request(uuid,text)
  to authenticated;

revoke all on function public.admin_safety_update(uuid,text)
  from public,anon;
grant execute on function public.admin_safety_update(uuid,text)
  to authenticated;

revoke all on function public.admin_support_update(uuid,text)
  from public,anon;
grant execute on function public.admin_support_update(uuid,text)
  to authenticated;

commit;
