import { test, expect } from '@playwright/test';

// Settings in plain words: the country sets currency, date and number format
// and timezone together, and the sheet shows them as one readable line
// ("Euro (€) · German (Germany) · Berlin time") instead of codes, with a
// "Change" link to the individual fields.
//
// Shares the server with the other specs (workers: 1, no reset); it restores
// the household preferences it changes.

test('picking a country sets currency, format and timezone in one go', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });

  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  try {
    await page.request.put('/api/settings/preferences', {
      data: {
        ...prefs,
        language: 'en',
        country: 'GB',
        currency: 'GBP',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    });
    await page.reload();

    await page
      .locator('header')
      .getByRole('button', { name: /account/i })
      .click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    const summary = sheet.locator('[data-region-summary]');
    await expect(summary).toContainText('£');
    await expect(summary).toContainText('London time');
    // No raw codes on the summary line.
    await expect(summary).not.toContainText('GBP');
    await expect(summary).not.toContainText('en-GB');

    await sheet.locator('#country').selectOption('DE');
    await expect(summary).toContainText('€');
    await expect(summary).toContainText('German (Germany)');
    await expect(summary).toContainText('Berlin time');
    // The individual fields stay folded away until asked for.
    await expect(sheet.locator('#pref_currency')).toHaveCount(0);

    await sheet.getByRole('button', { name: 'Save preferences' }).click();
    await expect
      .poll(async () => {
        const p = await page.request.get('/api/settings/preferences').then((r) => r.json());
        return [p.currency, p.locale, p.timezone];
      })
      .toEqual(['EUR', 'de-DE', 'Europe/Berlin']);

    // "Change" opens the fields, now in plain words too.
    await sheet.getByRole('button', { name: 'Change' }).click();
    await expect(sheet.locator('#pref_currency option:checked')).toContainText('€');
    await expect(sheet.getByText('Date and number format')).toBeVisible();
  } finally {
    await page.request.put('/api/settings/preferences', { data: prefs });
  }
});
