begin;
do $qa$
declare
  rider_id uuid:=gen_random_uuid(); other_rider uuid:=gen_random_uuid();
  driver_id uuid:=gen_random_uuid(); unapproved_driver uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid(); other_request uuid:=gen_random_uuid();
  offer_id uuid:=gen_random_uuid(); other_offer uuid:=gen_random_uuid();
  response jsonb; blocked boolean; entries integer; violated_constraint text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values (rider_id,'biloo-trip-qa-'||rider_id::text||'@example.invalid',now(),jsonb_build_object('role','rider','full_name','QA Rider','phone','+251912000011')),
    (other_rider,'biloo-trip-qa-'||other_rider::text||'@example.invalid',now(),jsonb_build_object('role','rider','full_name','QA Rider Two','phone','+251912000012')),
    (driver_id,'biloo-trip-qa-'||driver_id::text||'@example.invalid',now(),jsonb_build_object('role','rider','full_name','QA Driver','phone','+251912000013')),
    (unapproved_driver,'biloo-trip-qa-'||unapproved_driver::text||'@example.invalid',now(),jsonb_build_object('role','driver','full_name','QA Unapproved','phone','+251912000014'));
  update public.profiles set role='driver' where id=driver_id;
  insert into public.drivers(id,review_status,is_online,vehicle,vehicle_color,vehicle_plate)
    values(driver_id,'approved',true,'Toyota Yaris','white','QA1234');
  insert into public.ride_requests(id,rider_id,pickup_location,destination_location,estimated_trip_fare_etb,estimated_driver_payout_etb)
    values(request_id,rider_id,'QA Pickup','QA Destination',200,170),(other_request,other_rider,'QA Pickup Two','QA Destination Two',220,187);
  insert into public.ride_request_offers(id,request_id,driver_id,status,expires_at)
    values(offer_id,request_id,driver_id,'pending',now()+interval '5 minutes'),
      (other_offer,other_request,unapproved_driver,'pending',now()+interval '5 minutes');

  perform set_config('request.jwt.claim.sub',unapproved_driver::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  blocked:=false;
  begin perform public.driver_decide_ride_offer(other_offer,'accept');
    exception when raise_exception then
      if sqlerrm='DRIVER_NOT_ELIGIBLE' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'QA_UNAPPROVED_ACCEPTANCE_FAILED'; end if;
  blocked:=false;
  begin perform public.driver_decide_ride_offer(offer_id,'accept');
    exception when raise_exception then
      if sqlerrm='RIDE_OFFER_NOT_OWNED' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'QA_FOREIGN_OFFER_ACCESS_FAILED'; end if;

  perform set_config('request.jwt.claim.sub',driver_id::text,true);
  response:=public.driver_decide_ride_offer(offer_id,'accept');
  if response->>'status'<>'accepted' then raise exception 'QA_ACCEPTANCE_FAILED'; end if;
  if (select assigned_driver_id from public.ride_requests where id=request_id)<>driver_id then
    raise exception 'QA_ASSIGNMENT_SYNC_FAILED'; end if;
  blocked:=false;
  begin update public.ride_requests set status='in_trip' where id=request_id;
    exception when raise_exception then
      if sqlerrm='INVALID_TRIP_STAGE_TRANSITION' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'QA_PICKUP_ORDER_FAILED'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  blocked:=false;
  begin
    insert into public.ride_requests(rider_id,pickup_location,destination_location,status,assigned_driver_id)
    values(null,'Concurrent QA Pickup','Concurrent QA Destination','accepted',driver_id);
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint='biloo_one_active_trip_per_driver' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'QA_DOUBLE_DRIVER_ASSIGNMENT_FAILED'; end if;

  perform set_config('request.jwt.claim.sub',driver_id::text,true);
  set local role authenticated;
  update public.ride_requests set status='arrived_pickup' where id=request_id;
  update public.ride_requests set status='in_trip' where id=request_id;
  update public.ride_requests set status='completed' where id=request_id;
  update public.ride_requests set status='completed' where id=request_id;
  select count(*) into entries from public.driver_earnings_ledger where ride_request_id=request_id;
  if entries<>2 then raise exception 'QA_DUPLICATE_EARNINGS_FAILED'; end if;
  if (select payment_status from public.ride_requests where id=request_id)<>'pending' then
    raise exception 'QA_FAKE_PAYMENT_FAILED'; end if;
  perform set_config('request.jwt.claim.sub',rider_id::text,true);
  if not exists(select 1 from public.ride_requests where id=request_id and status='completed' and completed_at is not null) then
    raise exception 'QA_RIDER_HISTORY_FAILED'; end if;
  reset role;
end;
$qa$;
rollback;
select 'PASS: unapproved acceptance denied, foreign offer denied, atomic assignment, pickup progression enforced, driver double-assignment denied, trip completion synchronized, duplicate earnings prevented, payment kept pending, Rider history visible. All test records rolled back.' as result;
