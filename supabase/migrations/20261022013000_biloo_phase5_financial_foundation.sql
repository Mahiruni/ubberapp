-- Biloo Phase 5 — controlled double-entry accounting foundation.
-- Backward compatible; no backfill, collection, settlement, payout or revenue recognition.
-- The posting control is OFF and can only be enabled by a separate DBA-approved migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_posting_controls (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
 posting_enabled boolean NOT NULL DEFAULT false CHECK (posting_enabled = false),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.financial_posting_controls(singleton,posting_enabled)
VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;
COMMENT ON TABLE public.financial_posting_controls IS
 'Hard-disabled at schema level through posting_enabled=false CHECK. A reviewed later migration must remove the gate before journals can post.';
ALTER TABLE public.financial_posting_controls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_accounts (
 code text PRIMARY KEY CHECK(code ~ '^[1-5][0-9]{3}$'),
 name text NOT NULL,
 account_class text NOT NULL CHECK(account_class IN ('asset','liability','revenue','expense')),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.financial_accounts IS
 'ETB chart of accounts; account existence does not represent a balance or stored value.';
INSERT INTO public.financial_accounts(code,name,account_class) VALUES
 ('1100','Platform cash clearing','asset'),
 ('1110','Payment-provider settlement clearing','asset'),
 ('1120','Cash commission due from drivers','asset'),
 ('1130','Rider fare receivable','asset'),
 ('2100','Driver settlement payable','liability'),
 ('2110','Refunds payable','liability'),
 ('4100','Platform commission revenue','revenue'),
 ('4200','Service fee revenue','revenue'),
 ('5100','Driver incentive expense','expense'),
 ('5200','Processing fee expense','expense')
ON CONFLICT(code) DO NOTHING;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_key text NOT NULL UNIQUE CHECK(length(source_key) BETWEEN 8 AND 160),
 source_type text NOT NULL CHECK(source_type IN (
  'gateway_collection','cash_commission','driver_share','driver_settlement',
  'refund','commission','incentive','adjustment','sandbox')),
 source_reference uuid,
 description text NOT NULL CHECK(length(description) BETWEEN 5 AND 400),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 status text NOT NULL DEFAULT 'posted' CHECK(status='posted'),
 payload_hash text NOT NULL CHECK(length(payload_hash)=32),
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_journals_created_idx
 ON public.financial_journals(created_at DESC);
ALTER TABLE public.financial_journals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_ledger_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 journal_id uuid NOT NULL REFERENCES public.financial_journals(id),
 line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 100),
 account_code text NOT NULL REFERENCES public.financial_accounts(code),
 side text NOT NULL CHECK(side IN ('debit','credit')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999999),
 ride_request_id uuid REFERENCES public.ride_requests(id),
 driver_id uuid REFERENCES public.drivers(id),
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT financial_journal_line_unique UNIQUE(journal_id,line_number)
);
CREATE INDEX IF NOT EXISTS financial_entries_account_idx
 ON public.financial_ledger_entries(account_code,created_at DESC);
CREATE INDEX IF NOT EXISTS financial_entries_driver_idx
 ON public.financial_ledger_entries(driver_id,created_at DESC)
 WHERE driver_id IS NOT NULL;
ALTER TABLE public.financial_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK(provider IN ('internal','cash','chapa','arifpay')),
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending_external_activation'
  CHECK(status IN ('pending_external_activation','awaiting_evidence','in_review','reconciled','exception')),
 expected_minor bigint,
 verified_minor bigint,
 currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 evidence_reference text CHECK(length(evidence_reference)<=240),
 initiated_by uuid REFERENCES public.profiles(id),
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT financial_reconciliation_period_valid CHECK(period_start < period_end),
 CONSTRAINT financial_reconciliation_amounts_nonnegative CHECK(
  (expected_minor IS NULL OR expected_minor>=0) AND
  (verified_minor IS NULL OR verified_minor>=0)
 )
);
CREATE INDEX IF NOT EXISTS financial_reconciliations_created_idx
 ON public.financial_reconciliation_runs(created_at DESC);
