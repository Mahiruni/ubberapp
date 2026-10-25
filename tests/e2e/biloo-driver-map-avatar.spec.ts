import { expect, test, type Page } from '@playwright/test';
import { driverMapAvatarSource, type DriverAvatarStyle } from '../../lib/biloo-driver-map-avatar';

test.use({ video: 'off', serviceWorkers: 'block', launchOptions: {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
} });
const driverId = '22222222-2222-4222-8222-222222222222';
const riderId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const tripId = '55555555-5555-4555-8555-555555555555';
const registry = () => ({ style: 'signature' as DriverAvatarStyle, fail: false, complete: true, writes: [] as unknown[] });
type Registry = ReturnType<typeof registry>;
const avatar = (state: Registry) => ({ bodyType: 'suv' as const, color: 'Beige' as const, style: state.style });

async function backend(page: Page, state: Registry, role: 'driver' | 'rider' = 'driver', assigned = false) {
  const id = role === 'driver' ? driverId : riderId;
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'avatar@example.test', app_metadata: {}, user_metadata: { role, full_name: 'Biloo Driver', vehicle: 'BYD Tang L', vehicle_color: 'Beige', vehicle_body_type: 'suv', driver_onboarding_complete: true }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride.driver.theme', 'light'); localStorage.setItem('nexride.driver.aurora-light-v1', '1');
    localStorage.setItem('nexride:onboarding-complete', 'true');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success: PositionCallback) { queueMicrotask(() => success({ coords: { latitude: 9.008, longitude: 38.775, accuracy: 8, heading: 65, speed: 0, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() } as GeolocationPosition)); return 1; },
      clearWatch() {}, getCurrentPosition(success: PositionCallback) { queueMicrotask(() => success({ coords: { latitude: 9.008, longitude: 38.775, accuracy: 8, heading: 65, speed: 0, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() } as GeolocationPosition)); },
    } });
  }, { session });
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  const ride = () => ({ id: tripId, rider_id: riderId, assigned_driver_id: driverId, status: 'in_trip', ride_category: 'economy', pickup_location: 'Bole Atlas', destination_location: 'Meskel Square', pickup_lat: 9.008, pickup_lng: 38.775, destination_lat: 9.018, destination_lng: 38.751, estimated_trip_distance_km: 6.4, estimated_trip_duration_minutes: 18, estimated_trip_fare_etb: 336, created_at: new Date(Date.now() - 60_000).toISOString(), updated_at: new Date().toISOString(), payment_status: 'pending', payment_method: 'cash' });
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object+json');
    let row: unknown = null;
    if (table === 'profiles') row = { id, role, full_name: 'Biloo Driver', account_status: 'active', phone: '+251912345678' };
    if (table === 'drivers') row = { id: driverId, review_status: 'approved', is_online: false, vehicle: 'BYD Tang L', vehicle_color: 'Beige', vehicle_plate: 'TEST-123', license_expiry: '2030-01-01', rating: null };
    if (table === 'ride_requests') row = role === 'driver' || assigned ? ride() : null;
    if (table === 'ride_request_offers' && assigned && url.searchParams.has('id')) row = { id: offerId, request_id: tripId, driver_id: driverId, status: 'accepted' };
    if (table === 'ride_driver_locations') row = { driver_id: driverId, latitude: 9.008, longitude: 38.775, heading_degrees: 65, accuracy_meters: 8, recorded_at: new Date().toISOString() };
    return route.fulfill({ json: single ? row : row ? [row] : [], headers: { 'content-range': '0-0/0' } });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.route('**/api/driver/map-avatar', async route => {
    if (route.request().method() === 'PATCH') {
      state.writes.push(route.request().postDataJSON());
      if (state.fail) return route.fulfill({ status: 503, json: { status: 'save_failed' } });
      state.style = route.request().postDataJSON().style;
    }
    return route.fulfill({ json: { status: 'ready', complete: state.complete, avatar: avatar(state), vehicle: { model: state.complete ? 'BYD Tang L' : '', color: state.complete ? 'Beige' : '', bodyType: 'suv' } } });
  });
  await page.route('**/api/rider/nearby-drivers?*', route => route.fulfill({ json: { status: 'ready', vehicles: [{ key: 'anonymous-car', lat: 9.008, lng: 38.775, distanceMeters: 10, updatedAt: new Date().toISOString(), avatar: avatar(state) }] } }));
  await page.route('**/api/rider/profile', route => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/driver/availability', route => route.fulfill({ json: { status: 'ready', gpsStatus: 'ready' } }));
  await page.route('**/api/driver/route', route => route.fulfill({ json: { status: 'ready', route: { geometry: [[9.008, 38.775], [9.012, 38.766], [9.018, 38.751]], distanceMeters: 6400, durationSeconds: 1080, steps: [] } } }));
  await page.route(`**/api/rider/trips/${tripId}/driver`, route => route.fulfill({ json: { status: 'ready', driver: { id: driverId, name: 'Biloo Driver', vehicle: { model: 'BYD Tang L', color: 'Beige', plate: 'TEST-123', mapAvatar: avatar(state) } } } }));
}

