-- Biloo Chapa v2 payment integrity foundation.
-- Compatible with existing rider/driver tables; all live provider calls remain feature-gated.
begin;

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  provider text not null default 'chapa' check (provider = 'chapa'),
  event_type text not null,
  merchant_reference text not null,
  chapa_reference text not null,
  provider_mode text not null check (provider_mode in ('test','live')),
  processing_status text not null default 'received'
    check (processing_status in ('received','processed')),
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists payment_webhook_events_reference_idx
  on public.payment_webhook_events(merchant_reference,received_at desc);

-- Only one unresolved or successful electronic charge may exist for one ride.
-- This guards against simultaneous requests carrying different idempotency keys.
create unique index if not exists payment_transactions_one_active_ride_idx
  on public.payment_transactions(ride_request_id)
  where status in ('initialized','pending','paid');

create unique index if not exists payment_transactions_provider_reference_idx
  on public.payment_transactions(provider_reference)
  where provider_reference is not null;

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from public, anon, authenticated;
grant select, insert, update on public.payment_webhook_events to service_role;

commit;
