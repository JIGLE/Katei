import { test, expect, type Page } from '@playwright/test';

// Two floating controls used to cover the content they sit over:
// - the add button parked on top of right-aligned amounts and pills;
// - the shopping list's add field, sticky inside <main>, stopped 128px above
//   the screen edge on a 360×740 phone, floating mid-list with rows visible
//   beneath it.
// Shares the server with the other specs (workers: 1, no reset), signing in
// as the same "Alex".

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
}

// Leave the shared database as found: the smoke journey counts shopping rows.
async function cleanup(page: Page, prefix: string) {
  const items: { id: number; name: string }[] = await page.request
    .get('/api/shopping')
    .then((r) => r.json());
  for (const i of items.filter((x) => x.name.startsWith(prefix)))
    await page.request.delete(`/api/shopping/${i.id}`);
  const events: { id: number; title: string }[] = await page.request
    .get('/api/events')
    .then((r) => r.json());
  for (const e of events.filter((x) => x.title.startsWith(prefix)))
    await page.request.delete(`/api/events/${e.id}`);
}

// Runs even when an assertion fails, so one failure can't cascade into the
// smoke journey's shopping-row count.
test.afterEach(async ({ page }) => {
  await cleanup(page, 'Dock spec');
  await cleanup(page, 'Fab spec');
});

const scrollMain = (page: Page, y: number) =>
  page.evaluate((py) => document.querySelector('main')!.scrollTo(0, py), y);

test('the shopping add field docks flush on the nav and never covers a row', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  for (let i = 1; i <= 14; i++) {
    const r = await page.request.post('/api/shopping', { data: { name: `Dock spec item ${i}` } });
    expect(r.ok()).toBeTruthy();
  }
  await page.reload();
  await page.locator('nav a[href="/lists"]').click();
  const input = page.getByRole('textbox', { name: /Add an item/ });
  await expect(input).toBeVisible();

  const bar = input.locator('xpath=ancestor::form[1]');
  const nav = page.locator('nav').last();

  for (const y of [0, 300, 99_999]) {
    await scrollMain(page, y);
    await page.waitForTimeout(150);
    const barBox = (await bar.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(
      Math.abs(barBox.y + barBox.height - navBox.y),
      `bar is not flush on the nav at scroll ${y}`,
    ).toBeLessThanOrEqual(1);
  }

  // At the end of the list, the last row ends above the bar.
  const lastRow = page.locator('[data-shopping-id]').last();
  const rowBox = (await lastRow.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(rowBox.y + rowBox.height, 'last row is hidden behind the add bar').toBeLessThanOrEqual(
    barBox.y,
  );

  // Adding brings the new row into view above the bar.
  await scrollMain(page, 0);
  await input.fill('Dock spec newest');
  await input.press('Enter');
  const newest = page.locator('[data-shopping-id]', { hasText: 'Dock spec newest' });
  await expect(newest).toBeVisible();
  const barTop = (await bar.boundingBox())!.y;
  await expect
    .poll(
      async () => {
        const b = (await newest.boundingBox())!;
        return b.y + b.height;
      },
      { message: 'new row landed behind the add bar' },
    )
    .toBeLessThanOrEqual(barTop + 1);
});

test('the add button steps aside while scrolling down and returns on scroll up', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  for (let i = 1; i <= 10; i++) {
    await page.request.post('/api/events', {
      data: {
        title: `Fab spec ${i}`,
        event_type: 'appointment',
        target_date: `2030-01-${String(i).padStart(2, '0')}`,
      },
    });
  }
  await page.reload();
  await page.locator('nav a[href="/timeline"]').click();
  const fab = page.getByRole('button', { name: 'Add event' });
  await expect(fab).toBeVisible();

  const opacity = () => fab.evaluate((b) => getComputedStyle(b.parentElement!).opacity);
  await page.locator('main').hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(opacity).toBe('0');
  await page.mouse.wheel(0, -200);
  await expect.poll(opacity).toBe('1');
});
