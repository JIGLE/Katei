import { test, expect, type Page } from '@playwright/test';

// The Timeline keeps its month grid on top but compact, so the list starts
// on the first screen of a phone. With no day picked, open events read in
// three groups (Overdue / Next 7 days / Later). Browsing another month shows
// a "Today" link back, and ?day= links from the Overview still open a day.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Timeline spec';

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });
}

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

test.afterEach(async ({ page }) => {
  const events: { id: number; title: string }[] = await page.request
    .get('/api/events')
    .then((r) => r.json());
  for (const e of events.filter((x) => x.title.startsWith(PREFIX)))
    await page.request.delete(`/api/events/${e.id}`);
});

test('the list starts on the first screen, grouped, under a compact month', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const [title, offset] of [
    ['late', -3],
    ['soon', 2],
    ['far', 30],
  ] as const) {
    const r = await page.request.post('/api/events', {
      data: { title: `${PREFIX} ${title}`, event_type: 'deadline', target_date: iso(offset) },
    });
    expect(r.ok()).toBeTruthy();
  }

  await page.goto('/timeline');
  for (const name of ['Overdue', 'Next 7 days', 'Later'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const overdue = page.getByRole('region', { name: 'Overdue' });
  await expect(overdue).toContainText(`${PREFIX} late`);
  await expect(page.getByRole('region', { name: 'Later' })).toContainText(`${PREFIX} far`);

  // At least two list rows sit above the bottom nav without scrolling.
  const navTop = (await page.locator('nav').last().boundingBox())!.y;
  // Each list row starts with its check circle; count every row, not only ours.
  const rows = page.getByRole('button', { name: 'Mark complete' });
  const bottoms = await rows.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().bottom),
  );
  expect(
    bottoms.filter((b) => b <= navTop).length,
    'rows visible above the nav',
  ).toBeGreaterThanOrEqual(2);

  // Day cells answer a full 44px tap.
  const cell = page.getByRole('gridcell').filter({ hasText: /\d/ }).first();
  expect((await cell.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test('"Today" brings you back from another month, and ?day= opens a day', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const day = iso(3);
  await page.request.post('/api/events', {
    data: { title: `${PREFIX} dentist`, event_type: 'appointment', target_date: day },
  });

  await page.goto('/timeline');
  const back = page.getByRole('button', { name: 'Today', exact: true });
  await expect(back).toHaveCount(0);
  const grid = page.getByRole('grid');
  const thisMonth = await grid.getAttribute('aria-label');
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(grid).not.toHaveAttribute('aria-label', thisMonth!);
  await back.click();
  await expect(grid).toHaveAttribute('aria-label', thisMonth!);
  await expect(back).toHaveCount(0);

  await page.goto(`/timeline?day=${day}`);
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: `${PREFIX} dentist` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overdue' })).toHaveCount(0);
});
