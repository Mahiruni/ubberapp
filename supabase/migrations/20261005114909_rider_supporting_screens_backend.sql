alter table public.ride_requests
  add column if not exists rider_id uuid references public.profiles(id) on delete set null,
  add column if not exists final_fare_etb numeric(12,2),
  add column if not exists payment_method text not null default 'cash',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.ride_requests
  drop constraint if exists ride_requests_final_fare_etb_check;
alter table public.ride_requests
  add constraint ride_requests_final_fare_etb_check
  check (final_fare_etb is null or final_fare_etb >= 0);

alter table public.ride_requests
  drop constraint if exists ride_requests_payment_method_check;
alter table public.ride_requests
  add constraint ride_requests_payment_method_check
  check (payment_method in ('cash'));

alter table public.ride_requests
  drop constraint if exists ride_requests_payment_status_check;
alter table public.ride_requests
  add constraint ride_requests_payment_status_check
  check (payment_status in ('pending','paid','failed','unknown'));

create index if not exists ride_requests_rider_history_idx
  on public.ride_requests (rider_id, created_at desc)
  where rider_id is not null;

drop policy if exists "riders_read_own_ride_requests" on public.ride_requests;
create policy "riders_read_own_ride_requests"
on public.ride_requests
for select
to authenticated
using (
  rider_id = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "participants_read_active_trip_profiles" on public.profiles;
create policy "participants_read_active_trip_profiles"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
  or exists (
    select 1
    from public.ride_requests r
    where r.status in ('accepted','arrived_pickup','in_trip')
      and (
        (r.rider_id = (select auth.uid()) and r.assigned_driver_id = profiles.id)
        or
        (r.assigned_driver_id = (select auth.uid()) and r.rider_id = profiles.id)
      )
  )
);

create table if not exists public.ride_chat_messages (
  id uuid primary key default gen_random_uuid(),
  ride_request_id uuid not null references public.ride_requests(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  client_nonce uuid,
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) between 1 and 2000),
  unique (sender_id, client_nonce)
);

create index if not exists ride_chat_messages_ride_created_idx
  on public.ride_chat_messages (ride_request_id, created_at);

alter table public.ride_chat_messages enable row level security;
revoke all on table public.ride_chat_messages from anon;
revoke all on table public.ride_chat_messages from authenticated;
grant select on table public.ride_chat_messages to authenticated;
grant insert (ride_request_id, body, client_nonce) on table public.ride_chat_messages to authenticated;

drop policy if exists "trip_participants_read_chat" on public.ride_chat_messages;
create policy "trip_participants_read_chat"
on public.ride_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.ride_requests r
    where r.id = ride_chat_messages.ride_request_id
      and (
        r.rider_id = (select auth.uid())
        or r.assigned_driver_id = (select auth.uid())
      )
  )
  or (select private.is_admin())
);

drop policy if exists "trip_participants_send_active_chat" on public.ride_chat_messages;
create policy "trip_participants_send_active_chat"
on public.ride_chat_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.ride_requests r
    where r.id = ride_chat_messages.ride_request_id
      and r.status in ('accepted','arrived_pickup','in_trip')
      and (
        r.rider_id = (select auth.uid())
        or r.assigned_driver_id = (select auth.uid())
      )
  )
);

create table if not exists public.ride_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_request_id uuid not null references public.ride_requests(id) on delete cascade,
  rater_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  feedback text,
  created_at timestamptz not null default now(),
  check (feedback is null or char_length(feedback) <= 1000),
  unique (ride_request_id, rater_id)
);

alter table public.ride_ratings enable row level security;
revoke all on table public.ride_ratings from anon;
revoke all on table public.ride_ratings from authenticated;
grant select on table public.ride_ratings to authenticated;
grant insert (ride_request_id, score, feedback) on table public.ride_ratings to authenticated;

drop policy if exists "riders_read_own_ride_ratings" on public.ride_ratings;
create policy "riders_read_own_ride_ratings"
on public.ride_ratings
for select
to authenticated
using (
  rater_id = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "riders_rate_completed_ride" on public.ride_ratings;
create policy "riders_rate_completed_ride"
on public.ride_ratings
for insert
to authenticated
with check (
  rater_id = (select auth.uid())
  and exists (
    select 1
    from public.ride_requests r
    where r.id = ride_ratings.ride_request_id
      and r.rider_id = (select auth.uid())
      and r.status = 'completed'
  )
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ride_request_id uuid references public.ride_requests(id) on delete set null,
  category text not null
    check (category in ('trip_issue','payment','driver','app','lost_item','other')),
  details text not null,
  status text not null default 'submitted'
    check (status in ('submitted','reviewing','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(details)) between 1 and 4000)
);

create index if not exists support_requests_user_created_idx
  on public.support_requests (user_id, created_at desc);

alter table public.support_requests enable row level security;
revoke all on table public.support_requests from anon;
revoke all on table public.support_requests from authenticated;
grant select on table public.support_requests to authenticated;
grant insert (ride_request_id, category, details) on table public.support_requests to authenticated;

drop policy if exists "users_read_own_support_requests" on public.support_requests;
create policy "users_read_own_support_requests"
on public.support_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "users_submit_support_requests" on public.support_requests;
create policy "users_submit_support_requests"
on public.support_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    ride_request_id is null
    or exists (
      select 1
      from public.ride_requests r
      where r.id = support_requests.ride_request_id
        and (
          r.rider_id = (select auth.uid())
          or r.assigned_driver_id = (select auth.uid())
        )
    )
  )
);

create or replace function private.touch_support_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_support_request_updated_at() from public, anon, authenticated;

drop trigger if exists support_request_touch_updated_at on public.support_requests;
create trigger support_request_touch_updated_at
before update on public.support_requests
for each row execute function private.touch_support_request_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ride_chat_messages'
  ) then
    alter publication supabase_realtime add table public.ride_chat_messages;
  end if;
end
$$;
