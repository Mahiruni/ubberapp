-- Ordinary portraits are self managed; driver/document eligibility is untouched.
alter table public.driver_profile_photos drop constraint driver_profile_photos_status_check;
alter table public.driver_profile_photos add constraint driver_profile_photos_status_check check (status in ('pending_review','approved','rejected','deleted'));
alter table public.driver_profile_photos drop constraint driver_photo_file_extension;
alter table public.driver_profile_photos add constraint driver_photo_file_extension check (storage_path ~* '[.](jpg|jpeg|png|webp)$');
alter table public.driver_profile_photos alter column status set default 'approved';
drop policy driver_photo_owner_submit on public.driver_profile_photos;
create policy driver_photo_owner_submit on public.driver_profile_photos for insert to authenticated with check (
 driver_id=(select auth.uid()) and status='approved' and reviewed_at is null and reviewed_by is null and rejection_reason is null
 and exists(select 1 from public.drivers d where d.id=(select auth.uid()))
 and exists(select 1 from storage.objects o where o.bucket_id='nexride-driver-photos' and o.name=storage_path and o.owner_id=(select auth.uid())::text));
create policy driver_photo_owner_retire on public.driver_profile_photos for update to authenticated
 using(driver_id=(select auth.uid())) with check(driver_id=(select auth.uid()) and status in ('rejected','deleted') and reviewed_by is null and reviewed_at is null);
drop policy driver_photo_assigned_rider_read_approved on public.driver_profile_photos;
create policy driver_photo_assigned_rider_read_approved on public.driver_profile_photos for select to authenticated using (
 status in ('approved','deleted') and exists(select 1 from public.ride_requests r where r.assigned_driver_id=driver_id and r.rider_id=(select auth.uid()) and r.status in ('accepted','arrived_pickup','in_trip','completed')));
drop policy nexride_driver_photo_upload_own on storage.objects;
create policy nexride_driver_photo_upload_own on storage.objects for insert to authenticated with check(
 bucket_id='nexride-driver-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~* '[.](jpg|jpeg|png|webp)$' and exists(select 1 from public.drivers d where d.id=(select auth.uid())));
drop policy nexride_driver_photo_delete_unlinked_own on storage.objects;
create policy nexride_driver_photo_delete_unlinked_own on storage.objects for delete to authenticated using(
 bucket_id='nexride-driver-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text
 and not exists(select 1 from public.driver_profile_photos p where p.storage_path=storage.objects.name and p.status in ('approved','pending_review')));
-- Invoker RPC uses the same owner RLS as direct clients. The advisory lock serializes replacements.
create or replace function public.set_driver_profile_photo(p_storage_path text default null) returns text[]
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); retired text[];
begin
 if actor is null or not exists(select 1 from public.drivers d where d.id=actor) then raise exception 'Driver authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,913));
 if p_storage_path is not null and not exists(select 1 from storage.objects o where o.bucket_id='nexride-driver-photos' and o.name=p_storage_path and o.owner_id=actor::text and split_part(o.name,'/',1)=actor::text) then raise exception 'Owned uploaded photo required' using errcode='42501'; end if;
 select coalesce(array_agg(storage_path),'{}'::text[]) into retired from public.driver_profile_photos where driver_id=actor;
 update public.driver_profile_photos set status=case when p_storage_path is null then 'deleted' else 'rejected' end,reviewed_by=null,reviewed_at=null,rejection_reason=null where driver_id=actor and status in ('approved','pending_review');
 if p_storage_path is not null then insert into public.driver_profile_photos(driver_id,storage_path,status) values(actor,p_storage_path,'approved'); end if;
 return retired;
end $$;
revoke all on function public.set_driver_profile_photo(text) from public,anon;
grant execute on function public.set_driver_profile_photo(text) to authenticated;
-- Existing pending portraits become active, selecting only the newest per driver.
with newest as (select distinct on(driver_id) id,driver_id from public.driver_profile_photos where status='pending_review' order by driver_id,created_at desc,id desc)
update public.driver_profile_photos p set status='rejected',rejection_reason='Replaced by newer portrait' where p.status in ('approved','pending_review') and exists(select 1 from newest n where n.driver_id=p.driver_id and n.id<>p.id);
update public.driver_profile_photos set status='approved' where status='pending_review';
-- Moderation remains admin only; normal portraits no longer need approval.
create or replace function public.review_driver_profile_photo(p_photo_id uuid,p_approve boolean,p_reason text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not (select private.is_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_approve then raise exception 'Portraits are immediately active; no approval required'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A moderation reason is required'; end if;
 update public.driver_profile_photos set status='deleted',rejection_reason=left(btrim(p_reason),500),reviewed_at=now(),reviewed_by=auth.uid() where id=p_photo_id and status='approved';
 if not found then raise exception 'Photo is no longer active'; end if;
end $$;
revoke all on function public.review_driver_profile_photo(uuid,boolean,text) from public,anon;
grant execute on function public.review_driver_profile_photo(uuid,boolean,text) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_profile_photos') then alter publication supabase_realtime add table public.driver_profile_photos; end if;
end $$;
