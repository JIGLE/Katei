import { test, expect, type Page } from '@playwright/test';

// One way to add things (BRAND.md §7, Adding things): each tab with a create
// action has one floating add button that opens a sheet, and Money, which has
// several kinds of thing to add, opens a chooser sheet first instead of a
// speed-dial of floating pills. Editing an event offers the same type choices
// as adding one.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Add spec';

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
}

test.afterEach(async ({ page }) => {
  const events: { id: number; title: string }[] = await page.request
    .get('/api/events')
    .then((r) => r.json());
  for (const e of events.filter((x) => x.title.startsWith(PREFIX)))
    await page.request.delete(`/api/events/${e.id}`);
});

test('every tab adds through one button and a sheet; Money asks what first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  for (const [href, name] of [
    ['/timeline', 'Add event'],
    ['/household', 'Add member'],
  ] as const) {
    await page.goto(href);
    const fab = page.getByRole('button', { name });
    await expect(fab).toHaveCount(1);
    await fab.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  await page.goto('/money');
  await page.getByRole('button', { name: 'Add money stream' }).click();
  const chooser = page.getByRole('dialog', { name: 'What are you adding?' });
  await expect(chooser).toBeVisible();
  for (const label of ['Income', 'Expense', 'Savings', 'Add to savings']) {
    await expect(chooser.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await chooser.getByRole('button', { name: 'Expense', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New money stream' });
  await expect(form).toBeVisible();
  await expect(chooser).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Focus comes back to the add button, not to a chooser row that is gone.
  await expect(page.getByRole('button', { name: 'Add money stream' })).toBeFocused();
});

test('editing an event offers the same type choices as adding one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const typeButtons = (scope: ReturnType<Page['getByRole']>) =>
    scope.locator('button[aria-pressed]').allInnerTexts();

  await page.goto('/timeline');
  await page.getByRole('button', { name: 'Add event' }).click();
  const add = page.getByRole('dialog');
  const newTypes = await typeButtons(add);
  expect(newTypes).toEqual(['Deadline', 'Payment', 'Appointment']);
  await page.keyboard.press('Escape');

  const r = await page.request.post('/api/events', {
    data: { title: `${PREFIX} dentist`, event_type: 'appointment', target_date: '2030-03-01' },
  });
  expect(r.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: `${PREFIX} dentist` }).click();
  const edit = page.getByRole('dialog');
  await expect(edit).toBeVisible();
  expect(await typeButtons(edit)).toEqual(newTypes);
});
