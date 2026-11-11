# Biloo Financial System — Chapa API v2 rollout

This release **does not turn on live collections or payouts**. It upgrades the existing
ride-hailing payment integration behind the existing server-side feature flags.
Do not enable or deploy live charging until the Chapa merchant account explicitly
supports the Biloo ride-hailing/marketplace business model, payout destinations,
and the appropriate country/payment methods.

## Architecture currently implemented

- `lib/nexride-payments.ts`: server-only Chapa v2 hosted checkout, ETB validation,
  merchant-reference binding, provider-reference verification, raw-body HMAC.
- `/api/payments/chapa/initialize`: authenticated completed-ride checkout with
  idempotency and no concurrent active charge per ride.
- `/api/payments/chapa/callback`: customer redirect only. Unknown/timeout states
  remain **pending**, not paid or definitively failed.
- `/api/payments/chapa/webhook`: HMAC-authenticated notifications; Chapa reference,
  original merchant reference, amount, currency and environment checks; then
  independent provider verification before finalization.
- `lib/nexride-payouts.ts`: v2 bank destinations, payout submission with
  idempotency, and payout status confirmation. Payout results are asynchronous.
- `supabase/migrations/20261021195000_biloo_chapa_v2_integrity.sql`: private
  webhook replay ledger and one-active-payment-per-ride guard.
- `tests/unit/biloo-payments-v2.test.ts`: verification, HMAC, hosted checkout
  and payout contract unit tests.

## Environment contract

Set keys only in Vercel **server-side** environment settings, never in
`NEXT_PUBLIC_*`, GitHub files, screenshots or chat.

| Variable | Purpose |
| --- | --- |
| `PAYMENT_PROVIDER=chapa` | Activate Chapa adapter |
| `NEXRIDE_PAYMENTS_ENABLED=true` | Permit the payment API only when keys are valid |
| `CHAPA_SECRET_KEY=CHAPA_TEST_...` | Sandbox private key |
| `CHAPA_WEBHOOK_SECRET` | Signing secret from configured Chapa webhook |
| `BILOO_LIVE_PAYMENTS_APPROVED=true` | Explicit live-payment opt-in (live key required) |
| `BILOO_SANDBOX_CHECKOUT_ENABLED=true` | Sandbox checkout on **preview-only** production-mode builds |
| `NEXRIDE_PAYOUTS_ENABLED=true` | Enable driver payout API only with remaining conditions met |
| `PAYOUT_ENCRYPTION_KEY` | Existing AES-GCM key; preserve existing value across releases |
| `BILOO_LIVE_PAYOUTS_APPROVED=true` | Explicit live-payout opt-in (live key required) |
| `BILOO_SANDBOX_PAYOUTS_ENABLED=true` | Sandbox payout testing in isolated preview builds |

Production site: do **not** set sandbox flags; do not grant live flags until
merchant KYC, settlement eligibility, payout safeguards and finance review pass.

Chapa's v2 webhook must point to:
`https://<approved-domain>/api/payments/chapa/webhook`
with HMAC signature authentication enabled.

## Deployment steps

1. Run `npm test`, `npx tsc --noEmit`, `npm run build` and mandatory browser tests.
2. Verify Chapa API v2 sandbox payment initiation, signed webhook and receipt end to end.
3. Review and apply the additive SQL migration to the linked project; ensure the
   unique index is valid against existing records (currently payment table is empty).
4. Check Supabase database security advisors and RLS; the webhook table is backend-only.
5. Deploy to a preview environment first; prove that no production money moves.
6. Confirm exactly-once finalization, webhook retry handling and payout reconciliation.
7. Obtain live merchant and disbursement approval; set production secrets and gates
   only after explicit launch authorization.
8. Monitor server errors, missing webhook delivery, failed status verification,
   duplicates, and unresolved financial events.

## Known follow-on phases (not delivered by this PR)

- ArifPay merchant-approved fallback adapter (never auto-recharge).
- Configurable platform commission and balanced double-entry finance ledger.
- Finance admin center, daily reconciliation and anomaly resolution queue.
- Driver payouts with scheduled batching and administrative approvals.
- Partial/full refund flow, adjustments and accounting reports.
- True provider-approved split settlement if licensed/contractually permitted.
- Complete Android/web end-to-end sandbox runs and live-merchant verification.

Do not advertise these capabilities as active until implemented and verified.

## Provider source

- https://docs.chapa.global/docs/v2/getting-started
- https://docs.chapa.global/docs/v2/integrations/verify-payment
- https://docs.chapa.global/docs/v2/integrations/webhooks
- https://docs.chapa.global/docs/v2/payouts/payout
- https://docs.chapa.global/docs/v2/payouts/verify-payout
