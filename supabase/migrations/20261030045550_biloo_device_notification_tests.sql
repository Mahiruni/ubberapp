-- User-initiated notification tests use the existing private outbox and worker.
-- An explicit device target prevents a test from notifying other installations.
alter table public.nexride_push_outbox
  add column if not exists device_id uuid references public.nexride_push_devices(id) on delete set null;
create index if not exists nexride_push_outbox_device_test
  on public.nexride_push_outbox(device_id,created_at desc) where device_id is not null;
alter table public.nexride_push_outbox drop constraint if exists nexride_push_outbox_kind_check;
alter table public.nexride_push_outbox add constraint nexride_push_outbox_kind_check
  check (kind in ('driver_offer','driver_offer_closed','rider_trip','device_test'));
alter table public.nexride_push_outbox add constraint biloo_device_test_is_not_a_ride
  check (kind <> 'device_test' or (role='driver' and offer_id is null and request_id is null));
-- Existing RLS and service-role-only grants remain in force. Browser clients
-- cannot read tokens, insert tests, change their target or alter rate-limit keys.
