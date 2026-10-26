-- Synthetic local contract fixture, NOT a production schema dump.
create role anon; create role authenticated; create role service_role bypassrls;
create schema private;
create table public.profiles(id uuid primary key,role text,account_status text,admin_role text);
create table public.drivers(id uuid primary key references public.profiles(id),review_status text);
create table public.ride_requests(id uuid primary key,rider_id uuid,assigned_driver_id uuid,status text,
 payment_method text,payment_status text,final_fare_etb numeric(12,2),estimated_trip_fare_etb numeric(12,2),
 estimated_driver_payout_etb numeric(12,2),pickup_location text,destination_location text,completed_at timestamptz,updated_at timestamptz);
create table public.driver_payout_accounts(id uuid primary key default gen_random_uuid(),driver_id uuid unique,provider text default 'chapa',bank_code text,bank_name text,
 account_name text,account_number_ciphertext text,account_number_last4 text,status text,updated_at timestamptz);
create function public.mark_payment_paid_server(uuid,text,jsonb) returns void language sql as $$select;$$;
create function public.reserve_driver_payout_server(uuid,uuid,numeric,text,text) returns void language sql as $$select;$$;
create function public.finalize_driver_payout_server(uuid,text,jsonb,text) returns void language sql as $$select;$$;
grant usage on schema public to service_role;
grant select,insert,update on all tables in schema public to service_role;
grant select,update on public.ride_requests to authenticated;
