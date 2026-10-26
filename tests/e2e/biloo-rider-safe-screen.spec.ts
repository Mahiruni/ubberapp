import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', video: 'off' });

async function home(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(theme => {
    localStorage.setItem('nexride:preview-enabled', 'true');
    localStorage.setItem('nexride.rider.aurora-light-v1', '1');
    localStorage.setItem('nexride.rider.theme', theme);
  }, theme);
  // Exercise the real UI without writing to an account, booking or payment API.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eff3"/><path d="M0 140 256 80M90 0 160 256" stroke="white" stroke-width="15"/><rect x="15" y="15" width="50" height="45" rx="5" fill="#d4e8dc"/></svg>',
  }));
  await page.goto('/');
  await expect(page.locator('.nr-rider-home-panel')).toBeVisible();
  await expect(page.locator('.nr-app')).toHaveAttribute('data-theme', theme);
}

async function insets(page: Page, top: number, bottom: number, side = 0) {
  await page.evaluate(({ top, bottom, side }) => {
    for (const [edge, value] of Object.entries({ top, bottom, left: side, right: side }))
      document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
  }, { top, bottom, side });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Rider header and booking card respect Android insets in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await home(page, theme);
    await insets(page, 44, 24);
    const header = page.locator('.nr-topbar');
    const menu = page.getByRole('button', { name: 'Open menu', exact: true });
    const panel = page.locator('.nr-rider-flow-panel');
    const search = page.getByRole('button', { name: 'Search destination', exact: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 740, height: 390 }]) {
      await page.setViewportSize(viewport);
      await insets(page, 44, 24, viewport.width > viewport.height ? 30 : 0);
      await expect(menu).toBeInViewport();
      await expect(search).toBeInViewport();
      const head = (await header.boundingBox())!;
      const trigger = (await menu.boundingBox())!;
      const card = (await panel.boundingBox())!;
      const map = (await page.locator('.nr-rider-map-surface').boundingBox())!;
      expect(trigger.y).toBeGreaterThanOrEqual(44);
      expect(map.y).toBeGreaterThanOrEqual(head.y + head.height + 9);
      expect(card.y).toBeGreaterThanOrEqual(head.y + head.height + 12);
      expect(card.y + card.height).toBeLessThanOrEqual(viewport.height - 24);
      expect(card.x).toBeGreaterThanOrEqual(viewport.width > viewport.height ? 30 : 12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await insets(page, 44, 24);
    await expect(page.locator('.nr-rider-persistent-wrapper')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(19, 46, 78)' : 'rgb(255, 255, 255)');
    await expect(search).toHaveCSS('background-color', 'rgb(249, 196, 73)');
    await expect(search.locator('span').first()).toHaveCSS('color', 'rgb(8, 41, 95)');
    await menu.click();
    const drawer = page.getByRole('dialog', { name: 'Rider menu' });
    const close = drawer.getByRole('button', { name: 'Close menu' });
    await expect(close).toBeInViewport();
    expect((await close.boundingBox())!.y).toBeGreaterThanOrEqual(44);
    await close.click();
    const drag = page.getByRole('button', { name: 'Expand or collapse ride panel' });
    await drag.press('End');
    await expect(page.locator('.nr-rider-home-sheet')).toHaveAttribute('data-snap', 'expanded');
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThanOrEqual(140);
    await drag.press('Home');
    await expect(page.locator('.nr-rider-home-sheet')).toHaveAttribute('data-snap', 'collapsed');
    await expect(search).toBeInViewport();
    if (process.env.BILOO_RIDER_EVIDENCE_DIR) {
      await page.reload();
      await expect(page.locator('.nr-rider-home-panel')).toBeVisible();
      await insets(page, 44, 24);
      await expect(search).toHaveCSS('background-color', 'rgb(249, 196, 73)');
      await expect(page.locator('.nr-map-control-stack')).toBeInViewport();
      await page.screenshot({ animations: 'disabled', path: `${process.env.BILOO_RIDER_EVIDENCE_DIR}/biloo-rider-${theme}.png` });
    }
  });
}

test('destination focus stays below the status bar and Safety opens its real route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page, 'light');
  await insets(page, 44, 24);
  await page.getByRole('button', { name: 'Search destination', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search destination', exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  expect((await input.boundingBox())!.y).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Safety center', exact: true }).click();
  await expect(page).toHaveURL(/\/safety\?role=rider$/);
});

test('a failed map keeps retry and map controls above the booking card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page, 'light');
  await insets(page, 44, 24);
  await expect(page.locator('.nr-rider-map-surface')).toHaveAttribute('data-map-status', 'unavailable');
  await expect(page.locator('.nr-map-unavailable').getByRole('button', { name: 'Try again' })).toBeInViewport();
  const style = page.getByRole('button', { name: 'Map style', exact: true });
  await style.click();
  await expect(page.getByRole('menuitemradio', { name: 'Streets', exact: true })).toBeVisible();
  await style.click();
  await page.getByRole('button', { name: 'Search destination', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search destination', exact: true })).toBeVisible();
});
