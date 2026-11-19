import { test, expect, type Page } from '@playwright/test';

// Every button, link and text field must answer a tap of at least 44×44 on a
// phone (BRAND.md §7, Touch targets). Small-looking controls (a 20px check
// circle, a text-xs link) keep their look and get an invisible hit area from
// a ::after in index.css, so the hit box measured here is the larger of the
// element and that pseudo-element. Bottom sheets also close when their top is
// pulled down.
//
// Shares the server with the other specs (workers: 1, no reset). It adds a
// little data so each tab renders its rows, then removes it again.

const PREFIX = 'Tap spec';

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
  const items: { id: number; name: string }[] = await page.request
    .get('/api/shopping')
    .then((r) => r.json());
  for (const i of items.filter((x) => x.name.startsWith(PREFIX)))
    await page.request.delete(`/api/shopping/${i.id}`);
  const events: { id: number; title: string }[] = await page.request
    .get('/api/events')
    .then((r) => r.json());
  for (const e of events.filter((x) => x.title.startsWith(PREFIX)))
    await page.request.delete(`/api/events/${e.id}`);
});

// Runs in the page: one line per control whose hit box is under 44×44.
function audit(): string[] {
  const out: string[] = [];
  const sel = 'button, a[href], summary, [role=button], [role=tab], input, select, textarea';
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    if (
      el instanceof HTMLInputElement &&
      ['hidden', 'checkbox', 'radio', 'range', 'color'].includes(el.type)
    )
      continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    let faded = false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) === 0) {
        faded = true;
        break;
      }
    }
    if (faded) continue;
    const after = getComputedStyle(el, '::after');
    const aw =
      after.content !== 'none' && after.position === 'absolute' ? parseFloat(after.width) || 0 : 0;
    const ah =
      after.content !== 'none' && after.position === 'absolute' ? parseFloat(after.height) || 0 : 0;
    const w = Math.max(r.width, aw);
    const h = Math.max(r.height, ah);
    if (w < 43.5 || h < 43.5) {
      const name = (
        el.getAttribute('aria-label') ||
        el.textContent ||
        el.getAttribute('placeholder') ||
        el.tagName
      )
        .trim()
        .slice(0, 30);
      out.push(`${Math.round(w)}×${Math.round(h)} ${el.tagName.toLowerCase()} "${name}"`);
    }
  }
  return [...new Set(out)];
}

test('every control answers a 44×44 tap on every tab and in a sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.request.post('/api/events', {
    data: { title: `${PREFIX} overdue`, event_type: 'deadline', target_date: iso(-2) },
  });
  await page.request.post('/api/events', {
    data: { title: `${PREFIX} soon`, event_type: 'appointment', target_date: iso(3) },
  });
  const done = await page.request
    .post('/api/shopping', { data: { name: `${PREFIX} bought` } })
    .then((r) => r.json());
  await page.request.patch(`/api/shopping/${done.id}`, { data: { is_done: true } });
  await page.request.post('/api/shopping', { data: { name: `${PREFIX} open` } });

  const failures: Record<string, string[]> = {};
  for (const href of ['/', '/timeline', '/money', '/lists', '/household']) {
    await page.goto(href);
    await expect(page.locator('nav a[href="/timeline"]')).toBeVisible();
    await page.waitForTimeout(1000);
    for (const y of [0, 99_999]) {
      await page.evaluate((py) => document.querySelector('main')!.scrollTo(0, py), y);
      await page.waitForTimeout(250);
      const found = await page.evaluate(audit);
      if (found.length) failures[`${href} @${y}`] = found;
    }
  }

  // A sheet with a full form in it.
  await page.goto('/timeline');
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(audit);
  if (sheet.length) failures['add event sheet'] = sheet;

  expect(failures, JSON.stringify(failures, null, 2)).toEqual({});
});

test('a sheet closes when pulled down and springs back from a short pull', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  await page.goto('/timeline');
  await page.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(500);

  const handle = dialog.locator('[data-sheet-handle]');
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 3;
  const y = box.y + 8;
  const top = (await dialog.boundingBox())!.y;

  // A short, slow pull springs back.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x, y + i * 8, { steps: 2 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(dialog).toBeVisible();
  expect(
    Math.abs((await dialog.boundingBox())!.y - top),
    'sheet did not spring back',
  ).toBeLessThanOrEqual(1);

  // A long pull closes it.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 200, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
});
