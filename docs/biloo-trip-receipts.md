# BILOO completed-trip receipts

Completed Rider trips open a compact navy-and-gold receipt at a 56% sheet snap.
The handle still supports 32–75% expansion. Receipt content scrolls separately
from the Done and Trip history actions. Trip details and optional rating comments
expand on demand. Driver receipts use the same design with Driver home and
Earnings actions and no Rider rating controls.

The map uses the completed trip's confirmed pickup and destination, rather than
the current booking draft. Route-switch suggestions and the active destination
banner are hidden on completed-trip receipts. Historical endpoints do not invent
a road route or an actual travelled distance; the receipt labels its stored
route distance as estimated.

The live database was missing the earlier cash-completion migration. The
`biloo_completed_cash_receipts` migration activates that existing policy: a
validated `in_trip` → `completed` cash trip changes a pending/unknown payment to
paid in the same update. It leaves electronic settlement statuses unchanged and
preserves the existing idempotent earnings-ledger posting. The trigger function
is private, uses an empty search path and is not executable by application roles.

Historical payment records are not backfilled. An unconfirmed cash receipt shows
Cash / With your driver, without claiming collection or presenting a gateway
failure. Only a recorded paid status displays Payment completed. The fare always
comes from the confirmed final amount.

Validation covers rating failure/retry, legacy cash, paid cash, pending electronic
payments, small-screen actions, expandable details, both themes and Driver stage
transitions. The cash trigger is also tested on a temporary table as the
authenticated role, inside a rolled-back transaction, without changing live trips.
