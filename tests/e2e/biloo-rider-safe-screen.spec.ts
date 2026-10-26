import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', video: 'off', permissions: ['geolocation'], geolocation: { latitude: 9.008, longitude: 38.775, accuracy: 16 } });

const riderId = '11111111-1111-4111-8111-111111111111';
const user = { id: riderId, aud: 'authenticated', role: 'authenticated', email: 'rider@example.test', app_metadata: {}, user_metadata: { role: 'rider', full_name: 'Biloo Rider' }, created_at: '2026-01-01T00:00:00Z' };
const airport = { name: 'Bole International Airport', address: 'Bole, Addis Ababa', lat: 8.9779, lng: 38.7993, source: 'provider', confirmed: true };

// Local geometry exercises the installed Mapbox renderer/camera without a live
// provider token, account mutation, GPS spoofing in production, or tile service.
const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features });
const roads: unknown[] = [];
const buildings: unknown[] = [];
for (let i = -12; i <= 12; i++) {
  const x = 38.775 + i * .00065, y = 9.008 + i * .00055;
  roads.push({ type: 'Feature', properties: { class: i % 4 ? 'street' : 'primary' }, geometry: { type: 'LineString', coordinates: [[x, 8.99], [x, 9.026]] } });
  roads.push({ type: 'Feature', properties: { class: i % 4 ? 'street' : 'primary' }, geometry: { type: 'LineString', coordinates: [[38.755, y], [38.795, y]] } });
  for (let j = -12; j <= 12; j++) {
    const b = 9.008 + j * .00055;
    buildings.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x + .00012, b + .0001], [x + .0005, b + .0001], [x + .0005, b + .00043], [x + .00012, b + .00043], [x + .00012, b + .0001]]] } });
  }
}
const style = { version: 8, sources: { roads: { type: 'geojson', data: collection(roads) }, buildings: { type: 'geojson', data: collection(buildings) } }, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#edf3f6' } },
  { id: 'building', type: 'fill', source: 'buildings', paint: { 'fill-color': '#dbe5ec' } },
  { id: 'road-simple', type: 'line', source: 'roads', paint: { 'line-color': '#fff', 'line-width': ['match', ['get', 'class'], 'primary', 10, 5] } },
] };

async function home(page: Page, theme: 'light' | 'dark' = 'light', unavailable = false) {
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: riderId, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'synthetic', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eyyvvwecpyctttiueban.supabase.co').hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ theme, session, storageKey }) => {
    localStorage.setItem('nexride:preview-enabled', 'true');
    localStorage.setItem('nexride:onboarding-complete', 'true');
    localStorage.setItem('nexride.rider.aurora-light-v1', '1');
    localStorage.setItem('nexride.rider.theme', theme);
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, { theme, session, storageKey });
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const single = route.request().headers().accept?.includes('object+json');
    const profile = new URL(route.request().url()).pathname.endsWith('/profiles') ? { id: riderId, role: 'rider', account_status: 'active', full_name: 'Biloo Rider', phone: '+251900000000', avatar_path: null } : null;
    return route.fulfill({ json: single ? profile : profile ? [profile] : [] });
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/rider/search' && url.searchParams.has('q')) return route.fulfill({ json: { status: 'ready', results: [airport] } });
    return route.fulfill({ status: 503, json: { status: 'unavailable' } });
  });
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
  await page.route('https://api.mapbox.com/styles/v1/**', route => unavailable ? route.fulfill({ status: 503, json: { message: 'Fixture unavailable' } }) : route.fulfill({ json: style }));
  await page.goto('/');
  await expect(page.locator('.nr-rider-home-panel')).toBeVisible();
  await expect(page.locator('.nr-app')).toHaveAttribute('data-theme', theme);
}

