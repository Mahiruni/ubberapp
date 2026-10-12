import { test, expect, type Page } from '@playwright/test';

const driverId = '22222222-2222-4222-8222-222222222222';
const riderId = '33333333-3333-4333-8333-333333333333';
const offerId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

async function connectedDriver(page: Page, trip: 'pending' | 'accepted' | 'in_trip', theme: 'dark' | 'light') {
  const user = { id: driverId, aud: 'authenticated', role: 'authenticated', email: 'driver@example.test',
    app_metadata: {}, user_metadata: { role: 'driver', full_name: 'NexRide Driver', driver_onboarding_complete: true }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: driverId, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session, theme }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride.driver.theme', theme);
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {},
    } });
  }, { session, theme });
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object+json');
    const respond = (value: object | null) => route.fulfill({ json: single ? value : value ? [value] : [] });
    if (name === 'profiles') return respond({ id: driverId, role: 'driver', full_name: 'NexRide Driver', phone: '+251900000000' });
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

test('incoming Rider call uses navy and emerald brand with theme-aware surfaces', async ({ page }) => {
  await connectedDriver(page, 'pending', 'dark');
  await page.goto(`/driver/request?offer=${offerId}`);
  const wrapper = page.locator('.nr-driver-request-page .nr-request-sheet');
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toHaveCSS('background-color', 'rgb(11, 43, 67)');
  await expect(wrapper.locator('.nr-request-eyebrow')).toContainText('NexRide');
  await expect(wrapper.getByRole('button', { name: 'Accept' })).toHaveCSS('background-color', 'rgb(0, 200, 120)');
  await expect(wrapper.getByRole('button', { name: 'Pass/Skip' })).toHaveCSS('background-color', 'rgb(4, 28, 48)');
  await expect(wrapper.locator('.nr-request-route-horizontal')).toBeVisible();
  await expect(wrapper.getByRole('button', { name: 'Accept' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('accepted Rider trip retains pinned stage action and brand-aware light/dark surfaces', async ({ page }) => {
  await connectedDriver(page, 'accepted', 'dark');
  await page.goto(`/driver/navigation?offer=${offerId}`);
  const wrapper = page.locator('.nr-driver-navigation-page .nr-nav-bottom-card');
  await expect(wrapper).toBeVisible();
  await expect(wrapper).toHaveCSS('background-color', 'rgb(11, 43, 67)');
  await expect(wrapper.locator('.nr-nav-trip-meta')).toContainText('NexRide');
  const pinned = wrapper.locator('.nr-driver-sheet-footer').getByRole('button', { name: 'Arrived at pickup' });
  await expect(pinned).toBeVisible();
  await expect(pinned).toHaveCSS('background-color', 'rgb(0, 200, 120)');
  await expect(pinned).toBeInViewport();
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'light'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme','light');
  await expect(wrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(pinned).toHaveCSS('background-color', 'rgb(0, 200, 120)');
});


test('incoming Driver offer stacks Accept, Pass/Skip and Decline without bottom dead space', async ({ page }) => {
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
  expect(p.y + p.height + 2).toBeLessThan(d.y);
  expect(Math.abs(a.x - p.x)).toBeLessThan(2);
  expect(Math.abs(p.x - d.x)).toBeLessThan(2);
  expect(Math.abs(a.width - p.width)).toBeLessThan(2);
  const sheetBox = (await sheet.boundingBox())!;
  const footerBox = (await sheet.locator('.nr-driver-sheet-footer').boundingBox())!;
  expect(sheetBox.y + sheetBox.height - (footerBox.y + footerBox.height)).toBeLessThan(3);
  await expect(accept).toBeInViewport();
  await expect(decline).toBeInViewport();
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

test('Driver home shortcuts retain their original slots after returning from a ride call', async ({ page }) => {
  await connectedDriver(page, 'pending', 'light');
  await page.setViewportSize({ width: 390, height: 844 });

  // Avoid reopening a mocked incoming offer immediately after returning home.
  await page.route('**/rest/v1/ride_request_offers**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('id')) return route.fallback();
    const single = route.request().headers().accept?.includes('object+json');
    return route.fulfill({ json: single ? null : [] });
  });

  await page.goto(`/driver/request?offer=${offerId}`);
  await expect(page.locator('.nr-driver-request-page .nr-request-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/driver\/home(?:\?.*)?$/);

  const shortcuts = page.locator('.nr-driver-home-quick-actions');
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).toHaveCSS('display', 'grid');
  for (const [index, label] of ['Activity', 'Earnings', 'Settings'].entries()) {
    await expect(shortcuts.locator('button').nth(index)).toContainText(label);
  }

  const boxes = await shortcuts.locator('button').evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(boxes).toHaveLength(3);
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
  expect(Math.abs(boxes[1].y - boxes[2].y)).toBeLessThan(2);
  expect(boxes.every(box => box.width < 160 && box.height >= 44)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
