-- Some deployed databases already have this additive lifecycle field. Ensure
-- fresh installations of the current repository have the same contract.
alter table public.ride_requests
  add column if not exists pickup_instructions text not null default '';

-- An assignment does not grant permanent permission to start a trip after an
-- account/Driver suspension. Keep the existing atomic state machine in charge
-- of stage order; this extra guard only rechecks current pickup eligibility.
create function private.guard_biloo_pickup_eligibility()
returns trigger language plpgsql set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status or actor is null then return new; end if;
  if actor = old.assigned_driver_id and new.status in ('arrived_pickup','in_trip') then
    if not exists (
      select 1 from public.drivers d join public.profiles p on p.id=d.id
      where d.id=actor and d.review_status='approved' and p.account_status='active'
    ) then raise exception 'DRIVER_NOT_AUTHORIZED_FOR_PICKUP'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_biloo_pickup_eligibility() from public, anon, authenticated;
create trigger biloo_guard_pickup_eligibility before update of status on public.ride_requests
  for each row execute function private.guard_biloo_pickup_eligibility();
