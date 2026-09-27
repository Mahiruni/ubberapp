-- NexRide security and realtime hardening
revoke execute on function public.nexride_nearby_available_drivers(double precision,double precision,integer,integer) from public,anon,authenticated;
grant execute on function public.nexride_nearby_available_drivers(double precision,double precision,integer,integer) to service_role;
revoke execute on function public.nexride_dispatch_trip(uuid,integer) from public,anon,authenticated;
grant execute on function public.nexride_dispatch_trip(uuid,integer) to service_role;
alter function public.nexride_distance_m(geography,geography) set search_path=public;
drop policy if exists rate_limit_buckets_service_only on public.rate_limit_buckets;
create policy rate_limit_buckets_service_only on public.rate_limit_buckets for all to service_role using(true) with check(true);
revoke all on table public.spatial_ref_sys from anon,authenticated;
revoke execute on function public.st_estimatedextent(text,text) from anon,authenticated;
revoke execute on function public.st_estimatedextent(text,text,text) from anon,authenticated;
revoke execute on function public.st_estimatedextent(text,text,text,boolean) from anon,authenticated;
alter publication supabase_realtime add table public.ride_shares;
