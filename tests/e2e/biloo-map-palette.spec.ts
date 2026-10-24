import { expect, test, type Page } from '@playwright/test';

const driverId = '22222222-2222-4222-8222-222222222222';
const offerId = '44444444-4444-4444-8444-444444444444';
const tripId = '55555555-5555-4555-8555-555555555555';
const trafficTileRequests = new WeakMap<Page, string[]>();

async function mapProviders(page: Page) {
  const polygon = (kind: string, x: number, y: number) => ({ type: 'Feature', properties: { kind, class: kind === 'landuse' ? 'park' : kind }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + .001, y], [x + .001, y + .001], [x, y + .001], [x, y]]] } });
  const style = {
    version: 8,
    sources: { city: { type: 'geojson', data: { type: 'FeatureCollection', features: [
      polygon('landuse', 38.7735, 9.0083), polygon('water', 38.7756, 9.007), polygon('building', 38.7744, 9.0074),
      { type: 'Feature', properties: { kind: 'road', class: 'primary' }, geometry: { type: 'LineString', coordinates: [[38.772, 9.006], [38.778, 9.010]] } },
    ] } } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#f5f6f7' } },
      ...['landuse', 'water', 'building'].map(id => ({ id, type: 'fill', source: 'city', filter: ['==', ['get', 'kind'], id], paint: { 'fill-color': '#ddd' } })),
      { id: 'road-simple', type: 'line', source: 'city', filter: ['==', ['get', 'kind'], 'road'], paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0, 16, 8] } },
    ],
  };
  await page.route('**/api.mapbox.com/**', route => route.fulfill({ json: style }));
  await page.route('**/api.mapbox.com/v4/**', route => route.fulfill({ json: { tilejson: '3.0.0', minzoom: 0, maxzoom: 22, tiles: [`${test.info().project.use.baseURL}/fixture/palette/{z}/{x}/{y}.pbf`], vector_layers: [{ id: 'traffic', fields: {} }] } }));
  await page.route('**/fixture/palette/**', route => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await page.route('**/api.mapbox.com/map-sessions/**', route => route.fulfill({ json: {} }));
  await page.route('**/events.mapbox.com/**', route => route.fulfill({ status: 204 }));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
}

async function authenticatedDriver(page: Page, tripStatus: 'accepted' | 'in_trip' = 'accepted') {
  const user = { id: driverId, aud: 'authenticated', role: 'authenticated', email: 'driver@example.test', app_metadata: {}, user_metadata: { role: 'driver', full_name: 'Biloo Driver' }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: driverId, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await page.addInitScript(({ session }) => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride.driver.theme', 'dark');
    localStorage.setItem('nexride.driver.aurora-light-v1', '1');
  }, { session });
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object+json');
    let row: Record<string, unknown> | null = null;
    if (table === 'profiles') row = { id: driverId, role: 'driver', full_name: 'Biloo Driver', account_status: 'active', phone: '+251912345678' };
    if (table === 'drivers') row = { id: driverId, review_status: 'approved', vehicle: 'Toyota Yaris' };
    if (table === 'ride_request_offers') row = { id: offerId, request_id: tripId, driver_id: driverId, status: 'accepted', pickup_distance_km: 1.1, pickup_eta_minutes: 4 };
    if (table === 'ride_requests') row = { id: tripId, rider_id: '33333333-3333-4333-8333-333333333333', assigned_driver_id: driverId, pickup_location: 'Bole, Addis Ababa', destination_location: 'Mexico Square, Addis Ababa', pickup_lat: 9.008, pickup_lng: 38.775, destination_lat: 9.018, destination_lng: 38.751, ride_category: 'Economy', status: tripStatus, estimated_trip_distance_km: 6.4, estimated_trip_duration_minutes: 20 };
    return route.fulfill({ json: single ? row : row ? [row] : [] });
  });
}

test.beforeEach(async ({ page, context }) => {
  test.skip(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.'), 'The map fixture requires a syntactically valid public Mapbox token.');
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 38.775, latitude: 9.008, accuracy: 8 });
  const requests: string[] = [];
  trafficTileRequests.set(page, requests);
  page.on('request', request => {
    if (request.url().includes('mapbox-traffic-v1')) requests.push(request.url());
  });
  await mapProviders(page);
});

test.afterEach(async ({ page }) => {
  expect(trafficTileRequests.get(page) ?? [], 'Maps must not download the removed traffic tiles').toEqual([]);
});

