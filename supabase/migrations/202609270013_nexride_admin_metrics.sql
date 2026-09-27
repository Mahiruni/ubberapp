-- Correct NexRide admin dashboard metrics.
create or replace function public.admin_dashboard_summary(p_city_id uuid default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; f timestamptz:=coalesce(p_from,date_trunc('day',now())); t timestamptz:=coalesce(p_to,now());
begin
 if not public.is_admin() then raise exception 'forbidden'; end if;
 select jsonb_build_object(
  'trips',(select count(*) from trips where (p_city_id is null or city_id=p_city_id) and requested_at between f and t and deleted_at is null),
  'active_rides',(select count(*) from trips where (p_city_id is null or city_id=p_city_id) and state in ('accepted','arriving','in_progress') and deleted_at is null),
  'completed_trips',(select count(*) from trips where (p_city_id is null or city_id=p_city_id) and state='completed' and completed_at between f and t and deleted_at is null),
  'revenue_minor',(select coalesce(sum(total_minor),0) from trips where (p_city_id is null or city_id=p_city_id) and state='completed' and completed_at between f and t and deleted_at is null),
  'drivers',(select count(*) from drivers where (p_city_id is null or city_id=p_city_id) and deleted_at is null),
  'online_drivers',(select count(*) from drivers where (p_city_id is null or city_id=p_city_id) and is_online=true and review_status='approved' and deleted_at is null),
  'customers',(select count(*) from profiles where role='customer' and (p_city_id is null or city_id=p_city_id) and account_status='active'),
  'open_safety',(select count(*) from safety_reports where status in ('open','investigating') and deleted_at is null),
  'open_support',(select count(*) from support_tickets where status in ('open','in_progress') and deleted_at is null)
 ) into r;
 if public.can_view_finance() then r:=r||jsonb_build_object(
  'commission_minor',(select coalesce(sum(round(total_minor*(coalesce((select commission_percent from fare_configs fc where fc.city_id=trips.city_id and fc.service_type=trips.service_type order by effective_from desc limit 1),0))/100.0)),0) from trips where state='completed' and completed_at between f and t and (p_city_id is null or city_id=p_city_id) and deleted_at is null),
  'payouts_minor',(select coalesce(sum(case when entry_type='driver_payout' then amount_minor else 0 end),0) from wallet_ledger where created_at between f and t and (p_city_id is null or city_id=p_city_id) and deleted_at is null)
 ); end if;
 return r;
end $$;
revoke all on function public.admin_dashboard_summary(uuid,timestamptz,timestamptz) from public;
grant execute on function public.admin_dashboard_summary(uuid,timestamptz,timestamptz) to authenticated;