begin;
do $$ declare driver uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid(); ride uuid; begin
insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at) values
(operator_id,'authenticated','authenticated','biloo-admin-rollback-'||operator_id::text||'@example.invalid','{"role":"rider","full_name":"Rollback administrator"}'::jsonb,'{}'::jsonb,now(),now()),
(driver,'authenticated','authenticated','biloo-driver-rollback-'||driver::text||'@example.invalid','{"role":"driver","full_name":"Rollback driver"}'::jsonb,'{}'::jsonb,now(),now());
insert into public.profiles(id,role,account_status) values(operator_id,'admin','active') on conflict(id) do update set role='admin',account_status='active';
insert into public.profiles(id,role,account_status) values(driver,'driver','active') on conflict(id) do update set role='driver',account_status='active';
perform set_config('request.jwt.claim.sub',operator_id::text,true);
insert into public.drivers(id,review_status,is_online) values(driver,'suspended',false) on conflict(id) do update set review_status='suspended',is_online=false;
insert into public.ride_requests(pickup_location,destination_location,status,assigned_driver_id,estimated_trip_fare_etb,payment_method,payment_status) values('Rollback-only pickup','Rollback-only destination','accepted',driver,100,'cash','pending') returning id into ride;
perform set_config('request.jwt.claim.sub',driver::text,true);
begin update public.ride_requests set status='arrived_pickup' where id=ride; raise exception 'SUSPENDED_DRIVER_ADVANCED'; exception when raise_exception then if sqlerrm <> 'DRIVER_NOT_AUTHORIZED_FOR_PICKUP' then raise; end if; end;
perform set_config('request.jwt.claim.sub',operator_id::text,true);
update public.drivers set review_status='approved' where id=driver;
perform set_config('request.jwt.claim.sub',driver::text,true);
update public.ride_requests set status='arrived_pickup' where id=ride;
update public.ride_requests set status='in_trip' where id=ride;
update public.ride_requests set status='completed' where id=ride;
if not exists(select 1 from public.ride_requests where id=ride and status='completed' and payment_status='pending' and final_fare_etb=100) then raise exception 'FINAL_STATE_OR_PAYMENT_FAILED'; end if;
if (select count(*) from public.ride_journey_events where ride_request_id=ride and event_type='pickup_confirmed')<>1 then raise exception 'PICKUP_AUDIT_FAILED'; end if;
if (select count(*) from public.ride_journey_events where ride_request_id=ride and event_type='completed')<>1 then raise exception 'COMPLETION_AUDIT_FAILED'; end if;
end $$;
rollback;
select 'Driver suspension, approved pickup, trip completion, pending payment and audit checks passed; all fixtures rolled back' as verification;
