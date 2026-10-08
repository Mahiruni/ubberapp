-- Permit already-installed driver clients to accept/decline their own
-- pending offers while they update to the transactional decision API.
-- Existing RLS and BEFORE UPDATE guard retain ownership/transition checks.
-- One-pending-offer-per-request and one-pending-offer-per-driver indexes
-- remain mandatory. Cron/rider polling handles legacy decline handoff.
grant update on public.ride_request_offers to authenticated;