async function insets(page: Page, top = 44, bottom = 24, side = 0) {
  await page.evaluate(({ top, bottom, side }) => {
    for (const [edge, value] of Object.entries({ top, bottom, left: side, right: side })) document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
  }, { top, bottom, side });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Floating Dock fills the map and clears Android system areas in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await home(page, theme);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 740, height: 390 }]) {
      await page.setViewportSize(viewport);
      await insets(page, 44, 24, viewport.width > viewport.height ? 30 : 0);
      await expect(page.getByRole('button', { name: 'Search destination', exact: true })).toBeInViewport();
      const menu = (await page.locator('.biloo-home-floating-header').boundingBox())!;
      const dock = (await page.getByRole('navigation', { name: 'Rider tabs' }).boundingBox())!;
      const card = (await page.locator('.nr-rider-flow-panel').boundingBox())!;
      const map = (await page.locator('.nr-rider-map-surface').boundingBox())!;
      expect(map.x).toBe(0); expect(map.y).toBe(0);
      expect(map.width).toBe(viewport.width); expect(map.height).toBe(viewport.height);
      expect(menu.y).toBeGreaterThanOrEqual(44);
      expect(card.y).toBeGreaterThanOrEqual(menu.y + menu.height);
      expect(card.y + card.height).toBeLessThanOrEqual(dock.y - 9);
      expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height - 24);
      expect(card.x).toBeGreaterThanOrEqual(viewport.width > viewport.height ? 30 : 14);
      await expect(page.getByRole('link', { name: 'Home tab', exact: true })).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await insets(page);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    const close = page.getByRole('dialog', { name: 'Rider menu' }).getByRole('button', { name: 'Close menu' });
    await expect(close).toBeInViewport();
    expect((await close.boundingBox())!.y).toBeGreaterThanOrEqual(44);
    await close.click();
    await page.getByRole('button', { name: 'Expand or collapse ride panel' }).press('End');
    await expect(page.locator('.nr-rider-home-sheet')).toHaveAttribute('data-snap', 'expanded');
    await expect(page.getByRole('navigation', { name: 'Rider tabs' })).toBeInViewport();
    await page.getByRole('button', { name: 'Expand or collapse ride panel' }).press('Home');
    await expect(page.getByRole('button', { name: 'Search destination', exact: true })).toBeInViewport();
    if (process.env.BILOO_RIDER_EVIDENCE_DIR) {
      await page.reload(); await insets(page);
      await expect(page.locator('.nr-rider-map-surface')).toHaveAttribute('data-map-status', 'ready');
      await page.screenshot({ animations: 'disabled', path: `${process.env.BILOO_RIDER_EVIDENCE_DIR}/floating-dock-${theme}.png` });
    }
  });
}

test('Home, Activity and Account use real screens and retain their active tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await insets(page);
  await page.getByRole('link', { name: 'Activity tab', exact: true }).click();
  await expect(page).toHaveURL(/\/rider\/trips$/);
  await expect(page.getByRole('heading', { name: 'Your rides' })).toBeVisible();
  expect((await page.locator('.nr-support-head').boundingBox())!.y).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('link', { name: 'Activity tab', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Account tab', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Account tab', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.nr-rider-home-panel')).toHaveCount(0);
  const header = await page.locator('.nr-topbar').boundingBox();
  expect(header!.height).toBeGreaterThanOrEqual(108);
  await page.getByRole('link', { name: 'Home tab', exact: true }).click();
  await expect(page.locator('.nr-rider-home-panel')).toBeVisible();
});

test('Airport searches the provider and lets the Rider choose the destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await insets(page);
  const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rider/search' && new URL(request.url()).searchParams.get('q') === 'Bole International Airport');
  await page.getByRole('button', { name: 'Airport', exact: true }).click();
  await request;
  const input = page.getByRole('textbox', { name: 'Search destination', exact: true });
  await expect(input).toHaveValue('Bole International Airport');
  await expect(input).toBeFocused();
  expect((await input.boundingBox())!.y).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('navigation', { name: 'Rider tabs' })).toHaveCount(0);
  const result = page.locator('.nr-place-suggestion').filter({ hasText: 'Bole International Airport' }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(input).toHaveValue(/Bole/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set your Home shortcut', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Pickup', exact: true })).toBeFocused();
});

test('real Mapbox rendering keeps GPS above the floating card after recenter and expansion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await insets(page);
  await expect(page.locator('.nr-rider-map-surface')).toHaveAttribute('data-map-status', 'ready');
  const marker = page.locator('.nr-live-location-marker[data-marker-role="rider"]');
  await expect(marker).toBeVisible();
  const assertClear = async () => {
    await expect.poll(async () => {
      const person = (await marker.boundingBox())!;
      const card = (await page.locator('.nr-rider-flow-panel').boundingBox())!;
      const header = (await page.locator('.nr-topbar').boundingBox())!;
      return person.y >= header.y + header.height && person.y + person.height <= card.y - 5;
    }).toBe(true);
  };
  await page.getByRole('button', { name: 'Recenter on my location', exact: true }).click();
  await assertClear();
  await page.getByRole('button', { name: 'Expand or collapse ride panel' }).press('End');
  await expect.poll(async () => {
    const card = (await page.locator('.nr-rider-flow-panel').boundingBox())!;
    const header = (await page.locator('.nr-topbar').boundingBox())!;
    return card.y - header.y - header.height;
  }).toBeGreaterThanOrEqual(99);
  await assertClear();
});

test('failed map leaves destination search and map retry accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page, 'light', true);
  await expect(page.locator('.nr-rider-map-surface')).toHaveAttribute('data-map-status', 'unavailable', { timeout: 20000 });
  await expect(page.locator('.nr-map-unavailable').getByRole('button', { name: 'Try again' })).toBeInViewport();
  await page.getByRole('button', { name: 'Search destination', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search destination', exact: true })).toBeVisible();
});
