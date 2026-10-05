create table if not exists public.driver_online_sessions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists driver_online_sessions_one_active_idx
  on public.driver_online_sessions (driver_id)
  where ended_at is null;

create index if not exists driver_online_sessions_driver_started_idx
  on public.driver_online_sessions (driver_id, started_at desc);

alter table public.driver_online_sessions enable row level security;

revoke all on table public.driver_online_sessions from anon;
revoke all on table public.driver_online_sessions from authenticated;
grant select on table public.driver_online_sessions to authenticated;

drop policy if exists "drivers_read_own_online_sessions" on public.driver_online_sessions;
create policy "drivers_read_own_online_sessions"
on public.driver_online_sessions
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin())
);

create or replace function private.sync_driver_online_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_online is not distinct from new.is_online then
    return new;
  end if;

  if new.is_online then
    insert into public.driver_online_sessions (driver_id, started_at)
    values (new.id, now())
    on conflict do nothing;
  else
    update public.driver_online_sessions
       set ended_at = now()
     where driver_id = new.id
       and ended_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_driver_online_session() from public, anon, authenticated;

drop trigger if exists driver_sync_online_session on public.drivers;
create trigger driver_sync_online_session
after update of is_online on public.drivers
for each row execute function private.sync_driver_online_session();

insert into public.driver_online_sessions (driver_id, started_at)
select d.id, now()
from public.drivers d
where d.is_online = true
  and not exists (
    select 1
    from public.driver_online_sessions s
    where s.driver_id = d.id
      and s.ended_at is null
  );

create table if not exists public.driver_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  ride_request_id uuid references public.ride_requests(id) on delete set null,
  entry_type text not null
    check (entry_type in ('gross_fare','driver_earning','deduction','adjustment','payout')),
  amount_etb numeric(12,2) not null check (amount_etb >= 0),
  status text not null default 'posted'
    check (status in ('pending','posted','processing','paid','void')),
  label text,
  details jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_earnings_ledger_driver_effective_idx
  on public.driver_earnings_ledger (driver_id, effective_at desc);

create index if not exists driver_earnings_ledger_ride_idx
  on public.driver_earnings_ledger (ride_request_id)
  where ride_request_id is not null;

alter table public.driver_earnings_ledger enable row level security;

revoke all on table public.driver_earnings_ledger from anon;
revoke all on table public.driver_earnings_ledger from authenticated;
grant select on table public.driver_earnings_ledger to authenticated;

drop policy if exists "drivers_read_own_earnings_ledger" on public.driver_earnings_ledger;
create policy "drivers_read_own_earnings_ledger"
on public.driver_earnings_ledger
for select
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin())
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_earnings_ledger'
  ) then
    alter publication supabase_realtime add table public.driver_earnings_ledger;
  end if;
end
$$;
