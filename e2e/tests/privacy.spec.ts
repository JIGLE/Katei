import { test, expect, type Page } from '@playwright/test';

// Private money streams: a member can mark a stream private and it must be
// fully invisible to every other household member — nowhere in Money, the
// Overview, or the Timeline — while Overview's "Around the house" section
// never names who did what, only what happened.
//
// This spec shares one server/database with smoke.spec.ts (playwright.config
// runs with workers: 1, no per-file reset — see its own comment on why). It
// therefore can't assume it's the first-run registration: "Alex"/"password123"
// deliberately matches smoke.spec.ts's own credentials, so signing in here
// registers the first admin when this file happens to run first and logs
// into the existing one when it runs second. Alex herself owns the private
// stream (rather than inviting a third throwaway member for it) so the test
// only ever needs one extra browser context — Nosy's — keeping it light.

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

test('private money streams stay invisible to other members; Around the house never names an actor', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const problems = watchConsole(page);

  await test.step('sign in as the household admin (registers it if this is a fresh database)', async () => {
    await page.goto('/');
    await page.locator('#name').fill('Alex');
    await page.locator('#password').fill('password123');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
  });

  await test.step('force English so labels are stable', async () => {
    const res = await page.request.put('/api/settings/preferences', {
      data: { country: 'GB', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', language: 'en' },
    });
    expect(res.ok()).toBeTruthy();
    await page.reload();
    await expect(page.locator('nav a[href="/timeline"]')).toBeVisible();
  });

  await test.step('Alex creates a private expense stream and sees it marked Private', async () => {
    await page.locator('nav a[href="/money"]').click();
    await page.getByRole('button', { name: 'Add money stream' }).click();
    await page.getByRole('button', { name: 'Expense', exact: true }).click();
    await page.locator('#name').fill('Secret Rent');
    await page.locator('#amount').fill('42');
    await page.locator('form').getByRole('button', { name: 'Private' }).click();
    await page.locator('form button[type=submit]').click();
    await expect(page.getByText('Secret Rent', { exact: true })).toBeVisible();
    // Scoped to the stream's own row: the closed modal (still off-screen in
    // the DOM mid slide-out) has its own "Private" toggle label, which a bare
    // page-wide getByText would ambiguously match too.
    const row = page.getByRole('button', { name: /Secret Rent/ });
    await expect(row.getByText('Private', { exact: true })).toBeVisible();
  });

  const nosy = await test.step('invite Nosy, who must never see the private stream', async () => {
    const invite = await (await page.request.post('/api/invites', { data: {} })).json();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const nosyPage = await context.newPage();
    await nosyPage.goto(`/?invite=${invite.code}`);
    await nosyPage.locator('#name').fill('Nosy');
    await nosyPage.locator('#password').fill('password123');
    await nosyPage.locator('form button[type=submit]').click();
    await expect(nosyPage.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
    return nosyPage;
  });

  await test.step('Nosy never sees the private stream — not in Money, Overview, or Timeline', async () => {
    await nosy.locator('nav a[href="/money"]').click();
    await expect(nosy.getByText('Secret Rent')).toHaveCount(0);
    await nosy.locator('nav a[href="/"]').click();
    await expect(nosy.getByText('Secret Rent')).toHaveCount(0);
    await nosy.locator('nav a[href="/timeline"]').click();
    await expect(nosy.getByText('Secret Rent')).toHaveCount(0);
  });

  await test.step('Nosy adds a shopping item and a non-private stream of their own', async () => {
    // Via the API, not the UI form: the shopping list is shared and unscoped
    // (one list for the whole household, same as smoke.spec.ts exercises), so
    // adding through the UI and leaving it there — checked or not — collides
    // with smoke.spec.ts's own single-item selectors whichever spec happens
    // to run first. Deleting it again right after logs the same shopping_added
    // activity entry a UI add would (the activity row has no live reference
    // back to the item, so removing the item doesn't remove its log entry) —
    // exactly what's needed to prove it stays out of Around the house, with
    // nothing left in the shared list to collide with.
    const added = await (await nosy.request.post('/api/shopping', { data: { name: 'Snack Run' } })).json();
    await nosy.request.delete(`/api/shopping/${added.id}`);

    await nosy.locator('nav a[href="/money"]').click();
    await nosy.getByRole('button', { name: 'Add money stream' }).click();
    await nosy.getByRole('button', { name: 'Expense', exact: true }).click();
    await nosy.locator('#name').fill('Broadband');
    await nosy.locator('#amount').fill('10');
    await nosy.locator('form button[type=submit]').click();
    await expect(nosy.getByText('Broadband', { exact: true })).toBeVisible();
  });

  await test.step('Around the house shows the stream but not the shopping item, and names no one', async () => {
    await nosy.locator('nav a[href="/"]').click();
    const section = nosy.locator('section', { hasText: 'Around the house' });
    // Not exact: the row renders as a full sentence ("Added Broadband"), not
    // the item name standing alone.
    await expect(section.getByText('Broadband')).toBeVisible({ timeout: 15_000 });
    await expect(section.getByText('Snack Run')).toHaveCount(0);
    // Money/event activity renders with no attribution at all — Nosy's own
    // name must not appear here even though Nosy performed the action.
    await expect(section.getByText('Nosy')).toHaveCount(0);
  });

  await test.step('no page exceptions or CSP violations anywhere in the journey', async () => {
    expect(problems).toEqual([]);
  });
});
