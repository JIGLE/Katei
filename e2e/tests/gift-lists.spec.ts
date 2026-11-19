import { test, expect, type Page } from '@playwright/test';

// Other people's gift lists fold to one summary row each ("Sam · 3 gifts ·
// 1 reserved") so a family of four fits in under two screens, and open on a
// tap. Sharing is an icon in the open list's header.
//
// Shares the server with the other specs (workers: 1, no reset); it removes
// what it creates.

const PREFIX = 'Fold spec';

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
  for (const l of others.filter((x) => x.external_name?.startsWith(PREFIX)))
    await page.request.delete(`/api/gift-lists/${l.id}`);
});

test('a family of four fits in under two screens folded, and a list opens on tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  for (const who of ['Sam', 'Ana', 'Kai', 'Lou']) {
    const list = await page.request
      .post('/api/gift-lists', { data: { external_name: `${PREFIX} ${who}` } })
      .then((r) => r.json());
    for (const title of ['Book', 'Scarf', 'Lamp']) {
      const item = await page.request
        .post(`/api/gift-lists/${list.id}/items`, { data: { title: `${who} ${title}` } })
        .then((r) => r.json());
      if (title === 'Scarf')
        await page.request.patch(`/api/gift-lists/items/${item.id}`, {
          data: { status: 'reserved' },
        });
    }
  }

  await page.goto('/lists');
  await page.getByRole('button', { name: 'Gifts', exact: true }).click();
  const sam = page.getByRole('button', { name: new RegExp(`^${PREFIX} Sam`) });
  await expect(sam).toBeVisible();
  await expect(sam).toHaveAttribute('aria-expanded', 'false');
  await expect(sam).toContainText('3 gifts · 1 reserved');
  await expect(page.getByText('Sam Book')).toHaveCount(0);

  // Folded, the whole Gifts pane is under two screens tall.
  const height = await page.evaluate(() => document.querySelector('main')!.scrollHeight);
  expect(height, 'Gifts pane with four folded lists').toBeLessThan(2 * 844);

  await sam.click();
  await expect(sam).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Sam Book')).toBeVisible();

  // Sharing lives in the open list's header as an icon.
  const header = page.locator('div', { has: sam }).last();
  await header.getByRole('button', { name: 'Share list' }).click();
  await expect(page.getByText('Enable link')).toBeVisible();
});
