begin;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  ride_request_id uuid not null references public.ride_requests(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('chapa')),
  provider_tx_ref text not null unique,
  provider_reference text,
  idempotency_key text not null,
  amount_etb numeric(12,2) not null check (amount_etb > 0),
  currency text not null default 'ETB' check (currency='ETB'),
  status text not null default 'initialized'
    check (status in ('initialized','pending','paid','failed','cancelled')),
  checkout_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id,idempotency_key)
);

alter table public.payment_transactions enable row level security;
grant select on public.payment_transactions to authenticated;
revoke insert,update,delete on public.payment_transactions from authenticated,anon;

drop policy if exists payment_transactions_rider_read on public.payment_transactions;
create policy payment_transactions_rider_read
on public.payment_transactions
for select
to authenticated
using (
  rider_id=(select auth.uid())
  or (select private.is_admin())
);

create index if not exists payment_transactions_ride_idx
  on public.payment_transactions(ride_request_id,created_at desc);

alter table public.ride_requests
  drop constraint if exists ride_requests_payment_method_check;
alter table public.ride_requests
  add constraint ride_requests_payment_method_check
  check (payment_method in ('cash','chapa'));

create or replace function private.enforce_driver_trip_transition()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;

  if actor is null then
    if old.status='in_trip' and new.status='completed' then
      new.completed_at := coalesce(old.completed_at,now());
      new.final_fare_etb := coalesce(new.final_fare_etb,old.final_fare_etb,old.estimated_trip_fare_etb);
      if new.payment_method='cash' and new.payment_status='unknown' then new.payment_status:='pending'; end if;
    end if;
    new.updated_at:=now();
    return new;
  end if;

  if old.status='pending' and new.status='accepted'
     and new.assigned_driver_id is not null and new.assigned_driver_id=actor then
    new.accepted_at:=coalesce(old.accepted_at,now());
    new.updated_at:=now();
    return new;
  end if;

  if new.status='cancelled' and actor=old.rider_id and old.status in ('pending','accepted') then
    new.cancelled_at:=coalesce(old.cancelled_at,now());
    new.updated_at:=now();
    return new;
  end if;

  if old.assigned_driver_id is distinct from actor then
    raise exception 'TRIP_NOT_ASSIGNED_TO_DRIVER';
  end if;

  if old.status='accepted' and new.status='arrived_pickup' then
    new.pickup_arrived_at:=coalesce(old.pickup_arrived_at,now());
  elsif old.status='arrived_pickup' and new.status='in_trip' then
    new.started_at:=coalesce(old.started_at,now());
  elsif old.status='in_trip' and new.status='completed' then
    new.completed_at:=coalesce(old.completed_at,now());
    new.final_fare_etb:=coalesce(new.final_fare_etb,old.final_fare_etb,old.estimated_trip_fare_etb);
    if new.payment_method='cash' and new.payment_status='unknown' then new.payment_status:='pending'; end if;
  else
    raise exception 'INVALID_TRIP_STAGE_TRANSITION';
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.mark_payment_paid_server(
  p_transaction_id uuid,
  p_provider_reference text,
  p_provider_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  tx public.payment_transactions%rowtype;
begin
  select * into tx
  from public.payment_transactions
  where id=p_transaction_id
  for update;

  if not found then raise exception 'PAYMENT_TRANSACTION_NOT_FOUND'; end if;

  if tx.status<>'paid' then
    update public.payment_transactions
       set status='paid',
           provider_reference=coalesce(p_provider_reference,provider_reference),
           provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
           paid_at=coalesce(paid_at,now()),
           verified_at=now(),
           updated_at=now()
     where id=tx.id;

    update public.ride_requests
       set payment_method='chapa',
           payment_status='paid',
           updated_at=now()
     where id=tx.ride_request_id
       and rider_id=tx.rider_id
       and status='completed'
       and coalesce(final_fare_etb,estimated_trip_fare_etb)=tx.amount_etb;

    if not found then raise exception 'PAYMENT_RIDE_MISMATCH'; end if;
  end if;

  return jsonb_build_object(
    'transactionId',tx.id,
    'rideRequestId',tx.ride_request_id,
    'status','paid'
  );
end;
$$;

revoke all on function public.mark_payment_paid_server(uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.mark_payment_paid_server(uuid,text,jsonb)
  to service_role;

commit;
