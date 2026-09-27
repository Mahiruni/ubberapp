-- Restrict NexRide lifecycle RPCs to signed-in users
revoke execute on function public.driver_set_online(boolean) from anon, authenticated;
grant execute on function public.driver_set_online(boolean) to authenticated;
revoke execute on function public.driver_update_location(double precision,double precision,double precision,double precision,double precision) from anon, authenticated;
grant execute on function public.driver_update_location(double precision,double precision,double precision,double precision,double precision) to authenticated;
revoke execute on function public.ensure_customer_profile(text,uuid) from anon, authenticated;
grant execute on function public.ensure_customer_profile(text,uuid) to authenticated;
revoke execute on function public.submit_trip_rating(uuid,smallint,text) from anon, authenticated;
grant execute on function public.submit_trip_rating(uuid,smallint,text) to authenticated;
revoke execute on function public.trip_transition(uuid,text,integer,integer,bigint) from anon, authenticated;
grant execute on function public.trip_transition(uuid,text,integer,integer,bigint) to authenticated;
