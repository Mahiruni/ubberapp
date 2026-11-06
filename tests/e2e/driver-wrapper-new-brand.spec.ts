import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'off', serviceWorkers: 'block' });

const driverId = '22222222-2222-4222-8222-222222222222';
const riderId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

async function connectedDriver(page: Page, trip: 'pending' | 'accepted' | 'in_trip', theme: 'dark' | 'light') {
  const user = { id: driverId, aud: 'authenticated', role: 'authenticated', email: 'driver@example.test',
    app_metadata: {}, user_metadata: { role: 'driver', full_name: 'Biloo Driver' }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: driverId, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session, theme }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride.driver.theme', theme);
    localStorage.setItem('nexride.driver.aurora-light-v1', '1');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {},
    } });
  }, { session, theme });
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object+json');
    const respond = (value: object | null) => route.fulfill({ json: single ? value : value ? [value] : [] });
    if (name === 'profiles') return respond({ id: driverId, role: 'driver', full_name: 'Biloo Driver', phone: '+251900000000' });
    if (name === 'drivers') return respond({ id: driverId, review_status: 'approved', is_online: true, rating: null });
    if (name === 'ride_request_offers') return respond({ id: offerId, request_id: requestId, driver_id: driverId,
      status: trip === 'in_trip' ? 'accepted' : trip, pickup_distance_km: 1.1, pickup_eta_minutes: 4,
      expires_at: new Date(Date.now() + 90000).toISOString(), created_at: new Date().toISOString() });
    if (name === 'ride_requests') return respond({ id: requestId, rider_id: riderId, assigned_driver_id: trip !== 'pending' ? driverId : null,
      pickup_location: 'Bole, Addis Ababa', destination_location: 'Mexico Square, Addis Ababa',
      pickup_lat: 8.998, pickup_lng: 38.790, destination_lat: 9.018, destination_lng: 38.751,
      ride_category: 'Economy', status: trip, estimated_trip_fare_etb: 235,
      estimated_driver_payout_etb: 195, estimated_trip_distance_km: 6.4,
      estimated_trip_duration_minutes: 20 });
    return respond(null);
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.routeWebSocket('**/realtime/v1/**', ws => ws.close());
}

