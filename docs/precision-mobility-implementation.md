# NexRide Precision Mobility — Implementation Contract

Status: planned; this document does not certify implementation or deployment.

## Non-negotiable compatibility
Preserve existing Supabase authentication, rider/driver/admin roles, maps, routing, existing booking adapters, trip transitions, payment boundaries, Android package identities and signing. Never turn sample quotes or simulated matches into production claims.

## Visual tokens
- Carbon: #0B0C10; obsidian: #12141A; navy: #041C30.
- Brand emerald: #00C878; performance red: #D40000; earned prestige gold: #F5C518.
- Dark text: #FFFFFF; secondary text: #A3AAB5; light canvas: #F5F7F9.
- Preserve contrast in both themes, English/Amharic localization, reduced motion, safe areas and keyboard accessibility.

## Incremental modules
1. Drive selector: Sprint, GT, Paddock as typed presentation modes mapped to verified existing vehicle categories; do not fabricate fares or ETAs.
2. Atelier: rider defaults and per-trip snapshots, secure RLS, explicit delivery/acknowledgment state.
3. Pilot telemetry: real validated assignment, GPS freshness, actual ETA and trip progress, graceful stale-data handling.
4. Garage: opt-in favorite drivers, driver consent and privacy-preserving eligibility, normal-dispatch fallback.
5. Driver cockpit: preferences acknowledgment and existing navigation state machine.
6. Admin: server-authorized configuration, loyalty thresholds and operational metrics.
7. Android: signed update manifests, integrity checks and user-authorized installation.

## Type contracts (to implement)
RideMode; CabinPreferences; RiderLoyaltyStatus; PilotTelemetry; DriverRecognition; FavoritePilot; TripPreferenceAcknowledgment.

## Dispatch constraints
Eligibility requires online status, fresh accurate location, vehicle/service compatibility, route ETA and server-authorized matching. Enforce idempotency and race-safe transitions. Never show verified or percentile badges without supporting data.

## Release gates
Audit code/schema first; build components behind compatible boundaries; migrate without data loss; run unit, integration, browser and Android tests; verify Rider/Driver APK signing and release provenance; only then deploy.

## Known boundary
The current README explicitly describes public ride request, matching and pricing as preview or unavailable in portions of the frontend. This milestone must not be represented as live booking until authenticated server adapters and end-to-end tests prove it.
