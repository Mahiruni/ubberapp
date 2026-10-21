# Biloo Phase 4 — Commission & Revenue Engine

## Scope
Phase 4 supports safe, explicit, **versioned** commission configuration.
No Chapa/ArifPay provider API, charge initiation, disbursement, stored-value wallet,
bank details, driver ledger posting or existing-trip backfill is included.

### Business model
- Percentage commission expressed as integer basis points (100 bps = 1%).
- Fixed platform service fee in ETB minor units (100 minor = ETB 1.00).
- Promotion discount in basis points **on the computed platform fee**, not the ride fare.
- Additional driver incentive in ETB minor units, paid conceptually from the platform share.
- Category-specific rule overrides the wildcard rule, selected from the latest
  approved version effective on or before the **new** ride-completion timestamp.
- Approved `tax_bps` must remain zero until Ethiopian tax treatment is reviewed.

For positive gross fare `G` in cents, rate `B` bps, fee `F` minor,
discount `D` bps and incentive `I` minor:

```text
baseFee = round_half_up(G * B / 10000) + F
discount = round_half_up(baseFee * D / 10000)
commission = min(G, max(0, baseFee - discount))
driverShare = G - commission + I
platformNet = commission - I
```

The formula is identical for API previews and database quote snapshots;
numbers use integer ETB minor units at calculation boundaries.

### Permission & approval
- Read/preview: verified active Biloo admin.
- Draft/approval: verified active `super_admin`.
- Approval: separate deliberate action and server-side confirmation string.
- State is append-only: rule fields never editable, draft transitions to approved once.
- A Postgres trigger records both draft and approval events atomically in
  `commission_rule_audit_events` and the existing `admin_action_log`.
- Dedicated RLS-protected tables grant **no direct user-side writes or reads**.
- This is explicit super-admin approval, **not** a two-person approval or MFA
  mechanism. Those enhanced governance requirements must be added before
  commission schedules can affect real-money settlements.

### Future-ride snapshots
Only a ride that newly changes to `completed`, with a final fare,
an assigned driver and an approved effective-dated rule, receives one
`calculated_unsettled` snapshot. Its quote is immutable, deduplicated by ride,
and **not** posted into `driver_earnings_ledger` or any provider.

Existing 59 completed cash trips are unchanged. At rollout, no rule is
preconfigured or approved, so no financial computation is activated by default.

### UI & operations
Admin → Payments → Commission Management.
A privileged operator can preview a fare, save a future-dated draft, and approve
it after reviewing the impact. The rule timeline and audit events are visible.
The system displays no fictional historical commissions or driver payouts.

### Remaining before financial activation
- Verified tax, service fee and discount legal/commercial treatment.
- Multi-person approval/MFA for consequential financial policy changes.
- Financial ledger journal and cash collection reconciliation with source evidence.
- Authorized driver-share posting and payout eligibility handling.
- Chapa/ArifPay merchant onboarding, provider endpoints, webhooks, reconciliation,
  reversals, driver disbursement and Android payment testing in the final phase.
