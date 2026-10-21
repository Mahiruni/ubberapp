-- Explicit deny policies make the intentionally service-role-only commission
-- schema auditable to Supabase RLS checks. Financial operations use the
-- authorized server API, never direct client access.
BEGIN;
DROP POLICY IF EXISTS commission_rules_no_client_access ON public.platform_commission_rules;
CREATE POLICY commission_rules_no_client_access ON public.platform_commission_rules
 FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS commission_audit_no_client_access ON public.commission_rule_audit_events;
CREATE POLICY commission_audit_no_client_access ON public.commission_rule_audit_events
 FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS commission_snapshots_no_client_access ON public.commission_quote_snapshots;
CREATE POLICY commission_snapshots_no_client_access ON public.commission_quote_snapshots
 FOR ALL TO authenticated USING (false) WITH CHECK (false);
COMMIT;
