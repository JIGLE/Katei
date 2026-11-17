import { test, expect, type Page } from '@playwright/test';

// Colour is meaning (BRAND.md §5): amber is time, emerald money, teal savings,
// rose critical. Household and gift screens carry none of those meanings, yet
// they used to paint an assignment's role emerald, a reserved gift amber, a
// bought gift and the Pets heading teal, and the Person/Pet picker emerald.
// This spec fills those screens with every state and asserts no time or
// savings accent appears on them, and that the Lists tab carries no accent dot.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Colour spec';

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
  const { others }: { others: { id: number; external_name: string | null }[] } = await page.request
    .get('/api/gift-lists')
    .then((r) => r.json());
  for (const l of others.filter((x) => x.external_name?.startsWith(PREFIX))) await page.request.delete(`/api/gift-lists/${l.id}`);
  const events: { id: number; title: string }[] = await page.request.get('/api/events').then((r) => r.json());
  for (const e of events.filter((x) => x.title.startsWith(PREFIX))) await page.request.delete(`/api/events/${e.id}`);
  const users: { id: number; name: string }[] = await page.request.get('/api/users').then((r) => r.json());
  for (const u of users.filter((x) => x.name.startsWith(PREFIX))) await page.request.delete(`/api/users/${u.id}`);
});

// Elements under `root` painted with a time (amber) or savings (teal) accent.
const accented = (page: Page, root: string) =>
  page.evaluate((sel) => {
    const scope = document.querySelector(sel);
    if (!scope) return [];
    return [...scope.querySelectorAll('[class*="amber-"], [class*="teal-"]')].map(
      (el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
    );
  }, root);

test('household and gift screens use no time or savings accent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const me: { id: number } = await page.request.get('/api/auth/me').then((r) => r.json());
  const pet = await page.request.post('/api/users', { data: { name: `${PREFIX} Pip`, kind: 'pet' } });
  expect(pet.ok()).toBeTruthy();
  const evt = await page.request
    .post('/api/events', { data: { title: `${PREFIX} vet`, event_type: 'appointment', target_date: '2030-02-01' } })
    .then((r) => r.json());
  const assign = await page.request.post('/api/assignments', { data: { user_id: me.id, event_id: evt.id, role: 'owner' } });
  expect(assign.ok()).toBeTruthy();

  const list = await page.request.post('/api/gift-lists', { data: { external_name: `${PREFIX} Sam` } }).then((r) => r.json());
  for (const [title, status] of [['Book', 'idea'], ['Scarf', 'reserved'], ['Lamp', 'bought']] as const) {
    const item = await page.request.post(`/api/gift-lists/${list.id}/items`, { data: { title } }).then((r) => r.json());
    if (status !== 'idea') {
      const r = await page.request.patch(`/api/gift-lists/items/${item.id}`, { data: { status } });
      expect(r.ok()).toBeTruthy();
    }
  }

  // Household: an assignment role, the Pets heading, the Person/Pet picker.
  await page.goto('/household');
  await expect(page.getByText(`${PREFIX} Pip`)).toBeVisible();
  await expect(page.getByText('owner', { exact: true }).first()).toBeVisible();
  expect(await accented(page, 'main'), 'household').toEqual([]);

  // Gifts: reserved and bought pills, "got this" lines, the status picker.
  await page.goto('/lists');
  await page.getByRole('button', { name: 'Gifts', exact: true }).click();
  const scarf = page.getByText('Scarf', { exact: true });
  await scarf.scrollIntoViewIfNeeded();
  await expect(scarf).toBeVisible();
  expect(await accented(page, 'main'), 'gifts').toEqual([]);
  await scarf.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await accented(page, '[role=dialog]'), 'gift sheet').toEqual([]);
  await page.keyboard.press('Escape');

  // The Lists tab is neither time nor money, so its active state has no dot.
  expect(await accented(page, 'nav'), 'bottom nav').toEqual([]);
});
