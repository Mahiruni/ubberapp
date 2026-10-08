-- Do not let direct profile edits replace an OTP-verified phone claim.
create or replace function private.nexride_protect_verified_profile_phone()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare owned_phone text;
begin
 if new.phone is not distinct from old.phone then return new; end if;
 select phone_e164 into owned_phone from public.account_verified_phones
 where user_id=new.id;
 if owned_phone is not null
   and private.normalize_et_phone(new.phone) is distinct from owned_phone then
    raise exception 'phone_otp_verification_required' using errcode='23514';
 end if;
 return new;
end;
$fn$;
drop trigger if exists profiles_protect_verified_phone on public.profiles;
create trigger profiles_protect_verified_phone
before update of phone on public.profiles
for each row execute function private.nexride_protect_verified_profile_phone();
revoke all on function private.nexride_protect_verified_profile_phone()
 from public,anon,authenticated;
