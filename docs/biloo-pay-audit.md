# Biloo Pay: architecture audit and staged implementation

Audit date: 26 October 2026, Africa/Addis_Ababa. Base: `658e2549b5bc68a18632da8f953763cd7ae880d1` in `Mahiruni/ubberapp`.

**Release decision: development candidate only. No production database, environment variable, production branch, payment, or payout was changed.** Production schema access and provider sandbox verification remain required. This document distinguishes observed facts from candidate design.

## 1. Verified environment findings

| Surface                                 | Direct evidence                                                                                                                                                     | Conclusion                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                              | Public `Mahiruni/ubberapp`, default branch `main`, Next.js 16.3.6 / React 19.2 / Node 24                                                                            | Existing app and routes are the implementation target.                                                                                |
| Vercel                                  | Team `gulitshop`, `team_AoSdFghTUd6VdeJiBNuaDEyV`; project `ubberapp`, `prj_sheVmE9OFdtXOBpn93xBxgLGVLVD`                                                           | Correct existing deployment identified.                                                                                               |
| Production deployment at audit          | `dpl_46CwBuZcmpoZAHVAu2dqXMXpenZG`, READY, commit `658e2549...`; domains include `biloo.hisabtech.com` and `ubberapp.vercel.app`                                    | Production state inspected without redeployment.                                                                                      |
| Deployed public Supabase URL            | `NEXT_PUBLIC_SUPABASE_URL=https://eyyvvwecpyctttiueban.supabase.co`, scoped to production **and preview**; server admin client also uses `publicConfig.supabaseUrl` | `eyyvvwecpyctttiueban` is the configured application database. A connection label is not proof of ownership or schema.                |
| Connected “Biloo Ride” project          | `ocvydmfywynqacshmcey`: `list_tables(public)` empty, `list_migrations` empty; catalog query found no application tables in other application schemas                | Do not create a replacement application here or assume it contains live financial state.                                              |
| Correct project's administrative access | Both connected Supabase accounts returned “You do not have permission to perform this action” for `get_project(eyyvvwecpyctttiueban)`                               | Production columns, constraints, RLS, triggers, grants, migration history, balances and actual transaction states are **unverified**. |
| Limited anonymous REST check            | Zero-row `payment_transactions` projection returned `200 []`; root metadata and other financial projections returned `401`                                          | Confirms a narrow reachable resource, not an empty ledger or a complete schema audit. No customer rows were fetched.                  |
| Live public capability endpoint         | `GET https://biloo.hisabtech.com/api/payments/config` returned `{"enabled":false,"provider":null,"methods":["cash"]}`                                               | Digital checkout is advertised as disabled. No provider operation was attempted.                                                      |

No service-role key, database password or merchant secret was retrieved from Vercel. Environment inspection used variable metadata and the public Supabase URL. No write tool was called on a remote Supabase project.

## 2. Repository risks found

1. `20261025100000_biloo_cash_payment_on_trip_completion.sql` automatically marks cash paid when a Driver completes a trip. Completion alone is not evidence of receipt.
2. `post_completed_ride_earnings` records estimated Driver earnings on completion, regardless of collection method/status. The old payout route sums these as available funds, including cash already held by the Driver and unverified electronic fares.
3. Chapa callback verification failure previously overwrote an attempt as failed, including transient provider failures. The initialize path compared only the idempotency key's amount, allowing an equal-priced different trip to reuse it. Different keys could initialize competing checkouts for the same trip.
4. Existing payout verification trusted a success status without binding reference, exact amount, currency, environment or frozen destination.
5. Legacy September `trips/payments/wallet_ledger` and October `ride_requests/payment_transactions/driver_earnings_ledger` models coexist. A legacy `trip_transition` creates paid cash records. Repository migration history is not proof that all these objects exist in production.
6. Two Rider-avatar files share migration version `20261024190000`. Do not blindly replay or `db push` this repository into production.
7. Preview shares the production database URL. Feature branches must not be used for live financial experiments.

## 3. Candidate accounting model