test('incoming Rider call uses Biloo navy and gold with theme-aware surfaces', async ({ page }, info) => {
  await connectedDriver(page, 'pending', 'dark');
  await page.goto(`/driver/request?offer=${offerId}`);
  const wrapper = page.locator('.nr-driver-request-page .nr-request-sheet');
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toHaveCSS('background-color', 'rgb(16, 56, 111)');
  await expect(wrapper.locator('.nr-request-eyebrow')).toContainText('Biloo');
  await expect(wrapper.getByRole('button', { name: 'Accept' })).toHaveCSS('background-color', 'rgb(249, 196, 73)');
  await expect(wrapper.getByRole('button', { name: 'Pass/Skip' })).toBeInViewport();
  await expect(wrapper.locator('.nr-request-route-compact')).toBeVisible();
  await expect(wrapper.getByRole('button', { name: 'Accept' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-request-dark-${info.project.name}.png` });
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'light'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(wrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(wrapper.getByRole('button', { name: 'Accept' })).toHaveCSS('background-color', 'rgb(249, 196, 73)');
  await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-request-light-${info.project.name}.png` });
});

test('accepted Driver trip keeps its details sheet above the bottom-pinned stage action', async ({ page }) => {
  await connectedDriver(page, 'accepted', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/driver/navigation?offer=${offerId}`);
  await expect(page.locator('.nr-driver-global-header .biloo-driver-trip-guidance')).toBeVisible();
  await expect(page.locator('.nr-driver-global-header .biloo-driver-trip-details')).toContainText('Biloo');
  const details = page.locator('.biloo-driver-trip-details');
  await expect(details).toHaveAttribute('open', '');
  const tripSheet = page.locator('#biloo-driver-trip-header-slot');
  expect(await tripSheet.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await expect(page.locator('.nr-nav-bottom-card')).toHaveCount(0);
  const wrapper = page.locator('.nr-nav-trip-action-bar');
  await expect(wrapper).toBeVisible();
  const pinned = wrapper.getByRole('button', { name: 'Arrived at pickup' });
  await expect(pinned).toBeVisible();
  await expect(pinned).toBeInViewport();
  expect(await wrapper.evaluate(element => getComputedStyle(element).position)).toBe('absolute');
  const actionBottom = parseFloat(await wrapper.evaluate(element => getComputedStyle(element).bottom));
  expect(actionBottom).toBeGreaterThanOrEqual(0);
  expect(actionBottom).toBeLessThanOrEqual(16);
  const tripSheetBox = (await tripSheet.boundingBox())!;
  const actionBox = (await wrapper.boundingBox())!;
  expect(tripSheetBox.y).toBeGreaterThan((await page.locator('.nr-driver-global-header-inner').boundingBox())!.y + 48);
  expect(tripSheetBox.y + tripSheetBox.height).toBeLessThanOrEqual(actionBox.y + 1);
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'light'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme','light');
  await expect(wrapper).toBeVisible();
  await expect(pinned).toBeEnabled();
});


test('incoming Driver offer shows the fare with compact secondary decisions and no bottom dead space', async ({ page }) => {
  await connectedDriver(page, 'pending', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/driver/request?offer=${offerId}`);
  const sheet = page.locator('.nr-driver-request-page .nr-request-sheet');
  const accept = sheet.locator('.nr-request-accept');
  const pass = sheet.locator('.nr-request-pass');
  const decline = sheet.locator('.nr-request-decline');
  await expect(accept).toBeVisible();
  await expect(pass).toBeVisible();
  await expect(decline).toBeVisible();
  const a = (await accept.boundingBox())!;
  const p = (await pass.boundingBox())!;
  const d = (await decline.boundingBox())!;
  expect(Math.abs(a.y - d.y)).toBeLessThan(2);
  expect(p.y).toBeGreaterThan(d.y);
  expect(p.x + p.width).toBeLessThan(a.x);
  expect(Math.abs(p.x - d.x)).toBeLessThan(2);
  expect(Math.abs(p.width - d.width)).toBeLessThan(2);
  expect(a.height).toBeGreaterThan(p.height + d.height);
  await expect(sheet.locator('.nr-request-offer-value')).toBeInViewport();
  await expect(sheet.locator('.nr-request-offer-value')).toContainText('Estimated driver payout');
  await expect(sheet.locator('.nr-request-offer-value')).toContainText('195 ETB');
  await expect(sheet.locator('.nr-request-route-compact')).toBeInViewport();
  const sheetBox = (await sheet.boundingBox())!;
  const footer = sheet.locator('.nr-driver-sheet-footer');
  const footerBox = (await footer.boundingBox())!;
  const footerSafeArea = parseFloat(await footer.evaluate(element => getComputedStyle(element).paddingBottom));
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(viewportHeight - (sheetBox.y + sheetBox.height)).toBeLessThanOrEqual(16);
  expect(sheetBox.y + sheetBox.height - (footerBox.y + footerBox.height)).toBeLessThanOrEqual(footerSafeArea + 2);
  await expect(accept).toBeInViewport();
  await expect(decline).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(accept).toBeInViewport();
  await expect(pass).toBeInViewport();
  await expect(decline).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('active Driver trip keeps its stage action in a compact bottom sheet', async ({ page }) => {
  await connectedDriver(page, 'in_trip', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/driver/navigation?offer=${offerId}`);
  await expect(page.locator('.nr-nav-bottom-card')).toHaveCount(0);
  const details = page.locator('.biloo-driver-trip-details');
  await expect(details).toHaveAttribute('open', '');
  await expect(page.locator('.nr-nav-current-destination h1')).toHaveText('Mexico Square, Addis Ababa');
  await expect(page.locator('.nr-nav-trip-meta')).toContainText('IN TRIP');
  const sheet = page.locator('.nr-nav-trip-action-bar');
  const complete = sheet.getByRole('button', { name: /Complete trip/i });
  await expect(sheet).toBeVisible();
  await expect(complete).toBeVisible();
  await expect(complete).toBeInViewport();
  expect(await sheet.evaluate(element => getComputedStyle(element).position)).toBe('absolute');
  expect(await sheet.evaluate(element => getComputedStyle(element).bottom)).toBe('0px');
  expect((await sheet.boundingBox())!.height).toBeLessThan(120);
  const guidanceBox = (await page.locator('#biloo-driver-trip-header-slot').boundingBox())!;
  const actionBox = (await sheet.boundingBox())!;
  expect(guidanceBox.y + guidanceBox.height).toBeLessThanOrEqual(actionBox.y + 1);
});

for (const theme of ['light', 'dark'] as const) {
  test(`trip completion confirmation stays readable and dismisses without changing the trip in ${theme} mode`, async ({ page }, info) => {
    await connectedDriver(page, 'in_trip', theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/driver/navigation?offer=${offerId}`);
    const next = page.getByRole('button', { name: 'Complete trip', exact: true });
    await expect(page.locator('.nr-nav-current-destination')).toBeInViewport();
    await expect(next).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-navigation-${theme}-${info.project.name}.png` });
    await next.click();
    const dialog = page.getByRole('dialog', { name: 'Complete this trip?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveCSS('color', theme === 'light' ? 'rgb(34, 34, 34)' : 'rgb(242, 242, 242)');
    await expect(dialog).toContainText('Mexico Square, Addis Ababa');
    await expect(dialog.getByRole('button', { name: 'Complete trip', exact: true })).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: `/tmp/biloo-complete-dialog-${theme}-${info.project.name}.png` });
    await dialog.getByRole('button', { name: 'Not yet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(next).toBeEnabled();
    await next.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(next).toBeFocused();
    await page.setViewportSize({ width: 320, height: 640 });
    await next.click();
    await expect(dialog.getByRole('heading')).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Complete trip', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Not yet', exact: true })).toBeInViewport();
  });
}
