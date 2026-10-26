-- Candidate only. No historical balances or paid states are inferred or backfilled.
-- Read docs/biloo-pay-audit.md and reconcile the real schema before applying.
begin;
create schema biloo_pay;
revoke all on schema biloo_pay from public, anon, authenticated;
grant usage on schema biloo_pay to service_role;

create table biloo_pay.settings (
  singleton boolean primary key default true check (singleton),
  schema_version text not null default '20261026.1',
  writes_enabled boolean not null default false,
  commission_bps integer check (commission_bps between 0 and 10000),
  policy_version text,
  mode text not null default 'test' check (mode in ('test','live')),
  check (not writes_enabled or (commission_bps is not null and length(policy_version)>0))
);
insert into biloo_pay.settings(singleton) values(true);
create table biloo_pay.terms (
  ride_id uuid primary key references public.ride_requests(id) on delete restrict,
  commission_bps integer not null check (commission_bps between 0 and 10000),
  policy_version text not null,
  created_at timestamptz not null default now()
);
create table biloo_pay.journals (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null check(kind in ('cash_collection','digital_collection','payout_hold','payout_paid','payout_release')),
  ride_id uuid references public.ride_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'ETB' check(currency='ETB'),
  posting_xid bigint not null default txid_current(),
  mode text not null default 'test' check(mode in ('test','live')),
  created_at timestamptz not null default now()
);
create table biloo_pay.entries (
  journal_id uuid not null references biloo_pay.journals(id) on delete restrict,
  line smallint not null,
  account text not null check(account in ('provider_clearing','driver_payable','commission_receivable','commission_revenue','payout_pending')),
  owner_id uuid references public.profiles(id) on delete restrict,
  amount_minor bigint not null check(abs(amount_minor)<=999999999999),
  primary key(journal_id,line),
  check ((account in ('driver_payable','commission_receivable','payout_pending')) = (owner_id is not null))
);
create index biloo_pay_entries_owner on biloo_pay.entries(owner_id,account);
create table biloo_pay.settlements (
  ride_id uuid primary key references public.ride_requests(id) on delete restrict,
  journal_id uuid not null unique references biloo_pay.journals(id),
  rider_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  method text not null check(method in ('cash','chapa')),
  gross_minor bigint not null check(gross_minor>0 and gross_minor<=999999999999),
  commission_minor bigint not null check(commission_minor>=0),
  driver_minor bigint not null check(driver_minor>=0),
  provider_reference text unique,
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  commission_offset_minor bigint not null default 0 check(commission_offset_minor>=0),
  check(gross_minor=commission_minor+driver_minor),
  check((method='chapa')=(provider_reference is not null))
);
create table biloo_pay.attempts (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  tx_ref text not null unique,
  amount_minor bigint not null check(amount_minor>0 and amount_minor<=999999999999),
  mode text not null check(mode in ('test','live')),
  status text not null default 'initialized' check(status in ('initialized','pending','paid','failed','cancelled')),
  checkout_url text,
  provider_reference text unique,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique(rider_id,idempotency_key)
);
-- At most one potentially chargeable checkout per ride. An uncertain request is never auto-reissued.
create unique index biloo_pay_attempt_active_ride on biloo_pay.attempts(ride_id) where status in ('initialized','pending','paid');
create table biloo_pay.webhooks (
  digest text primary key check(digest ~ '^[0-9a-f]{64}$'),
  tx_ref text not null,
  event text not null,
  state text not null check(state in ('received','retry','processed','rejected','ignored','review')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table biloo_pay.payouts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  account_id uuid not null references public.driver_payout_accounts(id) on delete restrict,
  bank_code text not null,
  account_name text not null,
  account_ciphertext text not null,
  idempotency_key text not null,
  reference text not null unique,
  amount_minor bigint not null check(amount_minor>0 and amount_minor<=999999999999),
  mode text not null check(mode in ('test','live')),
  status text not null default 'requested' check(status in ('requested','processing','paid','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(driver_id,idempotency_key)
);
create table biloo_pay.cases (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check(kind in ('refund','dispute','reconciliation')),
  reason text not null check(length(reason) between 10 and 1000),
  status text not null default 'open' check(status in ('open','under_review','closed')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);
create table biloo_pay.audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function biloo_pay.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'BILOO_PAY_IMMUTABLE'; end $$;
create function biloo_pay.journal_mode() returns trigger language plpgsql set search_path='' as $$
begin new.mode := (select mode from biloo_pay.settings); return new; end $$;
create trigger biloo_pay_journal_mode before insert on biloo_pay.journals for each row execute function biloo_pay.journal_mode();
create function biloo_pay.settings_mode() returns trigger language plpgsql set search_path='' as $$
begin
  if old.mode is distinct from new.mode and exists(select 1 from biloo_pay.journals) then raise exception 'BILOO_PAY_ENVIRONMENT_IMMUTABLE'; end if;
  return new;
end $$;
create trigger biloo_pay_settings_mode before update on biloo_pay.settings for each row execute function biloo_pay.settings_mode();
create function biloo_pay.entry_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from biloo_pay.journals where id=new.journal_id and posting_xid=txid_current()) then
    raise exception 'BILOO_PAY_JOURNAL_SEALED';
  end if;
  return new;
end $$;
create function biloo_pay.balanced() returns trigger language plpgsql set search_path='' as $$
begin
  if (select count(*)<2 or coalesce(sum(amount_minor),1)<>0 from biloo_pay.entries where journal_id=new.id) then
    raise exception 'BILOO_PAY_UNBALANCED_JOURNAL';
  end if;
  return null;
end $$;
create constraint trigger biloo_pay_journal_balanced after insert on biloo_pay.journals
  deferrable initially deferred for each row execute function biloo_pay.balanced();
create trigger biloo_pay_entry_guard before insert on biloo_pay.entries for each row execute function biloo_pay.entry_guard();
do $$ declare t text; begin
  foreach t in array array['terms','journals','entries','settlements','audit'] loop
    execute format('create trigger immutable before update or delete on biloo_pay.%I for each row execute function biloo_pay.immutable()',t);
  end loop;
  foreach t in array array['settings','terms','journals','entries','settlements','attempts','webhooks','payouts','cases','audit'] loop
    execute format('alter table biloo_pay.%I enable row level security',t);
    execute format('revoke all on biloo_pay.%I from public,anon,authenticated',t);
  end loop;
end $$;
grant select on all tables in schema biloo_pay to service_role;
grant insert on biloo_pay.terms,biloo_pay.journals,biloo_pay.entries,biloo_pay.settlements,biloo_pay.audit to service_role;
grant insert,update on biloo_pay.attempts,biloo_pay.webhooks,biloo_pay.payouts,biloo_pay.cases to service_role;

create function biloo_pay.require_writes() returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from biloo_pay.settings where writes_enabled and commission_bps is not null and length(policy_version)>0) then
    raise exception 'BILOO_PAY_NOT_ENABLED';
  end if;
end $$;
create function biloo_pay.require_actor(p_actor uuid,p_role text default null) returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and account_status='active' and (p_role is null or role=p_role) and (role<>'admin' or admin_role in ('super_admin','finance'))) then
    raise exception 'BILOO_PAY_FORBIDDEN';
  end if;
end $$;
create function public.biloo_pay_capabilities_server() returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('schemaVersion',schema_version,'writesEnabled',writes_enabled,'mode',mode) from biloo_pay.settings;
$$;

-- Snapshot the agreed commission for NEW bookings only; never reinterpret historical fares.
create function biloo_pay.capture_terms() returns trigger language plpgsql set search_path='' as $$
begin
  insert into biloo_pay.terms(ride_id,commission_bps,policy_version)
    select new.id,commission_bps,policy_version from biloo_pay.settings
    where writes_enabled and commission_bps is not null and length(policy_version)>0;
  return new;
end $$;
create trigger biloo_pay_capture_terms after insert on public.ride_requests for each row execute function biloo_pay.capture_terms();

-- Completion is a trip event, not evidence of physical cash collection.
drop trigger if exists zz_ride_request_complete_cash_payment on public.ride_requests;
create function biloo_pay.guard_ride() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin')
     or coalesce((coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role') in ('authenticated','anon'),false) then
    if new.rider_id is distinct from old.rider_id or new.assigned_driver_id is distinct from old.assigned_driver_id
      or new.payment_method is distinct from old.payment_method
      or (new.payment_status is distinct from old.payment_status and not (old.status='in_trip' and new.status='completed' and old.payment_status='unknown' and new.payment_status='pending'))
      or new.estimated_trip_fare_etb is distinct from old.estimated_trip_fare_etb
      or new.estimated_driver_payout_etb is distinct from old.estimated_driver_payout_etb
      or (new.final_fare_etb is distinct from old.final_fare_etb and
        not (old.status='in_trip' and new.status='completed' and new.final_fare_etb=coalesce(old.final_fare_etb,old.estimated_trip_fare_etb))) then
      raise exception 'BILOO_PAY_FINANCIAL_FIELDS_PROTECTED';
    end if;
  end if;
  if current_user in ('service_role','postgres','supabase_admin') then
    if exists(select 1 from biloo_pay.settlements where ride_id=old.id) then
    if new.final_fare_etb is distinct from old.final_fare_etb or new.payment_method is distinct from old.payment_method
      or new.payment_status is distinct from 'paid' or new.rider_id is distinct from old.rider_id
      or new.assigned_driver_id is distinct from old.assigned_driver_id then raise exception 'BILOO_PAY_SETTLED_RIDE_IMMUTABLE'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger zzzz_biloo_pay_guard before update on public.ride_requests for each row execute function biloo_pay.guard_ride();

-- Net cash commission only against unreserved digital funds already owed to the driver.
-- The additional debit/credit pair clears the receivable without recognizing revenue twice.
create function biloo_pay.offset_commission(p_driver uuid,p_journal uuid,p_line smallint) returns bigint
language plpgsql set search_path='' as $$
declare payable bigint; debt bigint; amount bigint;
begin
  select greatest(0,-coalesce(sum(amount_minor) filter(where account='driver_payable'),0)),
    greatest(0,coalesce(sum(amount_minor) filter(where account='commission_receivable'),0))
    into payable,debt from biloo_pay.entries where owner_id=p_driver;
  amount := least(payable,debt);
  if amount>0 then
    insert into biloo_pay.entries values(p_journal,p_line,'driver_payable',p_driver,amount),
      (p_journal,p_line+1,'commission_receivable',p_driver,-amount);
  end if;
  return amount;
end $$;

create function public.biloo_pay_confirm_cash_server(p_ride_id uuid,p_actor uuid,p_key text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.ride_requests%rowtype; s biloo_pay.settlements%rowtype; j uuid; gross bigint; fee bigint; bps integer; offset_minor bigint;
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor,'driver');
  if p_key !~ '^[A-Za-z0-9_-]{16,120}$' then raise exception 'BILOO_PAY_INVALID_KEY'; end if;
  select * into r from public.ride_requests where id=p_ride_id for update;
  if not found or r.assigned_driver_id is distinct from p_actor then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  if r.status<>'completed' or r.payment_method<>'cash' then raise exception 'BILOO_PAY_CASH_NOT_ELIGIBLE'; end if;
  if exists(select 1 from biloo_pay.journals where idempotency_key='cash:'||p_actor||':'||p_key and ride_id<>r.id) then raise exception 'BILOO_PAY_IDEMPOTENCY_CONFLICT'; end if;
  select * into s from biloo_pay.settlements where ride_id=r.id;
  if found then return jsonb_build_object('status','recorded','rideId',r.id,'existing',true); end if;
  if r.final_fare_etb is null or r.final_fare_etb<=0 then raise exception 'BILOO_PAY_FINAL_FARE_REQUIRED'; end if;
  select commission_bps into bps from biloo_pay.terms where ride_id=r.id;
  if not found then raise exception 'BILOO_PAY_TERMS_REVIEW_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261026));
  gross := (r.final_fare_etb*100)::bigint; fee := round(gross::numeric*bps/10000)::bigint;
  insert into biloo_pay.journals(idempotency_key,kind,ride_id,actor_id)
    values('cash:'||p_actor||':'||p_key,'cash_collection',r.id,p_actor) returning id into j;
  -- Driver already holds physical cash. Only Biloo's commission receivable is posted.
  insert into biloo_pay.entries values(j,1,'commission_receivable',p_actor,fee),(j,2,'commission_revenue',null,-fee);
  offset_minor := biloo_pay.offset_commission(p_actor,j,3::smallint);
  insert into biloo_pay.settlements values(r.id,j,r.rider_id,p_actor,'cash',gross,fee,gross-fee,null,p_actor,now(),offset_minor);
  update public.ride_requests set payment_status='paid',updated_at=now() where id=r.id;
  insert into biloo_pay.audit(actor_id,action,subject_id) values(p_actor,'cash_received',r.id);
  return jsonb_build_object('status','recorded','rideId',r.id,'grossMinor',gross,'commissionMinor',fee,'driverMinor',gross-fee);
end $$;

create function public.biloo_pay_begin_payment_server(p_ride_id uuid,p_actor uuid,p_key text,p_tx_ref text,p_mode text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.ride_requests%rowtype; a biloo_pay.attempts%rowtype; gross bigint;
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor,'rider');
  if p_key !~ '^[A-Za-z0-9_-]{16,120}$' or length(p_tx_ref)>120 then raise exception 'BILOO_PAY_INVALID_KEY'; end if;
  if p_mode is distinct from (select mode from biloo_pay.settings) then raise exception 'BILOO_PAY_MODE_MISMATCH'; end if;
  -- Serialize all checkout creation for this Rider: bind keys to rides and enforce the rate limit atomically.
  perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_actor::text,20261027));
  select * into a from biloo_pay.attempts where rider_id=p_actor and idempotency_key=p_key;
  if found and a.ride_id<>p_ride_id then raise exception 'BILOO_PAY_IDEMPOTENCY_CONFLICT'; end if;
  select * into r from public.ride_requests where id=p_ride_id for update;
  if not found or r.rider_id is distinct from p_actor then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  if r.status<>'completed' or r.payment_method<>'chapa' then raise exception 'BILOO_PAY_PAYMENT_NOT_ELIGIBLE'; end if;
  if exists(select 1 from biloo_pay.settlements where ride_id=r.id) then raise exception 'BILOO_PAY_ALREADY_PAID'; end if;
  if r.payment_status='paid' then raise exception 'BILOO_PAY_LEGACY_REVIEW_REQUIRED'; end if;
  if not exists(select 1 from biloo_pay.terms where ride_id=r.id) then raise exception 'BILOO_PAY_TERMS_REVIEW_REQUIRED'; end if;
  if r.final_fare_etb is null or r.final_fare_etb<=0 then raise exception 'BILOO_PAY_FINAL_FARE_REQUIRED'; end if;
  gross := (r.final_fare_etb*100)::bigint;
  select * into a from biloo_pay.attempts where rider_id=p_actor and idempotency_key=p_key;
  if found then
    if a.amount_minor<>gross or a.mode<>p_mode then raise exception 'BILOO_PAY_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(a)||jsonb_build_object('existing',true);
  end if;
  select * into a from biloo_pay.attempts where ride_id=r.id and status in ('initialized','pending','paid');
  if found then return to_jsonb(a)||jsonb_build_object('existing',true); end if;
  if (select count(*) from biloo_pay.attempts where rider_id=p_actor and created_at>now()-interval '1 hour')>=20 then raise exception 'BILOO_PAY_RATE_LIMITED'; end if;
  insert into biloo_pay.attempts(ride_id,rider_id,idempotency_key,tx_ref,amount_minor,mode)
    values(r.id,p_actor,p_key,p_tx_ref,gross,p_mode) returning * into a;
  return to_jsonb(a)||jsonb_build_object('existing',false);
end $$;
create function public.biloo_pay_save_checkout_server(p_id uuid,p_url text) returns void language plpgsql set search_path='' as $$
begin
  perform biloo_pay.require_writes();
  if p_url !~ '^https://checkout[.]chapa[.]co/' then raise exception 'BILOO_PAY_CHECKOUT_ORIGIN'; end if;
  update biloo_pay.attempts set status='pending',checkout_url=p_url where id=p_id and status='initialized';
end $$;
create function public.biloo_pay_attempt_server(p_tx_ref text) returns jsonb language sql set search_path='' as $$
  select to_jsonb(a) from biloo_pay.attempts a where tx_ref=p_tx_ref;
$$;
create function public.biloo_pay_record_webhook_server(p_digest text,p_tx_ref text,p_event text,p_state text) returns void
language plpgsql set search_path='' as $$
declare driver uuid;
begin
  if p_state='review' then
    select driver_id into driver from biloo_pay.payouts where reference=p_tx_ref;
    if driver is not null then perform pg_advisory_xact_lock(hashtextextended(driver::text,20261026)); end if;
  end if;
  insert into biloo_pay.webhooks(digest,tx_ref,event,state) values(p_digest,left(p_tx_ref,120),left(p_event,80),p_state)
  on conflict(digest) do update set state=case when biloo_pay.webhooks.state in ('processed','review') then biloo_pay.webhooks.state else excluded.state end,updated_at=now();
end $$;

create function public.biloo_pay_settle_chapa_server(p_id uuid,p_evidence jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare a biloo_pay.attempts%rowtype; r public.ride_requests%rowtype; s biloo_pay.settlements%rowtype;
  j uuid; fee bigint; bps integer; ref text; offset_minor bigint;
begin
  perform biloo_pay.require_writes();
  -- Lock order is ride then attempt, shared with checkout creation.
  select r0.* into r from public.ride_requests r0 join biloo_pay.attempts a0 on a0.ride_id=r0.id where a0.id=p_id for update of r0;
  select * into a from biloo_pay.attempts where id=p_id for update;
  if not found then raise exception 'BILOO_PAY_NOT_FOUND'; end if;
  ref := nullif(p_evidence->>'reference','');
  if p_evidence->>'status' is distinct from 'success' or p_evidence->>'currency' is distinct from 'ETB'
    or p_evidence->>'txRef' is distinct from a.tx_ref or p_evidence->>'mode' is distinct from a.mode
    or p_evidence->>'amountMinor' is distinct from a.amount_minor::text or ref is null then
    raise exception 'BILOO_PAY_PROVIDER_MISMATCH';
  end if;
  select * into s from biloo_pay.settlements where ride_id=a.ride_id;
  if found then
    if s.method<>'chapa' or s.provider_reference<>ref then raise exception 'BILOO_PAY_SETTLEMENT_CONFLICT'; end if;
    return jsonb_build_object('status','paid','existing',true);
  end if;
  if r.status<>'completed' or r.rider_id<>a.rider_id or r.assigned_driver_id is null or r.payment_method<>'chapa'
    or (r.final_fare_etb*100)::bigint is distinct from a.amount_minor or r.payment_status='paid' then
    raise exception 'BILOO_PAY_RIDE_MISMATCH';
  end if;
  select commission_bps into bps from biloo_pay.terms where ride_id=r.id;
  if not found then raise exception 'BILOO_PAY_TERMS_REVIEW_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.assigned_driver_id::text,20261026));
  fee := round(a.amount_minor::numeric*bps/10000)::bigint;
  insert into biloo_pay.journals(idempotency_key,kind,ride_id,actor_id)
    values('chapa:'||a.tx_ref,'digital_collection',r.id,a.rider_id) returning id into j;
  insert into biloo_pay.entries values(j,1,'provider_clearing',null,a.amount_minor),
    (j,2,'driver_payable',r.assigned_driver_id,-(a.amount_minor-fee)),(j,3,'commission_revenue',null,-fee);
  offset_minor := biloo_pay.offset_commission(r.assigned_driver_id,j,4::smallint);
  insert into biloo_pay.settlements values(r.id,j,r.rider_id,r.assigned_driver_id,'chapa',a.amount_minor,fee,a.amount_minor-fee,ref,r.rider_id,now(),offset_minor);
  update biloo_pay.attempts set status='paid',provider_reference=ref,verified_at=now() where id=a.id;
  update public.ride_requests set payment_status='paid',updated_at=now() where id=r.id;
  insert into biloo_pay.audit(actor_id,action,subject_id,details) values(a.rider_id,'chapa_verified',r.id,jsonb_build_object('attemptId',a.id,'reference',ref,'mode',a.mode));
  return jsonb_build_object('status','paid','rideId',r.id);
end $$;

create function biloo_pay.finance_hold(p_driver uuid) returns boolean language sql set search_path='' as $$
  select exists(select 1 from biloo_pay.cases c join public.ride_requests r on r.id=c.ride_id
    where r.assigned_driver_id=p_driver and c.status<>'closed')
  or exists(select 1 from biloo_pay.webhooks w join biloo_pay.payouts p on p.reference=w.tx_ref
    where p.driver_id=p_driver and w.state='review');
$$;
create function biloo_pay.driver_balance(p_driver uuid) returns jsonb language sql set search_path='' as $$
  with b as (
    select -coalesce(sum(amount_minor) filter(where account='driver_payable'),0) payable,
      coalesce(sum(amount_minor) filter(where account='commission_receivable'),0) debt,
      -coalesce(sum(amount_minor) filter(where account='payout_pending'),0) held
    from biloo_pay.entries where owner_id=p_driver
  ) select jsonb_build_object('availableMinor',case when biloo_pay.finance_hold(p_driver) then 0 else greatest(0,payable-debt) end,'digitalPayableMinor',payable,'commissionDueMinor',debt,'withdrawalPendingMinor',held) from b;
$$;
create function public.biloo_pay_reserve_payout_server(p_actor uuid,p_account uuid,p_minor bigint,p_key text,p_ref text) returns jsonb
language plpgsql set search_path='' as $$
declare a biloo_pay.payouts%rowtype; j uuid; available bigint; destination public.driver_payout_accounts%rowtype;
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor,'driver');
  if p_minor<=0 or p_minor>999999999999 or p_key !~ '^[A-Za-z0-9_-]{16,120}$' then raise exception 'BILOO_PAY_INVALID_PAYOUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261026));
  select * into a from biloo_pay.payouts where driver_id=p_actor and idempotency_key=p_key;
  if found then
    if a.amount_minor<>p_minor or a.account_id<>p_account then raise exception 'BILOO_PAY_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(a)||jsonb_build_object('existing',true);
  end if;
  if not exists(select 1 from public.drivers where id=p_actor and review_status='approved') then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  select * into destination from public.driver_payout_accounts where id=p_account and driver_id=p_actor and status='configured' for share;
  if not found then raise exception 'BILOO_PAY_ACCOUNT_REQUIRED'; end if;
  if biloo_pay.finance_hold(p_actor) then
    raise exception 'BILOO_PAY_FINANCE_HOLD';
  end if;
  available := (biloo_pay.driver_balance(p_actor)->>'availableMinor')::bigint;
  if p_minor>available then raise exception 'BILOO_PAY_INSUFFICIENT_FUNDS'; end if;
  insert into biloo_pay.payouts(driver_id,account_id,bank_code,account_name,account_ciphertext,idempotency_key,reference,amount_minor,mode)
    select p_actor,p_account,destination.bank_code,destination.account_name,destination.account_number_ciphertext,p_key,p_ref,p_minor,mode from biloo_pay.settings returning * into a;
  insert into biloo_pay.journals(idempotency_key,kind,actor_id) values('hold:'||a.id,'payout_hold',p_actor) returning id into j;
  insert into biloo_pay.entries values(j,1,'driver_payable',p_actor,p_minor),(j,2,'payout_pending',p_actor,-p_minor);
  insert into biloo_pay.audit(actor_id,action,subject_id) values(p_actor,'payout_reserved',a.id);
  return to_jsonb(a)||jsonb_build_object('existing',false);
end $$;
create function public.biloo_pay_payout_reference_server(p_ref text) returns jsonb language sql set search_path='' as $$
  select to_jsonb(p) from biloo_pay.payouts p where reference=p_ref;
$$;
create function public.biloo_pay_payout_server(p_id uuid) returns jsonb language sql set search_path='' as $$
  select to_jsonb(p) from biloo_pay.payouts p where id=p_id;
$$;
create function public.biloo_pay_finalize_payout_server(p_id uuid,p_state text,p_evidence jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare a biloo_pay.payouts%rowtype; j uuid;
begin
  perform biloo_pay.require_writes();
  -- All operations that change a driver's available funds share this lock.
  select * into a from biloo_pay.payouts where id=p_id;
  if not found then raise exception 'BILOO_PAY_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.driver_id::text,20261026));
  select * into a from biloo_pay.payouts where id=p_id for update;
  if a.status in ('paid','failed') then return jsonb_build_object('status',a.status); end if;
  if p_state='processing' then update biloo_pay.payouts set status='processing' where id=a.id; return jsonb_build_object('status','processing'); end if;
  if p_state not in ('paid','failed') or p_evidence->>'reference' is distinct from a.reference
    or p_evidence->>'amountMinor' is distinct from a.amount_minor::text
    or p_evidence->>'currency' is distinct from 'ETB' or p_evidence->>'mode' is distinct from a.mode
    or p_evidence->>'state' is distinct from p_state then raise exception 'BILOO_PAY_PAYOUT_EVIDENCE_REQUIRED'; end if;
  insert into biloo_pay.journals(idempotency_key,kind,actor_id) values('final:'||a.id,
    case when p_state='paid' then 'payout_paid' else 'payout_release' end,a.driver_id) returning id into j;
  insert into biloo_pay.entries values(j,1,'payout_pending',a.driver_id,a.amount_minor);
  insert into biloo_pay.entries values(j,2,case when p_state='paid' then 'provider_clearing' else 'driver_payable' end,
    case when p_state='paid' then null else a.driver_id end,-a.amount_minor);
  update biloo_pay.payouts set status=p_state,processed_at=now() where id=a.id;
  insert into biloo_pay.audit(actor_id,action,subject_id) values(a.driver_id,'payout_'||p_state,a.id);
  return jsonb_build_object('status',p_state);
end $$;

create function public.biloo_pay_snapshot_server(p_actor uuid,p_role text) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  perform biloo_pay.require_actor(p_actor,p_role);
  if p_role is null or p_role not in ('rider','driver','admin') then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  result := jsonb_build_object('status','ready','currency','ETB','mode',(select mode from biloo_pay.settings),
    'balance',case when p_role='driver' then biloo_pay.driver_balance(p_actor) else null end,
    'totals',case when p_role='rider' then null else (
      select jsonb_build_object('grossMinor',coalesce(sum(gross_minor),0),'driverMinor',coalesce(sum(driver_minor),0),
        'commissionMinor',coalesce(sum(commission_minor),0),'cashCollectedMinor',coalesce(sum(gross_minor) filter(where method='cash'),0))
      from biloo_pay.settlements where p_role='admin' or driver_id=p_actor) end,
    'settlements',coalesce((select jsonb_agg(to_jsonb(s) order by s.confirmed_at desc) from (
      select * from biloo_pay.settlements where (p_role='admin' or (p_role='driver' and driver_id=p_actor) or (p_role='rider' and rider_id=p_actor))
      order by confirmed_at desc limit 50) s),'[]'::jsonb),
    'rides',coalesce((select jsonb_agg(to_jsonb(r)) from (
      select r.id,r.pickup_location,r.destination_location,r.payment_method,r.payment_status,r.final_fare_etb,r.completed_at,
        exists(select 1 from biloo_pay.terms t where t.ride_id=r.id) as terms_ready,
        exists(select 1 from biloo_pay.settlements s where s.ride_id=r.id) as settled
      from public.ride_requests r where r.status='completed' and (p_role='admin' or (p_role='driver' and r.assigned_driver_id=p_actor) or (p_role='rider' and r.rider_id=p_actor))
      order by r.completed_at desc limit 50) r),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(to_jsonb(p)) from (select id,driver_id,amount_minor,status,reference,created_at from biloo_pay.payouts
      where p_role='admin' or (p_role='driver' and driver_id=p_actor) order by created_at desc limit 50) p),'[]'::jsonb),
    'cases',coalesce((select jsonb_agg(to_jsonb(c)) from (select * from biloo_pay.cases where p_role='admin' or actor_id=p_actor order by created_at desc limit 50) c),'[]'::jsonb));
  if p_role='admin' then
    result := result||jsonb_build_object('attempts',coalesce((select jsonb_agg(to_jsonb(a)) from (
      select id,ride_id,tx_ref,amount_minor,status,mode,created_at,verified_at from biloo_pay.attempts order by created_at desc limit 50) a),'[]'::jsonb),
      'webhooks',coalesce((select jsonb_agg(to_jsonb(w)) from (select * from biloo_pay.webhooks order by received_at desc limit 50) w),'[]'::jsonb),
      'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from biloo_pay.audit order by created_at desc limit 50) a),'[]'::jsonb));
  end if;
  return result;
end $$;
create function public.biloo_pay_open_case_server(p_actor uuid,p_ride uuid,p_kind text,p_reason text,p_key text) returns jsonb
language plpgsql set search_path='' as $$
declare c biloo_pay.cases%rowtype; driver uuid;
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor);
  if p_key !~ '^[A-Za-z0-9_-]{16,120}$' then raise exception 'BILOO_PAY_INVALID_KEY'; end if;
  if not exists(select 1 from public.ride_requests r join public.profiles p on p.id=p_actor
    where r.id=p_ride and (r.rider_id=p_actor or r.assigned_driver_id=p_actor or p.role='admin')) then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  select assigned_driver_id into driver from public.ride_requests where id=p_ride;
  if driver is not null then perform pg_advisory_xact_lock(hashtextextended(driver::text,20261026)); end if;
  select * into c from biloo_pay.cases where actor_id=p_actor and idempotency_key=p_key;
  if found then
    if c.ride_id<>p_ride or c.kind<>p_kind or c.reason<>p_reason then raise exception 'BILOO_PAY_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(c);
  end if;
  insert into biloo_pay.cases(ride_id,actor_id,kind,reason,idempotency_key) values(p_ride,p_actor,p_kind,p_reason,p_key) returning * into c;
  insert into biloo_pay.audit(actor_id,action,subject_id) values(p_actor,'case_opened',c.id);
  return to_jsonb(c);
end $$;

create function public.biloo_pay_save_account_server(p_actor uuid,p_bank_code text,p_bank_name text,p_name text,p_ciphertext text,p_last4 text) returns void
language plpgsql set search_path='' as $$
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor,'driver');
  if not exists(select 1 from public.drivers where id=p_actor and review_status='approved') then raise exception 'BILOO_PAY_FORBIDDEN'; end if;
  if p_last4 !~ '^[0-9]{4}$' or length(p_bank_code) not between 1 and 40 or length(p_name) not between 2 and 120
    or p_ciphertext !~ '^v1[.]' then raise exception 'BILOO_PAY_INVALID_ACCOUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,20261026));
  insert into public.driver_payout_accounts(driver_id,provider,bank_code,bank_name,account_name,account_number_ciphertext,account_number_last4,status,updated_at)
    values(p_actor,'chapa',p_bank_code,p_bank_name,p_name,p_ciphertext,p_last4,'configured',now())
  on conflict(driver_id) do update set bank_code=excluded.bank_code,bank_name=excluded.bank_name,account_name=excluded.account_name,
    account_number_ciphertext=excluded.account_number_ciphertext,account_number_last4=excluded.account_number_last4,status='configured',updated_at=now();
  insert into biloo_pay.audit(actor_id,action,details) values(p_actor,'payout_account_saved',jsonb_build_object('bankCode',p_bank_code,'last4',p_last4));
