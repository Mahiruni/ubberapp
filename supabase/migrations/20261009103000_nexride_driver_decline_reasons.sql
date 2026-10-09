-- Preserve a driver's selected decline reason without changing the
-- race-safe dispatch RPC or broadening rider/driver permissions.
create table if not exists public.ride_offer_decline_reasons (
  offer_id uuid primary key references public.ride_request_offers(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'distance', 'fare', 'pickup', 'direction', 'other'
  )),
  created_at timestamptz not null default now()
);

create index if not exists ride_offer_decline_reasons_driver_idx
  on public.ride_offer_decline_reasons (driver_id, created_at desc);

alter table public.ride_offer_decline_reasons enable row level security;

drop policy if exists driver_reads_own_offer_decline_reasons
  on public.ride_offer_decline_reasons;
create policy driver_reads_own_offer_decline_reasons
  on public.ride_offer_decline_reasons
  for select to authenticated
  using (driver_id = (select auth.uid()));

revoke all on public.ride_offer_decline_reasons from anon;
grant select on public.ride_offer_decline_reasons to authenticated;
grant all on public.ride_offer_decline_reasons to service_role;

-- This function delegates the decision to the existing transactional RPC,
-- then saves the reason within the SAME database transaction. Any failure
-- rolls back both operations, so a reason cannot be orphaned.
create or replace function public.driver_decline_ride_offer_with_reason(
  p_offer_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  actor uuid := (select auth.uid());
  owner_id uuid;
  decision jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason is null or p_reason not in
    ('distance', 'fare', 'pickup', 'direction', 'other')
  then
    raise exception 'INVALID_DECLINE_REASON';
  end if;

  select driver_id into owner_id
    from public.ride_request_offers
    where id = p_offer_id;
  if not found or owner_id is distinct from actor then
    raise exception 'RIDE_OFFER_NOT_OWNED';
  end if;

  decision := public.driver_decide_ride_offer(p_offer_id, 'decline');

  if decision->>'status' = 'declined' then
    insert into public.ride_offer_decline_reasons(offer_id, driver_id, reason)
    values (p_offer_id, actor, p_reason)
    on conflict (offer_id) do nothing;
  end if;

  return decision;
end;
$function$;

revoke all on function public.driver_decline_ride_offer_with_reason(uuid,text)
  from public, anon, authenticated;
grant execute on function public.driver_decline_ride_offer_with_reason(uuid,text)
  to authenticated, service_role;
