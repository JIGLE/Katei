import { test, expect } from '@playwright/test';

// Overview's status line promises "N overdue". That count must be backed by
// rows the reader can see on the same screen: before this spec, overdue
// deadlines had no block on Overview at all, so the most urgent item in the
// household took a trip to the Timeline to find.
//
// Shares the server with the other specs (workers: 1, no reset), so it signs
// in as the same "Alex" — registering the admin if it happens to run first —
// and only asserts on the events it creates itself.

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

test('an overdue item named in the status line is shown under Needs attention', async ({ page }) => {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });

  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());
  await page.request.put('/api/settings/preferences', { data: { ...prefs, language: 'en' } });

  const overdue = await page.request.post('/api/events', {
    data: { title: 'Attention spec: overdue', event_type: 'appointment', target_date: iso(-3) },
  });
  expect(overdue.ok()).toBeTruthy();
  const soonDeadline = await page.request.post('/api/events', {
    data: { title: 'Attention spec: deadline', event_type: 'deadline', target_date: iso(2) },
  });
  expect(soonDeadline.ok()).toBeTruthy();
  const later = await page.request.post('/api/events', {
    data: { title: 'Attention spec: later', event_type: 'appointment', target_date: iso(20) },
  });
  expect(later.ok()).toBeTruthy();

  await page.reload();
  const attention = page.locator('section', { has: page.getByText('Needs attention', { exact: true }) });
  await expect(attention).toBeVisible();
  await expect(attention.getByText('Attention spec: overdue')).toBeVisible();
  await expect(attention.getByText('Attention spec: deadline')).toBeVisible();
  await expect(attention.getByText('Attention spec: later')).toHaveCount(0);

  // Needs attention sits above the fold, before the week strip and shortcuts.
  const box = await attention.boundingBox();
  expect(box && box.y + box.height).toBeLessThan(page.viewportSize()!.height);
});
