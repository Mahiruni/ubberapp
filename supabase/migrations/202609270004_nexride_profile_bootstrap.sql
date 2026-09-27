-- NexRide authenticated rider bootstrap
create or replace function public.ensure_customer_profile(p_full_name text default null,p_city_id uuid default null)
returns public.profiles language plpgsql security definer set search_path=public
as $$
declare v public.profiles;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profiles(id,city_id,role,full_name)
 values(auth.uid(),coalesce(p_city_id,(select id from public.cities where name='Addis Ababa' limit 1)),'customer',nullif(trim(p_full_name),''))
 on conflict(id) do update set full_name=coalesce(nullif(trim(p_full_name),''),profiles.full_name),
 city_id=coalesce(profiles.city_id,excluded.city_id);
 select * into v from public.profiles where id=auth.uid();
 return v;
end $$;
revoke all on function public.ensure_customer_profile(text,uuid) from public;
grant execute on function public.ensure_customer_profile(text,uuid) to authenticated;
