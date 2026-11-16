import { test, expect } from '@playwright/test';

// An installed iPhone PWA runs with viewport-fit=cover and a black-translucent
// status bar, so the page is drawn under the clock/notch and over the home
// indicator. Headless Chromium resolves every env(safe-area-inset-*) to 0, so
// tailwind.config.js routes the insets through --katei-safe-top and
// --katei-safe-bottom, which this spec sets to stand up an iPhone 15-ish frame.
//
// Shares the server with the other specs (workers: 1, no reset), so it signs
// in as the same "Alex" — registering the admin if it happens to run first.

const TOP = 47;
const BOTTOM = 34;

test('header, add button and sheet footer clear a notch and a home indicator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });

  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
  await page.reload();

  await page.addStyleTag({ content: `:root { --katei-safe-top: ${TOP}px; --katei-safe-bottom: ${BOTTOM}px; }` });
  await page.locator('nav a[href="/timeline"]').click();

  // Nothing tappable or readable in the header sits under the status bar.
  const header = page.locator('header').first();
  const headerKids = await header.evaluate((h) =>
    [...h.children].map((c) => c.getBoundingClientRect().top));
  for (const top of headerKids) expect(top, 'header content sits under the status bar').toBeGreaterThanOrEqual(TOP);

  // The add button keeps its resting gap above the nav, which is taller now.
  const fab = page.getByRole('button', { name: 'Add event' });
  const fabBox = (await fab.boundingBox())!;
  const navBox = (await page.locator('nav').last().boundingBox())!;
  expect(navBox.y - (fabBox.y + fabBox.height), 'add button crowds the nav').toBeGreaterThanOrEqual(16);

  // A sheet's last control ends above the home indicator.
  await fab.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(500); // let the slide-up settle
  const submit = dialog.locator('button[type=submit]');
  await submit.scrollIntoViewIfNeeded();
  const submitBox = (await submit.boundingBox())!;
  expect(submitBox.y + submitBox.height, 'sheet button sits on the home indicator')
    .toBeLessThanOrEqual(844 - BOTTOM);
});
