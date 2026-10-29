-- Versioned, backwards-compatible native ride alerts. No fare/ledger or matching changes.
alter table public.nexride_push_devices
  add column if not exists alert_protocol smallint not null default 0
  check (alert_protocol in (0,1));
alter table public.nexride_push_outbox drop constraint if exists nexride_push_outbox_kind_check;
alter table public.nexride_push_outbox add constraint nexride_push_outbox_kind_check
  check (kind in ('driver_offer','driver_offer_closed','rider_trip'));

-- A single terminal event per offer is sufficient, regardless of which state ended it.
create or replace function private.biloo_close_native_ride_alerts()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='ride_request_offers' then
    if old.status='pending' and new.status is distinct from old.status then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,offer_id,request_id,expected_status)
      values ('offer-closed:'||new.id::text,new.driver_id,'driver','driver_offer_closed',new.id,new.request_id,new.status)
      on conflict(dedupe_key) do nothing;
    end if;
  elsif tg_table_name='ride_requests' then
    if new.status not in ('pending','requested','searching') and new.status is distinct from old.status then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,offer_id,request_id,expected_status)
      select 'offer-closed:'||o.id::text,o.driver_id,'driver','driver_offer_closed',o.id,o.request_id,new.status
      from public.ride_request_offers o where o.request_id=new.id and o.status in ('pending','accepted')
      on conflict(dedupe_key) do nothing;
    end if;
  elsif tg_table_name='drivers' then
    if not new.is_online or new.review_status is distinct from 'approved' then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,offer_id,request_id,expected_status)
      select 'offer-closed:'||o.id::text,o.driver_id,'driver','driver_offer_closed',o.id,o.request_id,'driver_unavailable'
      from public.ride_request_offers o where o.driver_id=new.id and o.status='pending'
      on conflict(dedupe_key) do nothing;
    end if;
  elsif tg_table_name='profiles' then
    if new.account_status is distinct from 'active' then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,offer_id,request_id,expected_status)
      select 'offer-closed:'||o.id::text,o.driver_id,'driver','driver_offer_closed',o.id,o.request_id,'account_unavailable'
      from public.ride_request_offers o where o.driver_id=new.id and o.status='pending'
      on conflict(dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.biloo_close_native_ride_alerts() from public,anon,authenticated;
create trigger biloo_offer_close_native_alert after update of status on public.ride_request_offers
  for each row when (old.status is distinct from new.status) execute function private.biloo_close_native_ride_alerts();
create trigger biloo_ride_close_native_alert after update of status on public.ride_requests
  for each row when (old.status is distinct from new.status) execute function private.biloo_close_native_ride_alerts();
create trigger biloo_driver_close_native_alert after update of is_online,review_status on public.drivers
  for each row when (old.is_online is distinct from new.is_online or old.review_status is distinct from new.review_status)
  execute function private.biloo_close_native_ride_alerts();
create trigger biloo_account_close_native_alert after update of account_status on public.profiles
  for each row when (old.account_status is distinct from new.account_status) execute function private.biloo_close_native_ride_alerts();

-- Dispatch promptly after commit. The existing ten-second cron remains the retry safety net.
-- Reuse the existing encrypted worker secret; never expose it to an application client.
create or replace function private.biloo_wake_native_push_worker()
returns trigger language plpgsql security definer set search_path='' as $$
declare worker_token text;
begin
  begin
    select decrypted_secret into worker_token from vault.decrypted_secrets where name='nexride_push_worker_token' limit 1;
    if worker_token is not null and length(worker_token)>=20 then
      perform net.http_get(
        url:='https://ubberapp.vercel.app/api/internal/push-drain',
        headers:=jsonb_build_object('Authorization','Bearer '||worker_token),
        timeout_milliseconds:=15000);
    end if;
  exception when others then
    -- Notification transport must never roll back an accepted/declined ride.
    null;
  end;
  return new;
end;
$$;
revoke all on function private.biloo_wake_native_push_worker() from public,anon,authenticated;
create trigger biloo_native_push_wake after insert on public.nexride_push_outbox
  for each row when (new.status='pending') execute function private.biloo_wake_native_push_worker();