end $$;
create function public.biloo_pay_admin_audit_server(p_actor uuid,p_subject uuid,p_action text) returns void
language plpgsql set search_path='' as $$
begin
  perform biloo_pay.require_actor(p_actor,'admin');
  if p_action not in ('payment_verification_requested','payout_verification_requested') then raise exception 'BILOO_PAY_INVALID_ACTION'; end if;
  insert into biloo_pay.audit(actor_id,action,subject_id) values(p_actor,p_action,p_subject);
end $$;
create function public.biloo_pay_provider_review_server(p_tx_ref text,p_event text,p_digest text) returns void
language plpgsql set search_path='' as $$
declare a biloo_pay.attempts%rowtype; driver uuid;
begin
  perform biloo_pay.require_writes();
  select * into a from biloo_pay.attempts where tx_ref=p_tx_ref;
  if not found then return; end if;
  select assigned_driver_id into driver from public.ride_requests where id=a.ride_id;
  perform pg_advisory_xact_lock(hashtextextended(driver::text,20261026));
  insert into biloo_pay.cases(ride_id,actor_id,kind,reason,idempotency_key)
    values(a.ride_id,a.rider_id,'reconciliation','Signed Chapa event requires provider reconciliation: '||left(p_event,80),'provider_'||p_digest)
    on conflict(actor_id,idempotency_key) do nothing;
  insert into biloo_pay.audit(action,subject_id,details) values('provider_review_required',a.ride_id,jsonb_build_object('event',p_event,'digest',p_digest));