ALTER TABLE public.financial_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reconciliation_id uuid REFERENCES public.financial_reconciliation_runs(id),
 source_kind text NOT NULL CHECK(source_kind IN (
  'cash_trip','provider_payment','driver_payout','ledger','commission')),
 source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 200),
 exception_type text NOT NULL CHECK(exception_type IN (
  'missing_entry','amount_mismatch','duplicate_reference','late_confirmation',
  'unverified_collection','unbalanced_journal','payout_discrepancy')),
 severity text NOT NULL DEFAULT 'review' CHECK(severity IN ('review','urgent')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 resolved_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS financial_exceptions_status_idx
 ON public.financial_reconciliation_exceptions(status,created_at DESC);
ALTER TABLE public.financial_reconciliation_exceptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.financial_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_type text NOT NULL CHECK(event_type IN ('journal_posted','reconciliation_started','exception_created','exception_resolved')),
 journal_id uuid REFERENCES public.financial_journals(id),
 actor_id uuid REFERENCES public.profiles(id),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_audit_events_created_idx
 ON public.financial_audit_events(created_at DESC);
ALTER TABLE public.financial_audit_events ENABLE ROW LEVEL SECURITY;

-- No direct access from mobile clients, riders, drivers, or admins.
-- Only the authenticated, authorized server endpoint may read through its service-role client.
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY[
  'financial_posting_controls','financial_accounts','financial_journals',
  'financial_ledger_entries','financial_reconciliation_runs',
  'financial_reconciliation_exceptions','financial_audit_events'
 ] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role',name);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',name);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',name||'_deny_client',name);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
    name||'_deny_client',name
  );
 END LOOP;
END $$;

-- Rule out changes to posted accounting and audit records.
CREATE OR REPLACE FUNCTION private.biloo_reject_financial_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'BILOO_FINANCIAL_RECORD_IMMUTABLE';
END $$;
REVOKE ALL ON FUNCTION private.biloo_reject_financial_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS financial_journals_immutable ON public.financial_journals;
CREATE TRIGGER financial_journals_immutable BEFORE UPDATE OR DELETE
 ON public.financial_journals FOR EACH ROW
 EXECUTE FUNCTION private.biloo_reject_financial_mutation();
DROP TRIGGER IF EXISTS financial_entries_immutable ON public.financial_ledger_entries;
CREATE TRIGGER financial_entries_immutable BEFORE UPDATE OR DELETE
 ON public.financial_ledger_entries FOR EACH ROW
 EXECUTE FUNCTION private.biloo_reject_financial_mutation();
DROP TRIGGER IF EXISTS financial_audit_immutable ON public.financial_audit_events;
CREATE TRIGGER financial_audit_immutable BEFORE UPDATE OR DELETE
 ON public.financial_audit_events FOR EACH ROW
 EXECUTE FUNCTION private.biloo_reject_financial_mutation();

-- Deferred check guarantees each committed journal is balanced and nonempty,
-- including when the journal and lines are inserted in the same transaction.
CREATE OR REPLACE FUNCTION private.biloo_assert_balanced_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE debits numeric; credits numeric; line_count bigint;
BEGIN
 SELECT coalesce(sum(amount_minor) FILTER (WHERE side='debit'),0),
        coalesce(sum(amount_minor) FILTER (WHERE side='credit'),0),
        count(*)
 INTO debits,credits,line_count
 FROM public.financial_ledger_entries WHERE journal_id=NEW.id;
 IF line_count<2 OR debits<=0 OR credits<=0 OR debits<>credits THEN
  RAISE EXCEPTION 'BILOO_JOURNAL_NOT_BALANCED';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.biloo_assert_balanced_journal() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS financial_journal_commit_balance ON public.financial_journals;
CREATE CONSTRAINT TRIGGER financial_journal_commit_balance AFTER INSERT
 ON public.financial_journals DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION private.biloo_assert_balanced_journal();

