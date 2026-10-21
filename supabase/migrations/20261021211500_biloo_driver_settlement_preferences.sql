-- Biloo Phase 3 — non-financial settlement preferences.
-- These preferences do not authorize a transfer, register a payout account,
-- create a wallet, or certify available earnings.
begin;
create table if not exists public.driver_settlement_preferences (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  requested_schedule text not null default 'weekly'
    check (requested_schedule in ('weekly', 'monthly', 'manual')),
  preferred_destination_type text not null default 'undecided'
    check (preferred_destination_type in ('undecided', 'bank', 'mobile_money')),
  updated_at timestamptz not null default now()
);
comment on table public.driver_settlement_preferences is
  'Informational driver-selected future settlement preferences only. No funds or bank credentials, no payout authorization.';
alter table public.driver_settlement_preferences enable row level security;
revoke all on public.driver_settlement_preferences from public, anon;
grant select, insert, update on public.driver_settlement_preferences to authenticated;
grant select, insert, update, delete on public.driver_settlement_preferences to service_role;

drop policy if exists driver_settlement_preferences_select_own on public.driver_settlement_preferences;
create policy driver_settlement_preferences_select_own
  on public.driver_settlement_preferences for select to authenticated
  using (driver_id = (select auth.uid()));
drop policy if exists driver_settlement_preferences_insert_own on public.driver_settlement_preferences;
create policy driver_settlement_preferences_insert_own
  on public.driver_settlement_preferences for insert to authenticated
  with check (driver_id = (select auth.uid()));
drop policy if exists driver_settlement_preferences_update_own on public.driver_settlement_preferences;
create policy driver_settlement_preferences_update_own
  on public.driver_settlement_preferences for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));
commit;