test('Rider retains Biloo day/night styling and the compact avatar across style reloads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nexride:preview-enabled', 'true'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const map = page.locator('.nr-mapbox-map');
  await expect(map).toHaveAttribute('data-biloo-map-palette', 'biloo-streets-v2', { timeout: 20000 });
  await expect(page.locator('.mapboxgl-marker.biloo-custom-map-avatar')).toHaveCSS('height', '48px');
  await expect(page.getByRole('button', { name: /(?:Show|Hide) live traffic/i })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('biloo-rider-day.png') });
  for (const [label, palette] of [['Dark', 'biloo-dark-v3'], ['Satellite', 'satellite'], ['Streets', 'biloo-streets-v2']]) {
    await page.getByRole('button', { name: 'Map style', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    await expect(map).toHaveAttribute('data-biloo-map-palette', palette);
    await expect(page.locator('.mapboxgl-marker.biloo-custom-map-avatar')).toHaveCSS('height', '48px');
  }
  expect(errors).toEqual([]);
});

test('Driver navigation follows theme and manual layer changes with the correct palette', async ({ page }) => {
  await authenticatedDriver(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/driver/navigation?offer=${offerId}`);
  const map = page.locator('.nr-live-navigation-canvas');
  await expect(map).toHaveAttribute('data-biloo-map-palette', 'biloo-dark-v3', { timeout: 20000 });
  await page.evaluate(() => { localStorage.setItem('nexride.driver.theme', 'light'); window.dispatchEvent(new Event('nexride:appearance-change')); });
  await expect(map).toHaveAttribute('data-biloo-map-palette', 'biloo-streets-v2');
  await expect(page.locator('.nr-nav-stage-primary')).toHaveCSS('background-color', 'rgb(255, 176, 0)');
  await expect(page.locator('.nr-nav-bottom-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  for (const [label, palette] of [['Satellite', 'satellite'], ['Dark', 'biloo-dark-v3'], ['Streets', 'biloo-streets-v2']]) {
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    await expect(map).toHaveAttribute('data-biloo-map-palette', palette);
  }
  await page.screenshot({ path: test.info().outputPath('biloo-driver-day.png') });
  expect(errors).toEqual([]);
});

test('Driver layer labels and selection icons stay compact on narrow phones', async ({ page }) => {
  await authenticatedDriver(page, 'in_trip');
  await page.route('**/api/driver/route', route => route.fulfill({ json: {
    status: 'ready', generatedAt: Date.now(), route: {
      geometry: [[9.008, 38.775], [9.012, 38.766], [9.018, 38.751]],
      distanceMeters: 6400, durationSeconds: 1200,
      traffic: { level: 'severe' },
      segments: [
        { from: [9.008, 38.775], to: [9.012, 38.766], congestion: 'low' },
        { from: [9.012, 38.766], to: [9.018, 38.751], congestion: 'severe' },
      ],
    },
  } }));
  await page.goto(`/driver/navigation?offer=${offerId}`);
  await expect(page.locator('.nr-live-navigation-canvas')).toHaveAttribute('data-biloo-map-palette', 'biloo-dark-v3', { timeout: 20000 });
  await expect(page.locator('.nr-nav-bottom-card')).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await expect(page.locator('.nr-driver-global-header')).toHaveCSS('background-color', 'rgb(24, 24, 24)');
  await expect(page.locator('.nr-driver-menu-trigger>span').first()).toHaveCSS('background-color', 'rgb(242, 242, 242)');
  await expect(page.getByRole('button', { name: 'Complete trip', exact: true })).toHaveCSS('background-color', 'rgb(255, 176, 0)');

  const layers = page.getByRole('button', { name: 'Map layers', exact: true });
  await layers.click();
  const menu = page.getByRole('menu', { name: 'Map style', exact: true });
  await expect(menu).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(0);
  await expect(page.locator('.nr-live-map-status.route')).toHaveCount(0);
  await expect(page.locator('.nr-driver-map-marker.vehicle')).toBeInViewport();
  await expect(page.locator('.nr-driver-map-marker.destination')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('biloo-driver-graphite-menu.png') });
  await page.getByRole('menuitemradio', { name: 'Satellite', exact: true }).click();
  await layers.click();

  // The reported failure stretched the selected SVG to the map's height,
  // leaving only one letter per line for the Satellite label.
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('menuitemradio', { name: 'Satellite', exact: true })).toHaveAttribute('aria-checked', 'true');
    const geometry = await menu.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right,
        rows: Array.from(element.querySelectorAll('button')).map(row => ({
          height: row.getBoundingClientRect().height,
          labelHeight: row.querySelector('span')!.getBoundingClientRect().height,
          iconWidth: row.querySelector('svg')?.getBoundingClientRect().width ?? 0,
          iconHeight: row.querySelector('svg')?.getBoundingClientRect().height ?? 0,
          overflow: row.scrollWidth > row.clientWidth,
        })),
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(8);
    expect(geometry.right).toBeLessThanOrEqual(width - 8);
    for (const row of geometry.rows) {
      expect(row.height).toBeLessThanOrEqual(48);
      expect(row.labelHeight).toBeLessThanOrEqual(24);
      expect(row.iconWidth).toBeLessThanOrEqual(16);
      expect(row.iconHeight).toBeLessThanOrEqual(16);
      expect(row.overflow).toBe(false);
    }
  }
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('biloo-driver-satellite-menu.png') });
});
