-- NexRide world-class data layer v2
-- Extends the existing DriverSuperApp schema; does not create a parallel ride schema.
-- Applied to Supabase project mrbgtdrpscdoxwdgvfcs.

create table if not exists public.emergency_contacts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null, phone text not null, relationship text, is_primary boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create index if not exists emergency_contacts_user_idx on public.emergency_contacts(user_id) where deleted_at is null;

create table if not exists public.chat_messages (
 id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete restrict, body text not null check(length(trim(body)) between 1 and 2000),
 message_type text not null default 'text' check(message_type in ('text','system')), created_at timestamptz not null default now(), deleted_at timestamptz);
create index if not exists chat_messages_trip_created_idx on public.chat_messages(trip_id,created_at desc) where deleted_at is null;

create table if not exists public.wallets (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null unique references public.profiles(id) on delete cascade,
 currency text not null default 'ETB', balance_minor bigint not null default 0 check(balance_minor>=0), version bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create index if not exists wallets_profile_idx on public.wallets(profile_id) where deleted_at is null;

alter table public.trips add column if not exists deleted_at timestamptz;
alter table public.drivers add column if not exists updated_at timestamptz not null default now();
alter table public.drivers add column if not exists deleted_at timestamptz;
alter table public.vehicles add column if not exists updated_at timestamptz not null default now();
alter table public.vehicles add column if not exists deleted_at timestamptz;
alter table public.driver_locations add column if not exists deleted_at timestamptz;
alter table public.ride_locations add column if not exists deleted_at timestamptz;
alter table public.payments add column if not exists deleted_at timestamptz;
alter table public.ratings add column if not exists deleted_at timestamptz;
alter table public.notifications add column if not exists deleted_at timestamptz;
alter table public.ride_shares add column if not exists deleted_at timestamptz;
alter table public.safety_reports add column if not exists updated_at timestamptz not null default now();
alter table public.safety_reports add column if not exists deleted_at timestamptz;
alter table public.support_tickets add column if not exists deleted_at timestamptz;
alter table public.wallet_ledger add column if not exists deleted_at timestamptz;

create index if not exists trips_customer_state_created_idx on public.trips(customer_id,state,requested_at desc) where deleted_at is null;
create index if not exists trips_driver_state_idx on public.trips(driver_id,state,requested_at desc) where deleted_at is null;
create index if not exists trips_city_state_requested_idx on public.trips(city_id,state,requested_at desc) where deleted_at is null;
create index if not exists trips_pickup_gist_idx on public.trips using gist(pickup) where deleted_at is null;
create index if not exists drivers_online_city_idx on public.drivers(city_id,is_online,review_status) where deleted_at is null;
create index if not exists drivers_location_gist_idx on public.drivers using gist(location) where is_online=true and review_status='approved' and deleted_at is null;
create index if not exists driver_locations_driver_time_idx on public.driver_locations(driver_id,updated_at desc) where deleted_at is null;
create index if not exists ride_locations_trip_time_idx on public.ride_locations(trip_id,recorded_at desc) where deleted_at is null;
create index if not exists payments_customer_created_idx on public.payments(customer_id,created_at desc) where deleted_at is null;
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc) where deleted_at is null;
create index if not exists wallet_ledger_profile_created_idx on public.wallet_ledger(profile_id,created_at desc) where deleted_at is null;

create or replace function public.nexride_nearby_available_drivers(p_lat double precision,p_lng double precision,p_radius_m integer default 5000,p_limit integer default 20)
returns table(driver_id uuid,distance_m double precision,latitude double precision,longitude double precision)
language sql stable security definer set search_path=public as $$
 select d.id,st_distance(d.location,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography),st_y(d.location::geometry),st_x(d.location::geometry)
 from public.drivers d where d.is_online=true and d.review_status='approved' and d.deleted_at is null and d.location is not null
 and st_dwithin(d.location,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography,p_radius_m)
 order by d.location <-> st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography limit greatest(1,least(p_limit,100));
$$;
revoke all on function public.nexride_nearby_available_drivers(double precision,double precision,integer,integer) from public;
grant execute on function public.nexride_nearby_available_drivers(double precision,double precision,integer,integer) to authenticated;

