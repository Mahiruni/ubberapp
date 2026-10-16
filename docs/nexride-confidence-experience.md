# NexRide: confidence in every journey

## Product direction

NexRide earns preference through precise information, care, confidence, Ethiopian identity and consistency. The public positioning is **Confidence in every journey.** The established tagline remains **Better Rides. A Brighter Tomorrow.** Ferrari informed discipline and desirability, not visual imitation or artificial exclusivity.

## Shipped surfaces

- `/explore`: original navy/emerald editorial experience, text-only wordmark, Addis photography already in the project, real Rider/Driver entry routes, English/Amharic and Android download links.
- `/rider` and entry shell: the requested welcome headline, explicit booking and Driver actions, service-standard discovery. Existing account restoration and role switching remain authoritative.
- Rider home, account, Driver home and profile: a shared link to the relevant service guide.
- `/standard`: five brand principles, booking/pickup/receipt expectations, availability and safety limitations, honest status of proposed benefits.
- `/driver/standard`: practical shift and service expectations; support-based requests for review. It does not act as eligibility verification or automatically change an account decision.
- Ride selection: clarifies that fare confirmation precedes the search for an eligible Driver. Existing confirmed pricing, unavailable-category locks, dispatch, request recovery and cancellation controls remain in place.
- Completed Rider receipt: optional organic recommendation after a submitted rating of four or five. Shares only `/explore` through Android Share/browser Share or an explicit clipboard fallback. Dismissal persists on the device. No trip, identity, affiliate tracking or rewards are included. Cancellation does not trigger a clipboard copy.
- Admin overview: discoverable links to service quality, standards and existing reliability tools.
- `/admin/quality` and `/api/admin/service-quality`: current server-verified active Admin permission; aggregates of recorded requests only. Rider identities and locations never appear in the response. English/Amharic, error states, sampling notice and definitions are included.
- Older marketing information and Admin styles now use NexRide navy/emerald instead of purple/lime. Existing map geometry and navigation systems remain intact.

## Operational standards and measurement

| Promise | Product behavior | Operational dependency / measure |
| --- | --- | --- |
| Precision | Review pickup, fare and payment before requesting; use recorded trip state | Pickup estimate accuracy needs validated estimate snapshots and arrival comparisons |
| Care | Trip-context support, identity/vehicle details, respectful Driver guide | Staff support queues and review complaints fairly; do not promise an unsupported response time |
| Confidence | Current permission checks; unavailable categories remain disabled; explain connectivity and emergency limitations | Real fleet eligibility and real-device safety/trip-sharing acceptance |
| Pride | Original wordmark, local context, English/Amharic, ETB | Ongoing language review and permission/provenance verification of brand photography |
| Consistency | Shared service standards across roles, existing request restoration | Monitor failed requests, acceptance delays and cancellations |

Quality metrics use requests **created** during a rolling 7/30-day window and their current status at refresh time. Completed-ride counts here are a request cohort, not trips completed during that window regardless of creation date.

- Closed completion = completed / (completed + cancelled + withdrawn). Active requests are excluded; no closed requests produces `null`, displayed as an em dash.
- Mean acceptance time = valid nonnegative acceptance minus creation intervals. Renewed searching can extend the interval. It is not pickup ETA accuracy.
- Repeat completed Riders = Riders with at least two completed requests in the observed cohort. It is not lifetime retention.
- Cancellation attribution distinguishes recorded Rider, Driver and other/unrecorded actors.
- The endpoint reads at most the newest 1,000 requests in deterministic order, returns the exact total count, and marks partial baselines prominently. Never represent capped aggregates as full-period totals.
- Refresh failures clear the prior dataset rather than presenting stale data as current. No trends, goals, testimonials or satisfaction scores are fabricated.

No new schema, authorization policy or credential is required. The endpoint reuses server-only Supabase credentials already used by existing Admin APIs. No additional client tracking or marketing consent is collected.

## Dependencies intentionally not marketed as available

- **NexRide Circle / financial referral rewards:** require owner-approved funding, eligibility, expiry, anti-abuse controls, ledger, redemption and terms. No enrolment or credit balance is fabricated.
- **New ride categories, airports, corporate service and expansion waitlists:** require actual capacity, pricing, service-area rules and operating approval. No new bookable category or artificial scarcity was introduced.
- **Full analytics:** booking-funnel conversion, pickup estimate accuracy, referral conversion, support resolution, satisfaction, Driver retention and crash rates need validated instrumentation. The quality page explicitly lists these gaps. Read-only operational aggregates are a baseline, not a replacement for that work.
- **Fair review:** the guide links to existing support to request a review. It does not claim a dedicated appeal workflow, staffed SLA or automatic reversal.
- **Language:** all newly introduced brand and quality copy uses the central dictionary. Older operational/marketing subpages still have existing English copy; full historical string migration is a remaining task.

## Android and release boundaries

The current Rider/Driver Capacitor shells load the hosted production application. These changes are hosted UI/server changes, with no native API or package/signing changes; they do not inherently require fresh APKs. Verify the hosted update on installed apps after deployment.

Open PR #58 contains the separate v2.0.0 production-signing / legacy retirement work. It is not merged or modified by this feature. Do not describe these hosted changes as new signed APKs or retire older APK interfaces as part of this release.

## Verification

- Unit suite: 223 tests passed, including new aggregate edge cases and active Admin authorization, anonymous/Rider/Driver/suspended rejection, input validation, sampling, no identifiers and provider failure behavior.
- TypeScript and optimized production build passed.
- Browser checks cover welcome/auth/account restoration, menus, language persistence, 320px layouts, reduced motion, both color schemes, quality sampling and stale-data removal after errors.
- New public/standard/quality pages were rendered at phone and desktop sizes without horizontal overflow or page JavaScript errors.
- Live database schema and read-only recorded request counts were checked against project `eyyvvwecpyctttiueban`. No live trips, profiles, balances or permissions were changed to manufacture test data.
- Paired physical Rider/Driver journeys, notification delivery, TalkBack, Android sharing and production Admin login still require real-device/test-account acceptance; automated browser fixtures are not evidence of these physical behaviors.
