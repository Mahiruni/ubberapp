-- Extend the existing Driver review, preserving all identities and records.
-- SECURITY INVOKER retains the administrator's existing RLS context.
begin;
create or replace function public.admin_review_driver_application(
  p_driver_id uuid, p_status text, p_reason text default ''
) returns public.drivers
language plpgsql security invoker set search_path = ''
as $function$
declare
  current_driver public.drivers;
  result public.drivers;
  reason text := trim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status not in ('pending','approved','rejected','suspended') then
    raise exception 'invalid_review_status' using errcode = '22023';
  end if;
  if length(reason)>1000 or (p_status<>'approved' and length(reason)<5) then
    raise exception 'review_reason_required' using errcode = '22023';
  end if;
  select * into current_driver from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;
  -- Network retries must not duplicate review records.
  if current_driver.review_status=p_status and
    (p_status='approved' or current_driver.rejection_reason=reason) then
    return current_driver;
  end if;
  if exists(select 1 from public.ride_requests where assigned_driver_id=p_driver_id
    and status in ('accepted','arrived_pickup','in_trip')) then
    raise exception 'driver_has_active_trip' using errcode='23514';
  end if;
  if p_status='approved' then
    if current_driver.review_status not in ('pending','suspended') then
      raise exception 'review_pending_required' using errcode='23514';
    end if;
    if not exists(select 1 from public.profiles where id=p_driver_id
      and role='driver' and account_status='active'
      and length(trim(coalesce(full_name,'')))>=2
      and length(regexp_replace(coalesce(phone,''),'[^0-9]','','g')) between 7 and 15) then
      raise exception 'profile_incomplete' using errcode='23514';
    end if;
    if current_driver.license_expiry is null or current_driver.license_expiry<current_date then
      raise exception 'licence_expired' using errcode='23514';
    end if;
    if nullif(trim(current_driver.license_number),'') is null
      or nullif(trim(current_driver.vehicle),'') is null
      or nullif(trim(current_driver.vehicle_color),'') is null
      or nullif(trim(current_driver.vehicle_plate),'') is null
      or current_driver.license_document_path is null
      or current_driver.vehicle_registration_path is null
      or current_driver.license_document_path=current_driver.vehicle_registration_path
      or split_part(current_driver.license_document_path,'/',1)<>p_driver_id::text
      or split_part(current_driver.vehicle_registration_path,'/',1)<>p_driver_id::text
      or (select count(*) from storage.objects where bucket_id='driver-verification'
        and name in (current_driver.license_document_path,current_driver.vehicle_registration_path)
        and lower(coalesce(metadata->>'mimetype','')) in ('image/jpeg','image/png','image/webp','application/pdf')
        and coalesce((metadata->>'size')::numeric,0)>0
        and coalesce((metadata->>'size')::numeric,0)<=8388608)<>2 then
      raise exception 'documents_incomplete' using errcode='23514';
    end if;
  end if;
  update public.drivers set review_status=p_status,reviewed_at=now(),
    is_online=false,
    rejection_reason=case when p_status='approved' then null else reason end
    where id=p_driver_id returning * into result;
  insert into public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),'driver_review','driver',p_driver_id,
    jsonb_build_object('previous_status',current_driver.review_status,'status',p_status,'reason',reason));
  return result;
end;
$function$;
revoke all on function public.admin_review_driver_application(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_driver_application(uuid,text,text) to authenticated;

-- Existing integrations receive the same approval checks; they cannot use
-- the old two-argument endpoint to approve missing or expired documents.
create or replace function public.admin_driver_review(p_driver_id uuid,p_status text)
returns public.drivers language sql security invoker set search_path=''
as $function$
  select public.admin_review_driver_application(p_driver_id,p_status,
    case when p_status='approved' then '' else 'Administrator review — contact Biloo support for details.' end);
$function$;
revoke all on function public.admin_driver_review(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_driver_review(uuid,text) to authenticated;
commit;
