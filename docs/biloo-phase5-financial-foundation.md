# Biloo Phase 5 — Enterprise Financial Database

This foundation is **not live settlement**, not a bank wallet and not proof that ride fares were collected.

## Delivered

- Ten ETB chart-of-account codes, with asset/liability/revenue/expense classifications.
- Append-only financial journals and numbered debit/credit ledger entries.
- Integer minor units (100 = ETB 1) and a deferred transaction-level balancing check.
- A unique source key plus payload-hash idempotency protections for future posting.
- An immutable journal/entry/audit trail.
- Reconciliation run, exception and audit-event registers. These start empty.
- Read-only authorized Admin → Payments → Financial Ledger screen.
- A role-protected, preview-only journal balance checker that validates current
  active account codes. It never inserts anything.
- Security: RLS deny-all to browser roles, table reads only to service role,
  mutations withheld. Posting routine lives in a private schema with EXECUTE
  restricted to service_role.

### Hard posting control

`financial_posting_controls.posting_enabled` is constrained to `false` by a
PostgreSQL CHECK constraint in this release. Even privileged normal application
code cannot turn on posting. A separate reviewed DBA migration is required
to change this behavior.

There is no Chapa, ArifPay, bank transfer, driver settlement, commission collection,
wallet balance, or live financial journal API endpoint in Phase 5.

### Critical accounting principles

- Every journal has two or more lines with **equal debit and credit totals**.
- Every journal uses ETB integer minor units, never floating-point balances.
- Journal lines and journals cannot be updated or deleted; corrections later
  require separately authorized reversing journals (not yet implemented).
- A driver payout liability is not a payout and a cash-ride fare is not
  gateway collection. The new accounts start at zero; do not backfill based
  on unverified fare estimates.
- Phase 4 commission quotes are `calculated_unsettled`; they do not create
  a driver payable, balance, or recognized revenue in Phase 5.
- Source idempotency is enforced by a unique key plus normalized payload hash,
  with transaction lock protection against simultaneous duplicates.
- All new reconciliation exceptions are pending investigation, not automatically
  settled or dismissed.

### Tested

Supabase rollback-only SQL checks confirm the posting gate rejects a journal
request and that a balanced two-line journal would pass the deferred constraint,
while an attempt to update an existing ledger entry is rejected. After rollback,
`financial_journals` and `financial_ledger_entries` remain empty.

### Operations before real-money launch

1. Obtain compliance-approved chart of accounts and commission/tax policy.
2. Implement controlled, verified source-event posting with explicit maker-checker
   approval, balancing and reconciliation.
3. Define journal reversal/adjustment approvals; reconcile driver cash collections
   against evidence and an authorized commission-remittance arrangement.
4. Implement reconciliation jobs and verified provider statements with exception
   handling, escalation, and immutable audit records.
5. Restrict financial posting to these validated server workflows, integrate
   Chapa and ArifPay only after merchant onboarding and explicit authorization.
6. Prove exactly-once posting, out-of-order event handling, refund controls,
   settlements, and Android payment return flows in sandbox before launch.
7. Obtain finance/legal signoff on operational reporting and legal retention.

The existing 59 driver earnings ledger entries and all rider trip records
are preserved. No live ledger balance has been manufactured.
