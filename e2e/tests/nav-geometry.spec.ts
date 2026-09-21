import { test, expect, type Page } from '@playwright/test';

// The bottom nav's geometry and legibility, measured at the widths and in the
// languages that actually break it.
//
// This file exists because three rounds of careful manual checking passed
// while the nav was clipping 10.9px off each edge of a real Galaxy S24: every
// check ran at 390px, and so did playwright.config.ts. Measuring the narrow
// case by hand is not a safeguard — this is.
//
// Shares one server/database with the other specs (workers: 1, no per-file
// reset), so it uses the same "Alex"/"password123" credentials they do: that
// registers the first-run admin when this file runs first and signs into the
// existing one when it runs later. It creates no household data, so it can
// never collide with their selectors.

// Mirrors SUPPORTED_LANGUAGES in frontend/src/lib/i18n.ts. Duplicated rather
// than imported because e2e is its own package; if a seventh language lands,
// this list is the thing to update.
const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'nl'] as const;

// 320 is below any phone still sold but is the floor the layout claims to
// survive; 360 is the Galaxy S24 and the narrowest mainstream width; 390 is
// where the suite used to live; 430 is a Pro Max.
const WIDTHS = [320, 360, 390, 430];
const HEIGHT = 780;

// BottomNav drops labels below this via `max-[359px]:hidden`.
const LABEL_BREAKPOINT = 360;

// Sub-pixel layout means an element flush to the right edge can measure a
// hair past it; anything genuinely clipped is off by whole pixels.
const EPSILON = 0.5;

interface Box {
  x: number;
  right: number;
  width: number;
  height: number;
  bottom: number;
}

interface TabGeometry extends Box {
  href: string;
  label: { text: string; scrollWidth: number; clientWidth: number; shown: boolean } | null;
}

interface NavGeometry {
  vw: number;
  vh: number;
  nav: Box & { scrollWidth: number; clientWidth: number; paddingBottom: number };
  tabs: TabGeometry[];
  account: Box;
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.locator('#password').fill('password123');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible({ timeout: 15_000 });
}

// The preferences endpoint rewrites every field it knows about, so `theme`
// has to be sent explicitly or it resets to the default.
async function setPreferences(page: Page, language: string, theme: 'dark' | 'light') {
  const res = await page.request.put('/api/settings/preferences', {
    data: { country: 'GB', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', language, theme },
  });
  expect(res.ok(), `failed to switch to ${language}/${theme}`).toBeTruthy();
  await page.reload();
  await expect(page.locator('nav a[href="/timeline"]')).toBeVisible();
}

async function measureNav(page: Page): Promise<NavGeometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) throw new Error('no <nav> rendered');
    // The account control lives in the header, not the bar: six items do not
    // fit five labels plus a 44px avatar at 360px. Still measured here because
    // it has to stay on-screen and hittable wherever it lives.
    const account = document.querySelector('header button[aria-haspopup="menu"]');
    if (!account) throw new Error('no account trigger in the header');

    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, height: r.height, bottom: r.bottom };
    };

    const tabs = Array.from(nav.querySelectorAll('a[href]')).map((a) => {
      // The label is the only span in a tab carrying text — the accent dot is
      // an empty positioned span. Finding it by content survives a reorder
      // that :first-of-type would not.
      const label = Array.from(a.querySelectorAll('span')).find((s) => (s.textContent ?? '').trim());
      return {
        href: a.getAttribute('href') ?? '',
        ...box(a),
        label: label
          ? {
              text: label.textContent!.trim(),
              scrollWidth: label.scrollWidth,
              clientWidth: label.clientWidth,
              shown: getComputedStyle(label).display !== 'none',
            }
          : null,
      };
    });

    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      nav: {
        ...box(nav),
        scrollWidth: nav.scrollWidth,
        clientWidth: nav.clientWidth,
        paddingBottom: parseFloat(getComputedStyle(nav).paddingBottom),
      },
      tabs,
      account: box(account),
    };
  });
}

