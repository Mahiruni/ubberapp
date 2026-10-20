import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'off' });
const id = '22222222-2222-4222-8222-222222222222';

async function connectedAccount(page: Page, role: 'rider' | 'driver') {
  const user = { id, aud: 'authenticated', role: 'authenticated', email: `${role}@example.test`, app_metadata: {}, user_metadata: { role, full_name: 'Connected Account' }, created_at: '2026-01-01T00:00:00Z' };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
  const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  let name = 'Connected Account', failSave = true, signupCalls = 0, activeRole = role;
  await page.addInitScript(session => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session));
    localStorage.setItem('nexride:onboarding-complete', 'true');
  }, session);
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() === 'PUT') Object.assign(user.user_metadata, route.request().postDataJSON().data || {});
    return route.fulfill({ json: user });
  });
  await page.route('**/auth/v1/signup*', route => { signupCalls++; return route.fulfill({ status: 500, json: {} }); });
  await page.route('**/api/rider/profile', route => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  // Playwright matches the most recently registered route first.
  await page.route('**/api/rider/profile', route => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/rest/v1/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const object = route.request().headers().accept?.includes('object+json');
    const one = (value: unknown) => route.fulfill({ json: object ? value : value ? [value] : [] });
    if (table === 'profiles') {
      if (route.request().method() === 'PATCH') {
        expect(route.request().postDataJSON()).toEqual({ full_name: 'Updated Account' });
        if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { message: 'technical_database_error' } }); }
        name = 'Updated Account';
      }
      return one({ id, role: activeRole, full_name: name, account_status: 'active', phone: '+251912345678', avatar_path: null });
    }
    if (table === 'drivers') return one({ id, review_status: 'pending', is_online: false, vehicle: 'Toyota Yaris', vehicle_color: 'Silver', vehicle_plate: 'REAL-123', rating: null });
    if (table === 'account_begin_driver_application') { activeRole = 'driver'; return route.fulfill({ json: 'ready' }); }
    if (table === 'account_activate_rider_role') return route.fulfill({ json: 'ready' });
    return route.fulfill({ json: object ? null : [], headers: { 'content-range': '0-0/0' } });
  });
  await page.routeWebSocket('**/realtime/v1/**', ws => ws.close());
  return { signupCalls: () => signupCalls };
}

const verifyBilooBrand = async (page: Page) => {
  await expect(page.locator('.nr-brand').first()).toContainText(/biloo/i);
  await expect(page.locator('.nr-brand').first().locator('img.nr-brand-symbol')).toHaveCount(1);
};

test('welcome actions fit small phones and use the current Biloo campaigns', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/rider');
  await expect(page.locator('.biloo-rider-brand')).toContainText(/biloo/i);
  await expect(page.locator('.biloo-rider-brand img')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Your Ride\s*is Here/i);
  await expect(page.getByRole('link', { name: /Get started/i }).first()).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Already have an account?' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/biloo-rider-welcome-${info.project.name}.png`, fullPage: true });

  await page.goto('/driver');
  await expect(page.locator('.biloo-driver-welcome__photo')).toBeVisible();
  await expect(page.getByRole('link', { name: /Get Started/i })).toHaveAttribute('href', '/driver/onboarding');
  await expect(page.getByRole('link', { name: 'Sign In', exact: true })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/biloo-driver-welcome-${info.project.name}.png`, fullPage: true });
});
test('both sign-in forms preserve email, reveal passwords and recover from real server failures', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  let requests = 0;
  await page.route('**/auth/v1/token*', route => {
    requests++;
    return route.fulfill({ status: requests % 2 ? 400 : 503, json: { code: requests % 2 ? 'invalid_credentials' : 'unexpected_failure', message: 'technical_auth_error_DO_NOT_DISPLAY' } });
  });
  for (const path of ['/rider/sign-in', '/driver/auth']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await verifyBilooBrand(page);
    const email = page.getByLabel('Email address', { exact: true }), password = page.getByLabel('Password', { exact: true });
    await email.fill('person@example.test');
    await password.fill('private-password');
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('main [role=alert]')).toBeVisible();
    await expect(page.locator('main [role=alert]')).not.toContainText('technical_auth_error');
    await expect(email).toHaveValue('person@example.test');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/nexride-${path.includes('driver') ? 'driver' : 'rider'}-signin-${info.project.name}.png`, fullPage: true });
  }
});

