import { test, expect, type Page } from '@playwright/test';

// Loading and failure states (BRAND.md §7, Loading and errors): a failed load
// shows one quiet row with "Try again" instead of a raw server message, and
// offline the app still opens each screen on what it last loaded, with a
// one-line note. Signing out drops that offline copy.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Offline spec';

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
}

test.afterEach(async ({ page, context }) => {
  await context.setOffline(false);
  // The offline test ends signed out; sign back in to tidy up.
  await page.request.post('/api/auth/login', { data: { name: 'Alex', password: 'password123' } });
  const items: { id: number; name: string }[] = await page.request
    .get('/api/shopping')
    .then((r) => (r.ok() ? r.json() : []));
  for (const i of items.filter((x) => x.name.startsWith(PREFIX)))
    await page.request.delete(`/api/shopping/${i.id}`);
});

test.describe('a failed load', () => {
  // page.route can't see requests the service worker answers, so this one
  // runs without it.
  test.use({ serviceWorkers: 'block' });

  test('shows one quiet row with "Try again", which loads it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    let fail = true;
    await page.route('**/api/events', (route) =>
      fail ? route.fulfill({ status: 500, body: 'boom' }) : route.continue(),
    );
    await page.goto('/timeline');
    const row = page.getByRole('alert');
    await expect(row).toContainText("Couldn't load this right now.");
    await expect(page.getByText('boom')).toHaveCount(0);
    fail = false;
    await row.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('grid')).toBeVisible();
  });
});

test('offline, Lists still shows what it last loaded, and sign-out drops it', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.request.post('/api/shopping', { data: { name: `${PREFIX} oat milk` } });

  // Let the service worker take over, then load Lists through it once.
  await page.goto('/lists');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText(`${PREFIX} oat milk`)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(`${PREFIX} oat milk`)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText("You're offline")).toHaveCount(0);
  expect(await page.evaluate(() => caches.has('katei-api'))).toBe(true);

  await page
    .locator('header')
    .getByRole('button', { name: /account/i })
    .click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.locator('#name')).toBeVisible();
  expect(await page.evaluate(() => caches.has('katei-api'))).toBe(false);
});
