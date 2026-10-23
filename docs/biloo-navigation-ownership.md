# Biloo navigation ownership — October 23, 2026

## Principle
One primary navigation owner per role and viewport. Account holds identity,
security and personal preferences. Operational destinations belong to the
navigation drawer/desktop rail. Trip-state actions may still appear contextually
on their operating screen; these are not second navigation entries.

## Canonical source of truth
`lib/biloo-navigation-registry.ts`
- Rider: Home, My Rides, Wallet, Saved Places, Safety Center, Help & Support
- Driver: Home, Activity, Navigation, Earnings, Help & Support, Safety Center
- Admin: Dashboard, Rides, Drivers, Verification, Users, Identity & Accounts,
  Payments, Safety, Support, Audit Log
- Admin secondary: Email Campaigns, Messaging Security, Android Reliability

Each role has distinct primary IDs, labels, destinations and navigation icons.
The validator `navigationConflicts` prevents repeated primary assignments.

## Navigation placement
- Rider and Driver mobile: one hamburger. Account is the portrait at the top.
- Rider desktop: one sidebar/rail, plus Account/Driver switching in its
  designated actions area; its separate mobile hamburger is hidden.
- Admin mobile: one hamburger/sidebar. Removed second bottom-tab strip.
- Admin desktop: same sidebar destinations, no duplicate tab strip.

## Consolidated ownership
- Rider Account: edit profile/photo, account security, settings, privacy,
  legal and sign out. Rides, wallet, saved places, support, safety, and
  driver switching do not appear as duplicate Account menu cards.
- Driver Account: identity/photo, verified document status and access,
  vehicle, payout account, security, app settings, privacy and sign out.
  Activity/Earnings/Safety/Support are not repeated as Account menu cards.
- Driver verification evidence remains unchanged.
- Driver profile/settings uses one primary entry, rather than both
  a hero Edit button and an Account settings entry.
- Hamburger branding stays in its header; footer contains only app-version
  information rather than a second logo block.
- Legacy deep links remain; only redundant *navigation widgets* were
  eliminated, never historical trip/payment records.

## Deliberate contextual exceptions
Search, booking, online/offline swipe, notifications for active trips,
Back/Close, safety tools during an actual trip, verification status actions,
and profile-photo editing controls are not duplicate navigation entries.
They remain where directly necessary to finish an operation.

## Validation
Unit/source regression checks: `tests/unit/biloo-hamburger-flat.test.ts`,
`tests/unit/biloo-account-experience.test.ts`,
`tests/unit/biloo-footer-navigation.test.ts`.
Browser regression expectations updated:
`tests/e2e/biloo-account-experience.spec.ts`,
`tests/e2e/biloo-footer-navigation.spec.ts`, and
`tests/e2e/destination.spec.ts`.

No Supabase migration or destructive record operation is part of this work.

## Release limitation
Vercel rejected a forced deploy request with HTTP 402,
`api-deployments-free-per-day` (>100 deployment requests / 24 hours).
Do not mark these latest commits as production-ready until Vercel reports
an actual READY deployment for the final commit. Browser tests and Android
device testing still require execution.