test('registration and recovery are localized, match confirmation links and preserve validation failures', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.route('**/auth/v1/signup*', route => route.fulfill({ status: 422, json: { code: 'user_already_exists', message: 'technical_database_conflict' } }));
  await page.goto('/rider/sign-up');
  await page.getByLabel('Full name', { exact: true }).fill('Example Account');
  await page.getByLabel('Phone number', { exact: true }).fill('+251912345678');
  await page.getByLabel('Email address', { exact: true }).fill('existing@example.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('strong-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('strong-password');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(page.locator('main [role=alert]')).not.toContainText('technical_database');
  await expect(page.locator('.nr-signup-summary')).toContainText('existing@example.test');
  await page.getByRole('button', { name: 'Edit your details', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('existing@example.test');
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/explore/terms');
  await page.goto('/rider/verify-email?role=driver&purpose=recovery');
  await expect(page.getByText('Open the password-reset link in your email to choose a new password.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email verification code', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Reset password');
  await page.screenshot({ path: `/tmp/nexride-recovery-am-${info.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
});

test('Driver account uses real details, saves confirmed edits and persists Light, Dark and System', async ({ page }, info) => {
  await connectedAccount(page, 'driver');
  await page.goto('/driver/profile');
  await expect(page.getByRole('heading', { name: 'Connected Account', exact: true })).toBeVisible();
  await expect(page.locator('.nr-driver-profile-v2')).toContainText('Toyota Yaris · Silver');
  await expect(page.locator('.nr-driver-profile-v2')).toContainText('REAL-123');
  await expect(page.locator('.nr-driver-verification-pill.pending')).toContainText('Verification under review');
  // Fresh installs and accounts migrated from forced black now start in Light.
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.nr-driver-profile-section').first()).toBeVisible();
  await expect(page.locator('.nr-profile-metric').first()).toBeVisible();
  await expect(page.locator('.nr-driver-profile-row-copy strong').first()).toBeVisible();
  await page.screenshot({ path: `/tmp/nexride-driver-account-${info.project.name}.png`, fullPage: true });
  await page.goto('/driver/profile/settings');
  await expect(page.locator('.nr-settings-group-heading button')).toHaveCount(5);
  await expect(page.locator('.nr-settings-group-heading button[aria-expanded=false]')).toHaveCount(5);
  await page.getByRole('button', { name: /^Account Personal details/ }).click();
  const name = page.getByLabel('Full name', { exact: true });
  await name.fill('Updated Account');
  await page.getByRole('button', { name: /^Notifications Ride alerts/ }).click();
  await expect(name).toBeHidden();
  await page.getByRole('button', { name: /^Account Personal details/ }).click();
  await expect(name).toHaveValue('Updated Account');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('We couldn’t save your changes');
  await expect(name).toHaveValue('Updated Account');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('main [role=status]')).toContainText('Profile updated.');
  await page.getByRole('button', { name: /^Language & Appearance/ }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /^Account Personal details/ }).click();
  await expect(name).toHaveValue('Updated Account');
  await page.getByRole('button', { name: /^Language & Appearance/ }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('.nr-driver-app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `/tmp/nexride-driver-settings-${info.project.name}.png`, fullPage: true });
});

test('Driver menu traps focus, closes with Escape and backdrop, and restores its trigger', async ({ page }) => {
  await connectedAccount(page, 'driver');
  await page.goto('/driver/profile');
  const trigger = page.getByRole('button', { name: 'Open driver menu', exact: true });
  await trigger.click();
  const menu = page.locator('.nr-driver-menu-panel');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Connected Account');
  const focusable = menu.locator('button:not([disabled]),a[href]');
  await focusable.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(focusable.first()).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('.nr-driver-menu-backdrop').click({ position: { x: page.viewportSize()!.width - 5, y: 120 } });
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Connected Account', exact: true })).toBeVisible();
});

test('existing Rider enters Driver onboarding with the same account and never creates a second identity', async ({ page }) => {
  const backend = await connectedAccount(page, 'rider');
  await page.goto('/driver/onboarding');
  await expect(page.getByRole('heading', { name: 'Apply to Drive', exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('rider@example.test');
  await page.getByLabel('Vehicle model', { exact: true }).fill('Toyota Yaris');
  await page.getByLabel('Vehicle color', { exact: true }).selectOption('Silver');
  await page.getByLabel('Plate number', { exact: true }).fill('REAL-123');
  await page.getByRole('button', { name: 'Continue verification', exact: true }).click();
  await expect(page).toHaveURL(/\/driver\/verification$/);
  expect(backend.signupCalls()).toBe(0);
});

test('Rider settings persist, and its menu protects focus and the current screen', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('nexride:preview-enabled', 'true');
    localStorage.setItem('nexride:onboarding-complete', 'true');
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok: unknown, fail: (error: { code: number }) => void) => fail({ code: 1 }) } });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  await page.goto('/?screen=profile');
  await expect(page.locator('.nr-account-standard')).toBeVisible();
  await page.locator('.nr-account-standard').getByRole('button', { name: /Appearance, language & alerts/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog.locator('.nr-settings-group-heading button')).toHaveCount(5);
  await expect(dialog.locator('.nr-settings-group-heading button[aria-expanded=false]')).toHaveCount(5);
  await dialog.getByRole('button', { name: /^Language & Appearance/ }).click();
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(dialog.locator('.nr-appearance-control button').first()).toHaveCSS('white-space', 'nowrap');
  await expect(page.locator('main.nr-app').first()).toHaveAttribute('data-theme', 'dark');
  await dialog.getByRole('button', { name: /^Notifications Trip alerts/ }).click();
  await expect(dialog.getByRole('button', { name: 'Dark', exact: true })).toBeHidden();
  await dialog.getByRole('switch', { name: /^In-app trip alerts/ }).uncheck();
  expect(await page.evaluate(() => localStorage.getItem('nexride:trip-alerts'))).toBe('off');
  await page.screenshot({ path: `/tmp/nexride-rider-settings-${info.project.name}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  // Desktop uses the persistent navigation rail; the drawer serves the
  // narrow layout. Changing size must retain account settings and state.
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: 'Rider menu', exact: true });
  await expect(menu.getByRole('button', { name: /^Account/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^Settings/ })).toBeVisible();
  const items = menu.locator('button:not([disabled]),a[href]');
  await items.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.nr-account-standard')).toBeVisible();
  await page.reload();
  await expect(page.locator('main.nr-app').first()).toHaveAttribute('data-theme', 'dark');
  await page.locator('.nr-account-standard').getByRole('button', { name: /Appearance, language & alerts/ }).click();
  await dialog.getByRole('button', { name: /^Notifications Trip alerts/ }).click();
  await expect(page.getByRole('switch', { name: /^In-app trip alerts/ })).not.toBeChecked();
});

test('startup does not confuse a failed authenticated profile lookup with being signed out', async ({ page }) => {
  await connectedAccount(page, 'driver');
  let unavailable = true;
  await page.route('**/rest/v1/profiles*', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'database_unavailable' } })
    : route.fulfill({ json: { id, role: 'driver', full_name: 'Connected Account', account_status: 'active', phone: '+251912345678' } }));
  await page.goto('/driver');
  await expect(page.locator('.nr-splash-error')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start driving', exact: true })).toHaveCount(0);
  await expect(page.locator('.nr-splash-wordmark')).toHaveText('Biloo');
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
});

test('account security retries a failed load without losing the identity and translates its controls', async ({ page }) => {
  await connectedAccount(page, 'driver');
  let unavailable = true;
  await page.route('**/rest/v1/profiles*', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'technical_database_error' } })
    : route.fulfill({ json: { id, role: 'driver', full_name: 'Connected Account', account_status: 'active', phone: '+251912345678' } }));
  await page.goto('/account/manage');
  await expect(page.locator('main [role=alert]')).toContainText('Unable to load account details');
  await expect(page).toHaveURL(/\/account\/manage$/);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connected Account', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('New password', { exact: true }).fill('private-password');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text');
  await page.evaluate(() => {
    localStorage.setItem('nexride:language', 'am');
    window.dispatchEvent(new CustomEvent('nexride:language-change', { detail: 'am' }));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('መለያን');
  await expect(page.getByRole('option', { name: 'የፋይዳ ብሔራዊ መታወቂያ', exact: true })).toHaveCount(1);
});

