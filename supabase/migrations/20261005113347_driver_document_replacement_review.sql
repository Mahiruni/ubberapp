create or replace function private.enforce_driver_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog'
as $$
declare
  verification_changed boolean;
  review_changed boolean;
begin
  if new.id <> old.id then
    raise exception 'Driver identity cannot be changed' using errcode = '42501';
  end if;

  review_changed :=
    new.review_status is distinct from old.review_status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.reviewed_at is distinct from old.reviewed_at;

  if review_changed and not private.is_admin() then
    raise exception 'Only an administrator can change driver review state' using errcode = '42501';
  end if;

  verification_changed :=
    new.license_number is distinct from old.license_number
    or new.license_expiry is distinct from old.license_expiry
    or new.vehicle_plate is distinct from old.vehicle_plate
    or new.license_document_path is distinct from old.license_document_path
    or new.vehicle_registration_path is distinct from old.vehicle_registration_path;

  if verification_changed then
    if old.review_status = 'suspended' then
      raise exception 'Suspended driver verification cannot be changed';
    end if;

    if old.review_status not in ('draft','pending','rejected','approved') then
      raise exception 'Driver verification cannot be changed in the current state';
    end if;

    if nullif(trim(coalesce(new.license_number,'')), '') is null then
      raise exception 'License number is required';
    end if;

    if new.license_expiry is null or new.license_expiry <= current_date then
      raise exception 'Driver license must have a future expiry date';
    end if;

    if nullif(trim(coalesce(new.vehicle_plate,'')), '') is null then
      raise exception 'Vehicle plate is required';
    end if;

    if new.license_document_path not like new.id::text || '/%'
       or new.vehicle_registration_path not like new.id::text || '/%' then
      raise exception 'Invalid verification document path' using errcode = '42501';
    end if;

    new.review_status := 'pending';
    new.rejection_reason := null;
    new.submitted_at := now();
    new.reviewed_at := null;
    new.is_online := false;
  end if;

  if new.is_online is distinct from old.is_online and new.is_online and old.review_status <> 'approved' then
    raise exception 'Driver approval is required before going online' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_driver_update() from public, anon, authenticated;