`biloo_pay` is a private schema. Client roles have neither schema/table access nor financial RPC execute rights. Server RPCs use invoker privileges and are granted only to `service_role`. The API verifies the bearer token with Supabase, reads protected account roles, and derives actor IDs from that verified identity. Finance access requires `admin_role` of `super_admin` or explicitly provisioned `finance`.

Money is integer santim. Revenue uses the commission basis points captured for each **new** booking from a reviewed policy. The policy has no production default. Historical trips without captured terms are blocked for review. Final confirmed fare is required; no estimated Driver payout is used as a wallet balance.

| Event                                                      | Debit                         | Credit                                       | Driver effect                                                                            |
| ---------------------------------------------------------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cash received, explicitly confirmed by assigned Driver     | Commission receivable         | Commission revenue                           | Physical fare remains with Driver; no wallet credit.                                     |
| Chapa collection verified on server                        | Provider clearing, gross fare | Driver payable, net fare; commission revenue | Only verified digital net fare becomes payable.                                          |
| Cash commission netted against unreserved digital earnings | Driver payable                | Commission receivable                        | Clears owed cash commission once, without another revenue charge.                        |
| Withdrawal reserved                                        | Driver payable                | Payout pending                               | Immediately removes reserved funds from availability.                                    |
| Payout verified successful                                 | Payout pending                | Provider clearing                            | Funds leave clearing only after reference, amount, currency, mode and destination match. |
| Payout verified failed                                     | Payout pending                | Driver payable                               | Releases the reservation once. Unknown/timeouts/404 do not release it.                   |

Provider clearing represents gross provider receivables, not a verified bank balance. Provider fees and bank settlement require statement reconciliation; the app does not invent either. Historical opening balances are not imported. Lifetime totals in these screens cover Biloo Pay postings only; recent record lists are bounded to 50 rows.

Every journal has at least two entries and balances to zero at the database transaction boundary. Ledger entries, terms, settlements and audit events are immutable. New lines cannot be appended to a journal after its posting transaction. A natural per-ride settlement key and actor/request idempotency keys prevent duplicate postings. Ride and Driver locks serialize collection and withdrawal changes. Held withdrawal destinations are encrypted snapshots, so editing an account cannot redirect an existing request.

Trip completion remains a trip event. The candidate removes only the cash auto-paid trigger and protects financial fields from direct client updates while permitting normal Driver stage transitions. Legacy financial RPC execute grants are removed to prevent alternate settlement/payout paths; the actual production inventory must be verified before migration.

## 4. Implemented surfaces

- `/rider/wallet`: navy/white Biloo Pay, methods, attention queue, verified receipts, cash status, trip-linked refund/dispute requests, loading/error states, shared appearance setting.
- `/driver/wallet`: verified availability, recorded cash, net trip earnings, pending withdrawals, commission due, explicit cash-received dialog and withdrawal flow. Linked from Earnings and cash trip completion. Existing payout destination management is retained.
- `/admin/finance`: protected collections, transactions, payout verification, checkout reconciliation, durable webhook inbox, refund/dispute/reconciliation review, and audit events. Linked from the existing administration navigation.
- Chapa v1 API paths are retained; v2's amount units and payload shapes are not mixed in. Checkout redirects are restricted to `https://checkout.chapa.co`; callback origins come from server configuration.
- Webhooks authenticate the exact raw body using `x-chapa-signature` and constant-time comparison. The replayable legacy static hash is not accepted. Signed payment and payout deliveries are persisted; unresolved verification returns non-200 for retry. Payment or payout refund/reversal events create a conservative finance hold instead of being treated as payment success.
- Cash commission is offset only from digital funds not reserved for withdrawal. An unresolved finance case blocks new withdrawals. Refund/reversal reviews cannot be closed merely to release that hold.

**Refund execution is not activated or represented as complete.** This stage implements refund requests, disputes and conservative holds. Provider-verified refund/reversal postings, partial refunds, external cash commission remittances, provider-fee statements, and historical migration require a separate verified reconciliation adapter and approval. No “refund succeeded” action exists. These are release requirements, not simulated functionality.

## 5. Release controls

