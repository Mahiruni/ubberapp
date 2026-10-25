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

test('accepted Rider trip retains pinned stage action and brand-aware light/dark surfaces', async ({ page }) => {
  await connectedDriver(page, 'accepted', 'dark');
  await page.goto(`/driver/navigation?offer=${offerId}`);
  const wrapper = page.locator('.nr-driver-navigation-page .nr-nav-bottom-card');
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await expect(wrapper.locator('.nr-nav-trip-meta')).toContainText('Biloo');
  const pinned = wrapper.locator('.nr-driver-sheet-footer').getByRole('button', { name: 'Arrived at pickup' });
  await expect(pinned).toBeVisible();
  await expect(pinned).toHaveCSS('background-color', 'rgb(255, 176, 0)');
  await expect(pinned).toBeInViewport();
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'light'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme','light');
  await expect(wrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(pinned).toHaveCSS('background-color', 'rgb(255, 176, 0)');
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
  expect(a.y + a.height + 2).toBeLessThan(p.y);
  expect(Math.abs(p.y - d.y)).toBeLessThan(2);
  expect(p.x + p.width).toBeLessThan(d.x);
  expect(Math.abs(p.width - d.width)).toBeLessThan(2);
  await expect(sheet.locator('.nr-request-offer-value')).toBeInViewport();
  await expect(sheet.locator('.nr-request-offer-value')).toContainText('Estimated driver payout');
  await expect(sheet.locator('.nr-request-offer-value')).toContainText('195 ETB');
  await expect(sheet.locator('.nr-request-route-compact')).toBeInViewport();
  const sheetBox = (await sheet.boundingBox())!;
  const footerBox = (await sheet.locator('.nr-driver-sheet-footer').boundingBox())!;
  expect(sheetBox.y + sheetBox.height - (footerBox.y + footerBox.height)).toBeLessThan(3);
  await expect(accept).toBeInViewport();
  await expect(decline).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(accept).toBeInViewport();
  await expect(pass).toBeInViewport();
  await expect(decline).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('active Driver trip Complete trip stays flush with compact safe-area footer after expanding', async ({ page }) => {
  await connectedDriver(page, 'in_trip', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/driver/navigation?offer=${offerId}`);
  const sheet = page.locator('.nr-driver-navigation-page .nr-nav-bottom-card');
  const complete = sheet.getByRole('button', { name: /Complete trip/i });
  await expect(complete).toBeVisible();
  await sheet.locator('.nr-driver-sheet-grab').press('End');
  await expect.poll(async () => {
    const sheetBox = (await sheet.boundingBox())!;
    const footerBox = (await sheet.locator('.nr-driver-sheet-footer').boundingBox())!;
    return sheetBox.y + sheetBox.height - (footerBox.y + footerBox.height);
  }).toBeLessThan(3);
  const footer = sheet.locator('.nr-driver-sheet-footer');
  const lastButton = (await complete.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  expect(footerBox.y + footerBox.height - (lastButton.y + lastButton.height)).toBeLessThan(30);
  await expect(complete).toBeInViewport();
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
