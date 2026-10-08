-- Background expiry for sequential matching when rider and driver apps
-- are suspended. Active rider/driver polling remains the immediate path.
create extension if not exists pg_cron;
create index if not exists nexride_pending_dispatch_tick_idx
 on public.ride_requests(dispatch_started_at)
 where status='pending' and dispatch_state='searching';
CREATE OR REPLACE FUNCTION private.nexride_advance_expired_offers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ride_id uuid;
  advanced integer := 0;
begin
  for ride_id in
    select r.id from public.ride_requests r
    where r.status='pending' and r.dispatch_state='searching'
      and not exists(
        select 1 from public.ride_request_offers o
         where o.request_id=r.id and o.status='pending'
           and (o.expires_at is null or o.expires_at>now()))
    order by r.dispatch_started_at nulls first
    limit 30
  loop
    -- The dispatch routine locks the booking, marks old offers expired
    -- and proposes exactly one new driver if one is eligible.
    perform private.dispatch_ride_request(ride_id);
    advanced:=advanced+1;
  end loop;
  return advanced;
end;
$function$
;
revoke all on function private.nexride_advance_expired_offers() from public,anon,authenticated;
-- Named cron.schedule updates the same job, avoiding duplicates on reapply.
select cron.schedule('nexride-sequential-dispatch-advance','10 seconds',
 'select private.nexride_advance_expired_offers();');
