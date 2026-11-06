import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

test.use({ video: 'off', serviceWorkers: 'block' });
const driverId = '22222222-2222-4222-8222-222222222222';
const riderId = '11111111-1111-4111-8111-111111111111';
const tripId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const navigation = `/driver/navigation?offer=${offerId}`;
type Stage = 'none' | 'pending' | 'accepted' | 'arrived_pickup' | 'in_trip' | 'completed';

async function driverFixture(page: Page, theme: 'light' | 'dark', initial: Stage) {
  const state = { stage: initial, receiptFails: false, receiptReads: 0, writes: 0, acceptCalls: 0,
    failAcceptance: false, delayRiderProfile: false };
  const channels: { socket: WebSocketRoute; topic: string; joinRef: string; v2: boolean }[] = [];
  const user = { id: driverId, aud: 'authenticated', role: 'authenticated', email: 'driver@example.test',
    app_metadata: {}, user_metadata: { role: 'driver', full_name: 'Biloo Driver', driver_onboarding_complete: true },
    created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: driverId, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user };
  const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eyyvvwecpyctttiueban.supabase.co').hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ session, theme, storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify(session));
    localStorage.setItem('nexride.driver.theme', theme);
    localStorage.setItem('nexride.driver.aurora-light-v1', '1');
    localStorage.setItem('nexride:onboarding-complete', 'true');
    const fix = () => ({ coords: { latitude: 9.008, longitude: 38.775, accuracy: 4, heading: 20,
      speed: 0, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() }) as GeolocationPosition;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) { queueMicrotask(() => callback(fix())); return 1; },
      clearWatch() {}, getCurrentPosition(callback: PositionCallback) { queueMicrotask(() => callback(fix())); },
    } });
  }, { session, theme, storageKey });
  const ride = () => ({ id: tripId, rider_id: riderId, assigned_driver_id: driverId, status: state.stage,
    pickup_location: 'Bole Atlas', destination_location: 'Meskel Square', pickup_lat: 9.009, pickup_lng: 38.776,
    destination_lat: 9.018, destination_lng: 38.751, ride_category: 'Economy',
    estimated_trip_distance_km: 6.4, estimated_trip_duration_minutes: 18,
    estimated_trip_fare_etb: 336, estimated_driver_payout_etb: 285,
    final_fare_etb: state.stage === 'completed' ? 336 : null,
    payment_method: 'cash', payment_status: state.stage === 'completed' ? 'paid' : 'pending',
    started_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    completed_at: state.stage === 'completed' ? new Date().toISOString() : null });
  // Unexpected external calls cannot reach a live backend with the synthetic session.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? route.continue() : route.abort();
  });
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: user }));
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.onMessage(raw => {
    const packet = JSON.parse(String(raw)), v2 = Array.isArray(packet);
    const message = v2 ? { join_ref: packet[0], ref: packet[1], topic: packet[2], event: packet[3], payload: packet[4] } : packet;
    if (message.event === 'phx_join') channels.push({ socket, topic: message.topic, joinRef: message.join_ref, v2 });
    if (message.event === 'phx_leave') {
      const index = channels.findIndex(channel => channel.socket === socket && channel.topic === message.topic && channel.joinRef === message.join_ref);
      if (index >= 0) channels.splice(index, 1);
    }
    const reply = {
      topic: message.topic, event: 'phx_reply', ref: message.ref, join_ref: message.join_ref,
      payload: { status: 'ok', response: { postgres_changes: (message.payload?.config?.postgres_changes || [])
        .map((filter: object, index: number) => ({ ...filter, id: index + 1 })) } },
    };
    if (['phx_join', 'phx_leave', 'heartbeat'].includes(message.event)) socket.send(JSON.stringify(
      v2 ? [reply.join_ref, reply.ref, reply.topic, reply.event, reply.payload] : reply,
    ));
  }));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').pop();
    const single = request.headers().accept?.includes('object+json');
    const respond = (row: unknown) => route.fulfill({ json: single ? row : row ? [row] : [] });
    if (request.method() === 'PATCH' && table === 'ride_requests') {
      state.writes++;
      expect(url.searchParams.get('assigned_driver_id')).toBe(`eq.${driverId}`);
      expect(url.searchParams.get('status')).toBe(`eq.${state.stage}`);
      state.stage = request.postDataJSON().status;
      return respond({ status: state.stage });
    }
    if (url.pathname.endsWith('/rpc/driver_decide_ride_offer')) {
      const payload = request.postDataJSON();
      if (payload.p_action === 'accept') {
        state.acceptCalls++;
        if (state.failAcceptance) return route.abort('failed');
        expect(payload).toMatchObject({ p_offer_id: offerId, p_action: 'accept' });
        state.stage = 'accepted';
        return route.fulfill({ json: { status: 'accepted', requestId: tripId } });
      }
    }
    if (table === 'profiles') {
      if (state.delayRiderProfile && url.searchParams.get('id') === `eq.${riderId}`) {
        await new Promise(resolve => setTimeout(resolve, 6000));
        return respond({ id: riderId, role: 'rider', phone: '+251911111111' });
      }
      return respond({ id: driverId, role: 'driver', account_status: 'active', full_name: 'Biloo Driver', phone: '+251900000000' });
    }
    if (table === 'drivers') return respond({ id: driverId, review_status: 'approved', is_online: false, rating: 4.9 });
    if (table === 'ride_requests') {
      if (state.stage === 'none') return respond(null);
      if (url.searchParams.get('select')?.includes('final_fare_etb')) {
        state.receiptReads++;
        if (state.receiptFails) return route.fulfill({ status: 503, json: { message: 'temporarily unavailable' } });
      }
      return respond(ride());
    }
    if (table === 'ride_request_offers') {
      const status = state.stage === 'pending' ? 'pending' : 'accepted';
      const filter = url.searchParams.get('status');
      if (state.stage === 'none' || (filter && filter !== `eq.${status}`)) return respond(null);
      return respond({ id: offerId, request_id: tripId, driver_id: driverId, status,
        pickup_distance_km: 1.2, pickup_eta_minutes: 3, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120_000).toISOString() });
    }
    return respond(null);
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.route('**/api/driver/map-avatar', route => route.fulfill({ json: { status: 'ready', complete: true,
    avatar: { bodyType: 'suv', color: 'Beige', style: 'signature' } } }));
  await page.route('**/api/driver/location', route => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/trips/*/pickup-signal', route => route.fulfill({ json: { status: 'ready', avatar: null, signal: null } }));
  await page.route('**/api/driver/route', route => route.fulfill({ json: { status: 'ready', route: {
    geometry: [[9.008, 38.775], [9.009, 38.776]], distanceMeters: 1200, durationSeconds: 180,
    steps: [{ instruction: 'Continue toward pickup', distanceMeters: 1200, durationSeconds: 180,
      maneuver: { lat: 9.009, lng: 38.776 }, type: 'continue', modifier: 'straight' }],
  } } }));
  return { state, async completeViaRealtime() {
    await expect.poll(() => channels.some(channel => channel.topic.endsWith(`driver-trip-${tripId}`))).toBe(true);
    // Let the browser process the join acknowledgement and Strict Mode cleanup
    // before delivering an update to the current subscription.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    state.stage = 'completed';
    const channel = channels.findLast(channel => channel.topic.endsWith(`driver-trip-${tripId}`))!;
    const update = { topic: channel.topic, event: 'postgres_changes', join_ref: channel.joinRef,
      payload: { ids: [1], data: { schema: 'public', table: 'ride_requests', type: 'UPDATE',
        commit_timestamp: new Date().toISOString(), columns: [], record: ride(), old_record: {} } } };
    channel.socket.send(JSON.stringify(channel.v2 ? [update.join_ref, null, update.topic, update.event, update.payload] : update));
  } };
}