test('the nav fits every supported language at every phone width', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);

  for (const language of LANGUAGES) {
    await setPreferences(page, language, 'dark');

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const g = await measureNav(page);
      const at = `${language} @ ${width}px`;

      expect(g.tabs.length, `${at}: expected five destinations`).toBe(5);

      // Equal slots are the point: every destination on one pitch, identically
      // in every language. Content-sized tabs varied by 20.3px in English and
      // 33.3px in Italian, which reads as a wobble even though nothing clipped.
      const centres = g.tabs.map((t) => t.x + t.width / 2);
      const pitch = centres.slice(1).map((c, i) => c - centres[i]);
      const spread = Math.max(...pitch) - Math.min(...pitch);
      expect(
        spread,
        `${at}: centre spacing varies by ${spread.toFixed(1)}px (${pitch.map((v) => v.toFixed(1)).join(', ')})`,
      ).toBeLessThanOrEqual(1);

      // Nothing overflows the bar's own box...
      expect(g.nav.scrollWidth, `${at}: the bar overflows itself`).toBeLessThanOrEqual(
        g.nav.clientWidth + EPSILON,
      );

      // ...and nothing in it sits outside the screen. This is the assertion
      // that the shipped-and-clipping pill would have failed.
      for (const item of [...g.tabs, { href: 'account', ...g.account }]) {
        expect(item.x, `${at}: ${item.href} starts ${(-item.x).toFixed(1)}px off the left edge`)
          .toBeGreaterThanOrEqual(-EPSILON);
        expect(item.right, `${at}: ${item.href} ends ${(item.right - g.vw).toFixed(1)}px past the right edge`)
          .toBeLessThanOrEqual(g.vw + EPSILON);
      }

      for (const tab of g.tabs) {
        expect(tab.label, `${at}: ${tab.href} has no label element`).not.toBeNull();
        const label = tab.label!;

        if (width >= LABEL_BREAKPOINT) {
          expect(label.shown, `${at}: "${label.text}" should be visible`).toBe(true);
          // `truncate` is a safety net, not a layout strategy: if it ever
          // fires, a real word is being hidden from a real user.
          expect(
            label.scrollWidth,
            `${at}: "${label.text}" is ellipsised (${label.scrollWidth}px of text in ${label.clientWidth}px)`,
          ).toBeLessThanOrEqual(label.clientWidth);
        } else {
          // Below the breakpoint every locale would ellipsise, so the design
          // drops to icons rather than showing five clipped words.
          expect(label.shown, `${at}: "${label.text}" should be hidden below ${LABEL_BREAKPOINT}px`).toBe(false);
        }
      }
    }
  }

  await setPreferences(page, 'en', 'dark');
});

test('every nav target stays comfortable to hit', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  // Dutch is the binding case: `Huishouden` is the widest label in any locale,
  // so it leaves the least room for the rest of the row.
  await setPreferences(page, 'nl', 'dark');
  await page.setViewportSize({ width: 360, height: HEIGHT });

  const g = await measureNav(page);
  const targets = [...g.tabs, { href: 'account', ...g.account }];

  for (const item of targets) {
    // Height is the dimension that carries a thumb: the bar is ~59px, well
    // clear of the 44px comfort figure and of WCAG 2.2's 24px floor.
    expect(item.height, `${item.href} is only ${item.height.toFixed(1)}px tall`).toBeGreaterThanOrEqual(44);
    // Every tab is an equal slot now — 70.4px at 360px — so width is no longer
    // label-dependent. 40px is kept as the floor a slot can never fall under
    // without the layout having changed shape.
    expect(item.width, `${item.href} is only ${item.width.toFixed(1)}px wide`).toBeGreaterThanOrEqual(40);
  }
});

test('nothing in the bar runs into the screen edge, whichever tab is active', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.setViewportSize({ width: 360, height: HEIGHT });

  // Dutch and Italian carry the two longest labels; the first and last slots
  // are where a wide active label has nowhere left to go. An earlier build of
  // this layout put `Panoramica` 1.1px from the edge and `Huishouden` 0.6px
  // from its neighbour — both passed every other assertion in this file.
  for (const language of ['nl', 'it'] as const) {
    await setPreferences(page, language, 'dark');

    for (const route of ['/', '/timeline', '/money', '/lists', '/household']) {
      await page.locator(`nav a[href="${route}"]`).click();
      await expect(page.locator(`nav a[href="${route}"]`)).toHaveAttribute('aria-current', 'page');

      const edges = await page.evaluate(() => {
        const nav = document.querySelector('nav')!;
        const labels = Array.from(nav.querySelectorAll('a[href] span'))
          .filter((s) => (s.textContent ?? '').trim() && getComputedStyle(s).display !== 'none');
        const first = labels[0].getBoundingClientRect();
        const last = labels[labels.length - 1].getBoundingClientRect();
        const chip = nav.querySelector('a[aria-current="page"]')!.getBoundingClientRect();
        return {
          label: Math.min(first.x, window.innerWidth - last.right),
          chip: Math.min(chip.x, window.innerWidth - chip.right),
        };
      });

      expect(edges.label, `${language} ${route}: label is ${edges.label.toFixed(1)}px from the screen edge`)
        .toBeGreaterThanOrEqual(4);
      // The chip is a filled surface with rounded corners — flush to the edge
      // and the corners get sliced off.
      expect(edges.chip, `${language} ${route}: active chip is ${edges.chip.toFixed(1)}px from the screen edge`)
        .toBeGreaterThanOrEqual(2);
    }
  }

  await setPreferences(page, 'en', 'dark');
});

