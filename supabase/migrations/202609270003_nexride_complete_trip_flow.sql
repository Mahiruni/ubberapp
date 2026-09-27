-- NexRide complete trip lifecycle RPCs
-- Applied to DriverSuperApp Supabase project: mrbgtdrpscdoxwdgvfcs

create or replace function public.driver_set_online(p_online boolean)
returns public.drivers language plpgsql security definer set search_path=public
as $$
declare v public.drivers;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.drivers set is_online=p_online where id=auth.uid() returning * into v;
 if not found then raise exception 'DRIVER_NOT_FOUND'; end if;
 if v.review_status <> 'approved' and p_online then raise exception 'DRIVER_NOT_VERIFIED'; end if;
 return v;
end $$;

create or replace function public.driver_update_location(p_lat double precision,p_lng double precision,p_heading double precision default null,p_speed_mps double precision default null,p_accuracy_m double precision default null)
returns public.driver_locations language plpgsql security definer set search_path=public
as $$
declare v public.driver_locations; d public.drivers;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into d from public.drivers where id=auth.uid() and is_online=true;
 if not found then raise exception 'DRIVER_NOT_ONLINE'; end if;
 insert into public.driver_locations(driver_id,city_id,location,heading,speed_mps,accuracy_m)
 values(auth.uid(),d.city_id,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography,p_heading,p_speed_mps,p_accuracy_m)
 returning * into v;
 update public.drivers set location=st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography where id=auth.uid();
 return v;
end $$;

create or replace function public.trip_transition(p_trip_id uuid,p_action text,p_distance_m integer default null,p_duration_s integer default null,p_actual_fare_minor bigint default null)
returns public.trips language plpgsql security definer set search_path=public
as $$
declare t public.trips; next_state public.trip_state; uid uuid:=auth.uid();
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
 update public.trips set state=next_state,
   final_distance_m=coalesce(p_distance_m,final_distance_m),
   final_duration_s=coalesce(p_duration_s,final_duration_s),
   actual_fare_minor=case when p_actual_fare_minor is null then actual_fare_minor else p_actual_fare_minor end,
   total_minor=case when p_action='complete' and p_actual_fare_minor is not null then p_actual_fare_minor else total_minor end,
   completed_at=case when p_action='complete' then now() else completed_at end,
   cancelled_at=case when p_action='cancel' then now() else cancelled_at end,
   cancelled_by=case when p_action='cancel' then uid else cancelled_by end,
   cancellation_reason=case when p_action='cancel' then 'user_cancelled' else cancellation_reason end,
   updated_at=now()
 where id=t.id returning * into t;
 insert into public.ride_events(trip_id,actor_id,event_type,metadata)
 values(t.id,uid,p_action,jsonb_build_object('state',next_state));
 return t;
end $$;

revoke all on function public.driver_set_online(boolean) from public;
grant execute on function public.driver_set_online(boolean) to authenticated;
revoke all on function public.driver_update_location(double precision,double precision,double precision,double precision,double precision) from public;
grant execute on function public.driver_update_location(double precision,double precision,double precision,double precision,double precision) to authenticated;
revoke all on function public.trip_transition(uuid,text,integer,integer,bigint) from public;
grant execute on function public.trip_transition(uuid,text,integer,integer,bigint) to authenticated;
