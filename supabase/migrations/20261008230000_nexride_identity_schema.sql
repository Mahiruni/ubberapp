-- NexRide unified identity, account ownership and verification schema.
-- Non-destructive. Never merge, delete or overwrite production users.
-- Phones are reserved only AFTER Supabase Auth verifies ownership by OTP.
-- Run identity_functions migration immediately after this file.
create table if not exists public.account_roles(
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('rider','driver')),
 created_at timestamptz not null default now(),
 primary key(user_id,role));
create table if not exists public.account_verified_phones(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_e164 text not null unique check(phone_e164 ~ '^\+251[79][0-9]{8}$'),
 verified_at timestamptz not null,created_at timestamptz not null default now());
create table if not exists private.nexride_identity_hmac_keys(
 key_name text primary key,secret bytea not null,created_at timestamptz not null default now());
revoke all on private.nexride_identity_hmac_keys from public,anon,authenticated;
insert into private.nexride_identity_hmac_keys(key_name,secret)
 values('document_v1',extensions.gen_random_bytes(32))
 on conflict(key_name) do nothing;
create table if not exists public.account_identity_documents(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 document_type text not null check(document_type in ('fayda','passport','driver_license','other')),
 issuing_country text not null check(issuing_country ~ '^[A-Z]{2}$'),
 fingerprint text not null unique,
 status text not null default 'pending'
 check(status in ('pending','approved','rejected','expired','revoked','superseded')),
 storage_bucket text not null default 'driver-verification',
 storage_path text,expires_at date,created_at timestamptz not null default now(),
 reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 constraint identity_document_path_private check(storage_path is null or storage_path like user_id::text||'/%'));
create unique index if not exists nexride_account_unique_current_document_type
 on public.account_identity_documents(user_id,document_type,issuing_country)
 where status in ('pending','approved');
create table if not exists public.account_identity_reviews(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('duplicate_identity','phone_ownership','document_replacement','account_recovery')),
 status text not null default 'pending' check(status in ('pending','under_review','resolved','rejected')),
 detail text not null default '' check(length(detail)<=1500),
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewer_id uuid references auth.users(id));
create table if not exists public.account_deletion_requests(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','under_review','on_hold','approved','rejected','completed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 decided_at timestamptz,decided_by uuid references auth.users(id));
create unique index if not exists nexride_one_open_deletion_request on public.account_deletion_requests(user_id)
 where status in ('pending','under_review','on_hold');
create table if not exists private.nexride_phone_change_reservations(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_e164 text not null unique,expires_at timestamptz not null,created_at timestamptz not null default now());
revoke all on private.nexride_phone_change_reservations from public,anon,authenticated;

alter table public.account_roles enable row level security;
alter table public.account_verified_phones enable row level security;
alter table public.account_identity_documents enable row level security;
alter table public.account_identity_reviews enable row level security;
alter table public.account_deletion_requests enable row level security;

drop policy if exists account_roles_read_self_or_admin on public.account_roles;
create policy account_roles_read_self_or_admin on public.account_roles for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists account_verified_phones_read on public.account_verified_phones;
create policy account_verified_phones_read on public.account_verified_phones for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists account_identity_documents_read on public.account_identity_documents;
create policy account_identity_documents_read on public.account_identity_documents for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists account_identity_reviews_read on public.account_identity_reviews;
create policy account_identity_reviews_read on public.account_identity_reviews for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists account_identity_reviews_submit on public.account_identity_reviews;
create policy account_identity_reviews_submit on public.account_identity_reviews for insert to authenticated
 with check(user_id=(select auth.uid()) and status='pending' and reviewer_id is null);
drop policy if exists account_deletion_requests_read on public.account_deletion_requests;
create policy account_deletion_requests_read on public.account_deletion_requests for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists account_deletion_requests_submit on public.account_deletion_requests;
create policy account_deletion_requests_submit on public.account_deletion_requests for insert to authenticated
 with check(user_id=(select auth.uid()) and status='pending' and decided_by is null);
revoke all on public.account_roles,public.account_verified_phones,
 public.account_identity_documents,public.account_identity_reviews,
 public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_roles,public.account_verified_phones,
 public.account_identity_documents to authenticated;
grant select,insert on public.account_identity_reviews,public.account_deletion_requests to authenticated;

insert into public.account_roles(user_id,role)
 select id,role from public.profiles where role in ('rider','driver')
 on conflict do nothing;
-- No merged accounts: uniqueness is indexed on VERIFIED ownership only.
-- Existing unverified phone conflicts are intentionally left for admin review.

insert into public.account_identity_documents(
 user_id,document_type,issuing_country,fingerprint,status,storage_path,expires_at)
select d.id,'driver_license','ET',
 encode(extensions.hmac(convert_to('driver_license:ET:'||
 upper(regexp_replace(trim(d.license_number),'[\s-]','','g')),'UTF8'),
 (select secret from private.nexride_identity_hmac_keys where key_name='document_v1'),'sha256'),'hex'),
 case when d.review_status='approved' then 'approved' else 'pending' end,
 d.license_document_path,d.license_expiry
from public.drivers d where nullif(trim(d.license_number),'') is not null
on conflict(fingerprint) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nexride-identity','nexride-identity',false,8388608,
 array['image/jpeg','image/png','image/webp','application/pdf'])
 on conflict(id) do nothing;
drop policy if exists nexride_identity_upload_own on storage.objects;
create policy nexride_identity_upload_own on storage.objects for insert to authenticated
 with check(bucket_id='nexride-identity' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists nexride_identity_read_own on storage.objects;
create policy nexride_identity_read_own on storage.objects for select to authenticated
 using(bucket_id='nexride-identity' and
  (split_part(name,'/',1)=(select auth.uid())::text or (select private.is_admin())));
drop policy if exists nexride_identity_discard_unsubmitted on storage.objects;
create policy nexride_identity_discard_unsubmitted on storage.objects for delete to authenticated
 using(bucket_id='nexride-identity' and split_part(name,'/',1)=(select auth.uid())::text
  and not exists(select 1 from public.account_identity_documents d
   where d.storage_bucket='nexride-identity' and d.storage_path=name));
