import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.use({ video: 'off', serviceWorkers: 'block' });
const id = '22222222-2222-4222-8222-222222222222';
type Theme = 'light' | 'dark';

async function backend(page: Page, theme: Theme = 'light', withPhoto = false) {
  const state = { review: 'approved', expiry: '2032-10-01', rating: 4.9 as number | null, trips: 35, tripsUnavailable: false, tripsCountMissing: false, activeTrip: false, offlineFails: false, profileFails: false, offlineCalls: 0, logoutCalls: 0 };
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'mahir@example.test', app_metadata: {}, user_metadata: { role: 'driver', full_name: 'Mahir Aman' }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session, theme }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    if (!localStorage.getItem('nexride.driver.theme')) localStorage.setItem('nexride.driver.theme', theme);
    localStorage.setItem('nexride.driver.aurora-light-v1', '1');
  }, { session, theme });
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/auth/v1/logout*', route => { state.logoutCalls++; return route.fulfill({ status: 204 }); });
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.onMessage(message => {
    try {
      const request = JSON.parse(String(message));
      if (['phx_join', 'phx_leave', 'heartbeat'].includes(request.event)) socket.send(JSON.stringify({ topic: request.topic, event: 'phx_reply', ref: request.ref, join_ref: request.join_ref, payload: { status: 'ok', response: { postgres_changes: (request.payload?.config?.postgres_changes || []).map((filter: object, index: number) => ({ ...filter, id: index+1 })) } } }));
    } catch {}
  }));
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object+json');
    const respond = (value: unknown) => route.fulfill({ json: single ? value : value ? [value] : [] });
    if (table === 'profiles') return respond({ id, role: 'driver', account_status: 'active', full_name: 'Mahir Aman', phone: '+251912345678' });
    if (table === 'drivers') {
      if (state.profileFails && url.searchParams.get('select')?.includes('license_number')) return route.fulfill({ status: 400, json: { message: 'temporarily unavailable' } });
      return respond({ id, review_status: state.review, rejection_reason: state.review === 'rejected' ? 'Please replace the registration image.' : null, is_online: false, vehicle: 'BYD Tang L', vehicle_color: 'Beige', vehicle_plate: 'TEST-123', rating: state.rating, license_expiry: state.expiry, license_number: 'PRIVATE-FIXTURE', license_document_path: `${id}/license.pdf`, vehicle_registration_path: `${id}/registration.pdf` });
    }
    if (table === 'ride_requests') {
      if (route.request().method() === 'HEAD') return state.tripsUnavailable ? route.fulfill({ status: 400 }) : route.fulfill({ status: 200, headers: state.tripsCountMissing ? {} : { 'content-range': `0-0/${state.trips}`, 'access-control-expose-headers': 'content-range' } });
      return respond(state.activeTrip ? { id: 'active-trip', status: 'in_trip' } : null);
    }
    if (table === 'driver_profile_photos') return respond(withPhoto ? { storage_path: `${id}/approved.jpg` } : null);
    return respond(null);
  });
  const portrait = await sharp({ create: { width: 72, height: 72, channels: 3, background: '#2c5b7e' } }).jpeg().toBuffer();
  await page.route('**/storage/v1/**', route => route.request().method() === 'POST' ? route.fulfill({ json: { signedURL: `/object/sign/nexride-driver-photos/${id}/approved.jpg?token=test` } }) : route.fulfill({ contentType: 'image/jpeg', body: portrait }));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.route('**/api/driver/availability', route => {
    state.offlineCalls++;
    return route.fulfill({ status: state.offlineFails ? 503 : 200, json: { status: state.offlineFails ? 'unavailable' : 'ready' } });
  });
  return state;
}

async function contrast(page: Page) {
  return page.locator('[data-driver-account]').evaluate(root => {
    const rgb = (color: string) => (color.match(/[\d.]+/g) || []).map(Number);
    const luminance = (color: number[]) => color.slice(0,3).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((n,c,i) => n+c*[.2126,.7152,.0722][i],0);
    const selectors = ['h1','h2','strong','p','small','[class*="contact"]','[class*="status"]','[class*="plate"]','[class*="verificationDetail"]','[class*="sectionLabel"]'];
    return Array.from(root.querySelectorAll<HTMLElement>(selectors.join(','))).filter(el => el.textContent?.trim() && el.getBoundingClientRect().height && !el.closest('dialog')).map(el => {
      const foreground = rgb(getComputedStyle(el).color);
      let node: Element | null = el;
      let background: number[] = [];
      while (node) { background = rgb(getComputedStyle(node).backgroundColor); if (background.length === 3 || background[3] >= .99) break; node = node.parentElement; }
      const a = luminance(foreground), b = luminance(background.length ? background : [255,255,255]);
      return { text: el.textContent?.trim().slice(0,50), ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) };
    });
  });
}