test('nav labels hold AA contrast in both themes', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.setViewportSize({ width: 360, height: HEIGHT });

  for (const theme of ['dark', 'light'] as const) {
    await setPreferences(page, 'en', theme);

    // Everything is read from the live palette rather than hardcoded, so a
    // change to the zinc ramp in index.css fails here instead of silently
    // shipping an illegible bar.
    const measured = await page.evaluate(() => {
      const parse = (s: string) => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) throw new Error(`unparseable colour: ${s}`);
        const p = m[1].split(',').map((v) => parseFloat(v));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      type Rgba = ReturnType<typeof parse>;
      const over = (fg: Rgba, bg: Rgba): Rgba => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const luminance = ({ r, g, b }: Rgba) => {
        const f = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a: Rgba, b: Rgba) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };

      const nav = document.querySelector('nav')!;
      // The bar is 95% opaque, so 5% of whatever scrolls behind it bleeds
      // through. Compositing over the app's own background is the
      // deterministic case and bounds the error at 5% of the difference.
      const pageBg = parse(getComputedStyle(nav.parentElement!).backgroundColor);
      const navBg = over(parse(getComputedStyle(nav).backgroundColor), pageBg);

      const tabs = Array.from(nav.querySelectorAll('a[href]'));
      const active = tabs.find((a) => a.getAttribute('aria-current') === 'page');
      const inactive = tabs.find((a) => a !== active);
      if (!active || !inactive) throw new Error('need one active and one inactive tab');
      const labelOf = (a: Element) =>
        Array.from(a.querySelectorAll('span')).find((s) => (s.textContent ?? '').trim())!;

      const chipBg = over(parse(getComputedStyle(active).backgroundColor), navBg);
      const inactiveText = over(parse(getComputedStyle(labelOf(inactive)).color), navBg);
      const activeText = over(parse(getComputedStyle(labelOf(active)).color), chipBg);
      const fontPx = parseFloat(getComputedStyle(labelOf(inactive)).fontSize);

      return {
        fontPx,
        inactive: ratio(inactiveText, navBg),
        active: ratio(activeText, chipBg),
        chipAgainstBar: ratio(chipBg, navBg),
      };
    });

    // 10.4px is normal-size text by every definition — "large" starts at 18pt
    // (24px), or 14pt bold — so 4.5:1 is the applicable AA threshold, not 3:1.
    expect(measured.fontPx, `${theme}: labels grew into "large text" territory`).toBeLessThan(24);
    expect(
      measured.inactive,
      `${theme}: inactive label is ${measured.inactive.toFixed(2)}:1 against the bar`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      measured.active,
      `${theme}: active label is ${measured.active.toFixed(2)}:1 against its chip`,
    ).toBeGreaterThanOrEqual(4.5);

    // Not an assertion with a standard behind it — the chip is a decorative
    // fill — but it is the thing that makes "which tab am I on" readable, and
    // it is weaker in light theme. Recorded so a regression is visible.
    console.log(
      `[nav contrast/${theme}] inactive ${measured.inactive.toFixed(2)}:1 · ` +
        `active ${measured.active.toFixed(2)}:1 · chip-vs-bar ${measured.chipAgainstBar.toFixed(2)}:1`,
    );
  }

  await setPreferences(page, 'en', 'dark');
});

test('a gesture-bar inset grows the bar without swallowing content', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await setPreferences(page, 'en', 'dark');
  await page.setViewportSize({ width: 360, height: HEIGHT });

  // Timeline is one of the pages with a floating add button, which is the
  // element most likely to end up underneath a taller bar.
  await page.locator('nav a[href="/timeline"]').click();
  const fab = page.getByRole('button', { name: 'Add event' });
  await expect(fab).toBeVisible();

  const before = await measureNav(page);

  // Headless Chromium always reports env(safe-area-inset-bottom) as 0 and
  // Playwright cannot emulate an inset, so tailwind.config.js resolves
  // `pb-safe` through --katei-safe-bottom specifically to let this stand one
  // up. 24px is roughly an Android gesture bar; iOS home indicators are ~34.
  const INSET = 24;
  await page.addStyleTag({ content: `:root { --katei-safe-bottom: ${INSET}px; }` });

  const after = await measureNav(page);
  expect(after.nav.paddingBottom, 'pb-safe did not pick the inset up').toBeCloseTo(INSET, 0);
  expect(after.nav.height - before.nav.height, 'the bar did not grow by the inset').toBeCloseTo(INSET, 0);
  expect(after.nav.bottom, 'the bar lifted off the bottom edge').toBeCloseTo(after.vh, 0);

  const mainPadding = await page.evaluate(
    () => parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom),
  );
  expect(mainPadding, `content padding ${mainPadding}px does not clear a ${after.nav.height}px bar`)
    .toBeGreaterThan(after.nav.height);

  const fabBox = (await fab.boundingBox())!;
  const fabClearance = after.vh - fabBox.y - fabBox.height;
  expect(fabClearance, `the add button overlaps the bar by ${(after.nav.height - fabClearance).toFixed(1)}px`)
    .toBeGreaterThan(after.nav.height);
});
