import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'off', serviceWorkers: 'block' });
const riderId = '22222222-2222-4222-8222-222222222222';
const driverId = '33333333-3333-4333-8333-333333333333';
const rideId = '44444444-4444-4444-8444-444444444444';
const offerId = '55555555-5555-4555-8555-555555555555';
const pickup = { lat: 9.01, lng: 38.77, name: 'Bole Atlas', address: 'Bole, Addis Ababa', source: 'provider', confirmed: true };
const destination = { lat: 8.98, lng: 38.8, name: 'Bole Airport', address: 'Addis Ababa', source: 'provider', confirmed: true };
const quote = () => ({ source: 'service', revision: 'test-quote', expiresAt: new Date(Date.now() + 300_000).toISOString(), chargesComplete: true,
  offers: ['economy','comfort','xl'].map((category, index) => ({ id: `quote-${category}`, category, seats: index === 2 ? 6 : 4,
    availability: index === 0 ? 'available' : 'unavailable', pickupMinutes: null, amount: index === 0 ? 180 : null,
    currency: 'ETB', priceType: 'estimate', charges: [] })) });
const baseRide = () => ({ id: rideId, rider_id: riderId, assigned_driver_id: driverId as string | null,
  status: 'accepted', ride_category: 'economy', pickup_location: pickup.name, destination_location: destination.name,
  pickup_lat: pickup.lat, pickup_lng: pickup.lng, destination_lat: destination.lat, destination_lng: destination.lng,
  pickup_instructions: 'Meet by the main entrance', estimated_trip_fare_etb: 180, estimated_driver_payout_etb: null, final_fare_etb: null as number | null,
  payment_method: 'cash', payment_status: 'pending', estimated_trip_distance_km: 4.3, estimated_trip_duration_minutes: 12,
  created_at: new Date(Date.now() - 120_000).toISOString(), started_at: null as string | null, completed_at: null as string | null,
  accepted_at: new Date(Date.now() - 60_000).toISOString(),
  pickup_arrived_at: null as string | null, updated_at: new Date().toISOString() });

async function prepare(page: Page, role: 'rider' | 'driver' | 'admin', ride = baseRide(), opts: { failFirstRating?: boolean } = {}) {
  const uid = role === 'rider' ? riderId : driverId;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'journey@example.test', app_metadata: {}, user_metadata: { role, full_name: 'Journey Tester', driver_onboarding_complete: true }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session, pickup, destination }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride:onboarding-complete', 'true');
    sessionStorage.setItem('nexride.rider.journey.v1', JSON.stringify({ pickup, destination }));
  }, { session, pickup, destination });
  await page.routeWebSocket('**/realtime/v1/**', ws => ws.close());
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.route('**/api/rider/profile', route => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/rider/fares', route => route.fulfill({ json: quote() }));
  await page.route('**/api/rider/route', route => route.fulfill({ json: { status: 'ready', route: {
    provider: 'mapbox', distanceMeters: 4300, durationSeconds: 720, geometry: [[pickup.lat, pickup.lng], [destination.lat, destination.lng]],
  } } }));
  await page.route(`**/api/rider/trips/${rideId}/driver`, route => route.fulfill({ json: { status: 'ready', driver: {
    name: 'Approved Driver', phone: '+251912345678', rating: null, tripCount: 8,
    vehicle: { model: 'Toyota Yaris', color: 'Silver', plate: 'TEST-123' },
  } } }));
  await page.route(`**/api/rider/trips/${rideId}/route`, route => route.fulfill({ json: { status: 'ready', route: {
    tripId: rideId, driverId, target: ride.status === 'in_trip' ? 'destination' : 'pickup',
    points: [{ lat: 9.015, lng: 38.775 }, pickup], distanceMeters: 1300, durationSeconds: 240,
    generatedAt: Date.now(), fixAt: Date.now(),
  } } }));
  let ratingCalls = 0, rating = 0, stageCalls = 0;
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').pop();
    const object = route.request().headers().accept?.includes('object+json');
    const one = (value: unknown) => route.fulfill({ json: object ? value : value ? [value] : [] });
    if (table === 'profiles') return one({ id: uid, role, admin_role: role === 'admin' ? 'super_admin' : null, full_name: 'Journey Tester', phone: '+251912345678', account_status: 'active' });
    if (table === 'drivers') return one({ id: driverId, review_status: 'approved', is_online: false, vehicle: 'Toyota Yaris', vehicle_color: 'Silver', vehicle_plate: 'TEST-123', rating: null });
    if (table === 'ride_requests') {
      if (route.request().method() === 'PATCH') {
        stageCalls++;
        const next = route.request().postDataJSON().status;
        await new Promise(resolve => setTimeout(resolve, 120));
        ride.status = next;
        if (next === 'arrived_pickup') ride.pickup_arrived_at = new Date().toISOString();
        if (next === 'in_trip') ride.started_at = new Date().toISOString();
        if (next === 'completed') { ride.completed_at = new Date().toISOString(); (ride as Record<string, unknown>).final_fare_etb = 180; }
      }
      return one(ride);
    }
    if (table === 'ride_request_offers') return one({ id: offerId, request_id: rideId, driver_id: driverId, status: 'accepted', pickup_distance_km: null, pickup_eta_minutes: null });
    if (table === 'ride_driver_locations') return one({ driver_id: driverId, latitude: 9.015, longitude: 38.775, recorded_at: new Date().toISOString() });
    if (table === 'ride_ratings') {
      if (route.request().method() === 'POST') {
        ratingCalls++;
        if (opts.failFirstRating && ratingCalls === 1) return route.fulfill({ status: 503, json: { message: 'temporary' } });
        rating = route.request().postDataJSON().score;
      }
      return one(rating ? { score: rating } : null);
    }
    return route.fulfill({ json: object ? null : [], headers: { 'content-range': '0-0/0' } });
  });
  return { ride, ratingCalls: () => ratingCalls, stageCalls: () => stageCalls };
}

