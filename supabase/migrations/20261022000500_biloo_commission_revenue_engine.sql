-- Biloo Phase 4: immutable, effective-dated commission rules and non-payable
-- calculation snapshots. No existing trip or earnings ledger is rewritten.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_commission_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_category text NOT NULL DEFAULT '*' CHECK (ride_category ~ '^(\*|[a-z][a-z0-9_]{0,39})$'),
 commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
 fixed_fee_minor bigint NOT NULL DEFAULT 0 CHECK (fixed_fee_minor BETWEEN 0 AND 100000000),
 discount_bps integer NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
 incentive_minor bigint NOT NULL DEFAULT 0 CHECK (incentive_minor BETWEEN 0 AND 100000000),
 tax_bps integer NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
 effective_from timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved')),
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 approved_by uuid REFERENCES public.profiles(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT commission_approval_state CHECK (
   (state = 'draft' AND approved_by IS NULL AND approved_at IS NULL) OR
   (state = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
 ),
 CONSTRAINT commission_effective_rule_unique UNIQUE (ride_category,effective_from)
);
COMMENT ON TABLE public.platform_commission_rules IS
 'Immutable rate versions. Approval authorizes future quote snapshots only; never a payout or an existing-ride reprice. tax_bps informational until compliance-approved tax engine.';

CREATE TABLE IF NOT EXISTS public.commission_rule_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 rule_id uuid NOT NULL REFERENCES public.platform_commission_rules(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 event_type text NOT NULL CHECK (event_type IN ('draft_created','rule_approved')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_rule_audit_rule_idx
 ON public.commission_rule_audit_events(rule_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commission_quote_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_request_id uuid NOT NULL UNIQUE REFERENCES public.ride_requests(id),
 driver_id uuid NOT NULL REFERENCES public.drivers(id),
 rule_id uuid NOT NULL REFERENCES public.platform_commission_rules(id),
 ride_category text NOT NULL,
 gross_minor bigint NOT NULL CHECK (gross_minor >= 0),
 base_fee_minor bigint NOT NULL CHECK (base_fee_minor >= 0),
 discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
 commission_minor bigint NOT NULL CHECK (commission_minor >= 0),
 incentive_minor bigint NOT NULL CHECK (incentive_minor >= 0),
 driver_share_minor bigint NOT NULL CHECK (driver_share_minor >= 0),
 platform_net_minor bigint NOT NULL,
 currency text NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
 status text NOT NULL DEFAULT 'calculated_unsettled' CHECK (status = 'calculated_unsettled'),
 calculated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT commission_arithmetic_invariant CHECK (
    commission_minor <= gross_minor AND
    driver_share_minor = gross_minor - commission_minor + incentive_minor AND
    platform_net_minor = commission_minor - incentive_minor
 )
);
COMMENT ON TABLE public.commission_quote_snapshots IS
 'Write-once, informational commission calculations for newly completed rides only. Never recognized cash, collected commission, settlement or payout.';

ALTER TABLE public.platform_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rule_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_quote_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_commission_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commission_rule_audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commission_quote_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.platform_commission_rules TO service_role;
GRANT SELECT,INSERT ON public.commission_rule_audit_events TO service_role;
GRANT SELECT,INSERT ON public.commission_quote_snapshots TO service_role;

-- Business rule changes are append-only except a single draft->approved transition.
CREATE OR REPLACE FUNCTION private.guard_biloo_commission_rule()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMMISSION_RULE_IMMUTABLE';
 ELSIF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' THEN RAISE EXCEPTION 'COMMISSION_RULE_MUST_START_DRAFT'; END IF;
 ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'draft' OR NEW.state <> 'approved'
       OR OLD.id IS DISTINCT FROM NEW.id
       OR OLD.ride_category IS DISTINCT FROM NEW.ride_category
       OR OLD.commission_bps IS DISTINCT FROM NEW.commission_bps
       OR OLD.fixed_fee_minor IS DISTINCT FROM NEW.fixed_fee_minor
       OR OLD.discount_bps IS DISTINCT FROM NEW.discount_bps
       OR OLD.incentive_minor IS DISTINCT FROM NEW.incentive_minor
       OR OLD.tax_bps IS DISTINCT FROM NEW.tax_bps
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.note IS DISTINCT FROM NEW.note
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR NEW.approved_at IS NULL OR NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'COMMISSION_RULE_IMMUTABLE';
    END IF;
    -- Tax is explicitly deferred to a jurisdiction-reviewed tax engine.
    IF NEW.tax_bps <> 0 THEN RAISE EXCEPTION 'COMMISSION_TAX_REQUIRES_REVIEW'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_biloo_commission_rule() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_biloo_commission_rule ON public.platform_commission_rules;
CREATE TRIGGER guard_biloo_commission_rule
BEFORE INSERT OR UPDATE OR DELETE ON public.platform_commission_rules
FOR EACH ROW EXECUTE FUNCTION private.guard_biloo_commission_rule();

CREATE OR REPLACE FUNCTION private.audit_biloo_commission_rule()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE who uuid;
DECLARE action text;
BEGIN
 who := CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by ELSE NEW.approved_by END;
 action := CASE WHEN TG_OP = 'INSERT' THEN 'draft_created' ELSE 'rule_approved' END;
 INSERT INTO public.commission_rule_audit_events(rule_id,actor_id,event_type,details)
 VALUES(NEW.id,who,action,jsonb_build_object('effective_from',NEW.effective_from,'category',NEW.ride_category,'bps',NEW.commission_bps));
 INSERT INTO public.admin_action_log(actor_id,action,entity_type,entity_id,metadata)
 VALUES(who,'commission_'||action,'platform_commission_rule',NEW.id,
  jsonb_build_object('effective_from',NEW.effective_from,'category',NEW.ride_category,'commission_bps',NEW.commission_bps));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.audit_biloo_commission_rule() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS audit_biloo_commission_rule ON public.platform_commission_rules;
CREATE TRIGGER audit_biloo_commission_rule
AFTER INSERT OR UPDATE ON public.platform_commission_rules
FOR EACH ROW EXECUTE FUNCTION private.audit_biloo_commission_rule();

CREATE OR REPLACE FUNCTION private.guard_biloo_commission_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'COMMISSION_SNAPSHOT_IMMUTABLE';
END $$;
REVOKE ALL ON FUNCTION private.guard_biloo_commission_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_biloo_commission_snapshot ON public.commission_quote_snapshots;
CREATE TRIGGER guard_biloo_commission_snapshot
BEFORE UPDATE OR DELETE ON public.commission_quote_snapshots
FOR EACH ROW EXECUTE FUNCTION private.guard_biloo_commission_snapshot();

-- Snapshot newly completed rides only. No retroactive backfill.
-- Rules are selected by effective date and category (exact match before '*').
CREATE OR REPLACE FUNCTION private.snapshot_biloo_future_ride_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rule_row public.platform_commission_rules%ROWTYPE;
DECLARE gross bigint;
DECLARE base_fee bigint;
DECLARE discount bigint;
DECLARE fee bigint;
BEGIN
 IF NEW.status <> 'completed' OR OLD.status = 'completed'
    OR NEW.assigned_driver_id IS NULL OR NEW.final_fare_etb IS NULL
    OR NEW.final_fare_etb < 0 THEN RETURN NEW; END IF;
 SELECT * INTO rule_row FROM public.platform_commission_rules r
 WHERE r.state='approved' AND r.tax_bps=0
    AND r.ride_category IN (NEW.ride_category,'*')
    AND r.effective_from <= COALESCE(NEW.completed_at,now())
 ORDER BY (r.ride_category=NEW.ride_category) DESC, r.effective_from DESC, r.created_at DESC
 LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 gross := round(NEW.final_fare_etb*100)::bigint;
 base_fee := round((gross::numeric * rule_row.commission_bps)/10000)::bigint
             + rule_row.fixed_fee_minor;
 discount := round((base_fee::numeric * rule_row.discount_bps)/10000)::bigint;
 fee := LEAST(gross,GREATEST(0,base_fee-discount));
 INSERT INTO public.commission_quote_snapshots(
 ride_request_id,driver_id,rule_id,ride_category,gross_minor,base_fee_minor,
 discount_minor,commission_minor,incentive_minor,driver_share_minor,platform_net_minor)
 VALUES(NEW.id,NEW.assigned_driver_id,rule_row.id,NEW.ride_category,gross,base_fee,
 discount,fee,rule_row.incentive_minor,
 gross-fee+rule_row.incentive_minor,fee-rule_row.incentive_minor)
 ON CONFLICT (ride_request_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.snapshot_biloo_future_ride_commission() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ride_completed_biloo_commission_quote ON public.ride_requests;
CREATE TRIGGER ride_completed_biloo_commission_quote
AFTER UPDATE OF status ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION private.snapshot_biloo_future_ride_commission();

CREATE INDEX IF NOT EXISTS commission_rule_selection_idx
 ON public.platform_commission_rules(ride_category,state,effective_from DESC);
CREATE INDEX IF NOT EXISTS commission_quote_driver_idx
 ON public.commission_quote_snapshots(driver_id,calculated_at DESC);
COMMIT;
