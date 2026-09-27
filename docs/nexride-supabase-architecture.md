# NexRide Supabase Production Architecture

## System boundary
The existing DriverSuperApp Supabase project is the NexRide source of truth. The design extends the existing profiles, drivers, vehicles, trips, financial, safety, notification, and audit tables instead of creating a duplicate ride schema.

## Core domains
- Identity: auth.users + profiles
- Driver operations: drivers, vehicles, driver_locations
- Ride aggregate: trips, ride_events, ride_locations, ride_shares
- Financial ledger: wallets, wallet_ledger, payments, driver_payouts
- Trust: ratings, safety_reports, emergency_contacts
- Communication: chat_messages, notifications, notification_devices
- Growth: promo_codes, promo_redemptions, referrals, incentives
- Operations: support_tickets, audit_logs, admin_action_log

## Lifecycle
requested -> accepted -> arriving -> in_progress -> completed, or requested/accepted/arriving/in_progress -> cancelled.

Lifecycle transitions are server-authoritative through trip_transition. It locks the ride row, validates actor and state, writes a ride_events record, and settles a completion payment idempotently.

## Matching
nexride_nearby_available_drivers uses PostGIS GiST indexes for durable geospatial fallback. nexride_dispatch_trip uses an advisory transaction lock plus a row lock to prevent double assignment. Production dispatch should call it from an Edge Function using the service role, then publish a narrow ride channel event.

Recommended dispatch path:
1. Rider calls a server-side ride-request RPC/API.
2. Edge Function validates idempotency and invokes matching.
3. Redis/GEO (when introduced) is the hot candidate index.
4. PostGIS remains the authoritative durable fallback.
5. Assignment is committed atomically in PostgreSQL.
6. Realtime publishes only the affected ride/driver channels.

## Realtime channels
- ride:{tripId}: rider + assigned driver; status, ETA, ride events
- driver:{driverId}: private driver state and assigned-trip updates
- dispatch:{cityId}: Edge Function controlled request fanout; avoid broadcasting customer PII
- share:{shareId}: restricted trip-sharing updates
- chat:{tripId}: chat_messages changes, participant-only
- Presence is client/Realtime presence state for driver heartbeat; PostgreSQL drivers.is_online is authoritative business state.

Location should not be broadcast through a global channel. Use the active ride channel and server-side authorization.

## Security model
- Client never receives service-role credentials.
- Sensitive document paths stay in private Storage buckets and are exposed only through short-lived signed URLs.
- Exact historical location is restricted to trip participants and authorized operations staff.
- Financial mutation happens through server-side RPC/Edge Functions, not direct table writes.
- All privileged SECURITY DEFINER functions use an explicit search_path and restricted EXECUTE grants.
- rate_limit_buckets is not directly writable by normal users.
- Critical admin operations belong in admin_action_log and audit_logs.
- PII encryption should be applied at the application/KMS layer for fields that require recoverability; never put encryption keys in PostgreSQL tables.

## Storage
Recommended private buckets:
- driver-documents: licenses, registration, insurance, verification evidence
- profile-photos: user/driver avatars
- payment-receipts: receipts and provider evidence

Use object paths scoped by user/driver UUID and Storage RLS policies. Never make driver documents public.

## Edge Functions
Recommended functions:
- nexride-dispatch: authenticated/service-side matching orchestration, retry and timeout policy
- nexride-payment-webhook: provider signature verification, idempotency, payment state reconciliation
- nexride-notify: push/SMS notification fanout with locale selection
- nexride-payouts: scheduled payout batching and reconciliation
- nexride-retention: scheduled deletion/archival of expired location and PII records
- nexride-incentives: scheduled incentive qualification
- nexride-safety-escalation: emergency workflow and operations alerts

All should verify JWT except provider webhooks that implement explicit signature authentication.

## Scale plan
Hot state belongs in Redis once dispatch volume requires it: driver heartbeat, GEO candidate sets, short-lived locks, rate limits. PostgreSQL remains authoritative. Location history should be time-partitioned once volume becomes material, with cold archival to object storage/warehouse.

Use Supavisor/pooling for server workloads, short transactions, bounded result sets, keyset pagination, and idempotency keys for every retriable mutation.

## Internationalization
Store translation keys, not duplicated business records. app_translations provides localized copy; application formatting uses locale-aware dates/numbers/currency. Current product baseline is English + Amharic.

## Production gates
Before public launch:
1. Real OTP/auth configuration and abuse limits
2. Private Storage buckets + policies
3. Real payment provider + signed webhooks
4. Maps/routing provider
5. Push/SMS provider
6. Redis dispatch layer
7. Automated RLS tests with rider/driver/admin fixtures
8. Load test ride creation, dispatch, location ingestion and realtime fanout
9. Database backup/restore drill
10. Auth leaked-password protection enabled
11. Security-advisor findings reduced to accepted/documented exceptions
12. Observability: Postgres/Edge logs, error tracking, latency SLOs, dispatch success/timeout metrics

## Implementation boundary
The current migration is a production-grade database foundation and server-authoritative ride lifecycle. External payment, maps, SMS/push, Redis, and Storage provider integrations still require their real credentials and provider-specific configuration; those should not be faked in the database.
