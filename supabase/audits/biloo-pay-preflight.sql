-- READ ONLY. Run with authorized catalog access on the project identified by Vercel.
-- Never infer the project from the connection label. Inspect the URL/project ref first.
begin transaction read only;
select current_database(), current_user, version();
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in (
 'profiles','drivers','ride_requests','payment_transactions','driver_earnings_ledger',
 'driver_payout_accounts','driver_payout_requests','trips','payments','wallet_ledger')
order by table_name,ordinal_position;
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','biloo_pay') and c.relkind in ('r','p') order by n.nspname,c.relname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','biloo_pay') order by tablename,policyname;
select t.tgname,t.tgenabled,p.oid::regprocedure as function_name,pg_get_triggerdef(t.oid)
from pg_trigger t join pg_proc p on p.oid=t.tgfoid
where t.tgrelid=to_regclass('public.ride_requests') and not t.tgisinternal order by t.tgname;
select p.oid::regprocedure,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private','biloo_pay') and
 (p.proname like '%payment%' or p.proname like '%payout%' or p.proname like 'biloo_pay_%' or p.proname='trip_transition')
order by p.oid::regprocedure::text;
select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid)
from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('public','biloo_pay'))
  and (contype='f' or conrelid in (to_regclass('public.ride_requests'),to_regclass('public.payment_transactions')))
order by conrelid::regclass::text,conname;
commit;
