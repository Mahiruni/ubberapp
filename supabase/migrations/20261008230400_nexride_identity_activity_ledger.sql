-- Non-sensitive identity audit ledger, already deployed to Supabase.
-- Status events do not contain phone numbers, ID numbers or document paths.
create table if not exists public.account_identity_events(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null, actor_id uuid, subject_id uuid,
 event_type text not null check(event_type in
 ('document_submitted','document_status_changed','phone_verified','phone_changed',
  'identity_review_submitted','identity_review_status_changed',
  'deletion_requested','deletion_review_status_changed')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 constraint account_identity_events_safe_metadata check(pg_column_size(metadata)<2048)
);
create index if not exists account_identity_events_owner_created_idx
 on public.account_identity_events(owner_id,created_at desc);
alter table public.account_identity_events enable row level security;
drop policy if exists account_identity_events_view on public.account_identity_events;
create policy account_identity_events_view on public.account_identity_events
 for select to authenticated using(owner_id=(select auth.uid()) or (select private.is_admin()));
revoke all on public.account_identity_events from public,anon,authenticated;
grant select on public.account_identity_events to authenticated;
CREATE OR REPLACE FUNCTION private.nexride_log_account_request_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare category_value text;
begin
 if tg_table_name='account_identity_reviews' then
   category_value:=new.category;
 else
   category_value:='account_deletion';
 end if;
 if tg_op='INSERT' then
   insert into public.account_identity_events(owner_id,actor_id,subject_id,event_type,metadata)
   values(new.user_id,auth.uid(),new.id,
      case when tg_table_name='account_identity_reviews'
        then 'identity_review_submitted' else 'deletion_requested' end,
      jsonb_build_object('category',category_value,'status',new.status));
 elsif new.status is distinct from old.status then
   insert into public.account_identity_events(owner_id,actor_id,subject_id,event_type,metadata)
   values(new.user_id,auth.uid(),new.id,
      case when tg_table_name='account_identity_reviews'
        then 'identity_review_status_changed' else 'deletion_review_status_changed' end,
      jsonb_build_object('category',category_value,'previous',old.status,'current',new.status));
 end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.nexride_log_document_identity_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then
   insert into public.account_identity_events(
     owner_id,actor_id,subject_id,event_type,metadata)
   values(new.user_id,auth.uid(),new.id,'document_submitted',
     jsonb_build_object('type',new.document_type,'country',new.issuing_country,'status',new.status));
 elsif new.status is distinct from old.status then
   insert into public.account_identity_events(
     owner_id,actor_id,subject_id,event_type,metadata)
   values(new.user_id,auth.uid(),new.id,'document_status_changed',
     jsonb_build_object('type',new.document_type,'country',new.issuing_country,
       'previous',old.status,'current',new.status));
 end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.nexride_log_verified_phone_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then
   insert into public.account_identity_events(owner_id,actor_id,event_type,metadata)
   values(new.user_id,auth.uid(),'phone_verified',jsonb_build_object('method','otp'));
 elsif new.phone_e164 is distinct from old.phone_e164 then
   insert into public.account_identity_events(owner_id,actor_id,event_type,metadata)
   values(new.user_id,auth.uid(),'phone_changed',jsonb_build_object('method','otp'));
 end if;
 return new;
end;
$function$
;
drop trigger if exists nexride_log_document_identity_event on public.account_identity_documents;
create trigger nexride_log_document_identity_event after insert or update of status
 on public.account_identity_documents for each row execute function private.nexride_log_document_identity_event();
drop trigger if exists nexride_log_verified_phone_event on public.account_verified_phones;
create trigger nexride_log_verified_phone_event after insert or update of phone_e164
 on public.account_verified_phones for each row execute function private.nexride_log_verified_phone_event();
drop trigger if exists nexride_log_identity_review_event on public.account_identity_reviews;
create trigger nexride_log_identity_review_event after insert or update of status
 on public.account_identity_reviews for each row execute function private.nexride_log_account_request_event();
drop trigger if exists nexride_log_deletion_review_event on public.account_deletion_requests;
create trigger nexride_log_deletion_review_event after insert or update of status
 on public.account_deletion_requests for each row execute function private.nexride_log_account_request_event();
revoke all on function private.nexride_log_document_identity_event() from public,anon,authenticated;
revoke all on function private.nexride_log_verified_phone_event() from public,anon,authenticated;
revoke all on function private.nexride_log_account_request_event() from public,anon,authenticated;