for (const theme of ['light','dark'] as const) test(`Driver Account has readable ${theme} surfaces and a compact responsive layout`, async ({ page }, info) => {
  await backend(page, theme); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/driver/profile');
  const account = page.locator('[data-driver-account]');
  const identity = account.getByRole('region', { name: 'Driver identity' });
  await expect(identity.getByRole('heading', { name: 'Mahir Aman' })).toBeVisible();
  await expect(identity).toContainText('mahir@example.test'); await expect(identity).toContainText('+251912345678');
  await expect(identity).toHaveCSS('background-color', theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(20, 41, 66)');
  await expect(account.getByRole('group', { name: 'Rating', exact: true })).toContainText('4.9');
  await expect(account.getByRole('group', { name: 'Completed trips', exact: true })).toContainText('35');
  await expect(account.getByRole('group', { name: 'Your vehicle' })).toContainText('BYD Tang L');
  await expect(account.getByRole('group', { name: 'Your vehicle' })).toContainText('TEST-123');
  await expect(account.getByRole('button', { name: 'View documents', exact: true })).toBeVisible();
  expect(await page.locator('.biloo-driver-overview').count()).toBe(0);
  const colors = await contrast(page);
  expect(colors.filter(value => value.ratio < 4.5), JSON.stringify(colors)).toEqual([]);
  await page.screenshot({ path: `/tmp/biloo-driver-account-${theme}-${info.project.name}.png`, animations: 'disabled' });
  for (const width of [320,430,1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await account.boundingBox())!.width).toBeLessThanOrEqual(1041);
    if (width === 1280) { const box = (await account.boundingBox())!; expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThan(3); }
  }
  await page.screenshot({ path: `/tmp/biloo-driver-account-${theme}-desktop-${info.project.name}.png`, animations: 'disabled' });
});

test('day and night controls persist the real Driver appearance and keep the header legible', async ({ page }) => {
  await backend(page); await page.goto('/driver/profile');
  const account = page.locator('[data-driver-account]');
  await account.getByRole('button', { name: 'Night mode', exact: true }).click();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(account.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.nr-driver-global-header .nr-driver-menu-trigger>span').first()).toHaveCSS('background-color', 'rgb(242, 246, 252)');
  await page.reload(); await expect(account.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'true');
  await account.getByRole('button', { name: 'Day mode' }).click();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('nexride.driver.theme'))).toBe('light');
});

test('Account options preserve vehicle, avatar, security, payout and safety routes', async ({ page }) => {
  await backend(page);
  for (const [name, path] of [
    ['Account & security', '/account/manage?role=driver#account-security'],
    ['Vehicle management', '/driver/profile/vehicle'],
    ['Map car avatar', '/driver/profile/vehicle#map-avatar'],
    ['Payout account', '/driver/profile/payouts'],
    ['Profile & app settings', '/driver/profile/settings'],
    ['Safety center', '/safety?role=driver'],
    ['Privacy & data', '/explore/privacy'],
    ['Terms & about Biloo', '/explore/terms'],
  ]) {
    await page.goto('/driver/profile');
    await page.locator('[data-driver-account]').getByRole('button', { name: new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')) }).click();
    await expect(page).toHaveURL(url => url.pathname+url.search+url.hash === path);
  }
});

test('expired verification and unavailable metrics are never presented as verified or fabricated values', async ({ page }) => {
  const state = await backend(page, 'dark'); state.expiry = '2020-01-01'; state.rating = null; state.tripsUnavailable = true;
  await page.goto('/driver/profile'); const account = page.locator('[data-driver-account]');
  await expect(account.getByRole('region', { name: 'Driver identity' })).toContainText('Driver license expired');
  await expect(account).not.toContainText('Verified driver');
  await expect(account.getByRole('group', { name: 'Rating', exact: true })).toContainText('—');
  await expect(account.getByRole('group', { name: 'Completed trips', exact: true })).toContainText('—');
  await expect(account.getByRole('button', { name: 'Review status', exact: true })).toBeVisible();
});

test('a successful response without an exact trip count stays unknown until a real zero is returned', async ({ page }) => {
  const state = await backend(page); state.tripsCountMissing = true;
  await page.goto('/driver/profile');
  const trips = page.locator('[data-driver-account]').getByRole('group', { name: 'Completed trips', exact: true });
  await expect(trips).toContainText('—');
  state.tripsCountMissing = false; state.trips = 0;
  await page.reload();
  await expect(trips).toContainText('0');
  await expect(trips).not.toContainText('—');
});

test('profile retry restores real data and the photo editor displays the current portrait', async ({ page }) => {
  const state = await backend(page, 'dark', true); state.profileFails = true;
  await page.goto('/driver/profile');
  await expect(page.locator('[data-driver-account]').getByRole('alert')).toContainText('Profile unavailable');
  state.profileFails = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const identity = page.getByRole('region', { name: 'Driver identity' });
  await expect(identity.getByRole('heading', { name: 'Mahir Aman' })).toBeVisible();
  await expect.poll(() => identity.getByRole('button', { name: 'Profile Photo' }).locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(72);
  await identity.getByRole('button', { name: 'Profile Photo' }).click();
  await expect(page.getByRole('dialog', { name: 'Profile Photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Photo', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(identity.getByRole('button', { name: 'Profile Photo' })).toBeFocused();
});

test('sign out retains active-trip checks, offline failure recovery and modal focus in night mode', async ({ page }) => {
  const state = await backend(page, 'dark'); state.activeTrip = true;
  await page.goto('/driver/profile');
  const account = page.locator('[data-driver-account]');
  const open = account.getByRole('button', { name: 'Sign out', exact: true });
  await open.click(); const dialog = page.getByRole('dialog', { name: 'Sign out of Biloo?' });
  await expect(dialog).toHaveCSS('background-color', 'rgb(20, 41, 66)');
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Finish or cancel your active trip');
  expect(state.offlineCalls).toBe(0); expect(state.logoutCalls).toBe(0);
  state.activeTrip = false; state.offlineFails = true;
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not take your driver account offline');
  expect(state.offlineCalls).toBe(1); expect(state.logoutCalls).toBe(0);
  await page.keyboard.press('Escape'); await expect(open).toBeFocused();
  await page.setViewportSize({ width: 320, height: 640 }); await open.click();
  await expect(dialog.getByRole('heading', { name: 'Sign out of Biloo?' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Stay signed in' })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Stay signed in' }).click(); await expect(dialog).toHaveCount(0);
});
