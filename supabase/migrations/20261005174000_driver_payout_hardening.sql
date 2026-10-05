begin;

create index if not exists driver_payout_requests_account_idx
  on public.driver_payout_requests(payout_account_id);

drop policy if exists driver_payout_accounts_authenticated_deny on public.driver_payout_accounts;
create policy driver_payout_accounts_authenticated_deny
on public.driver_payout_accounts
for all
to authenticated
using (false)
with check (false);

commit;
