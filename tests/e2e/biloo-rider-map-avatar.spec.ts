import { expect, test, type Page } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const initial = { preset: 5, skin: 2, hair: 0, outfit: 0 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

async function avatarBackend(page: Page) {
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
  const user = {
    id, aud: 'authenticated', role: 'authenticated', email: 'rider@example.test',
    app_metadata: {}, user_metadata: { role: 'rider', full_name: 'Biloo Rider', biloo_rider_map_avatar: initial },
    created_at: '2026-01-01T00:00:00Z',
  };
  let failWrites = false;
  const writes: unknown[] = [];
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride:preview-enabled', 'true');
    // The retired picker must never override the account-scoped design.
    localStorage.setItem('biloo:rider-avatar', JSON.stringify({ preset: 1, skin: '#9b5f40', hair: '#211a19', outfit: '#123c6b' }));
  }, { session });
  await page.route('**/auth/v1/user*', async route => {
    if (route.request().method() === 'PUT') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      const body = route.request().postDataJSON();
      if (failWrites) return route.fulfill({ status: 400, json: { msg: 'Avatar save unavailable' } });
      writes.push(body);
      Object.assign(user.user_metadata, body.data);
    }
    return route.fulfill({ json: user });
  });
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'rider_map_avatars') return route.fulfill({ status: 404, json: { code: 'PGRST205', message: 'Avatar table not provisioned' } });
    const single = route.request().headers().accept?.includes('object+json');
    const row = name === 'profiles' ? { id, role: 'rider', full_name: 'Biloo Rider', phone: '+251912345678', account_status: 'active', avatar_path: null } : null;
    return route.fulfill({ json: single ? row : row ? [row] : [] });
  });
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname === '/api/rider/profile') return route.fulfill({ json: { status: 'ready' } });
    return route.fulfill({ status: 503, json: { status: 'unavailable' } });
  });
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
  return { writes, fail: () => { failWrites = true; } };
}

async function openStudio(page: Page) {
  await page.goto('/');
  await page.locator('.biloo-home-floating-header .nr-rider-hamburger').click();
  await page.locator('#nr-rider-drawer .biloo-menu-profile-card').click();
  const account = page.locator('.nr-account-standard');
  await expect(account.locator('.biloo-avatar-collection')).toHaveCount(0);
  await account.getByRole('button', { name: /My Map Avatar/ }).click();
  const studio = page.getByRole('region', { name: 'Design your map avatar' });
  await expect(studio.getByRole('button', { name: 'Save my avatar', exact: true })).toBeEnabled();
  return studio;
}

test('20 premium characters use one picker, compact map size and account persistence', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await avatarBackend(page);
  let studio = await openStudio(page);
  await expect(studio.getByRole('button', { name: /^Choose character/ })).toHaveCount(20);
  await expect(studio.getByRole('button', { name: /^Choose character 06/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.getByRole('button', { name: 'Save my avatar', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: test.info().outputPath('avatar-picker.png') });
  const sources = await studio.locator('.biloo-avatar-collection image').evaluateAll(images => images.map(image => image.getAttribute('href')!));
  expect(new Set(sources).size).toBe(20);
  for (const source of sources) expect((await page.request.get(source)).status()).toBe(200);

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const marker = studio.locator('.biloo-custom-map-avatar');
    await expect(marker).toHaveCSS('width', '36px');
    await expect(marker).toHaveCSS('height', '48px');
    await expect(marker.locator('svg')).toHaveCSS('height', '48px');
    expect(await marker.evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await studio.getByRole('button', { name: /^Choose character 20/ }).click();
  await studio.getByRole('button', { name: 'Outfit color: Forest', exact: true }).click();
  await studio.getByRole('button', { name: 'Hair shade: Chestnut', exact: true }).click();
  await studio.locator('.biloo-avatar-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('avatar-customization.png') });
  await studio.getByRole('button', { name: 'Save my avatar', exact: true }).click();
  await expect(studio.getByRole('status')).toHaveText('Avatar saved to your Rider account.');
  expect(backend.writes).toEqual([expect.objectContaining({ data: { biloo_rider_map_avatar: { preset: 19, skin: 2, hair: 2, outfit: 4 } } })]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), `biloo:rider-map-avatar:${id}`)).toEqual({ preset: 19, skin: 2, hair: 2, outfit: 4 });
  await page.reload();
  studio = await openStudio(page);
  await expect(studio.getByRole('button', { name: /^Choose character 20/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.getByRole('button', { name: 'Outfit color: Forest', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the live Mapbox marker stays compact and bottom anchored after zoom and avatar updates', async ({ page, context }) => {
  test.skip(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.'), 'Live marker fixture needs a syntactically valid Mapbox public token.');
  await avatarBackend(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 38.775, latitude: 9.008, accuracy: 8 });
  await page.route('**/api.mapbox.com/**', route => route.fulfill({ json: {
    version: 8,
    sources: { roads: { type: 'geojson', data: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[38.772, 9.006], [38.778, 9.010]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[38.772, 9.010], [38.778, 9.006]] } },
    ] } } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e9efeb' } },
      { id: 'road-street', type: 'line', source: 'roads', paint: { 'line-color': '#ffffff', 'line-width': 12 } },
    ],
  } }));
  await page.route('**/api.mapbox.com/v4/**', route => route.fulfill({ json: {
    tilejson: '3.0.0', minzoom: 0, maxzoom: 22,
    tiles: [`${test.info().project.use.baseURL}/fixture/empty/{z}/{x}/{y}.pbf`],
    vector_layers: [{ id: 'traffic', fields: {} }],
  } }));
  await page.route('**/fixture/empty/**', route => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await page.route('**/api.mapbox.com/map-sessions/**', route => route.fulfill({ json: {} }));
  await page.route('**/events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.goto('/');
  const marker = page.locator('.mapboxgl-marker.biloo-custom-map-avatar');
  await expect(marker).toBeVisible({ timeout: 15000 });
  await expect(marker).toHaveClass(/mapboxgl-marker-anchor-bottom/);
  await expect(marker).toHaveCSS('width', '36px');
  await expect(marker).toHaveCSS('height', '48px');
  await expect(marker.locator('svg')).toHaveAttribute('data-avatar-preset', '5');
  await page.locator('.mapboxgl-canvas').dblclick({ position: { x: 150, y: 180 } });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('biloo:rider-avatar-updated', { detail: { preset: 19, skin: 2, hair: 0, outfit: 0 } })));
  await expect(marker.locator('svg')).toHaveAttribute('data-avatar-preset', '19');
  await expect(marker).toHaveCSS('height', '48px');
  await expect(marker).toHaveClass(/mapboxgl-marker-anchor-bottom/);
  await page.screenshot({ path: test.info().outputPath('compact-live-map.png') });
});

test('failed avatar writes keep the selected design and do not claim success', async ({ page }) => {
  const backend = await avatarBackend(page);
  const studio = await openStudio(page);
  backend.fail();
  await studio.getByRole('button', { name: /^Choose character 02/ }).click();
  await studio.getByRole('button', { name: 'Save my avatar', exact: true }).click();
  await expect(studio.getByRole('alert')).toContainText('Could not save your avatar');
  await expect(studio.getByRole('button', { name: /^Choose character 02/ })).toHaveAttribute('aria-pressed', 'true');
  expect(backend.writes).toHaveLength(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), `biloo:rider-map-avatar:${id}`)).toEqual(initial);
});
