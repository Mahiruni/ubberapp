import { test, expect, type Page } from '@playwright/test';
import { translate } from '../../lib/nexride-i18n';
import type { MatchSnapshot } from '../../lib/nexride-matching';
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/><path d="M0 140 256 80M90 0 160 256" stroke="white" stroke-width="15"/></svg>`;
const state = (status: MatchSnapshot['status'] = 'searching', version = 1): MatchSnapshot => ({ requestId: 'booking-1', version, status, cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null }, canRetry: status === 'no_drivers', canChangeCategory: ['no_drivers', 'cancelled'].includes(status) });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nexride:preview-enabled', 'true'));
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/svg+xml', body: tile }));
  await page.route('**/api/rider/route', r => {
    const { pickup, destination } = r.request().postDataJSON();
    return r.fulfill({ json: { status: 'ready', coverage: { kind: 'preview' }, route: { provider: 'mapbox', durationSeconds: 720, distanceMeters: 4300, geometry: [[pickup.lat, pickup.lng], [destination.lat, destination.lng]] } } });
  });
});
async function openRides(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Bole International Airport/ }).click();
  await page.getByLabel('Pickup location', { exact: true }).fill('Bole Atlas');
  await page.locator('.nr-place-suggestion').first().click();
  await page.getByRole('button', { name: 'Continue to ride options', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a ride' })).toBeVisible();
}
async function liveQuotes(page: Page) {
  await page.route('**/api/rider/fares', r => r.fulfill({ json: { source: 'service', revision: 'r1', expiresAt: new Date(Date.now() + 300000).toISOString(), chargesComplete: true, offers: ['economy', 'comfort', 'xl'].map(category => ({ id: `quote-${category}`, category, seats: 4, availability: 'available', pickupMinutes: null, amount: 145, currency: 'ETB', priceType: 'estimate', charges: [{ name: 'Service fee', amount: 35 }] })) } }));
}
async function submit(page: Page) {
  await openRides(page);
  await page.getByRole('button', { name: /^Request Ride/ }).click();
  await page.getByRole('button', { name: 'Confirm ride request', exact: true }).click();
  await expect(page.locator('.nr-driver-matching')).toBeVisible();
}
const reconnect = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')));
test('preview waits for an explicit action, preserves map/summary, and provides state recovery', async ({ page }) => {
  await openRides(page);
  await page.getByRole('button', { name: /Preview this ride/ }).click();
  await expect(page.getByRole('heading', { name: 'Finding your driver…' })).toBeVisible();
  await expect(page.getByText('We’ll let you know when a driver accepts.')).toBeVisible();
  await expect(page.locator('.nr-match-summary')).toContainText('Bole Atlas');
  await expect(page.locator('.nr-match-summary')).toContainText('Economy');
  await expect(page.locator('.nr-provider-route')).toHaveCount(1);
  await expect(page.locator('.nr-pickup-search-area')).toHaveCount(1);
  // Longer than the removed 1.6s auto-assignment timer.
  await page.waitForTimeout(1900);
  await expect(page.getByRole('heading', { name: 'Meet your driver' })).not.toBeVisible();
  const rects = await page.locator('.nr-rider-map-surface, .nr-driver-matching').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
  expect(rects[0].right <= rects[1].x || rects[0].bottom <= rects[1].y).toBe(true);
  await page.getByText('Preview matching states', { exact: true }).click();
  await page.getByRole('button', { name: 'Still finding your driver…', exact: true }).click();
  await expect(page.locator('.nr-driver-matching')).toHaveAttribute('data-matching-state', 'delayed');
  await page.getByRole('button', { name: 'No drivers available', exact: true }).click();
  await expect(page.locator('.nr-pickup-search-area')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try matching again', exact: true }).click();
  await expect(page.locator('.nr-driver-matching')).toHaveAttribute('data-matching-state', 'searching');
  await page.getByRole('button', { name: 'Connection lost', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel preview', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request cancelled' })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Change ride category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a ride' })).toBeVisible();
});
test('reduced motion stops pulse animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRides(page);
  await page.getByRole('button', { name: /Preview this ride/ }).click();
  await expect(page.locator('.nr-search-area-pulse')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.nr-matching-symbol')).toHaveCSS('animation-name', 'none');

});
test('a request receipt does not assign a driver; reconnection reads the same booking', async ({ page }) => {
  await liveQuotes(page);
  let creates = 0, broken = false, reads = 0;
  let current = state();
  await page.route('**/api/rider/requests', r => { creates++; return r.fulfill({ json: { status: 'accepted', requestId: 'booking-1' } }); });
  await page.route('**/api/rider/requests/booking-1', r => { reads++; return r.fulfill(broken ? { status: 503, json: { status: 'unavailable' } } : { json: current }); });
  await submit(page);
  await expect(page.getByRole('heading', { name: 'Finding your driver…' })).toBeVisible();
  await expect(page.locator('.nr-confirmed-driver')).toHaveCount(0);
  broken = true; await reconnect(page);
  await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel ride', exact: true })).toBeDisabled();
  broken = false; current = state('delayed', 2);
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Still finding your driver…' })).toBeVisible();
  current = { ...state('assigned', 3), driver: { name: 'Provider Driver', vehicle: 'Toyota Corolla', plate: 'AA-123', pickupMinutes: null } };
  await reconnect(page);
  await expect(page.getByRole('heading', { name: 'Meet your driver' })).toBeFocused();
  await expect(page.locator('.nr-confirmed-driver')).toContainText('Provider Driver');
  await expect(page.locator('.nr-confirmed-driver')).toContainText('AA-123');
  await expect(page.locator('.nr-pickup-search-area')).toHaveCount(0);
  await expect(page.locator('.nr-provider-route')).toHaveCount(1);
  current = state('searching', 4); await reconnect(page);
  await expect(page.getByRole('heading', { name: 'Meet your driver' })).toBeVisible();
  expect(creates).toBe(1); expect(reads).toBeGreaterThan(2);
});
test('cancellation consequence is confirmed and waits for the authoritative cancelled snapshot', async ({ page }) => {
  await liveQuotes(page);
  let current = state(), actions = 0;
  current.cancellation = { allowed: true, requiresConfirmation: true, fee: 50, reason: 'Provider cancellation rule' };
  await page.route('**/api/rider/requests', r => r.fulfill({ json: { status: 'accepted', requestId: 'booking-1' } }));
  await page.route('**/api/rider/requests/booking-1', async r => {
    if (r.request().method() === 'POST') {
      actions++; expect(r.request().postDataJSON()).toEqual({ action: 'cancel', expectedVersion: 1 });
      expect(r.request().headers()['idempotency-key']).toBe('booking-1:1:cancel');
      await new Promise(resolve => setTimeout(resolve, 400));
      current = state('cancelled', 2);
    }
    return r.fulfill({ json: current });
  });
  await submit(page);
  await expect(page.locator('.nr-match-summary')).toContainText('180 ETB');
  await page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Cancellation fee');
  await expect(page.getByRole('dialog')).toContainText('Provider cancellation rule');
  await page.getByRole('button', { name: 'No, Keep Ride' }).click();
  expect(actions).toBe(0);
  await page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Cancel Ride' }).click();
  await expect(page.getByRole('button', { name: 'Updating request…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Request cancelled' })).toBeVisible();
  expect(actions).toBe(1);
});
test('driver acceptance during cancellation wins the race without inventing cancellation', async ({ page }) => {
  await liveQuotes(page);
  let current = state();
  await page.route('**/api/rider/requests', r => r.fulfill({ json: { status: 'accepted', requestId: 'booking-1' } }));
  await page.route('**/api/rider/requests/booking-1', r => {
    if (r.request().method() === 'POST') {
      current = { ...state('assigned', 2), driver: { name: 'Actual Driver', vehicle: 'Sedan', plate: 'ABC', pickupMinutes: 3 } };
      return r.fulfill({ status: 409, json: current });
    }
    return r.fulfill({ json: current });
  });
  await submit(page);
  await page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meet your driver' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request cancelled' })).not.toBeVisible();
  await expect(page.locator('.nr-confirmed-driver')).toContainText('Actual Driver');
});
test('malformed acceptance cannot show a driver and unknown cancellation cannot create a replacement', async ({ page }) => {
  await liveQuotes(page);
  let current: unknown = state(), broken = false, creates = 0;
  await page.route('**/api/rider/requests', r => { creates++; return r.fulfill({ json: { status: 'accepted', requestId: 'booking-1' } }); });
  await page.route('**/api/rider/requests/booking-1', r => {
    if (r.request().method() === 'POST') { broken = true; return r.fulfill({ status: 503, json: {} }); }
    return r.fulfill(broken ? { status: 503, json: {} } : { json: current });
  });
  await submit(page);
  current = state('assigned', 2); await reconnect(page);
  await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible();
  await expect(page.locator('.nr-confirmed-driver')).toHaveCount(0);
  current = state('searching', 2); await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finding your driver…' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request cancelled' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Change ride category', exact: true })).not.toBeVisible();
  expect(creates).toBe(1);
});

test('Amharic matching uses the shared translations and keeps Ethiopian place labels', async ({ page }) => {
  const t = (key: Parameters<typeof translate>[1]) => translate('am', key);
  await page.addInitScript(() => localStorage.setItem('nexride:language', 'am'));
  await page.goto('/');
  await page.locator('.nr-home-destinations button').first().click();
  await page.getByLabel(t('editPickup'), { exact: true }).fill('Bole Atlas');
  await page.locator('.nr-place-suggestion').first().click();
  await page.getByRole('button', { name: t('continueRideOptions'), exact: true }).click();
  await page.getByRole('button', { name: t('previewRide'), exact: true }).click();
  await expect(page.getByRole('heading', { name: t('finding'), exact: true })).toBeVisible();
  await expect(page.getByText(t('matchingNote'), { exact: true })).toBeVisible();
  await expect(page.locator('.nr-match-summary')).toContainText('ቦሌ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('provider retry keeps the original request and category changes follow server eligibility', async ({ page }) => {
  await liveQuotes(page);
  let current = state('no_drivers'), creates = 0, retries = 0;
  current.canChangeCategory = false;
  await page.route('**/api/rider/requests', r => { creates++; return r.fulfill({ json: { status: 'accepted', requestId: 'booking-1' } }); });
  await page.route('**/api/rider/requests/booking-1', r => {
    if (r.request().method() === 'POST') {
      retries++;
      expect(r.request().postDataJSON()).toEqual({ action: 'retry', expectedVersion: 1 });
      current = state('searching', 2);
    }
    return r.fulfill({ json: current });
  });
  await submit(page);
  await expect(page.getByRole('heading', { name: 'No drivers available' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change ride category', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Try matching again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finding your driver…' })).toBeVisible();
  await expect(page.locator('.nr-pickup-search-area')).toHaveCount(1);
  expect(creates).toBe(1); expect(retries).toBe(1);
});
