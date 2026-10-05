begin;

create table if not exists public.driver_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.drivers(id) on delete cascade,
  provider text not null default 'chapa' check (provider in ('chapa')),
  bank_code text not null,
  bank_name text not null,
  account_name text not null,
  account_number_ciphertext text not null,
  account_number_last4 text not null check (char_length(account_number_last4) between 1 and 4),
  status text not null default 'configured'
    check (status in ('configured','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_payout_requests (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  payout_account_id uuid not null references public.driver_payout_accounts(id) on delete restrict,
  provider text not null default 'chapa' check (provider in ('chapa')),
  provider_reference text not null unique,
  idempotency_key text not null,
  amount_etb numeric(12,2) not null check (amount_etb > 0),
  currency text not null default 'ETB' check (currency = 'ETB'),
  status text not null default 'requested'
    check (status in ('requested','processing','paid','failed','cancelled')),
  provider_payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id,idempotency_key)
);

create index if not exists driver_payout_requests_driver_created_idx
  on public.driver_payout_requests(driver_id,created_at desc);

alter table public.driver_payout_accounts enable row level security;
alter table public.driver_payout_requests enable row level security;

revoke all on public.driver_payout_accounts from anon,authenticated;
revoke insert,update,delete on public.driver_payout_requests from anon,authenticated;
grant select on public.driver_payout_requests to authenticated;
grant select,insert,update,delete on public.driver_payout_accounts to service_role;
grant select,insert,update,delete on public.driver_payout_requests to service_role;
grant select,insert,update,delete on public.driver_earnings_ledger to service_role;

drop policy if exists driver_payout_requests_read_own on public.driver_payout_requests;
create policy driver_payout_requests_read_own
on public.driver_payout_requests
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin())
);

create or replace function public.reserve_driver_payout_server(
  p_driver_id uuid,
  p_payout_account_id uuid,
  p_amount_etb numeric,
  p_idempotency_key text,
  p_provider_reference text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing public.driver_payout_requests%rowtype;
  created public.driver_payout_requests%rowtype;
  available numeric(12,2);
begin
  if p_amount_etb is null or p_amount_etb <= 0 then
    raise exception 'PAYOUT_AMOUNT_INVALID';
  end if;
  if char_length(coalesce(p_idempotency_key,'')) < 16
     or char_length(p_idempotency_key) > 120 then
    raise exception 'PAYOUT_IDEMPOTENCY_INVALID';
  end if;

  perform 1
  from public.drivers
  where id=p_driver_id
  for update;
  if not found then raise exception 'PAYOUT_DRIVER_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.drivers d
    join public.profiles p on p.id=d.id
    where d.id=p_driver_id
      and d.review_status='approved'
      and p.role='driver'
      and p.account_status='active'
  ) then
    raise exception 'PAYOUT_DRIVER_NOT_ELIGIBLE';
  end if;

  if not exists (
    select 1
    from public.driver_payout_accounts a
    where a.id=p_payout_account_id
      and a.driver_id=p_driver_id
      and a.status='configured'
  ) then
    raise exception 'PAYOUT_ACCOUNT_INVALID';
  end if;

  select * into existing
  from public.driver_payout_requests
  where driver_id=p_driver_id
    and idempotency_key=p_idempotency_key
  limit 1;

  if found then
    if existing.amount_etb <> round(p_amount_etb,2) then
      raise exception 'PAYOUT_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'requestId',existing.id,
      'status',existing.status,
      'providerReference',existing.provider_reference,
      'amountEtb',existing.amount_etb,
      'existing',true
    );
  end if;

  select coalesce(sum(
    case
      when entry_type='driver_earning' and status in ('posted','paid') then amount_etb
      when entry_type='adjustment' and status in ('posted','paid') then amount_etb
      when entry_type='deduction' and status in ('posted','paid') then -amount_etb
      when entry_type='payout' and status in ('pending','processing','paid') then -amount_etb
      else 0
    end
  ),0)::numeric(12,2)
  into available
  from public.driver_earnings_ledger
  where driver_id=p_driver_id;

  if round(p_amount_etb,2) > available then
    raise exception 'PAYOUT_INSUFFICIENT_AVAILABLE_EARNINGS';
  end if;

  insert into public.driver_payout_requests (
    driver_id,payout_account_id,provider,provider_reference,
    idempotency_key,amount_etb,currency,status
  ) values (
    p_driver_id,p_payout_account_id,'chapa',p_provider_reference,
    p_idempotency_key,round(p_amount_etb,2),'ETB','requested'
  )
  returning * into created;

  insert into public.driver_earnings_ledger (
    driver_id,entry_type,amount_etb,status,label,details,effective_at
  ) values (
    p_driver_id,
    'payout',
    created.amount_etb,
    'pending',
    'Payout requested',
    jsonb_build_object(
      'payout_request_id',created.id,
      'provider','chapa',
      'provider_reference',created.provider_reference
    ),
    now()
  );

  return jsonb_build_object(
    'requestId',created.id,
    'status',created.status,
    'providerReference',created.provider_reference,
    'amountEtb',created.amount_etb,
    'availableAfter',available-created.amount_etb,
    'existing',false
  );
end;
$$;

create or replace function public.finalize_driver_payout_server(
  p_request_id uuid,
  p_status text,
  p_provider_payload jsonb default '{}'::jsonb,
  p_failure_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  req public.driver_payout_requests%rowtype;
  ledger_status text;
begin
  if p_status not in ('processing','paid','failed') then
    raise exception 'PAYOUT_FINAL_STATUS_INVALID';
  end if;

  select * into req
  from public.driver_payout_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'PAYOUT_REQUEST_NOT_FOUND'; end if;

  if req.status='paid' then
    return jsonb_build_object('requestId',req.id,'status','paid');
  end if;

  if req.status in ('failed','cancelled') and p_status <> req.status then
    raise exception 'PAYOUT_REQUEST_FINALIZED';
  end if;

  ledger_status :=
    case
      when p_status='processing' then 'processing'
      when p_status='paid' then 'paid'
      else 'void'
    end;

  update public.driver_payout_requests
     set status=p_status,
         provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
         failure_reason=case when p_status='failed' then left(coalesce(p_failure_reason,'Provider rejected payout'),240) else null end,
         processed_at=case when p_status in ('paid','failed') then coalesce(processed_at,now()) else processed_at end,
         updated_at=now()
   where id=req.id;

  update public.driver_earnings_ledger
     set status=ledger_status,
         label=case
           when p_status='processing' then 'Payout processing'
           when p_status='paid' then 'Payout paid'
           else 'Payout failed'
         end,
         updated_at=now()
   where driver_id=req.driver_id
     and entry_type='payout'
     and details->>'payout_request_id'=req.id::text;

  return jsonb_build_object(
    'requestId',req.id,
    'status',p_status
  );
end;
$$;

revoke all on function public.reserve_driver_payout_server(uuid,uuid,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.reserve_driver_payout_server(uuid,uuid,numeric,text,text)
  to service_role;

revoke all on function public.finalize_driver_payout_server(uuid,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.finalize_driver_payout_server(uuid,text,jsonb,text)
  to service_role;

commit;