async function maps(page: Page) {
  const style = { version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e7eeea' } }] };
  await page.route('**/api.mapbox.com/**', route => route.fulfill({ json: style }));
  await page.route('**/events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.route('**/api.mapbox.com/map-sessions/**', route => route.fulfill({ json: {} }));
}
async function assertMapCar(page: Page, source: string) {
  const marker = page.locator('.biloo-driver-car-marker').first();
  await expect(marker).toBeVisible({ timeout: 20_000 });
  await expect(marker).toHaveAttribute('data-avatar-style', 'goldline');
  await expect(marker).toHaveAttribute('data-vehicle-color', 'Beige');
  await expect(marker).toHaveAttribute('data-body-type', 'suv');
  await expect(marker.locator('img')).toHaveAttribute('src', source);
  await expect.poll(() => marker.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(marker).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(marker.locator('img')).toHaveCSS('width', '48px');
  await expect(marker.locator('img')).toHaveCSS('height', '82px');
  return marker;
}

test('driver chooses a finish matching the registered car, saves across reloads and recovers from failed saves', async ({ page }, info) => {
  const state = registry(); await backend(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/driver/profile/vehicle');
  const studio = page.getByRole('region', { name: 'Your car on the map' });
  await expect(studio).toBeVisible();
  await expect(studio).toContainText('BYD Tang L'); await expect(studio).toContainText('Beige · SUV');
  await expect(studio.getByRole('radio', { name: /Signature/ })).toBeChecked();
  await expect.poll(() => studio.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: `/tmp/biloo-car-avatar-studio-${info.project.name}.png`, animations: 'disabled' });
  await studio.getByText('Goldline', { exact: true }).click(); state.fail = true;
  await studio.getByRole('button', { name: 'Use this avatar' }).click();
  await expect(studio.getByRole('alert')).toContainText('Couldn’t save'); expect(state.style).toBe('signature');
  state.fail = false;
  await studio.getByRole('button', { name: 'Use this avatar' }).click();
  await expect(studio.getByRole('status')).toContainText('Saved.');
  expect(state.writes).toEqual([{ style: 'goldline' }, { style: 'goldline' }]);
  await page.reload(); await expect(studio.getByRole('radio', { name: /Goldline/ })).toBeChecked();
  await expect(studio.getByRole('button', { name: 'Current map avatar' })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await studio.getByRole('radio', { name: /Signature/ }).focus(); await page.keyboard.press('ArrowRight');
  await expect(studio.getByRole('radio', { name: /Goldline/ })).toBeChecked();
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'dark'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(studio).toHaveCSS('background-color', 'rgb(16, 56, 111)');
  await expect(studio.getByText('BYD Tang L', { exact: true })).toHaveCSS('color', 'rgb(8, 41, 95)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `/tmp/biloo-car-avatar-studio-dark-${info.project.name}.png`, animations: 'disabled' });
});

test('personalization is unavailable until the registered car has a model and color', async ({ page }) => {
  const state = registry(); state.complete = false; await backend(page, state);
  await page.goto('/driver/profile/vehicle');
  const studio = page.getByRole('region', { name: 'Your car on the map' });
  await expect(studio).toContainText('Add your vehicle model and color');
  await expect(studio.getByRole('radio').first()).toBeDisabled();
  await expect(studio.getByRole('link', { name: /Update vehicle/ })).toHaveAttribute('href', '/driver/verification');
});

test('same saved car renders on Driver home, map, navigation and the assigned Rider map', async ({ page, browser }, info) => {
  test.skip(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.'), 'Public test token required for the local Mapbox fixture.');
  const state = registry(); state.style = 'goldline'; await backend(page, state, 'driver', true); await maps(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const source = driverMapAvatarSource(avatar(state));
  for (const path of ['/driver/home', '/driver/map', `/driver/navigation?offer=${offerId}`]) {
    await page.goto(path); const marker = await assertMapCar(page, source);
    await expect(marker.locator('img')).toHaveCSS('--biloo-car-heading', '65deg');
    if (path.includes('navigation')) {
      await expect.poll(async () => {
        const car = (await marker.boundingBox())!;
        const sheet = (await page.locator('.nr-nav-bottom-card').boundingBox())!;
        return car.y + car.height < sheet.y;
      }).toBe(true);
    }
    await page.screenshot({ path: `/tmp/biloo-car-avatar-${path.includes('navigation') ? 'navigation' : path.split('/').pop()}-${info.project.name}.png`, animations: 'disabled' });
  }
  const rider = await browser.newPage({ baseURL: info.project.use.baseURL, serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await backend(rider, state, 'rider', true); await maps(rider);
  await rider.goto('/'); await assertMapCar(rider, source);
  await rider.screenshot({ path: `/tmp/biloo-car-avatar-rider-${info.project.name}.png`, animations: 'disabled' });
  await rider.close();
});

test('private trip link uses the same avatar and clears its marker when fresh GPS disappears', async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.'), 'Public test token required for the local Mapbox fixture.');
  const state = registry(); state.style = 'goldline'; await maps(page);
  let fresh = true;
  await page.route('**/api/trip-share/public/**', route => route.fulfill({ json: { status: 'active', trip: { stage: 'in_trip', pickup: 'Bole', destination: 'Meskel Square', category: 'economy' }, driverAvatar: avatar(state), driverLocation: fresh ? { lat: 9.008, lng: 38.775, accuracyMeters: 8, updatedAt: new Date().toISOString() } : null, expiresAt: new Date(Date.now()+600_000).toISOString(), lastCheckedAt: new Date().toISOString() } }));
  await page.goto('/share/trip/'+'a'.repeat(43));
  await assertMapCar(page, driverMapAvatarSource(avatar(state)));
  fresh = false; await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.biloo-driver-car-marker')).toHaveCount(0);
});

test('embedded active-trip map renders the same branded car with the proper Leaflet anchor', async ({ page }) => {
  const state = registry(); state.style = 'goldline';
  await page.route('**/*.tile.openstreetmap.org/**', route => route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1AAAAABJRU5ErkJggg==','base64'), contentType: 'image/png' }));
  await page.goto('/offline.html');
  await page.evaluate(({ avatar, tripId, driverId }) => {
    const frame = document.createElement('iframe'); frame.id='avatar-trip-frame'; frame.style.cssText='width:390px;height:700px;border:0';
    const snapshot = { id: tripId, revision: 1, status: 'in_trip', driver: { id: driverId, name: 'Biloo Driver', vehicle: { model: 'BYD Tang L', color: 'Beige', plate: 'TEST-123', mapAvatar: avatar } }, pickup: { lat: 9.008, lng: 38.775, name: 'Bole' }, destination: { lat: 9.018, lng: 38.751, name: 'Meskel Square' }, tracking: { lat: 9.008, lng: 38.775, driverId, heading: 65, updatedAt: Date.now() }, payment: { status: 'pending' } };
    window.addEventListener('message', event => {
      if(event.origin !== location.origin || event.source !== frame.contentWindow) return;
      if(event.data?.type==='nexride:ready') frame.contentWindow?.postMessage({ type: 'nexride:initialize', live: true, tripId }, location.origin);
      if(event.data?.type==='nexride:subscribed') frame.contentWindow?.postMessage({ type: 'nexride:snapshot', snapshot }, location.origin);
    });
    document.body.replaceChildren(frame); frame.src='/nexride/screens/trip.html?embedded=1&live=1';
  }, { avatar: avatar(state), tripId, driverId });
  const frame = page.frameLocator('#avatar-trip-frame');
  const marker = frame.locator('.biloo-driver-car-marker');
  await expect(marker.locator('img')).toHaveAttribute('src', driverMapAvatarSource(avatar(state)));
  await expect(marker).toHaveCSS('margin-left', '-30px');
  await expect(marker).toHaveCSS('margin-top', '-43px');
  await expect(marker.locator('img')).toHaveCSS('--biloo-car-heading', '65deg');
  await expect.poll(() => marker.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
});

test('nearby cars refresh their saved finish even without a coordinate change', async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.'), 'Public test token required for the local Mapbox fixture.');
  const state = registry(); await backend(page, state, 'rider'); await maps(page);
  await page.goto('/');
  const marker = page.locator('.nr-nearby-car-marker');
  await expect(marker).toHaveAttribute('data-avatar-style', 'signature', { timeout: 20_000 });
  state.style = 'goldline'; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await assertMapCar(page, driverMapAvatarSource(avatar(state)));
  await expect(marker).toHaveCount(1);
});
