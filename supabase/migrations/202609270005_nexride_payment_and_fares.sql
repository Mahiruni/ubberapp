-- NexRide payment settlement and Addis fare seed
create or replace function public.trip_transition(p_trip_id uuid,p_action text,p_distance_m integer default null,p_duration_s integer default null,p_actual_fare_minor bigint default null)
returns public.trips language plpgsql security definer set search_path=public
as $$
declare t public.trips; next_state public.trip_state; uid uuid:=auth.uid(); v_fare bigint;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into t from public.trips where id=p_trip_id for update;
 if not found then raise exception 'TRIP_NOT_FOUND'; end if;
 if p_action='arrive' then
   if t.driver_id<>uid or t.state<>'accepted' then raise exception 'INVALID_TRANSITION'; end if;
   next_state:='arrived';
 elsif p_action='start' then
   if t.driver_id<>uid or t.state<>'arrived' then raise exception 'INVALID_TRANSITION'; end if;
   next_state:='in_progress';
 elsif p_action='complete' then
   if t.driver_id<>uid or t.state<>'in_progress' then raise exception 'INVALID_TRANSITION'; end if;
   next_state:='completed';
 elsif p_action='cancel' then
   if (t.customer_id<>uid and t.driver_id<>uid) or t.state in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;
   next_state:='cancelled';
 else raise exception 'INVALID_ACTION'; end if;
 v_fare:=coalesce(p_actual_fare_minor,t.total_minor);
 update public.trips set state=next_state,
   final_distance_m=coalesce(p_distance_m,final_distance_m),
   final_duration_s=coalesce(p_duration_s,final_duration_s),
   actual_fare_minor=case when p_actual_fare_minor is null then actual_fare_minor else p_actual_fare_minor end,
   total_minor=case when p_action='complete' then v_fare else total_minor end,
   completed_at=case when p_action='complete' then now() else completed_at end,
   cancelled_at=case when p_action='cancel' then now() else cancelled_at end,
   cancelled_by=case when p_action='cancel' then uid else cancelled_by end,
   cancellation_reason=case when p_action='cancel' then 'user_cancelled' else cancellation_reason end,
   updated_at=now()
 where id=t.id returning * into t;
 insert into public.ride_events(trip_id,actor_id,event_type,metadata)
 values(t.id,uid,p_action,jsonb_build_object('state',next_state));
 if p_action='complete' then
   insert into public.payments(trip_id,customer_id,provider,provider_payment_id,idempotency_key,amount_minor,currency,status,metadata)
   values(t.id,t.customer_id,'cash','cash-'||t.id::text,'trip-'||t.id::text,v_fare,t.currency,'paid',jsonb_build_object('source','trip_completion'))
   on conflict (idempotency_key) do nothing;
 end if;
 return t;
end $$;
revoke all on function public.trip_transition(uuid,text,integer,integer,bigint) from public;
grant execute on function public.trip_transition(uuid,text,integer,integer,bigint) to authenticated;

insert into public.fare_configs(city_id,service_type,base_minor,per_km_minor,per_minute_minor,minimum_fare_minor,commission_percent)
select id,'taxi',5000,3000,500,15000,20 from public.cities c
where c.name='Addis Ababa' and not exists(select 1 from public.fare_configs f where f.city_id=c.id and f.service_type='taxi' and f.is_active);
insert into public.fare_configs(city_id,service_type,base_minor,per_km_minor,per_minute_minor,minimum_fare_minor,commission_percent)
select id,'delivery',8000,3500,500,15000,20 from public.cities c
where c.name='Addis Ababa' and not exists(select 1 from public.fare_configs f where f.city_id=c.id and f.service_type='delivery' and f.is_active);
