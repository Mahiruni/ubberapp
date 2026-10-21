# Biloo Phase 3 — Driver earnings and settlements

Phase 3 is **accounting visualization and preference storage only**.
No Chapa/ArifPay API calls, no destination verification, no transfer initiation,
no commission or payable amounts fabricated.

## Actual source data and semantics

- `ride_requests`: completed-trip status, final fare, payment method and
  cash payment confirmation status. A completed trip is not a collected payment.
- `driver_earnings_ledger`: posted gross fares, separately recorded
  `driver_earning`, `deduction`, `adjustment`, `payout` entries.
- `driver_payout_requests`: existing historical request status, read-only.
- `driver_settlement_preferences`: saved schedule and destination *type* only;
  contains no account, PIN, OTP, transaction or money values.

At implementation time the database had 59 completed cash trips with
`payment_status=pending`, 59 posted `gross_fare` entries, no posted
`driver_earning` entries and no payout requests.

Therefore the UI shows recorded gross fares and pending cash separately;
driver net earnings and platform commission remain **Not finalized**.
It must not infer a driver share from gross fares or arbitrary percentages.

Net driver earnings (when finalized) = posted driver earning amounts
+ posted adjustments - posted deductions. This is NOT cash in Biloo custody
and not a withdrawable wallet balance.

## Deployment and integration contract

- Payment provider integration must happen in the final payment phase.
- Never connect the payout-preference save control to a payout action.
- Only merchant-approved commission rules and backend financial posting can
  make earnings available for settlement.
- Use server-side reconciliation and immutable posting for cash collected by
  drivers versus Biloo's commission, with approval and audit records.
- Do not pay out a gross fare.
- Financial exports are **informational CSV statements**, not bank
  confirmations, receipt proofs, or tax documentation.
- Database row ownership uses Supabase RLS; no financial credentials on client.
- Phase 2 Rider Wallet PR #82 is a prerequisite for this Phase 3 branch.
