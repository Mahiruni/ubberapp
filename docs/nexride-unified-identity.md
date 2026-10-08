# NexRide unified account and identity

Non-destructive upgrade of existing Supabase Auth users, profiles and drivers. Never auto-merge or overwrite existing accounts.

- One Supabase Auth UUID is the primary identity. The account_roles table supports both Rider and Driver without requiring a new email/password.
- Email uniqueness stays in Supabase Auth. An unverified profiles.phone is NOT proof of phone ownership.
- Only SMS-verified phones are exclusively claimed by account_verified_phones, using canonical Ethiopian E.164 numbers. Supabase SMS provider must be enabled for the OTP interface.
- Before phone OTP, an authenticated function guards against conflicts in old auth.users.phone_change and the private 10-minute reservation table. If conflict exists, use account ownership recovery.
- Identity document numbers are normalized in PostgreSQL and fingerprinted with HMAC-SHA256 under a private, retained secret. No document numbers or HMAC keys appear in public API responses.
- Original approved and pending documents are displayed, not repeatedly uploaded. Replacements and disputes require authorized review.
- National ID/passport evidence is private in nexride-identity. Driver license/vehicle evidence remains in driver-verification.
- RLS protects account ownership, document metadata, private storage, and administrator review status. Privileged state transitions use authorized SQL functions and audit logging.
- Deletion requests are not automatic deletions. A request requires reauthentication, is blocked by active trips or payouts, and needs human legal/retention review before final deletion/release.
- Explicit logout persists until manual sign-in; Rider and Driver sessions share the original Auth ID.

Audit before migration: 7 Auth users, 7 profiles, 4 drivers. Zero duplicate Auth email or driver license groups. One legacy group of duplicate UNVERIFIED phone entries requires human ownership verification; no automatic merge or deletion.

Test signed-in Rider-to-Driver conversion, Rider/Driver selection, E.164 normalization, OTP states, private HMAC collision blocking, duplicate/approved document reuse, unique owner constraints, identity RLS, Admin actions, deletion guards, and the entire ride booking flow. Native Android builds and SMS delivery require separate device/provider validation.