test('entry layouts remain usable on desktop, tablet, short screens and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 320, height: 420 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/rider/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await page.getByLabel('Email address', { exact: true }).fill('person@example.test');
    await page.getByLabel('Password', { exact: true }).fill('private-password');
    const submit = page.getByRole('button', { name: 'Sign in', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 1280) await page.screenshot({ path: `/tmp/nexride-auth-desktop-${info.project.name}.png`, fullPage: true });
  }
});


test("Biloo Rider Account and Help are direct menu links with navigation and pinned logout", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
    localStorage.setItem("nexride:onboarding-complete", "true");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Rider menu", exact: true });
  await expect(menu.getByText("OVERVIEW", { exact: true })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Account and settings" }).getByRole("button", { name: /^Account/ })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Account and settings" }).getByRole("button", { name: /^Settings/ })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Help and safety" }).getByRole("button", { name: /^Safety/ })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Help and safety" }).getByRole("button", { name: /^Support/ })).toBeVisible();
  await expect(menu.locator(".nr-menu-group-toggle")).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Log out" })).toBeInViewport();
  await expect(menu.locator(".nr-menu-scroll")).toHaveCSS("overflow-y", "auto");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("EliteTrade-inspired Driver groups show management links without hiding logout", async ({ page }) => {
  await connectedAccount(page, "driver");
  await page.goto("/driver/profile");
  const trigger = page.getByRole("button", { name: "Open driver menu", exact: true });
  await trigger.click();
  const panel = page.locator(".nr-driver-menu-panel");
  await expect(panel.getByText("OVERVIEW", { exact: true })).toBeVisible();
  await expect(panel.getByRole("navigation", { name: "Account and settings" }).locator(".nr-driver-menu-row").filter({ hasText: /^Account/ })).toBeVisible();
  await expect(panel.getByRole("navigation", { name: "Help and safety" }).getByRole("link", { name: /^Help & Support/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /ACCOUNT & HELP/ })).toHaveCount(0);
  const management = panel.getByRole("button", { name: /DRIVER MANAGEMENT/ });
  await expect(management).toHaveAttribute("aria-expanded", "false");
  await management.click();
  await expect(management).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("link", { name: "Documents & verification" })).toBeVisible();
  await expect(panel.locator(".nr-driver-menu-nav .nr-driver-menu-row[data-active=true]")).toHaveAttribute("aria-current", "page");
  await expect(panel.getByRole("button", { name: "Log out" })).toBeInViewport();
  await expect(panel.locator(".nr-menu-scroll")).toHaveCSS("overflow-y", "auto");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
