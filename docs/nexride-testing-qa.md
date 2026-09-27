# NexRide Testing & QA

## Quality gates
1. Unit tests must pass before merge.
2. Playwright smoke/E2E must pass against a preview or local build.
3. Supabase integration tests must run against a dedicated branch/test project.
4. Production deploys require migration verification, RLS verification and rollback readiness.

## Automated layers

### Unit — Vitest
Critical deterministic logic:
- fare calculation
- trip state transitions
- matching eligibility/order
- admin RBAC

Run:
`npm test`

### E2E — Playwright
Configured for:
- Chromium desktop
- WebKit/Safari
- mobile Pixel 7
- trace/screenshot/video on failure
- CI retries

Run:
`npm run test:e2e`

Set `PLAYWRIGHT_BASE_URL` to test a deployed preview.

## Critical test matrix

### Rider
- OTP authentication
- destination selection
- service selection
- request creation/idempotency
- driver assignment
- realtime trip updates
- live location
- completion
- payment success/failure
- rating

### Driver
- authentication/session expiry
- online/offline
- location heartbeat
- request delivery
- concurrent request protection
- accept
- arrive/start/complete
- cancellation
- earnings/payout visibility

### Safety
- share trip creation/access
- emergency contact handling
- SOS/report creation
- safety queue visibility
- admin intervention/audit

### Reliability
- offline/reconnect
- duplicate request IDs
- stale location
- concurrent driver claims
- expired sessions
- realtime reconnect
- payment webhook retries

## Supabase integration QA

Use a dedicated Supabase branch/test project. Seed only synthetic fixtures. Never run destructive test cleanup against production.

Required integration suites:
- Auth/session expiry
- profiles/drivers/trips CRUD through RLS
- admin role boundaries
- trip transition RPC authorization
- dispatch RPC service-role boundary
- payment idempotency
- wallet ledger invariants
- storage signed URL/policy boundaries
- realtime subscription visibility

Important: tests should assert both allowed and denied operations.

## External service strategy

- Maps: deterministic fixtures + a small number of sandbox contract tests.
- Payments: provider sandbox + signed webhook fixtures + replay/idempotency tests.
- SMS/OTP: fake provider in CI; real provider only in staging.
- Push: mocked delivery in unit/integration tests; one staging end-to-end notification test.
- Redis: ephemeral test instance when the hot dispatch layer is introduced.

## Performance gates

Measure:
- initial page load
- map initialization
- ride request interaction
- realtime update latency
- location ingest throughput
- dashboard table queries
- admin dashboard refresh

Track p50/p95 latency and error rate. Avoid arbitrary pass/fail thresholds until staging baselines exist.

## Manual release checklist

Before production:
- Rider happy path
- Driver happy path
- payment success/failure/refund
- network interruption during request and trip
- GPS permission denied/changed
- driver cancellation
- rider cancellation
- concurrent matching
- SOS/report
- admin intervention
- mobile Safari/Chrome
- Android Chrome
- session expiry
- dark mode/accessibility
- migration rollback/restore rehearsal

## Flake policy

A test may not be made stable by adding arbitrary sleeps. Prefer:
- explicit state assertions
- deterministic fixtures
- unique test IDs
- network synchronization
- isolated test data
- retry only for known infrastructure failures

Any quarantined test must have an owner and issue.

## Reporting

CI should publish:
- unit test result
- Playwright HTML report
- failed test traces/screenshots
- browser/device matrix
- deployment SHA
- Supabase migration version

A release is not considered QA-complete merely because the build succeeds.
