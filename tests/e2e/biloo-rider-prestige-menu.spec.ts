import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', video: 'off' });

async function riderFixture(page: Page, theme: 'light' | 'dark' = 'light') {
  const id = '11111111-1111-4111-8111-111111111111';
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'rider@example.test',
    app_metadata: {}, user_metadata: { role: 'rider', full_name: 'Redwan Nemo' }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'synthetic', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  const storageKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eyyvvwecpyctttiueban.supabase.co').hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ session, storageKey, theme }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
    if (!localStorage.getItem('nexride.rider.theme')) localStorage.setItem('nexride.rider.theme', theme);
    localStorage.setItem('nexride.rider.aurora-light-v1', '1');
    localStorage.setItem('nexride:onboarding-complete', 'true');
  }, { session, storageKey, theme });
  // All backend calls are fixtures; no live account or financial data is written.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/auth/v1/user*', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), table = new URL(request.url()).pathname.split('/').pop();
    const single = request.headers().accept?.includes('object+json');
    const row = table === 'profiles' ? { id, role: 'rider', full_name: 'Redwan Nemo', phone: '+251900000000', avatar_path: null } : null;
    return route.fulfill({ json: single ? row : row ? [row] : [] });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Rider menu' });
  await expect(menu).toBeVisible();
  return menu;
}

for (const theme of ['light', 'dark'] as const) {
  test(`Prestige menu remains reachable on phones, landscape and desktop in ${theme}`, async ({ page }) => {
    await riderFixture(page, theme);
    await page.goto('/rider/trips');
    const menu = await openMenu(page);
    await expect(menu.getByRole('button', { name: 'View my profile' })).toContainText('Redwan Nemo');
    await expect(menu.getByRole('button', { name: /^My Rides/ })).toHaveAttribute('aria-current', 'page');
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await expect(menu).toBeVisible();
      const close = menu.getByRole('button', { name: 'Close menu', exact: true });
      await expect(close).toBeInViewport();
      await expect(menu.getByRole('group', { name: 'Appearance' })).toBeInViewport();
      expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect(await page.getByTestId('rider-menu-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await menu.getByRole('button', { name: /^Drive with Biloo/ }).scrollIntoViewIfNeeded();
      await expect(menu.getByRole('button', { name: /^Drive with Biloo/ })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await menu.getByRole('button', { name: 'View my profile' }).scrollIntoViewIfNeeded();
    if (process.env.RIDER_MENU_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.RIDER_MENU_EVIDENCE_DIR}/prestige-${theme}.png` });
    await menu.getByRole('button', { name: /^Help & Support/ }).click();
    await expect(page).toHaveURL(/\/support\?role=rider$/);
    await expect(page.getByRole('dialog', { name: 'Rider menu' })).toHaveCount(0);
    await openMenu(page);
    await expect(menu.getByRole('button', { name: /^Help & Support/ })).toHaveAttribute('aria-current', 'page');
  });
}

test('appearance follows device changes, persists across routes and leaves Driver preference intact', async ({ page }) => {
  await riderFixture(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rider/trips');
  let menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Dark theme', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.nr-app[data-mode="rider"]')).toHaveAttribute('data-theme', 'dark');
  await menu.getByRole('button', { name: /^Wallet/ }).click();
  await expect(page).toHaveURL(/\/rider\/wallet$/);
  menu = await openMenu(page);
  await expect(menu.getByRole('button', { name: 'Dark theme', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: 'Use device theme', exact: true }).click();
  await expect.poll(() => menu.evaluate(element => element.parentElement?.dataset.theme)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => menu.evaluate(element => element.parentElement?.dataset.theme)).toBe('dark');
  await menu.getByRole('button', { name: 'Light theme', exact: true }).click();
  await page.reload();
  menu = await openMenu(page);
  await expect.poll(() => menu.evaluate(element => element.parentElement?.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('nexride.driver.theme'))).toBeNull();
  await expect(menu.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('button', { name: 'Use device theme', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
});
