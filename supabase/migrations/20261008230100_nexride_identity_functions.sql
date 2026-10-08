-- NexRide identity functions exported from current production definitions. Run after identity schema migration.

CREATE OR REPLACE FUNCTION private.normalize_et_phone(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select case
  when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^251[79][0-9]{8}$'
   then '+'||regexp_replace(p_phone,'[^0-9]','','g')
  when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^0[79][0-9]{8}$'
   then '+251'||substring(regexp_replace(p_phone,'[^0-9]','','g') from 2)
  when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^[79][0-9]{8}$'
   then '+251'||regexp_replace(p_phone,'[^0-9]','','g')
  else null end
$function$;

CREATE OR REPLACE FUNCTION private.reserve_nexride_document(p_owner uuid, p_type text, p_country text, p_number text, p_path text DEFAULT NULL::text, p_expires date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 secret_key bytea;
 hash_value text;
 existing_id uuid;
 existing_owner uuid;
 existing_status text;
 normalized_number text;
begin
 if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then
  raise exception 'identity_owner_required' using errcode='42501';
 end if;
 if p_type not in ('fayda','passport','driver_license','other') or
    p_country !~ '^[A-Z]{2}$' then raise exception 'invalid_document_type'; end if;
 normalized_number := upper(regexp_replace(trim(coalesce(p_number,'')),'[\s-]','','g'));
 if length(normalized_number)<4 or length(normalized_number)>80
  then raise exception 'invalid_document_identifier'; end if;
 if p_path is not null and p_path not like p_owner::text||'/%'
  then raise exception 'invalid_document_path' using errcode='42501'; end if;
 select k.secret into secret_key from private.nexride_identity_hmac_keys k
  where k.key_name='document_v1';
 if secret_key is null then raise exception 'identity_service_unavailable'; end if;
 hash_value:=encode(extensions.hmac(
   convert_to(p_type||':'||p_country||':'||normalized_number,'UTF8'),
   secret_key,'sha256'),'hex');
 select d.id,d.user_id,d.status into existing_id,existing_owner,existing_status
  from public.account_identity_documents d
  where d.fingerprint=hash_value for update;
 if existing_id is not null then
   if existing_owner<>p_owner then
    raise exception 'identity_ownership_review_required' using errcode='23505';
   end if;
   return existing_id; -- reuse, never overwrite a previously verified record
 end if;
 -- A replacement is permitted only after the previous record is no longer
 -- approved or pending. Admin can revoke/expire; no silent identity changes.
 if exists(select 1 from public.account_identity_documents d
   where d.user_id=p_owner and d.document_type=p_type and d.issuing_country=p_country
     and d.status in ('pending','approved')) then
   raise exception 'existing_identity_document_must_be_reviewed' using errcode='23505';
 end if;
 insert into public.account_identity_documents(
  user_id,document_type,issuing_country,fingerprint,storage_path,expires_at)
 values(p_owner,p_type,p_country,hash_value,p_path,p_expires)
 returning id into existing_id;
 return existing_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reserve_nexride_uploaded_identity(p_owner uuid, p_type text, p_country text, p_number text, p_path text, p_expires date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare document_id uuid;
begin
 document_id:=private.reserve_nexride_document(p_owner,p_type,p_country,
    p_number,p_path,p_expires);
 update public.account_identity_documents d
 set storage_bucket='nexride-identity'
 where d.id=document_id and d.user_id=p_owner and d.storage_path=p_path
   and d.status='pending';
 return document_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.nexride_driver_identity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.license_number is not null and
   (tg_op='INSERT' or new.license_number is distinct from old.license_number) then
    perform private.reserve_nexride_document(new.id,'driver_license','ET',
      new.license_number,new.license_document_path,new.license_expiry);
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.nexride_sync_account_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.role in ('rider','driver') then
  insert into public.account_roles(user_id,role)
  values(new.id,new.role) on conflict do nothing;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.nexride_protect_account_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if new.role is distinct from old.role
   or new.admin_role is distinct from old.admin_role
   or new.account_status is distinct from old.account_status then
   if current_user not in ('postgres','service_role') and not private.is_admin() then
     raise exception 'account_authorization_change_denied' using errcode='42501';
   end if;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.nexride_deletion_request_safety()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.user_id <> auth.uid() then raise exception 'not_account_owner' using errcode='42501'; end if;
 if exists(select 1 from public.ride_requests r where
  (r.rider_id=new.user_id or r.assigned_driver_id=new.user_id)
  and r.status in ('accepted','arrived_pickup','in_trip')) then
  raise exception 'finish_active_trip_before_deletion' using errcode='23514';
 end if;
 if exists(select 1 from public.driver_payout_requests pr
  where pr.driver_id=new.user_id and pr.status in ('pending','approved','processing')) then
  raise exception 'resolve_payout_before_deletion' using errcode='23514';
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_sync_verified_phone()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := (select auth.uid()); normalized text; verified_time timestamptz;
begin
 if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
 select private.normalize_et_phone(u.phone),u.phone_confirmed_at
 into normalized,verified_time from auth.users u where u.id=actor;
 if normalized is null or verified_time is null then return 'unverified'; end if;
 begin
  insert into public.account_verified_phones(user_id,phone_e164,verified_at)
  values(actor,normalized,verified_time)
  on conflict(user_id) do update set
    phone_e164=excluded.phone_e164,verified_at=excluded.verified_at;
 exception when unique_violation then
   return 'ownership_review_required';
 end;
 delete from private.nexride_phone_change_reservations where user_id=actor;
 return 'verified';
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_prepare_verified_phone(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := (select auth.uid()); normalized text;
begin
 if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
 normalized:=private.normalize_et_phone(p_phone);
 if normalized is null then return 'invalid_phone'; end if;
 if not exists(select 1 from public.profiles p where p.id=actor and p.account_status='active')
  then return 'account_inactive'; end if;
 -- The phone verification bug in auth.phone_change is blocked by not allowing
 -- overlapping pending phone identifiers, even across old abandoned attempts.
 if exists(select 1 from auth.users u where u.id<>actor and
   (private.normalize_et_phone(u.phone_change)=normalized or
    (u.phone_confirmed_at is not null and private.normalize_et_phone(u.phone)=normalized)))
   or exists(select 1 from public.account_verified_phones c
    where c.phone_e164=normalized and c.user_id<>actor) then
   return 'ownership_review_required';
 end if;
 delete from private.nexride_phone_change_reservations where expires_at<now();
 begin
  insert into private.nexride_phone_change_reservations(user_id,phone_e164,expires_at)
  values(actor,normalized,now()+interval '10 minutes')
  on conflict(user_id) do update set
    phone_e164=excluded.phone_e164,expires_at=excluded.expires_at,created_at=now();
 exception when unique_violation then
   return 'ownership_review_required';
 end;
 return 'ready';
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_submit_identity_document(p_type text, p_country text, p_identifier text, p_storage_path text, p_expiry date DEFAULT NULL::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=(select auth.uid()); document_id uuid; actual_bucket text; actual_path text;
begin
 if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p where p.id=actor and p.account_status='active')
  then raise exception 'account_inactive' using errcode='42501'; end if;
 if p_storage_path not like actor::text||'/%' or length(p_storage_path)>350
  then raise exception 'invalid_storage_path'; end if;
 if not exists(select 1 from storage.objects o
  where o.bucket_id='nexride-identity' and o.name=p_storage_path)
  then raise exception 'document_upload_required'; end if;
 if (select count(*) from public.account_identity_documents d
     where d.user_id=actor and d.created_at>now()-interval '24 hours')>=5
  then raise exception 'verification_rate_limited' using errcode='42501'; end if;
 begin
  document_id:=private.reserve_nexride_uploaded_identity(
    actor,p_type,upper(p_country),p_identifier,p_storage_path,p_expiry);
 exception when unique_violation then return 'ownership_review_required';
 end;
 select d.storage_bucket,d.storage_path into actual_bucket,actual_path
 from public.account_identity_documents d where d.id=document_id;
 if actual_bucket<>'nexride-identity' or actual_path is distinct from p_storage_path
 then return 'already_registered'; end if;
 return 'submitted';
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_begin_driver_application()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=(select auth.uid()); profile_role text; state text;
begin
 if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
 select p.role,p.account_status into profile_role,state
 from public.profiles p where p.id=actor for update;
 if profile_role not in ('rider','driver') or state<>'active' then
  raise exception 'account_not_eligible' using errcode='42501'; end if;
 if exists(select 1 from public.ride_requests r
   where r.rider_id=actor and r.status in ('accepted','arrived_pickup','in_trip')) then
    raise exception 'finish_active_trip_first' using errcode='23514';
 end if;
 insert into public.account_roles(user_id,role) values(actor,'rider') on conflict do nothing;
 insert into public.account_roles(user_id,role) values(actor,'driver') on conflict do nothing;
 if profile_role='rider' then
   update public.profiles set role='driver' where id=actor;
 end if;
 insert into public.drivers(id) values(actor) on conflict(id) do nothing;
 return 'ready';
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_activate_rider_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=(select auth.uid());
begin
 if actor is null or not exists(select 1 from public.profiles p
  where p.id=actor and p.account_status='active' and p.role in ('rider','driver')) then
  raise exception 'account_not_eligible' using errcode='42501'; end if;
 if exists(select 1 from public.drivers d where d.id=actor and d.is_online=true)
   or exists(select 1 from public.ride_requests r
    where r.assigned_driver_id=actor and r.status in ('accepted','arrived_pickup','in_trip')) then
  raise exception 'go_offline_finish_trip_first' using errcode='23514';
 end if;
 insert into public.account_roles(user_id,role) values(actor,'rider') on conflict do nothing;
 return 'ready';
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_identity_review(p_document uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid;
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if p_status not in ('approved','rejected','expired','revoked')
  then raise exception 'invalid_review_status'; end if;
 update public.account_identity_documents
 set status=p_status,reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_document returning user_id into owner_id;
 if owner_id is null then raise exception 'document_unavailable'; end if;
 insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'identity_document_review','identity_document',p_document,
   jsonb_build_object('status',p_status));
 return 'saved';
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_identity_audit()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare conflicts integer; people integer; documents integer; pending_review integer;
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 select count(*) into conflicts from (
  select private.normalize_et_phone(p.phone) phone
  from public.profiles p where private.normalize_et_phone(p.phone) is not null
  group by 1 having count(*)>1
 ) q;
 select count(*) into people from public.profiles;
 select count(*) into documents from public.account_identity_documents;
 select count(*) into pending_review from public.account_identity_reviews where status in ('pending','under_review');
 return jsonb_build_object('accounts',people,'legacyPhoneConflictGroups',conflicts,
    'identityDocuments',documents,'openIdentityReviews',pending_review);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_ownership_review(p_id uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid;
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if p_status not in ('under_review','resolved','rejected')
  then raise exception 'invalid_review_status'; end if;
 update public.account_identity_reviews
 set status=p_status,reviewed_at=now(),reviewer_id=auth.uid()
 where id=p_id and status in ('pending','under_review')
 returning user_id into owner_id;
 if owner_id is null then raise exception 'review_unavailable'; end if;
 insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'account_identity_review','account_identity_review',p_id,
  jsonb_build_object('status',p_status));
 return 'saved';
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_deletion_review(p_id uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid;
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if p_status not in ('under_review','on_hold','approved','rejected')
   then raise exception 'invalid_review_status'; end if;
 update public.account_deletion_requests
 set status=p_status,updated_at=now(),decided_at=now(),decided_by=auth.uid()
 where id=p_id and status in ('pending','under_review','on_hold')
 returning user_id into owner_id;
 if owner_id is null then raise exception 'request_unavailable'; end if;
 insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'account_deletion_review','account_deletion_request',p_id,
  jsonb_build_object('status',p_status));
 return 'saved'; -- Not an actual deletion. Regulatory checks still required.
end;
$function$;

revoke all on function private.normalize_et_phone(text) from public,anon,authenticated;
revoke all on function private.reserve_nexride_document(uuid,text,text,text,text,date) from public,anon,authenticated;
revoke all on function private.reserve_nexride_uploaded_identity(uuid,text,text,text,text,date) from public,anon,authenticated;
revoke all on function public.account_sync_verified_phone(), public.account_begin_driver_application(),
 public.account_activate_rider_role(), public.admin_account_identity_audit()
 from public,anon,authenticated;
revoke all on function public.account_prepare_verified_phone(text),
 public.account_submit_identity_document(text,text,text,text,date),
 public.admin_account_identity_review(uuid,text),
 public.admin_account_ownership_review(uuid,text),
 public.admin_account_deletion_review(uuid,text)
 from public,anon,authenticated;
grant execute on function public.account_sync_verified_phone(),public.account_begin_driver_application(),
 public.account_activate_rider_role(),public.admin_account_identity_audit() to authenticated;
grant execute on function public.account_prepare_verified_phone(text),
 public.account_submit_identity_document(text,text,text,text,date),
 public.admin_account_identity_review(uuid,text),
 public.admin_account_ownership_review(uuid,text),
 public.admin_account_deletion_review(uuid,text) to authenticated;

drop trigger if exists profiles_sync_account_roles on public.profiles;
create trigger profiles_sync_account_roles after insert or update of role on public.profiles
 for each row execute function private.nexride_sync_account_roles();
drop trigger if exists profiles_protect_account_authorization on public.profiles;
create trigger profiles_protect_account_authorization before update of role,admin_role,account_status
 on public.profiles for each row execute function private.nexride_protect_account_authorization();
drop trigger if exists nexride_driver_identity_guard on public.drivers;
create trigger nexride_driver_identity_guard after insert or update of license_number on public.drivers
 for each row execute function private.nexride_driver_identity_guard();
drop trigger if exists nexride_deletion_request_safety on public.account_deletion_requests;
create trigger nexride_deletion_request_safety before insert on public.account_deletion_requests
 for each row execute function private.nexride_deletion_request_safety();
