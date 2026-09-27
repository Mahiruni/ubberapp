# NexRide production backend architecture

## Topology
- Next.js web/PWA: rider + driver UI.
- Supabase PostgreSQL: system of record, transactional state, RLS, auditability.
- PostGIS: geospatial indexing and nearest-driver queries.
- Redis: ephemeral presence, driver heartbeats, location fan-out, matching locks, rate limits, short-lived ride state.
- Realtime/WebSockets: ride status, driver location, request events, notifications.
- Private object storage: driver documents and profile photos; never store raw document bytes in PostgreSQL.
- Background workers/queues: matching, notifications, payouts, verification callbacks, location compaction, archival.

## Ride lifecycle
requested -> searching -> accepted -> arriving -> arrived -> ongoing -> completed
Eligible pre-completion states may transition to cancelled according to server-side rules. All transitions are backend commands/transactions, and every transition is recorded in ride_events.

## Matching
1. Driver heartbeat is written to Redis with TTL.
2. Driver location is updated in Redis for sub-second matching.
3. Match worker finds eligible nearby drivers using Redis GEO for the hot path and PostGIS as durable fallback.
4. Acquire a short Redis lock per ride/driver candidate.
5. Atomically assign one driver in PostgreSQL.
6. Publish rider/driver events through realtime.
7. Expire unaccepted requests and retry with an expanding radius.

Use server-side idempotency keys for request, accept, payment, payout and cancellation commands.

## Location
- Active driver: Redis hot state, TTL 30–60 seconds.
- Active trip: Redis hot state plus sampled PostgreSQL history.
- Persist trip location using cadence/distance thresholds rather than every GPS callback.
- Partition ride_locations by time when volume becomes material and archive old partitions.
- Never expose arbitrary driver locations to clients; expose only locations authorized by an active ride/matching workflow.

## Payments
- Store amounts as integer minor units; never use floating point.
- Payment provider references and idempotency keys are first-class.
- Wallet ledger is append-only; balance changes occur transactionally.
- Verify and deduplicate provider webhooks, then process them asynchronously.
- Card/payment secrets are tokenized by the provider; do not store PAN/CVV.

## Security
- RLS on every exposed table.
- Server-only service credentials.
- Private storage buckets and short-lived signed URLs for documents.
- Audit critical actions.
- Hash IP/user-agent data where operationally sufficient.
- Encrypt sensitive fields at the application/KMS layer.
- Define retention/deletion jobs for PII, location history, documents and audit data.
- Never authorize from user-editable JWT metadata.

## API surface
REST/command endpoints:
POST /api/rides
POST /api/rides/:id/accept
POST /api/rides/:id/arrived
POST /api/rides/:id/start
POST /api/rides/:id/complete
POST /api/rides/:id/cancel
POST /api/drivers/location
POST /api/drivers/availability
POST /api/payments/intents
POST /api/payments/webhooks/:provider
POST /api/safety/reports
POST /api/support/tickets

Realtime channels:
ride:{rideId}
driver:{driverId}
user:{userId}
dispatch:{region}

## Integrations
- Maps/routing adapter isolates Google Maps/Mapbox from business logic.
- Payment adapter isolates Telebirr/card/mobile-money providers.
- Notification adapter isolates SMS/push/email providers.
- Storage adapter isolates Supabase Storage/S3-compatible storage.
- Verification adapter isolates document/KYC provider.

## Analytics/admin
Use read-optimized views/materialized aggregates for active rides, driver availability, gross bookings, commission, payment success/failure, safety queue and daily/weekly/monthly active riders/drivers. Keep operational writes normalized and send analytics events to a warehouse/event stream rather than heavy dashboard queries against hot ride tables.

## Scaling plan
Phase 1: PostgreSQL + PostGIS + Redis + Realtime + queue workers.
Phase 2: partition location/event tables, add read replicas and regional Redis.
Phase 3: dispatch workers by region, analytics warehouse and dedicated realtime gateway.

## Multilingual model
Store user locale as en/am. Store reusable UI copy as translation keys. Resolve notification templates using recipient locale at send time. Addresses and provider responses remain source-language data unless explicitly translated.
