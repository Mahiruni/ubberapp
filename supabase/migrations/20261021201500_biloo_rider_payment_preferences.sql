-- Biloo Phase 2: payment selection preference only, not authorization to charge.
-- Cash remains the only active ride-payment method until merchant activation.
begin;
create table if not exists public.rider_payment_preferences (
  rider_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_method text not null default 'cash'
    check (preferred_method in ('cash','telebirr','cbe_birr','mpesa','awashbirr','ebirr','bank_card')),
  updated_at timestamptz not null default now()
);
comment on table public.rider_payment_preferences is
  'Customer payment-method interest only; no bank or mobile-money credentials; never payment authorization.';
alter table public.rider_payment_preferences enable row level security;
revoke all on public.rider_payment_preferences from public, anon;
grant select, insert, update on public.rider_payment_preferences to authenticated;
grant select, insert, update, delete on public.rider_payment_preferences to service_role;
drop policy if exists rider_payment_preferences_select_own on public.rider_payment_preferences;
create policy rider_payment_preferences_select_own
  on public.rider_payment_preferences for select to authenticated
  using ((select auth.uid()) = rider_id);
drop policy if exists rider_payment_preferences_insert_own on public.rider_payment_preferences;
create policy rider_payment_preferences_insert_own
  on public.rider_payment_preferences for insert to authenticated
  with check ((select auth.uid()) = rider_id);
drop policy if exists rider_payment_preferences_update_own on public.rider_payment_preferences;
create policy rider_payment_preferences_update_own
  on public.rider_payment_preferences for update to authenticated
  using ((select auth.uid()) = rider_id)
  with check ((select auth.uid()) = rider_id);
commit;
