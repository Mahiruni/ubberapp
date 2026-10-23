# Biloo connected lifecycle implementation

## Result

The existing Rider, Driver and Administration applications remain the product source. No parallel identity, booking, trip or finance system was added.

Changes include database-owned Driver resume routing, direct continuation after signup-code verification, bounded authentication/API waits, recoverable verification loads, live review status, private document previews, four-item bilingual bottom navigation, full booking confirmation and persisted pickup instructions. Admins can inspect existing operational and financial records, request corrections, reopen review and approve eligible applications with audit history.

## Authoritative state

| Concern | Existing source / behavior |
| --- | --- |
| Identity | One `auth.users.id`; shared `profiles` and `account_roles` |
| Driver activation | `drivers.review_status`; only approved Drivers open operational Home |
| Incomplete Driver | Existing vehicle draft resumes verification; missing application resumes onboarding |
| Review failure | Recoverable error; never treated as approval or logout |
| Booking | Existing server fare, eligibility, idempotency and sequential dispatch commands |
| Matching | Fixed-price sequential mode retained; negotiated fares are not enabled without configured business rules |
| Trip progression | Existing database transition guards and Realtime subscriptions |
| Assignment | Existing one-acceptance constraint plus one active trip per Driver |
| Earnings | Existing ledger and per-trip/type uniqueness; completion does not confirm payment |
| Documents | Existing private `driver-verification` bucket; owner/Admin access and short-lived signed previews |
| Administration | Existing Admin identity and RLS; current Driver evidence checked before approval; auditable decisions |
| Finance | Read-only inspection of existing commission, earnings, payment, settlement and reconciliation records |

Editable Auth metadata can prefill forms but cannot establish Admin/Driver authorization or approval. Review decisions are idempotent. Existing clients calling the old review RPC receive the same approval checks.

## Applied migrations

- `20261023061106_biloo_driver_review_controls.sql`: validated, auditable Driver review and compatibility wrapper.
- `20261023061853_biloo_one_active_trip_per_driver.sql`: unique active assignment; preflight found no conflicting assignments.
- `20261023063403_biloo_pickup_instructions.sql`: optional bounded instructions on the existing request row.

No account/trip history was removed. Financial posting was confirmed disabled during inspection; no gateway, payment or payout activation was performed.

## Verification

- Production build including TypeScript: passed.
- Unit suite: 273 tests passed.
- Production-build browser suite: 66 checks passed across Chromium desktop and Pixel-sized mobile contexts. Includes signup-code continuation, invalid codes, same-identity Driver application, pending/rejected/suspended Driver restrictions, approval refresh, network recovery, denied GPS with manual booking, request transport failure, Admin review/finance, four-tab navigation, existing portraits and synchronized Rider trip/receipt UI.
- Transactional database tests: shared Rider/Driver identity, Rider isolation, role escalation denial, self-approval denial, unapproved Online/offer denial, review idempotency, atomic assignment, trip progression, completion, earnings deduplication and pending payment preservation passed. All fixtures and associated outbox/ledger records were rolled back.
- Private document buckets were confirmed non-public.

The SQL regression scripts in `tests/sql` are rollback-only. They do not run provider transactions or send notifications.

## Release constraints

The broad historical browser suite still contains pre-redesign labels, Leaflet selectors and preview controls (for example, `Pickup location` and `Continue to ride options` where the current interface uses `Pickup` and `Choose a ride`). Its failures must not be described as a passing full repository suite. The current lifecycle coverage is added to the existing Identity Experience workflow; broader tests are retained.

The remote Supabase migration history also predates different local migration filenames and includes financial migrations absent from the original checkout. This pre-existing history mismatch remains a Preview/CI concern. No migration history was deleted, rewritten or marked applied to hide it.

Physical Android GPS/background testing, live Mapbox road testing and real-user acceptance remain distinct from mocked-provider browser checks. Payment providers are deferred by the project instruction. A Vercel READY result alone is not evidence that all release checks passed; do not promote production while required checks fail.