create or replace function public.nexride_distance_m(a geography,b geography) returns double precision language sql immutable strict as $$ select st_distance(a,b) $$;

alter table public.emergency_contacts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.wallets enable row level security;

drop policy if exists emergency_contacts_owner_select on public.emergency_contacts;
create policy emergency_contacts_owner_select on public.emergency_contacts for select to authenticated using(user_id=auth.uid() and deleted_at is null);
drop policy if exists emergency_contacts_owner_write on public.emergency_contacts;
create policy emergency_contacts_owner_write on public.emergency_contacts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists chat_trip_participant_select on public.chat_messages;
create policy chat_trip_participant_select on public.chat_messages for select to authenticated using(deleted_at is null and exists(select 1 from public.trips t where t.id=trip_id and (t.customer_id=auth.uid() or t.driver_id=auth.uid())));
drop policy if exists chat_trip_participant_insert on public.chat_messages;
create policy chat_trip_participant_insert on public.chat_messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.trips t where t.id=trip_id and t.state in ('accepted','arriving','in_progress') and (t.customer_id=auth.uid() or t.driver_id=auth.uid())));
drop policy if exists wallets_owner_select on public.wallets;
create policy wallets_owner_select on public.wallets for select to authenticated using(profile_id=auth.uid() and deleted_at is null);
alter publication supabase_realtime add table public.chat_messages;

create or replace function public.trip_transition(p_trip_id uuid,p_action text,p_distance_m integer default null,p_duration_s integer default null,p_actual_fare_minor bigint default null)
returns public.trips language plpgsql security definer set search_path=public as $$
declare t public.trips; next_state public.trip_state; uid uuid:=auth.uid(); v_fare bigint;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into t from public.trips where id=p_trip_id and deleted_at is null for update;
 if not found then raise exception 'TRIP_NOT_FOUND'; end if;
 if p_action='arrive' then if t.driver_id<>uid or t.state<>'accepted' then raise exception 'INVALID_TRANSITION'; end if; next_state:='arriving';
 elsif p_action='start' then if t.driver_id<>uid or t.state<>'arriving' then raise exception 'INVALID_TRANSITION'; end if; next_state:='in_progress';
 elsif p_action='complete' then if t.driver_id<>uid or t.state<>'in_progress' then raise exception 'INVALID_TRANSITION'; end if; next_state:='completed';
 elsif p_action='cancel' then if (t.customer_id<>uid and t.driver_id<>uid) or t.state in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if; next_state:='cancelled';
 else raise exception 'INVALID_ACTION'; end if;
 v_fare:=coalesce(p_actual_fare_minor,t.total_minor);
 update public.trips set state=next_state,final_distance_m=coalesce(p_distance_m,final_distance_m),final_duration_s=coalesce(p_duration_s,final_duration_s),
 actual_fare_minor=case when p_actual_fare_minor is null then actual_fare_minor else p_actual_fare_minor end,total_minor=case when p_action='complete' then v_fare else total_minor end,
 completed_at=case when p_action='complete' then now() else completed_at end,cancelled_at=case when p_action='cancel' then now() else cancelled_at end,
 cancelled_by=case when p_action='cancel' then uid else cancelled_by end,cancellation_reason=case when p_action='cancel' then 'user_cancelled' else cancellation_reason end,updated_at=now()
 where id=t.id returning * into t;
 insert into public.ride_events(trip_id,actor_id,event_type,metadata) values(t.id,uid,p_action,jsonb_build_object('state',next_state));
 if p_action='complete' then
  insert into public.payments(trip_id,customer_id,provider,provider_payment_id,idempotency_key,amount_minor,currency,status,metadata)
  values(t.id,t.customer_id,'cash','cash-'||t.id::text,'trip-'||t.id::text,v_fare,t.currency,'paid',jsonb_build_object('source','trip_completion'))
  on conflict(idempotency_key) do nothing;
 end if;
 return t;
end $$;
revoke all on function public.trip_transition(uuid,text,integer,integer,bigint) from public;
grant execute on function public.trip_transition(uuid,text,integer,integer,bigint) to authenticated;
