import { test, expect, type Page } from '@playwright/test';

// Money is split into three views (Summary / In & out / Savings) behind the
// Lists-style switch, with the view kept in the URL. Each view stays within
// two phone screens, the spending chart hides until there's spending to
// chart, and the search field only appears once a view holds 15 streams.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Views spec';

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
  return prefs.currency as string;
}

async function addStream(page: Page, currency: string, name: string, type: string, amount = 50) {
  const r = await page.request.post('/api/money-streams', {
    data: {
      name: `${PREFIX} ${name}`,
      amount,
      currency,
      stream_type: type,
      frequency: 'monthly',
      is_recurring: true,
    },
  });
  expect(r.ok()).toBeTruthy();
}

test.afterEach(async ({ page }) => {
  const streams: { id: number; name: string }[] = await page.request
    .get('/api/money-streams')
    .then((r) => r.json());
  for (const s of streams.filter((x) => x.name.startsWith(PREFIX)))
    await page.request.delete(`/api/money-streams/${s.id}`);
});

const mainHeight = (page: Page) =>
  page.evaluate(() => document.querySelector('main')!.scrollHeight);

test('Money splits into Summary, In & out and Savings, kept in the URL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const currency = await signIn(page);
  await addStream(page, currency, 'salary', 'income', 3000);
  for (const name of ['rent', 'power', 'phone']) await addStream(page, currency, name, 'expense');
  await addStream(page, currency, 'rainy day', 'savings', 200);

  await page.goto('/money');
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  await expect(tab('Summary')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(`${PREFIX} rent`)).toHaveCount(0);
  expect(await mainHeight(page), 'Summary').toBeLessThan(2 * 844);

  // The spending chart only shows once there's spending in it.
  const spend: { total: number }[] = await page.request
    .get('/api/analytics/monthly-spend?months=6')
    .then((r) => r.json());
  if (spend.every((m) => m.total === 0))
    await expect(page.getByText('Spending trends')).toHaveCount(0);

  await tab('In & out').click();
  await expect(page).toHaveURL(/view=flow/);
  await expect(page.getByText(`${PREFIX} rent`)).toBeVisible();
  await expect(page.getByText(`${PREFIX} salary`)).toBeVisible();
  await expect(page.getByText(`${PREFIX} rainy day`)).toHaveCount(0);
  await expect(page.getByLabel('Search streams')).toHaveCount(0);
  expect(await mainHeight(page), 'In & out').toBeLessThan(2 * 844);

  // A reload keeps the view.
  await page.reload();
  await expect(tab('In & out')).toHaveAttribute('aria-pressed', 'true');

  await tab('Savings').click();
  await expect(page).toHaveURL(/view=savings/);
  await expect(page.getByText('Savings balance')).toBeVisible();
  await expect(page.getByText(`${PREFIX} rainy day`)).toBeVisible();
  await expect(page.getByText(`${PREFIX} rent`)).toHaveCount(0);
  expect(await mainHeight(page), 'Savings').toBeLessThan(2 * 844);
});

test('search appears once a view holds 15 streams', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const currency = await signIn(page);
  const existing: { stream_type: string }[] = await page.request
    .get('/api/money-streams')
    .then((r) => r.json());
  const flow = existing.filter((s) => s.stream_type !== 'savings').length;
  const count = Math.max(15 - flow, 2);
  for (let i = 0; i < count; i++) await addStream(page, currency, `bill ${i}x`, 'expense', 10 + i);

  await page.goto('/money?view=flow');
  const search = page.getByLabel('Search streams');
  await expect(search).toBeVisible();
  await search.fill(`${PREFIX} bill 0x`);
  await expect(page.getByText(`${PREFIX} bill 0x`)).toBeVisible();
  await expect(page.getByText(`${PREFIX} bill 1x`)).toHaveCount(0);
});
