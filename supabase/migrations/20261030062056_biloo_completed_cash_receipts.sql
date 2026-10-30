-- Activate the cash-completion policy already specified for BILOO.
-- Only a future, validated in-trip -> completed transition acknowledges cash.
-- Existing receipts, earnings, gateway payments and balances are not backfilled.
create or replace function private.mark_completed_cash_ride_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'in_trip'
     and new.status = 'completed'
     and new.payment_method = 'cash'
     and coalesce(new.payment_status, 'pending') in ('pending','unknown')
  then
    new.payment_status := 'paid';
  end if;
  return new;
end;
$$;
drop trigger if exists zz_ride_request_complete_cash_payment on public.ride_requests;
create trigger zz_ride_request_complete_cash_payment
before update of status on public.ride_requests
for each row execute function private.mark_completed_cash_ride_paid();
revoke all on function private.mark_completed_cash_ride_paid() from public, anon, authenticated;