test('review shows the real journey, validates category availability and sends pickup notes once', async ({ page }, info) => {
  await prepare(page, 'rider', { ...baseRide(), status: 'completed' });
  let creates = 0;
  await page.route('**/api/rider/requests', async route => {
    creates++;
    expect(route.request().postDataJSON()).toMatchObject({ pickupInstructions: 'At the main entrance', paymentMethod: 'cash' });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({ json: { status: 'accepted', requestId: rideId } });
  });
  await page.route(`**/api/rider/requests/${rideId}`, route => route.fulfill({ json: {
    requestId: rideId, version: 1, status: 'searching', canRetry: false, canChangeCategory: false,
    cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null },
    progress: { phase: 'waiting', requestedAt: new Date(Date.now()-30_000).toISOString(), deliveredAt: new Date().toISOString(), attempts: 1, observedAt: Date.now() },
  } }));
  await page.goto('/');
  await page.locator('.nr-home-search').click();
  await expect(page.locator('.nr-route-review')).toContainText('4.3');
  const pickupInput = page.getByRole('textbox', { name: 'Pickup', exact: true });
  await expect(pickupInput).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(pickupInput).toHaveCSS('border-top-width', '0px');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-planning-v2-${info.project.name}.png` });
  // Android's IME can shrink the visual viewport without resizing the layout.
  // A valid route must retain its action above that viewport's bottom edge.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight - 260 });
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.rider-search-view')).toHaveAttribute('data-keyboard', 'true');
  const chooseRide = page.getByRole('button', { name: 'Choose a ride', exact: true });
  await expect(chooseRide).toBeVisible();
  if (info.project.name === 'mobile') {
    expect(await chooseRide.evaluate(button => button.getBoundingClientRect().bottom <= window.visualViewport!.height + window.visualViewport!.offsetTop + 1)).toBe(true);
  }
  await chooseRide.click();
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });
  await expect(page.getByRole('radio', { name: /Comfort/ })).toBeDisabled();
  const cars = page.locator('.nr-vehicle-art');
  await expect(cars).toHaveCount(3);
  await expect.poll(() => cars.evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(cars.last()).toBeInViewport({ ratio: 0.9 });
  await expect(page.locator('.nr-ride-route-meta')).not.toContainText('traffic');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-rides-v2-${info.project.name}.png` });
  await expect(page.getByRole('button', { name: 'Continue to review ride' })).toHaveCSS('background-color', 'rgb(249, 196, 73)');
  await expect(page.getByRole('button', { name: 'Continue to review ride' })).toHaveCSS('color', 'rgb(8, 41, 95)');
  await page.getByRole('button', { name: 'Continue to review ride' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Bole Atlas'); await expect(dialog).toContainText('Bole Airport');
  await expect(dialog).toContainText('4.3'); await expect(dialog).toContainText('12');
  await expect(dialog).toContainText('Payment is not collected now');
  await expect(dialog).toContainText('Estimated total');
  await expect(dialog.getByRole('button', { name: 'Request ride', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('region', { name: 'Ride review details' })).toHaveCSS('overflow-y', 'auto');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-booking-review-v2-${info.project.name}.png` });
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(dialog.getByRole('button', { name: 'Request ride', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('heading', { name: 'Review your ride' })).toBeInViewport();
  await dialog.getByRole('textbox', { name: /Pickup instructions/ }).fill('At the main entrance');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight - 220 });
    window.visualViewport?.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => dialog.getByRole('button', { name: 'Request ride', exact: true }).evaluate(button => button.getBoundingClientRect().bottom <= window.visualViewport!.height + window.visualViewport!.offsetTop + 1)).toBe(true);
  await expect(dialog.getByRole('textbox', { name: /Pickup instructions/ })).toBeInViewport({ ratio: 0.9 });
  await expect(dialog.getByRole('textbox', { name: /Pickup instructions/ })).toBeFocused();
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-review-keyboard-v2-${info.project.name}.png` });
  await page.evaluate(() => { Reflect.deleteProperty(window.visualViewport!, 'height'); window.visualViewport?.dispatchEvent(new Event('resize')); });
  await dialog.getByRole('button', { name: /Request Ride/i }).click();
  await expect(page.locator('.biloo-matching-live-meta')).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.nr-driver-matching')).toContainText('Waiting for driver response');
  await expect(page.locator('.nr-confirmed-driver')).toHaveCount(0);
  await expect(page.locator('.nr-driver-matching')).not.toContainText('No Driver nearby yet?');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-matching-v2-${info.project.name}.png` });
  expect(creates).toBe(1);
});

test('reopening an assigned Rider trip restores approved identity and a provider ETA', async ({ page }, info) => {
  await prepare(page, 'rider'); await page.goto('/');
  await expect(page.locator('.nr-accepted-driver-card')).toContainText('Approved Driver');
  await expect(page.locator('.nr-identity-vehicle')).toContainText('TEST-123');
  await expect(page.locator('.nr-identity-eta b')).toHaveText('4');
  await expect(page.locator('.nr-trip-experience iframe')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.nr-accepted-driver-card')).toContainText('Approved Driver');
  await expect(page.locator('.nr-identity-eta b')).toHaveText('4');
  await expect(page.locator('.nr-identity-actions button')).toHaveCount(4);
  await page.screenshot({ path: `/tmp/biloo-assigned-${info.project.name}.png` });
});

test('completed Rider journey keeps payment pending and recovers a failed rating without duplicates', async ({ page }, info) => {
  const ride = { ...baseRide(), status: 'completed', final_fare_etb: 180 as number | null,
    started_at: new Date(Date.now() - 720_000).toISOString(), completed_at: new Date().toISOString() };
  const fixture = await prepare(page, 'rider', ride, { failFirstRating: true });
  await page.goto('/?screen=trips');
  await page.locator('.nr-real-trip-history button').first().click();
  await expect(page.getByRole('heading', { name: "You've arrived!" })).toBeVisible();
  await expect(page.locator('.biloo-payment-state')).toHaveText('Payment pending');
  await expect(page.locator('.biloo-receipt-fare')).toContainText('180');
  await page.screenshot({ path: `/tmp/biloo-completion-receipt-${info.project.name}.png` });
  await page.getByRole('button', { name: '5 stars', exact: true }).click();
  await page.getByRole('button', { name: 'Submit rating', exact: true }).click();
  await expect(page.locator('.biloo-rating [role=alert]')).toBeVisible();
  await page.getByRole('button', { name: 'Submit rating', exact: true }).click();
  await expect(page.locator('.biloo-rating')).toContainText('Rating saved');
  expect(fixture.ratingCalls()).toBe(2);
  await expect(page.getByRole('button', { name: '5 stars', exact: true })).toBeDisabled();
  await page.screenshot({ path: `/tmp/biloo-completed-${info.project.name}.png` });
});

test('Driver confirms pickup and completion through backend stages before seeing the pending-payment receipt', async ({ page }, info) => {
  const fixture = await prepare(page, 'driver');
  await page.goto(`/driver/navigation?offer=${offerId}`);
  await page.getByRole('button', { name: 'Arrived at pickup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start trip', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start trip', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('only after the rider is with you');
  expect(fixture.stageCalls()).toBe(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Start trip', exact: true }).click();
  await page.getByRole('button', { name: 'Complete trip', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Complete trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip completed', exact: true })).toBeVisible();
  await expect(page.locator('.biloo-payment-state')).toHaveText('Payment pending');
  expect(fixture.stageCalls()).toBe(3);
  await expect(page.locator('.biloo-rating-stars')).toHaveCount(0);
  await page.screenshot({ path: `/tmp/biloo-driver-completed-${info.project.name}.png` });
});

test('pending request restores from the backend without creating another booking', async ({ page }) => {
  await prepare(page, 'rider', { ...baseRide(), status: 'pending', assigned_driver_id: null });
  let creates = 0;
  await page.route('**/api/rider/requests', route => { creates++; return route.fulfill({ status: 500 }); });
  await page.route(`**/api/rider/requests/${rideId}`, route => route.fulfill({ json: {
    requestId: rideId, version: 1, status: 'searching', canRetry: false, canChangeCategory: false,
    cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null },
    progress: { phase: 'searching', requestedAt: new Date().toISOString(), deliveredAt: null, attempts: 0, observedAt: Date.now() },
  } }));
  await page.goto('/');
  await expect(page.locator('.nr-driver-matching')).toBeVisible();
  await expect(page.locator('.nr-match-summary')).toContainText('Bole Atlas');
  await page.reload(); await expect(page.locator('.nr-driver-matching')).toBeVisible();
  expect(creates).toBe(0);
});

test('stale Driver tracking shows its timestamp and never presents a fresh ETA', async ({ page }) => {
  await prepare(page, 'rider');
  await page.route('**/rest/v1/ride_driver_locations*', route => route.fulfill({ json: {
    driver_id: driverId, latitude: 9.015, longitude: 38.775, recorded_at: new Date(Date.now() - 90_000).toISOString(),
  } }));
  await page.goto('/');
  await expect(page.locator('.biloo-tracking-status')).toContainText('Location update delayed');
  await page.locator('.nr-identity-details > summary').click();
  await expect(page.locator('.nr-identity-last-update time')).toBeVisible();
  await expect(page.locator('.nr-identity-eta')).toContainText('ETA unavailable');
  await expect(page.locator('.nr-identity-eta b')).toHaveCount(0);
});

test('Admin inspects offers, stages and pending payment without loading live locations', async ({ page }, info) => {
  await prepare(page, 'admin');
  await page.route('**/rest/v1/ride_journey_events*', route => route.fulfill({ json: [
    { id: 1, event_type: 'requested', actor_id: null, recorded_at: new Date().toISOString() },
    { id: 2, event_type: 'assigned', actor_id: driverId, recorded_at: new Date().toISOString() },
  ] }));
  const gpsCalls: string[] = [];
  page.on('request', request => { if (request.url().includes('/rest/v1/ride_driver_locations')) gpsCalls.push(request.url()); });
  await page.goto('/admin');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open admin navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Rides', exact: true }).click();
  await page.getByRole('button', { name: 'Journey details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Driver assigned');
  await expect(dialog).toContainText('Payment status'); await expect(dialog).toContainText('pending');
  await expect(dialog).toContainText('Driver offers'); await expect(dialog).toContainText('Journey audit');
  await expect(dialog).not.toContainText('+251912345678'); expect(gpsCalls).toHaveLength(0);
  await page.screenshot({ path: `/tmp/biloo-admin-journey-${info.project.name}.png` });
});

test('incoming Driver request shows pickup notes and handles a competing acceptance without assigning twice', async ({ page }, info) => {
  await prepare(page, 'driver', { ...baseRide(), status: 'pending', assigned_driver_id: null });
  await page.route('**/rest/v1/drivers*', route => route.fulfill({ json: { id: driverId, review_status: 'approved', is_online: true } }));
  await page.route('**/rest/v1/ride_request_offers*', route => route.fulfill({ json: {
    id: offerId, request_id: rideId, driver_id: driverId, status: 'pending', pickup_distance_km: null, pickup_eta_minutes: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(),
  } }));
  let accepts = 0;
  await page.route('**/rest/v1/rpc/driver_decide_ride_offer', route => { accepts++; return route.fulfill({ json: { status: 'unavailable' } }); });
  await page.goto(`/driver/request?offer=${offerId}`);
  await expect(page.getByRole('heading', { name: 'New ride request', exact: true })).toBeVisible();
  await expect(page.locator('.biloo-pickup-instructions')).toContainText('Meet by the main entrance');
  await page.screenshot({ path: `/tmp/biloo-driver-request-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Accept Ride', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ride no longer available', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/driver\/request/); expect(accepts).toBe(1);
});

