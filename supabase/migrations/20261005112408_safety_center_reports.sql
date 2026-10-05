create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ride_request_id uuid references public.ride_requests(id) on delete set null,
  trip_reference text,
  category text not null
    check (category in ('safety_concern','unsafe_driving','vehicle_issue','harassment','payment_issue','lost_item','other')),
  details text,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted','reviewing','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (details is null or char_length(details) <= 4000),
  check (trip_reference is null or char_length(trip_reference) <= 120)
);

create index if not exists safety_reports_user_created_idx
  on public.safety_reports (user_id, created_at desc);

create index if not exists safety_reports_ride_idx
  on public.safety_reports (ride_request_id)
  where ride_request_id is not null;

alter table public.safety_reports enable row level security;

revoke all on table public.safety_reports from anon;
revoke all on table public.safety_reports from authenticated;
grant select on table public.safety_reports to authenticated;
grant insert (ride_request_id, trip_reference, category, details, context) on table public.safety_reports to authenticated;

drop policy if exists "users_read_own_safety_reports" on public.safety_reports;
create policy "users_read_own_safety_reports"
on public.safety_reports
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "users_submit_own_safety_reports" on public.safety_reports;
create policy "users_submit_own_safety_reports"
on public.safety_reports
for insert
to authenticated
with check (user_id = (select auth.uid()));

create or replace function private.touch_safety_report_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_safety_report_updated_at() from public, anon, authenticated;

drop trigger if exists safety_report_touch_updated_at on public.safety_reports;
create trigger safety_report_touch_updated_at
before update on public.safety_reports
for each row execute function private.touch_safety_report_updated_at();
