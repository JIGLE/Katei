import { test, expect, type Page } from '@playwright/test';

// One end-to-end journey through a fresh household. It must run against a
// fresh database: the first registration becomes the admin account.
//
// Console hygiene: the test fails on page JS exceptions and on CSP
// violations ("Refused to ..."), but not on plain failed-resource noise
// (fonts blocked by an offline CI runner, pre-login 401 probes).

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Refused to/i.test(msg.text())) {
      problems.push(`csp: ${msg.text()}`);
    }
  });
  return problems;
}

test('first-run household journey: register, event, money stream, persistence', async ({ page, request }) => {
  const problems = watchConsole(page);

  await test.step('first-run registration creates the admin', async () => {
    await page.goto('/');
    await page.locator('#name').fill('Alex');
    await page.locator('#password').fill('password123');
    await page.locator('form button[type=submit]').click();
    // Landed in the app: the bottom navigation renders for a session.
    await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  });

  await test.step('switch the household to English so labels are stable', async () => {
    const res = await page.request.put('/api/settings/preferences', {
      data: { country: 'GB', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', language: 'en' },
    });
    expect(res.ok()).toBeTruthy();
    await page.reload();
    await expect(page.locator('nav a[href="/timeline"]')).toBeVisible();
  });

  await test.step('create a plain event from the Timeline', async () => {
    await page.locator('nav a[href="/timeline"]').click();
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.locator('#title').fill('Dentist appointment');
    await page.locator('#target_date').fill('2999-01-15');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByText('Dentist appointment')).toBeVisible();
  });

  await test.step('create an expense stream from Money', async () => {
    await page.locator('nav a[href="/money"]').click();
    await page.getByRole('button', { name: 'Add money stream' }).click();
    await page.getByRole('button', { name: 'Expense', exact: true }).click();
    await page.locator('#name').fill('Rent');
    await page.locator('#amount').fill('900');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByText('Rent', { exact: true })).toBeVisible();
  });

  await test.step('quick-add a shopping item and check it off', async () => {
    await page.locator('nav a[href="/lists"]').click();
    const input = page.getByLabel('Add an item…');
    await input.fill('Milk');
    await input.press('Enter');
    await expect(page.getByText('Milk', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark as bought' }).click();
    // No "In the basket" heading exists anymore — checked items sink to the
    // bottom of their store group in place. The checkbox itself is the source
    // of truth: its accessible name flips once the item is done.
    await expect(page.getByRole('button', { name: 'Put back on the list' })).toBeVisible();
  });

  await test.step('tagging items with different stores groups the list', async () => {
    // Milk (no store) lands in "Anywhere". A second, stored item creates a
    // real second bucket, so both group headers earn their place.
    const input = page.getByLabel('Add an item…');
    await input.fill('Bread');
    await input.press('Enter');
    await page.getByText('Bread', { exact: true }).click();
    await page.locator('#shop_store').fill('Bakery');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Bakery', { exact: true })).toBeVisible();
    await expect(page.getByText('Anywhere', { exact: true })).toBeVisible();
  });

  await test.step('my own wishlist never shows a status, even after adding to it', async () => {
    await page.getByRole('button', { name: 'Gifts', exact: true }).click();
    await expect(page.getByText('My wishlist')).toBeVisible();
    const mine = page.locator('section', { hasText: 'My wishlist' });
    await mine.getByRole('button', { name: 'Add gift' }).click();
    await page.locator('#gift_title').fill('Espresso grinder');
    await page.locator('form').getByRole('button', { name: 'Add a gift' }).click();
    await expect(page.getByText('Espresso grinder')).toBeVisible();
    await expect(mine.getByText(/^(Idea|Reserved|Bought)$/)).toHaveCount(0);
  });

  await test.step('add a gift list for someone outside the household', async () => {
    await page.getByRole('button', { name: 'Add a friend or family member' }).click();
    await page.locator('input[placeholder="Their name"]').fill('Lisa');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('For Lisa')).toBeVisible();
  });

  await test.step('share my wishlist and reach it as an anonymous visitor', async () => {
    const mine = page.locator('section', { hasText: 'My wishlist' });
    await mine.getByText('Share list').click();
    await mine.getByText('Enable link').click();
    const url = (await mine.locator('p.break-all').textContent())?.trim();
    expect(url).toMatch(/\/gift\//);
    const token = url!.split('/gift/')[1];

    // The `request` fixture is a standalone HTTP client sharing none of
    // `page`'s cookies — a plain anonymous visitor's first hit, checked at
    // the API the public page itself calls.
    const res = await request.get(`/api/gift-share/${token}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.list_name).toBe('Alex');
    expect(body.items.some((i: { title: string }) => i.title === 'Espresso grinder')).toBeTruthy();
  });

  await test.step('data survives a full reload (round-trips the database)', async () => {
    await page.reload();
    await page.locator('nav a[href="/timeline"]').click();
    await expect(page.getByText('Dentist appointment')).toBeVisible();
    await page.locator('nav a[href="/money"]').click();
    await expect(page.getByText('Rent', { exact: true })).toBeVisible();
    await page.locator('nav a[href="/lists"]').click();
    await expect(page.getByText('Milk', { exact: true })).toBeVisible();
  });

  await test.step('no page exceptions or CSP violations anywhere in the journey', async () => {
    expect(problems).toEqual([]);
  });
});
