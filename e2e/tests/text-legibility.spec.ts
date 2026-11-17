import { test, expect, type Page } from '@playwright/test';

// Every piece of visible text on every tab, in both themes, must hold WCAG AA
// contrast against what's actually behind it (4.5:1, or 3:1 for large text)
// and be at least 11px. The palette is CSS variables remapped per theme, so
// the ratios are computed from the live computed styles, with translucent
// pill and card backgrounds composited down to the opaque page — never from
// numbers copied into this file.
//
// Exempt: disabled controls (WCAG 1.4.3 excludes inactive components) and
// placeholder text, which isn't a text node.
//
// Shares the server with the other specs (workers: 1, no reset). It adds a
// little data so each tab renders its rows, then removes it again.

const PREFIX = 'Legibility spec';

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
}

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function cleanup(page: Page) {
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
}

test.afterEach(async ({ page }) => cleanup(page));

// Runs in the page: returns one line per failing text element.
function audit(): string[] {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: number[]) =>
    0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const over = (top: number[], bottom: number[]) => {
    const a = top[3] ?? 1;
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a));
  };
  const backdrop = (el: Element) => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if ((c[3] ?? 1) > 0) {
        layers.push(c);
        if ((c[3] ?? 1) >= 1) break;
      }
    }
    let bg = [255, 255, 255];
    for (const c of layers.reverse()) bg = over(c, bg);
    return bg;
  };
  const failures: string[] = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (el.closest('[disabled], [aria-disabled="true"], dialog:not([open])')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    let hidden = false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) === 0) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    const size = parseFloat(cs.fontSize);
    const bg = backdrop(el);
    const fg = over(parse(cs.color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const label = `"${text.slice(0, 40)}"`;
    if (ratio < (large ? 3 : 4.5)) failures.push(`${ratio.toFixed(2)}:1 at ${size}px ${label}`);
    if (size < 11) failures.push(`${size}px text ${label}`);
  }
  return [...new Set(failures)];
}

test('every visible text holds AA contrast and an 11px floor on every tab, in both themes', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  const prefs = await page.request.get('/api/settings/preferences').then((r) => r.json());

  // Enough data for each tab to render its rows, pills and captions.
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
  try {
    for (const theme of ['dark', 'light'] as const) {
      await page.request.put('/api/settings/preferences', {
        data: { ...prefs, language: 'en', theme },
      });
      for (const href of ['/', '/timeline', '/money', '/lists', '/household']) {
        await page.goto(href);
        await expect(page.locator('nav a[href="/timeline"]')).toBeVisible();
        await page.waitForTimeout(1200); // entrance stagger + count-ups settle
        // Long pages: audit at the top and at the end of <main>.
        for (const y of [0, 99_999]) {
          await page.evaluate((py) => document.querySelector('main')!.scrollTo(0, py), y);
          await page.waitForTimeout(250);
          const found = await page.evaluate(audit);
          if (found.length) failures[`${theme} ${href} @${y}`] = found;
        }
      }
    }
  } finally {
    await page.request.put('/api/settings/preferences', { data: prefs });
  }

  expect(failures, JSON.stringify(failures, null, 2)).toEqual({});
});
