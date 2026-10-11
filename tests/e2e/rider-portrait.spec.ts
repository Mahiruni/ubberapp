import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const id = '11111111-1111-4111-8111-111111111111';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'rider@example.test',
  app_metadata: {}, user_metadata: { role: 'rider' }, created_at: '2026-01-01T00:00:00Z' };
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString('base64url')}.test`;
const session = { access_token: token, refresh_token: 'test', expires_at: 4102444800,
  expires_in: 3600, token_type: 'bearer', user };

async function fakeProfileBackend(page: Page) {
  let avatar = `${id}/original.jpg`, failNext = true;
  let savedBytes = 0, uploads = 0;
  const currentPicture = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#041c30' } })
    .jpeg().toBuffer();
  // A valid, >5 MB camera-like original should be accepted and compressed.
  const largeOriginal = await sharp({ create: { width: 1800, height: 1800, channels: 3, background: '#00c878' } })
    .png({ compressionLevel: 0 }).toBuffer();
  expect(largeOriginal.length).toBeGreaterThan(5 * 1024 * 1024);

  await page.addInitScript(stored => {
    localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(stored));
    localStorage.setItem('nexride:onboarding-complete', 'true');
  }, session);
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url());
    const one = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
    if (url.pathname.endsWith('/profiles')) {
      if (route.request().method() === 'PATCH') {
        const next = route.request().postDataJSON();
        expect(next).toEqual({ avatar_path: expect.stringMatching(new RegExp(`^${id}/.*[.]jpg$`)) });
        if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { message: 'temporary error' } }); }
        avatar = next.avatar_path;
      }
      const profile = { id, role: 'rider', account_status: 'active', full_name: 'Connected Rider',
        phone: '+251900000000', avatar_path: avatar };
      return route.fulfill({ json: one ? profile : [profile] });
    }
    return route.fulfill({ json: one ? null : [] });
  });
  await page.route('**/storage/v1/**', route => {
    const method = route.request().method();
    if (method === 'POST' && route.request().url().includes('/object/sign/'))
      return route.fulfill({ json: { signedURL: `/object/sign/profile-photos/${avatar}?token=test` } });
    if (method === 'POST' && route.request().url().includes('/object/profile-photos/')) {
      uploads++;
      savedBytes = route.request().postDataBuffer()?.length || 0;
      expect(savedBytes).toBeGreaterThan(0);
      expect(savedBytes).toBeLessThanOrEqual(350 * 1024);
      expect(route.request().headers()['content-type']).toContain('image/jpeg');
      return route.fulfill({ json: { Key: 'photo' } });
    }
    if (method === 'DELETE') return route.fulfill({ json: [] });
    return route.fulfill({ contentType: 'image/jpeg', body: currentPicture });
  });
  await page.routeWebSocket('**/realtime/v1/**', ws => ws.close());
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { status: 'unavailable' } }));
  return { largeOriginal, count: () => uploads, current: () => avatar, size: () => savedBytes };
}

test('Rider crops and zooms >5 MB original to a <=350 KB JPEG and safely retries failed save', async ({ page }) => {
  const api = await fakeProfileBackend(page);
  await page.goto('/?screen=profile');
  const trigger = page.getByRole('button', { name: 'Change profile photo' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Choose a photo to crop, zoom and position');
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'large-original.png', mimeType: 'image/png', buffer: api.largeOriginal,
  });
  await expect(dialog.getByRole('heading', { name: 'Adjust photo' })).toBeVisible();
  const zoom = dialog.getByRole('slider', { name: 'Zoom' });
  await zoom.fill('1.5');
  await dialog.getByRole('slider', { name: 'Move left / right' }).fill('20');
  await dialog.getByRole('slider', { name: 'Move up / down' }).fill('-15');
  await expect(dialog.getByRole('button', { name: 'Save Photo' })).toBeEnabled();
  expect(api.count()).toBe(0); // edit before any network upload
  await dialog.getByRole('button', { name: 'Save Photo' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your previous photo is safe');
  expect(api.current()).toBe(`${id}/original.jpg`);
  expect(api.count()).toBe(1);

  // Editing and prior image remain intact after a failed DB write.
  await expect(zoom).toHaveValue('1.5');
  await dialog.getByRole('button', { name: 'Save Photo' }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.count()).toBe(2);
  expect(api.current()).toMatch(new RegExp(`^${id}/.*[.]jpg$`));
  expect(api.size()).toBeLessThanOrEqual(350 * 1024);
  await expect(page.getByRole('status').filter({ hasText: 'Profile photo saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change profile photo' })).toBeVisible();
});
