import { test, expect, type Page } from '@playwright/test';

// Date fields read in the household's format, not the browser's: with a
// German household format and an English UI, a picked date shows as
// "Do., 3. Dezember 2026", not "12/03/2026".
//
// Shares the server with the other specs (workers: 1, no reset); it puts the
// preferences back as it found them.

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
}

test('the new-event date shows in the household format', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  try {
    await page.request.put('/api/settings/preferences', {
      data: { ...prefs, language: 'en', locale: 'de-DE' },
    });
    await page.goto('/timeline');
    await page.getByRole('button', { name: 'Add event' }).click();
    const dialog = page.getByRole('dialog');
    const display = dialog.locator('[data-date-display]');
    await expect(display).toHaveText('Pick a date');

    await dialog.locator('#target_date').fill('2026-12-03');
    await expect(display).toContainText('3. Dezember 2026');
    await expect(display).not.toContainText('12/03/2026');
    // The label still names the real input for screen readers.
    await expect(dialog.getByLabel('Date')).toHaveValue('2026-12-03');
  } finally {
    await page.request.put('/api/settings/preferences', { data: prefs });
  }
});
