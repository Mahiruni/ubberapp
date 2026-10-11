-- NexRide Phase 1: push delivery outbox and privately registered Android devices.
-- No app role may read notification tokens or send arbitrary push messages.
create table if not exists public.nexride_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('rider','driver')),
  installation_id uuid not null,
  fcm_token text not null check (char_length(fcm_token) between 30 and 4096),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,role,installation_id)
);
create index if not exists nexride_push_devices_owner on public.nexride_push_devices(user_id,role)
  where enabled;
create table if not exists public.nexride_push_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('rider','driver')),
  kind text not null check (kind in ('driver_offer','rider_trip')),
  offer_id uuid,
  request_id uuid,
  expected_status text,
  status text not null default 'pending' check (status in ('pending','processing','sent','skipped')),
  attempts smallint not null default 0,
  retry_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists nexride_push_pending on public.nexride_push_outbox(retry_at,created_at)
 where status in ('pending','processing');
alter table public.nexride_push_devices enable row level security;
alter table public.nexride_push_outbox enable row level security;
revoke all on public.nexride_push_devices,public.nexride_push_outbox from public,anon,authenticated;
grant all on public.nexride_push_devices,public.nexride_push_outbox to service_role;
create or replace function private.nexride_queue_native_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='ride_request_offers' then
    if tg_op='INSERT' and new.status='pending' then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,offer_id,request_id,expected_status)
      values ('offer:'||new.id::text,new.driver_id,'driver','driver_offer',new.id,new.request_id,'pending')
      on conflict (dedupe_key) do nothing;
    end if;
  elsif tg_table_name='ride_requests' then
    if tg_op='UPDATE' and new.status is distinct from old.status
      and new.rider_id is not null
      and new.status in ('accepted','arrived_pickup','in_trip','completed','cancelled') then
      insert into public.nexride_push_outbox(dedupe_key,user_id,role,kind,request_id,expected_status)
      values ('ride:'||new.id::text||':'||new.status,new.rider_id,'rider','rider_trip',new.id,new.status)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.nexride_queue_native_notification() from public,anon,authenticated;
drop trigger if exists nexride_offer_native_push_outbox on public.ride_request_offers;
create trigger nexride_offer_native_push_outbox after insert on public.ride_request_offers
 for each row execute function private.nexride_queue_native_notification();
drop trigger if exists nexride_ride_native_push_outbox on public.ride_requests;
create trigger nexride_ride_native_push_outbox after update of status on public.ride_requests
 for each row execute function private.nexride_queue_native_notification();
-- Only the server-side worker can claim events, with row-level concurrency protection.
create or replace function public.nexride_claim_native_push_server(p_limit integer default 20)
returns setof public.nexride_push_outbox
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  return query
  update public.nexride_push_outbox n set
    status='processing', attempts=n.attempts+1, claimed_at=now()
  where n.id in (
    select q.id from public.nexride_push_outbox q
    where ((q.status='pending' and q.retry_at<=now())
       or (q.status='processing' and q.claimed_at<now()-interval '2 minutes'))
      and q.attempts<6
    order by q.created_at for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),30)
  )
  returning n.*;
end;
$$;
revoke all on function public.nexride_claim_native_push_server(integer) from public,anon,authenticated;
grant execute on function public.nexride_claim_native_push_server(integer) to service_role;