for (const theme of ['light', 'dark'] as const) {
  test(`incoming decisions stay readable at 320px in ${theme}`, async ({ page }) => {
    await driverFixture(page, theme, 'pending'); await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`/driver/request?offer=${offerId}`);
    const accept = page.locator('.nr-request-accept'), decline = page.locator('.nr-request-decline'), pass = page.locator('.nr-request-pass');
    await expect(page.locator('.nr-request-sheet')).toHaveAttribute('data-snap', 'medium');
    await expect(accept).toBeVisible(); await expect(decline).toBeInViewport(); await expect(pass).toBeInViewport();
    for (const control of [decline, pass]) expect((await control.boundingBox())!.width).toBeGreaterThan(100);
    expect((await page.locator('.nr-request-actions').boundingBox())!.height).toBeLessThan(140);
    expect(await page.locator('.nr-driver-sheet-content').evaluate(element => element.clientHeight)).toBeGreaterThan(140);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Home opens as a compact sheet and expands on demand in ${theme}`, async ({ page }) => {
    await driverFixture(page, theme, 'none'); await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/driver/home'); await expect(page.locator('.biloo-driver-dock-shortcuts')).toBeVisible();
    const shortcuts = page.locator('.biloo-driver-dock-shortcuts');
    await expect(shortcuts.getByRole('button')).toHaveText(['Activity', 'Earnings', 'Settings']);
    const panel = page.locator('.biloo-driver-dock'), compact = (await panel.boundingBox())!.height;
    await expect(panel).toHaveAttribute('data-compact', 'true');
    await page.getByRole('button', { name: 'Expand driver map panel' }).click();
    await expect(shortcuts).toBeVisible();
    await expect(page.getByRole('switch')).toBeInViewport();
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(compact + 20);
    await page.getByRole('button', { name: 'Minimize driver map panel' }).click();
    await expect(shortcuts).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(compact + 20);
  });

  test(`arrival replaces approaching guidance and ETA in ${theme}`, async ({ page }) => {
    const { state } = await driverFixture(page, theme, 'accepted');
    await page.goto(navigation); await expect(page.locator('.nr-nav-stage-primary')).toBeEnabled();
    const guidance = page.locator('.biloo-driver-trip-sheet .nr-nav-guidance');
    await expect(guidance).toBeVisible();
    await expect(guidance.locator('strong')).toHaveCSS('color', 'rgb(255, 255, 255)');
    const tripSheet = page.locator('.nr-nav-bottom-card.biloo-driver-trip-sheet');
    await expect(tripSheet).toBeVisible();
    await expect(tripSheet.locator('.nr-nav-guidance')).toHaveCount(1);
    await expect(tripSheet.locator('.nr-nav-current-destination')).toBeVisible();
    const details = page.locator('.biloo-driver-trip-details');
    await expect(details).toHaveAttribute('open', '');
    await expect(tripSheet.locator('.nr-driver-sheet-footer .nr-nav-stage-primary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
    await expect(page.locator('.nr-nav-stage-primary')).toBeInViewport();
    await details.locator('summary').click();
    await expect(details).not.toHaveAttribute('open');
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    const header = (await page.locator('.nr-driver-global-header').boundingBox())!;
    expect((await page.locator('.nr-driver-navigation-page').boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    const sheetBox = (await tripSheet.boundingBox())!;
    expect(await tripSheet.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
    expect((await page.evaluate(() => innerHeight)) - (sheetBox.y + sheetBox.height)).toBeLessThanOrEqual(2);
    await expect(page.locator('.nr-nav-current-destination')).toContainText('Arriving in about 3 min');
    await page.locator('.nr-nav-stage-primary').click();
    await expect(page.locator('.nr-nav-stage-primary')).toContainText('Start trip');
    await expect(page.locator('.nr-nav-guidance strong')).toHaveText('Arrived at pickup');
    await expect(page.locator('.nr-nav-current-destination')).toContainText('You are at this stop');
    await expect(page.locator('.nr-nav-current-destination')).not.toContainText('Arriving in');
    await expect(details).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
    expect(state.stage).toBe('arrived_pickup'); expect(state.writes).toBe(1);
  });

  test(`completion recovered by polling retries its receipt after reconnect in ${theme}`, async ({ page }) => {
    const { state } = await driverFixture(page, theme, 'in_trip');
    await page.goto(navigation); await expect(page.locator('.nr-nav-stage-primary')).toBeEnabled();
    const initialReads = state.receiptReads;
    state.stage = 'completed'; state.receiptFails = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // An online event can coincide with an in-flight sync. Its ten-second
    // reconciliation timer must still discover the completion.
    await expect.poll(() => state.receiptReads, { timeout: 15000 }).toBeGreaterThan(initialReads);
    await expect(page.locator('.biloo-completion-pending')).toBeVisible();
    state.receiptFails = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.biloo-completion-card')).toContainText('336', { timeout: 15000 });
    await expect(page.locator('.biloo-payment-state')).toHaveAttribute('data-status', 'paid');
    await expect(page.getByRole('button', { name: 'Driver home', exact: true })).toBeVisible();
    expect(state.writes).toBe(0);
  });

  test(`Realtime completion loads its receipt without reloading in ${theme}`, async ({ page }) => {
    const { state, completeViaRealtime } = await driverFixture(page, theme, 'in_trip');
    await page.goto(navigation); await expect(page.locator('.nr-nav-stage-primary')).toBeEnabled();
    await completeViaRealtime();
    await expect(page.locator('.biloo-completion-card')).toContainText('Meskel Square');
    await expect(page.locator('.biloo-payment-state')).toHaveAttribute('data-status', 'paid');
    expect(state.writes).toBe(0);
  });

  test(`confirmed Complete trip loads its receipt in ${theme}`, async ({ page }) => {
    const { state } = await driverFixture(page, theme, 'in_trip');
    await page.goto(navigation); await expect(page.locator('.nr-nav-stage-primary')).toBeEnabled();
    await page.locator('.nr-nav-stage-primary').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Complete trip', exact: true }).click();
    await expect(page.locator('.biloo-completion-card')).toContainText('336');
    await expect(page.locator('.biloo-payment-state')).toHaveAttribute('data-status', 'paid');
    expect(state.stage).toBe('completed'); expect(state.writes).toBe(1);
  });
}

test('network failure releases the acceptance action for retry', async ({ page }) => {
  const { state } = await driverFixture(page, 'light', 'pending');
  state.failAcceptance = true;
  await page.goto(`/driver/request?offer=${offerId}`);
  const accept = page.locator('.nr-request-accept');
  await accept.click();
  await expect(page.locator('.nr-request-error')).toBeVisible();
  await expect(accept).toBeEnabled();
  await expect(accept).toHaveText('Accept Ride');
  expect(state.acceptCalls).toBe(1);
});

test('acceptance completes the verified ride lifecycle while rider contact loads in background', async ({ page }) => {
  const { state } = await driverFixture(page, 'light', 'pending');
  state.delayRiderProfile = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/driver/request?offer=${offerId}`);
  const requestSheet = page.locator('.nr-request-sheet');
  await expect(requestSheet).toBeVisible();
  expect(await requestSheet.evaluate(element => getComputedStyle(element).position)).toBe('absolute');
  expect(await requestSheet.evaluate(element => getComputedStyle(element).bottom)).toBe('0px');
  await page.locator('.nr-request-accept').click();
  await expect.poll(() => state.stage).toBe('accepted');
  await expect(page).toHaveURL(/\/driver\/navigation\?offer=/);
  await expect(page.locator('.nr-nav-loading')).toHaveCount(0, { timeout: 5000 });
  const stageAction = page.locator('.nr-nav-stage-primary');
  await expect(stageAction).toBeEnabled({ timeout: 5000 });
  const actionSheet = page.locator('.nr-nav-bottom-card.biloo-driver-trip-sheet');
  await expect(actionSheet).toBeVisible();
  expect(await actionSheet.evaluate(element => getComputedStyle(element).bottom)).toBe('0px');
  await expect(actionSheet.locator('.biloo-driver-trip-details')).toHaveAttribute('open', '');
  await expect(actionSheet.locator('.nr-driver-sheet-footer .nr-nav-stage-primary')).toBeVisible();

  await expect(stageAction).toContainText('Arrived at pickup');
  await expect(stageAction).toBeEnabled({ timeout: 5000 });
  await expect(actionSheet.locator('.biloo-driver-trip-details')).toHaveAttribute('open', '');
  await stageAction.click();
  await expect.poll(() => state.stage).toBe('arrived_pickup');
  await expect(stageAction).toContainText('Start trip');
  await stageAction.click();
  const startTripConfirm = page.getByRole('dialog').getByRole('button', { name: 'Start trip', exact: true });
  await expect(startTripConfirm).toBeEnabled({ timeout: 5000 });
  await startTripConfirm.click();
  await expect.poll(() => state.stage).toBe('in_trip');
  await expect(stageAction).toContainText('Complete trip');
  await expect(actionSheet.locator('.biloo-driver-trip-details')).toHaveAttribute('open', '');
  await stageAction.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Complete trip', exact: true }).click();
  await expect.poll(() => state.stage).toBe('completed');
  const receipt = page.locator('.nr-app.biloo-driver-completion');
  const receiptCard = page.locator('.biloo-completion-card');
  await expect(receiptCard).toContainText('336');
  await expect(page.locator('.biloo-payment-state')).toHaveAttribute('data-status', 'paid');
  expect(await receipt.evaluate(element => getComputedStyle(element).alignItems)).toBe('flex-end');
  expect((await receiptCard.boundingBox())!.y + (await receiptCard.boundingBox())!.height)
    .toBeGreaterThan((await receipt.boundingBox())!.y + (await receipt.boundingBox())!.height - 80);
  expect(state.acceptCalls).toBe(1);
  expect(state.stage).toBe('completed');
  expect(state.writes).toBe(3);
});
