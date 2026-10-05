begin;

create index if not exists driver_payout_requests_account_idx
  on public.driver_payout_requests(payout_account_id);

commit;
