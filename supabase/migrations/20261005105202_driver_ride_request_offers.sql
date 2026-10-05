create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_location text not null,
  destination_location text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_lat double precision,
  destination_lng double precision,
  ride_category text not null default 'Economy',
  estimated_trip_fare_etb numeric(12,2),
  estimated_driver_payout_etb numeric(12,2),
  status text not null default 'pending'
    check (status in ('pending','accepted','withdrawn','cancelled','completed')),
  assigned_driver_id uuid references public.drivers(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estimated_trip_fare_etb is null or estimated_trip_fare_etb >= 0),
  check (estimated_driver_payout_etb is null or estimated_driver_payout_etb >= 0)
);

create table if not exists public.ride_request_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','withdrawn','expired')),
  pickup_distance_km numeric(8,2),
  pickup_eta_minutes integer,
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, driver_id),
  check (pickup_distance_km is null or pickup_distance_km >= 0),
  check (pickup_eta_minutes is null or pickup_eta_minutes >= 0)
);

create unique index if not exists ride_request_one_acceptance_idx
  on public.ride_request_offers (request_id)
  where status = 'accepted';

create index if not exists ride_request_offers_driver_status_idx
  on public.ride_request_offers (driver_id, status, created_at desc);

create index if not exists ride_request_offers_request_idx
  on public.ride_request_offers (request_id);

alter table public.ride_requests enable row level security;
alter table public.ride_request_offers enable row level security;

revoke all on table public.ride_requests from anon;
revoke all on table public.ride_request_offers from anon;
revoke all on table public.ride_requests from authenticated;
revoke all on table public.ride_request_offers from authenticated;

grant select on table public.ride_requests to authenticated;
grant select on table public.ride_request_offers to authenticated;
grant update (status) on table public.ride_request_offers to authenticated;

drop policy if exists "drivers_read_available_ride_requests" on public.ride_requests;
create policy "drivers_read_available_ride_requests"
on public.ride_requests
for select
to authenticated
using (
  assigned_driver_id = (select auth.uid())
  or exists (
    select 1
    from public.ride_request_offers offer
    where offer.request_id = ride_requests.id
      and offer.driver_id = (select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "drivers_read_own_ride_offers" on public.ride_request_offers;
create policy "drivers_read_own_ride_offers"
on public.ride_request_offers
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "drivers_update_own_ride_offers" on public.ride_request_offers;
create policy "drivers_update_own_ride_offers"
on public.ride_request_offers
for update
to authenticated
using (driver_id = (select auth.uid()))
with check (driver_id = (select auth.uid()));

create or replace function private.enforce_ride_offer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_status text;
  driver_ok boolean;
begin
  if new.id <> old.id
     or new.request_id <> old.request_id
     or new.driver_id <> old.driver_id
     or new.expires_at is distinct from old.expires_at
     or new.pickup_distance_km is distinct from old.pickup_distance_km
     or new.pickup_eta_minutes is distinct from old.pickup_eta_minutes
     or new.created_at <> old.created_at then
    raise exception 'RIDE_OFFER_IMMUTABLE_FIELDS';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'RIDE_OFFER_ALREADY_RESOLVED';
    end if;

    if new.status not in ('accepted','declined','withdrawn','expired') then
      raise exception 'INVALID_RIDE_OFFER_TRANSITION';
    end if;

    if new.status in ('accepted','declined') and (select auth.uid()) is distinct from old.driver_id then
      raise exception 'RIDE_OFFER_NOT_OWNED';
    end if;

    if new.status = 'accepted' then
      if old.expires_at is not null and old.expires_at <= now() then
        raise exception 'RIDE_OFFER_EXPIRED';
      end if;

      select r.status into request_status
      from public.ride_requests r
      where r.id = old.request_id;

      if request_status is distinct from 'pending' then
        raise exception 'RIDE_REQUEST_UNAVAILABLE';
      end if;

      select exists (
        select 1
        from public.drivers d
        where d.id = old.driver_id
          and d.review_status = 'approved'
          and d.is_online = true
      ) into driver_ok;

      if not driver_ok then
        raise exception 'DRIVER_NOT_ELIGIBLE';
      end if;

      new.accepted_at := coalesce(old.accepted_at, now());
    elsif new.status = 'declined' then
      new.declined_at := coalesce(old.declined_at, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.enforce_ride_offer_update() from public, anon, authenticated;

drop trigger if exists ride_offer_enforce_update on public.ride_request_offers;
create trigger ride_offer_enforce_update
before update on public.ride_request_offers
for each row execute function private.enforce_ride_offer_update();

create or replace function private.resolve_accepted_ride_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    update public.ride_requests
       set status = 'accepted',
           assigned_driver_id = new.driver_id,
           accepted_at = coalesce(accepted_at, now()),
           updated_at = now()
     where id = new.request_id
       and status = 'pending';

    if not found then
      raise exception 'RIDE_REQUEST_UNAVAILABLE';
    end if;

    update public.ride_request_offers
       set status = 'withdrawn',
           updated_at = now()
     where request_id = new.request_id
       and id <> new.id
       and status = 'pending';
  end if;

  return new;
end;
$$;

revoke execute on function private.resolve_accepted_ride_offer() from public, anon, authenticated;

drop trigger if exists ride_offer_resolve_acceptance on public.ride_request_offers;
create trigger ride_offer_resolve_acceptance
after update on public.ride_request_offers
for each row execute function private.resolve_accepted_ride_offer();

create or replace function private.withdraw_ride_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('withdrawn','cancelled') then
    update public.ride_request_offers
       set status = 'withdrawn',
           updated_at = now()
     where request_id = new.id
       and status = 'pending';
  end if;

  return new;
end;
$$;

revoke execute on function private.withdraw_ride_offers() from public, anon, authenticated;

drop trigger if exists ride_request_withdraw_offers on public.ride_requests;
create trigger ride_request_withdraw_offers
after update of status on public.ride_requests
for each row execute function private.withdraw_ride_offers();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_request_offers'
  ) then
    alter publication supabase_realtime add table public.ride_request_offers;
  end if;
end
$$;