-- The following routine is intentionally inaccessible while the DB gate is off.
-- It does not accept browser JWTs; future server implementation requires additional
-- approval and source-verification before invoking it.
CREATE OR REPLACE FUNCTION private.biloo_post_financial_journal(
 p_source_key text, p_source_type text, p_description text, p_lines jsonb,
 p_source_reference uuid DEFAULT NULL, p_actor uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j_id uuid; prior_hash text; item jsonb; idx integer:=0;
DECLARE d numeric:=0; c numeric:=0; minor bigint; side_text text;
DECLARE code text; content_hash text; actor_record boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.financial_posting_controls
  WHERE singleton=true AND posting_enabled=true) THEN
  RAISE EXCEPTION 'BILOO_FINANCIAL_POSTING_DISABLED';
 END IF;
 IF p_source_key IS NULL OR length(p_source_key) NOT BETWEEN 8 AND 160
  OR p_source_key !~ '^[a-zA-Z0-9:_-]+$'
  OR p_description IS NULL OR length(p_description) NOT BETWEEN 5 AND 400
  OR p_source_type NOT IN (
   'gateway_collection','cash_commission','driver_share','driver_settlement',
   'refund','commission','incentive','adjustment','sandbox')
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100
 THEN RAISE EXCEPTION 'BILOO_JOURNAL_INVALID'; END IF;

 content_hash:=md5(jsonb_build_object(
  'source_key',p_source_key,'source_type',p_source_type,
  'description',p_description,'reference',p_source_reference,
  'actor',p_actor,'lines',p_lines)::text);

 -- Identical concurrent submissions converge to the same journal.
 PERFORM pg_advisory_xact_lock(hashtext(p_source_key));
 SELECT id,payload_hash INTO j_id,prior_hash FROM public.financial_journals
 WHERE source_key=p_source_key;
 IF FOUND THEN
  IF content_hash=prior_hash THEN RETURN j_id; END IF;
  RAISE EXCEPTION 'BILOO_JOURNAL_IDEMPOTENCY_CONFLICT';
 END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  idx:=idx+1;
  IF jsonb_typeof(item)<>'object'
   OR item->>'amount_minor' !~ '^[1-9][0-9]{0,14}$'
   OR item->>'side' NOT IN ('debit','credit')
   OR item->>'account_code' !~ '^[1-5][0-9]{3}$'
   OR NOT EXISTS(SELECT 1 FROM public.financial_accounts
    WHERE code=item->>'account_code' AND active=true)
  THEN RAISE EXCEPTION 'BILOO_JOURNAL_LINE_INVALID'; END IF;
  minor:=(item->>'amount_minor')::bigint;
  IF item->>'side'='debit' THEN d:=d+minor; ELSE c:=c+minor; END IF;
 END LOOP;
 IF d=0 OR c=0 OR d<>c THEN RAISE EXCEPTION 'BILOO_JOURNAL_NOT_BALANCED'; END IF;

 INSERT INTO public.financial_journals(
  source_key,source_type,source_reference,description,payload_hash,created_by)
 VALUES(p_source_key,p_source_type,p_source_reference,p_description,content_hash,p_actor)
 RETURNING id INTO j_id;
 idx:=0;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  idx:=idx+1;
  INSERT INTO public.financial_ledger_entries(
   journal_id,line_number,account_code,side,amount_minor,
   ride_request_id,driver_id)
  VALUES(j_id,idx,item->>'account_code',item->>'side',
   (item->>'amount_minor')::bigint,
   NULLIF(item->>'ride_request_id','')::uuid,
   NULLIF(item->>'driver_id','')::uuid);
 END LOOP;
 INSERT INTO public.financial_audit_events(event_type,journal_id,actor_id,details)
 VALUES('journal_posted',j_id,p_actor,jsonb_build_object('source_key',p_source_key));
 RETURN j_id;
END $$;
REVOKE ALL ON FUNCTION private.biloo_post_financial_journal(text,text,text,jsonb,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.biloo_post_financial_journal(text,text,text,jsonb,uuid,uuid)
 TO service_role;
COMMENT ON FUNCTION private.biloo_post_financial_journal(text,text,text,jsonb,uuid,uuid) IS
 'DB-gated and disabled in Phase 5. Does not initiate any real money movement. Atomic balanced journal posting reserved for later controlled integration.';

COMMIT;
