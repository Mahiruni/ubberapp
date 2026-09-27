create extension if not exists pgcrypto;
create extension if not exists postgis;
create type public.user_role as enum ('rider','driver','admin','support');
create type public.verification_status as enum ('pending','submitted','verified','rejected','expired');
create type public.driver_availability as enum ('offline','online','busy','suspended');
create type public.ride_status as enum ('requested','searching','accepted','arriving','arrived','ongoing','completed','cancelled');
create type public.payment_status as enum ('pending','authorized','paid','failed','refunded','cancelled');
create type public.document_type as enum ('id','driving_license','vehicle_registration','insurance','inspection','other');
create type public.document_status as enum ('pending','approved','rejected','expired');
create type public.ticket_status as enum ('open','in_progress','resolved','closed');
create type public.safety_severity as enum ('low','medium','high','critical');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role public.user_role not null default 'rider', phone text, email text, full_name text, avatar_url text, locale text not null default 'en' check (locale in ('en','am')), phone_verified boolean not null default false, verification_status public.verification_status not null default 'pending', metadata jsonb not null default '{}'::jsonb, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index profiles_role_idx on public.profiles(role) where deleted_at is null;
create index profiles_phone_idx on public.profiles(phone) where phone is not null and deleted_at is null;

create table public.driver_profiles (user_id uuid primary key references public.profiles(id) on delete cascade, availability public.driver_availability not null default 'offline', verification_status public.verification_status not null default 'pending', rating numeric(3,2) not null default 5.00 check (rating between 0 and 5), completed_trips bigint not null default 0, preferred_area text, destination_filter boolean not null default false, quiet_hours jsonb not null default '{}'::jsonb, last_online_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index driver_availability_idx on public.driver_profiles(availability) where availability in ('online','busy');

create table public.vehicles (id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.driver_profiles(user_id) on delete restrict, make text not null, model text not null, year smallint, plate_number text not null unique, color text, seats smallint not null default 4 check (seats between 1 and 20), verification_status public.verification_status not null default 'pending', active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index vehicles_one_active_per_driver on public.vehicles(driver_id) where active=true;

create table public.driver_documents (id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.driver_profiles(user_id) on delete cascade, type public.document_type not null, storage_path text not null, status public.document_status not null default 'pending', expires_at date, rejection_reason text, verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(driver_id,type));

create table public.driver_locations (driver_id uuid primary key references public.driver_profiles(user_id) on delete cascade, location geography(point,4326) not null, heading numeric(6,2), speed_mps numeric(8,2), accuracy_m numeric(8,2), recorded_at timestamptz not null default now());
create index driver_locations_geo_idx on public.driver_locations using gist(location);
create index driver_locations_recorded_idx on public.driver_locations(recorded_at desc);

create table public.rides (id uuid primary key default gen_random_uuid(), rider_id uuid not null references public.profiles(id) on delete restrict, driver_id uuid references public.driver_profiles(user_id) on delete restrict, vehicle_id uuid references public.vehicles(id) on delete restrict, status public.ride_status not null default 'requested', pickup_point geography(point,4326) not null, pickup_address text, destination_point geography(point,4326) not null, destination_address text, requested_at timestamptz not null default now(), accepted_at timestamptz, started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text, distance_m numeric(12,2), duration_s integer, estimated_fare_minor bigint not null default 0, final_fare_minor bigint, currency char(3) not null default 'ETB', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index rides_rider_history_idx on public.rides(rider_id,created_at desc);
create index rides_driver_history_idx on public.rides(driver_id,created_at desc);
create index rides_active_status_idx on public.rides(status,created_at desc) where status not in ('completed','cancelled');
create index rides_pickup_geo_idx on public.rides using gist(pickup_point);

create table public.ride_events (id bigint generated always as identity primary key, ride_id uuid not null references public.rides(id) on delete cascade, event_type text not null, actor_id uuid references public.profiles(id) on delete set null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index ride_events_ride_idx on public.ride_events(ride_id,created_at);

create table public.ride_locations (id bigint generated always as identity primary key, ride_id uuid not null references public.rides(id) on delete cascade, actor_id uuid references public.profiles(id) on delete set null, location geography(point,4326) not null, heading numeric(6,2), speed_mps numeric(8,2), accuracy_m numeric(8,2), recorded_at timestamptz not null default now());
create index ride_locations_geo_idx on public.ride_locations using gist(location);
create index ride_locations_ride_time_idx on public.ride_locations(ride_id,recorded_at desc);

create table public.ride_shares (id uuid primary key default gen_random_uuid(), ride_id uuid not null references public.rides(id) on delete cascade, created_by uuid not null references public.profiles(id) on delete cascade, recipient_name text, recipient_phone text, token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now());

create table public.wallets (user_id uuid primary key references public.profiles(id) on delete cascade, balance_minor bigint not null default 0 check(balance_minor>=0), currency char(3) not null default 'ETB', updated_at timestamptz not null default now());
create table public.wallet_transactions (id uuid primary key default gen_random_uuid(), wallet_user_id uuid not null references public.wallets(user_id) on delete restrict, type text not null, amount_minor bigint not null, balance_after_minor bigint not null, reference_type text, reference_id uuid, status public.payment_status not null default 'paid', idempotency_key text unique, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index wallet_tx_user_time_idx on public.wallet_transactions(wallet_user_id,created_at desc);

create table public.payments (id uuid primary key default gen_random_uuid(), ride_id uuid references public.rides(id) on delete restrict, payer_id uuid not null references public.profiles(id) on delete restrict, provider text, provider_payment_id text, amount_minor bigint not null check(amount_minor>=0), currency char(3) not null default 'ETB', status public.payment_status not null default 'pending', idempotency_key text unique, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index payments_ride_idx on public.payments(ride_id);
create index payments_payer_idx on public.payments(payer_id,created_at desc);

create table public.driver_payouts (id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.driver_profiles(user_id) on delete restrict, amount_minor bigint not null, currency char(3) not null default 'ETB', status public.payment_status not null default 'pending', provider text, provider_reference text, period_start timestamptz, period_end timestamptz, paid_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index payouts_driver_time_idx on public.driver_payouts(driver_id,created_at desc);

create table public.ratings (id uuid primary key default gen_random_uuid(), ride_id uuid not null references public.rides(id) on delete cascade, reviewer_id uuid not null references public.profiles(id) on delete restrict, reviewee_id uuid not null references public.profiles(id) on delete restrict, score smallint not null check(score between 1 and 5), comment text, created_at timestamptz not null default now(), unique(ride_id,reviewer_id));
create index ratings_reviewee_idx on public.ratings(reviewee_id,created_at desc);

create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null, title_key text, body_key text, locale text not null default 'en' check(locale in ('en','am')), data jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now());
create index notifications_user_idx on public.notifications(user_id,created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;
create table public.notification_devices (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, platform text not null, push_token text not null unique, last_seen_at timestamptz not null default now(), created_at timestamptz not null default now());

create table public.promo_codes (id uuid primary key default gen_random_uuid(), code text not null unique, discount_type text not null check(discount_type in ('percent','fixed')), discount_value bigint not null check(discount_value>0), max_uses integer, uses_count integer not null default 0, starts_at timestamptz not null default now(), expires_at timestamptz, active boolean not null default true);
create table public.promo_redemptions (id uuid primary key default gen_random_uuid(), promo_id uuid not null references public.promo_codes(id) on delete restrict, user_id uuid not null references public.profiles(id) on delete restrict, ride_id uuid references public.rides(id) on delete restrict, amount_minor bigint not null default 0, created_at timestamptz not null default now(), unique(promo_id,user_id,ride_id));
create table public.referrals (id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id) on delete cascade, referred_id uuid not null references public.profiles(id) on delete cascade, code text not null unique, status text not null default 'pending' check(status in ('pending','qualified','rewarded','expired')), reward_minor bigint not null default 0, created_at timestamptz not null default now(), unique(referrer_id,referred_id));
create table public.incentives (id uuid primary key default gen_random_uuid(), driver_id uuid references public.driver_profiles(user_id) on delete cascade, type text not null, amount_minor bigint not null default 0, status text not null default 'pending', starts_at timestamptz, ends_at timestamptz, metadata jsonb not null default '{}'::jsonb);

create table public.support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict, ride_id uuid references public.rides(id) on delete set null, status public.ticket_status not null default 'open', category text not null, subject text not null, description text not null, priority smallint not null default 3 check(priority between 1 and 5), assigned_to uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index support_queue_idx on public.support_tickets(status,priority,created_at);
create table public.safety_reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete restrict, ride_id uuid references public.rides(id) on delete set null, subject_user_id uuid references public.profiles(id) on delete set null, severity public.safety_severity not null default 'medium', category text not null, description text not null, status public.ticket_status not null default 'open', assigned_to uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index safety_queue_idx on public.safety_reports(status,severity,created_at);

create table public.audit_logs (id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null, action text not null, entity_type text not null, entity_id uuid, request_id text, ip_hash text, user_agent_hash text, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());
create index audit_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);
create table public.app_translations (key text primary key, en text not null, am text not null, context text);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;

do $$
declare t text;
begin
 foreach t in array array['profiles','driver_profiles','vehicles','driver_documents','rides','payments','wallets','support_tickets','safety_reports'] loop
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_updated_at_'||t,t);
 end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.driver_locations enable row level security;
alter table public.rides enable row level security;
alter table public.ride_events enable row level security;
alter table public.ride_locations enable row level security;
alter table public.ride_shares enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.driver_payouts enable row level security;
alter table public.ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_devices enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.referrals enable row level security;
alter table public.incentives enable row level security;
alter table public.support_tickets enable row level security;
alter table public.safety_reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_translations enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy driver_profile_self_select on public.driver_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy driver_profile_self_update on public.driver_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy vehicles_driver_select on public.vehicles for select to authenticated using(driver_id=(select auth.uid()));
create policy documents_driver_select on public.driver_documents for select to authenticated using(driver_id=(select auth.uid()));
create policy rides_participant_select on public.rides for select to authenticated using(rider_id=(select auth.uid()) or driver_id=(select auth.uid()));
create policy rides_rider_insert on public.rides for insert to authenticated with check(rider_id=(select auth.uid()));
create policy ride_events_participant_select on public.ride_events for select to authenticated using(exists(select 1 from public.rides r where r.id=ride_id and (r.rider_id=(select auth.uid()) or r.driver_id=(select auth.uid()))));
create policy ride_locations_participant_select on public.ride_locations for select to authenticated using(exists(select 1 from public.rides r where r.id=ride_id and (r.rider_id=(select auth.uid()) or r.driver_id=(select auth.uid()))));
create policy ride_shares_owner_select on public.ride_shares for select to authenticated using(created_by=(select auth.uid()));
create policy wallet_self_select on public.wallets for select to authenticated using(user_id=(select auth.uid()));
create policy wallet_tx_self_select on public.wallet_transactions for select to authenticated using(wallet_user_id=(select auth.uid()));
create policy payments_self_select on public.payments for select to authenticated using(payer_id=(select auth.uid()));
create policy payouts_driver_select on public.driver_payouts for select to authenticated using(driver_id=(select auth.uid()));
create policy ratings_participant_select on public.ratings for select to authenticated using(reviewer_id=(select auth.uid()) or reviewee_id=(select auth.uid()));
create policy ratings_reviewer_insert on public.ratings for insert to authenticated with check(reviewer_id=(select auth.uid()));
create policy notifications_self_select on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy notification_devices_self_manage on public.notification_devices for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy promo_active_select on public.promo_codes for select to authenticated using(active=true and starts_at<=now() and (expires_at is null or expires_at>now()));
create policy promo_redemption_self_select on public.promo_redemptions for select to authenticated using(user_id=(select auth.uid()));
create policy referral_self_select on public.referrals for select to authenticated using(referrer_id=(select auth.uid()) or referred_id=(select auth.uid()));
create policy support_self_select on public.support_tickets for select to authenticated using(user_id=(select auth.uid()));
create policy support_self_insert on public.support_tickets for insert to authenticated with check(user_id=(select auth.uid()));
create policy safety_self_select on public.safety_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy safety_self_insert on public.safety_reports for insert to authenticated with check(reporter_id=(select auth.uid()));
create policy translations_public_select on public.app_translations for select to authenticated using(true);

create or replace view public.active_driver_map with (security_invoker=true) as
select dp.user_id, dl.location, dl.heading, dl.speed_mps, dl.recorded_at
from public.driver_profiles dp join public.driver_locations dl on dl.driver_id=dp.user_id
where dp.availability='online' and dl.recorded_at > now()-interval '30 seconds';
