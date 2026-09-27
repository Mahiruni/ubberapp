-- NexRide dispatch/matching support
create or replace function public.nexride_dispatch_trip(p_trip_id uuid,p_radius_m integer default 5000)
returns uuid language plpgsql security definer set search_path=public as $$
declare t public.trips; v_driver uuid; v_vehicle uuid;
begin
 select * into t from public.trips where id=p_trip_id and state='requested' and deleted_at is null for update;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(t.id::text,0));
 select d.id,v.id into v_driver,v_vehicle
 from public.drivers d left join lateral (
   select id from public.vehicles x where x.driver_id=d.id and x.deleted_at is null order by x.created_at desc limit 1
 ) v on true
 where d.is_online=true and d.review_status='approved' and d.deleted_at is null and d.location is not null
   and st_dwithin(d.location,t.pickup,p_radius_m)
   and not exists(select 1 from public.trips active where active.driver_id=d.id and active.state in ('accepted','arriving','in_progress') and active.deleted_at is null)
 order by d.location <-> t.pickup limit 1 for update of d;
 if v_driver is null then return null; end if;
 update public.trips set driver_id=v_driver,vehicle_id=v_vehicle,state='accepted',accepted_at=now(),updated_at=now()
 where id=t.id and state='requested';
 if not found then return null; end if;
 insert into public.ride_events(trip_id,actor_id,event_type,metadata) values(t.id,v_driver,'matched',jsonb_build_object('driver_id',v_driver));
 return v_driver;
end $$;
revoke all on function public.nexride_dispatch_trip(uuid,integer) from public;
grant execute on function public.nexride_dispatch_trip(uuid,integer) to service_role;

create index if not exists ride_events_trip_created_idx on public.ride_events(trip_id,created_at desc);
create index if not exists ratings_ratee_created_idx on public.ratings(ratee_id,created_at desc) where deleted_at is null;
create index if not exists support_tickets_requester_created_idx on public.support_tickets(requester_id,created_at desc) where deleted_at is null;
create index if not exists safety_reports_trip_created_idx on public.safety_reports(trip_id,created_at desc) where deleted_at is null;