end $$;
create function public.biloo_pay_review_case_server(p_actor uuid,p_id uuid,p_state text,p_note text) returns jsonb
language plpgsql set search_path='' as $$
begin
  perform biloo_pay.require_writes(); perform biloo_pay.require_actor(p_actor,'admin');
  if p_state not in ('under_review','closed') or length(trim(p_note))<10 or length(p_note)>1000 then raise exception 'BILOO_PAY_INVALID_CASE_REVIEW'; end if;
  if p_state='closed' and exists(select 1 from biloo_pay.cases where id=p_id and kind in ('refund','reconciliation')) then raise exception 'BILOO_PAY_PROVIDER_REVIEW_REQUIRED'; end if;
  update biloo_pay.cases set status=p_state where id=p_id;
  if not found then raise exception 'BILOO_PAY_NOT_FOUND'; end if;
  insert into biloo_pay.audit(actor_id,action,subject_id,details) values(p_actor,'case_'||p_state,p_id,jsonb_build_object('note',p_note));
  return jsonb_build_object('status',p_state);
end $$;

-- Remove legacy financial RPC bypasses. Existing data is retained for reconciliation.
revoke execute on function public.mark_payment_paid_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.reserve_driver_payout_server(uuid,uuid,numeric,text,text) from public,anon,authenticated,service_role;
revoke execute on function public.finalize_driver_payout_server(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
do $$ begin
  if to_regprocedure('public.trip_transition(uuid,text,integer,integer,bigint)') is not null then
    revoke execute on function public.trip_transition(uuid,text,integer,integer,bigint) from public,anon,authenticated,service_role;
  end if;
end $$;
-- Explicitly grant only the service role; functions use invoker privileges, never bypass RLS.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='biloo_pay' or (n.nspname='public' and p.proname like 'biloo_pay_%') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