test('reduced motion removes journey entrance animations while keeping safety controls available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page, 'rider'); await page.goto('/');
  await expect(page.locator('.nr-accepted-driver-card .nr-identity-status h2')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.nr-identity-actions').getByRole('button', { name: 'Safety', exact: true })).toBeEnabled();
});


test('active Rider journey keeps contact controls compact and reveals route details on demand', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, 'rider', { ...baseRide(), status: 'in_trip', started_at: new Date().toISOString() });
  await page.goto('/');
  const card = page.locator('.nr-accepted-driver-card');
  await expect(card.getByRole('heading', { name: 'On trip', exact: true })).toBeVisible();
  await expect(card.locator('.nr-identity-eta')).toContainText('min left');
  for (const name of ['Call Driver', 'Chat', 'Share Trip', 'Safety']) {
    await expect(card.getByRole('button', { name, exact: true })).toBeInViewport();
  }
  const details = card.locator('.nr-identity-details');
  await expect(details).not.toHaveAttribute('open');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-rider-active-${info.project.name}.png` });
  await details.locator('summary').click();
  await expect(card.locator('.nr-identity-route')).toContainText('Bole Atlas');
  await expect(card.locator('.nr-identity-route')).toContainText('Bole Airport');
  await expect(card.locator('.nr-identity-fare')).toContainText('180 ETB');
  await expect(card.locator('.nr-identity-last-update time')).toBeVisible();
});


test('matching recovery keeps the same request and leaves cancellation available', async ({ page }) => {
  await prepare(page, 'rider', { ...baseRide(), status: 'pending', assigned_driver_id: null });
  let creates = 0, retries = 0;
  let snapshot = { requestId: rideId, version: 1, status: 'no_drivers', canRetry: true, canChangeCategory: false,
    cancellation: { allowed: true, requiresConfirmation: true, fee: 0, reason: null } };
  await page.route('**/api/rider/requests', route => { creates++; return route.fulfill({ status: 500 }); });
  await page.route(`**/api/rider/requests/${rideId}`, route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ action: 'retry', expectedVersion: 1 });
      retries++;
      snapshot = { ...snapshot, version: 2, status: 'searching', canRetry: false };
    }
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  const matching = page.locator('.nr-driver-matching');
  await expect(matching.getByRole('button', { name: 'Keep searching', exact: true })).toBeEnabled();
  await expect(matching.getByRole('button', { name: 'Cancel ride', exact: true })).toBeEnabled();
  await matching.getByRole('button', { name: 'Keep searching', exact: true }).click();
  await expect(matching).toHaveAttribute('data-matching-state', 'searching');
  await matching.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'No, Keep Ride', exact: true }).click();
  await expect(matching).toHaveAttribute('data-matching-state', 'searching');
  expect(retries).toBe(1); expect(creates).toBe(0);
});