Application writes require `BILOO_PAY_ENABLED=true`, the exact `BILOO_PAY_VERIFIED_PROJECT_REF`, and a valid `PAYMENT_MODE`. Test mode is forbidden against the designated production project; live mode is forbidden in a Vercel preview. A private database gate additionally requires the expected schema version, an enabled policy and matching mode. Payouts require a separate reviewed feature flag. Defaults stay disabled.

Database mode cannot change once a journal exists. Test environments display a clear “no real money” notice. Local synthetic records are never seeded into production, shipped in application data, or treated as live evidence.

There is no migration-on-deploy or activation code. Applying this candidate is a separate operator step after reviewing the real schema. This PR must not be merged/deployed to production as a replacement for that review.

## 6. Verification and limits

- `npm run test:payments`: money parsing, environment isolation, signatures, checkout origin restrictions, amount/currency/reference/mode matching, callback uncertainty, ownership, exact-once posting, balancing, cash commission offsets, immutable records, schema/RPC permissions, withdrawal reservation and evidence rules.
- `npm run test:payments:e2e`: real browser → Next API → local PostgreSQL → UI. Fourteen Android/desktop scenarios exercise cash confirmation, checkout retries, callbacks/webhooks, withdrawal reservation/verification, finance case review and unknown balance states. Supabase Auth and Chapa are **synthetic local HTTP boundaries**, with external requests blocked. These tests do not prove merchant activation or actual provider behavior.
- `npm run build` and TypeScript checks validate the application. Screenshots are visually reviewed in both themes and at 320 px width.
- Full baseline regression run initially found five failures also reproduced in detached `main`: two Account presentation checks, two footer/navigation checks, and a launcher-icon distinction check. They were not hidden, deleted or loosened in this payment change. The existing payout configuration test was updated to require the new gates.
- The SQL tests use PGlite's PostgreSQL engine and isolated fixture schema. Real multi-connection contention, production-specific RLS/advisors, full existing migration replay and real merchant sandbox checks remain staging requirements. The fixture is **not** a production schema dump.

The dedicated GitHub workflow runs payment checks, production compilation, and isolated browser scenarios without deployment credentials or real provider secrets. A passing payment job does not override existing repository failures or authorize production release.

## 7. Required next verified stage

1. Connect authorized access to Supabase project `eyyvvwecpyctttiueban`. Run `supabase/audits/biloo-pay-preflight.sql` read-only; inspect actual migrations, triggers, policies and grants, and obtain authorized aggregate reconciliation reports without changing financial records.
2. Create/use an isolated development database from the verified schema. Resolve migration collisions and legacy bypass inventory there, run advisors, and apply only reviewed candidate migrations. Agree commission policy, opening balances, pending legacy transactions, fee treatment and cutover instant.
3. Confirm the actual Chapa merchant API version and sandbox response fields. Obtain genuine test-mode payment, failure, duplicate delivery, timeout, payout, refund and reversal evidence. Missing verification fields fail closed; do not relax checks to make a green screen.
4. Complete provider refund/reversal and external statement/remittance accounting before enabling those operations. Test over-refund prevention, hold release, stale/out-of-order events and payout races on separate database connections.
5. Close the five baseline regression failures, review migration/data retention behavior, and verify GPS, dispatch, authentication and active trip restoration against the isolated environment.
6. Obtain explicit production release confirmation after the reviewed migration, provider tests, reconciliation and rollback evidence are concrete. Stage a production build without assigning live domains; verify it, then promote only the reviewed commit.

Rollback means disable new financial writes and preserve all journals/holds/evidence, then reconcile ambiguous operations. **Do not** restore the former payout calculation or cash auto-paid trigger after new money has posted; that would reintroduce double-credit risk. Never delete ledger entries to roll back an application release.

## Primary references reviewed

- https://developer.chapa.co/integrations/verify-payments
- https://developer.chapa.co/integrations/webhooks
- https://developer.chapa.co/transfer/verify-transfers
- https://docs.chapa.global/docs/v2/security/security-guide (version comparison only)
- https://supabase.com/changelog
- https://supabase.com/docs/guides/database/postgres/row-level-security
- Installed `node_modules/next/dist/docs/` route, data-security and Playwright guides for Next.js 16.3.6.
