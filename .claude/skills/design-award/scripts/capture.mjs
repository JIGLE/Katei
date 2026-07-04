// Capture every Katei screen in both themes at 390×844 for a design audit.
//   node .claude/skills/design-award/scripts/capture.mjs [--out DIR]
// Defaults to .design-award/shots (gitignored). Requires a seeded, running
// app (see seed.mjs). The app scrolls <main>, not <body> — fullPage
// screenshots are useless here, so long pages are captured in segments.
import { mkdirSync } from 'node:fs';
import { BASE, launch, signIn } from './lib.mjs';

const out = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '.design-award/shots';
mkdirSync(out, { recursive: true });

const { browser, page } = await launch();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const settle = (ms = 700) => page.waitForTimeout(ms);
const shot = async (name) => { await settle(); await page.screenshot({ path: `${out}/${name}.png` }); };
const scrollMain = (y) => page.evaluate((py) => document.querySelector('main')?.scrollTo(0, py), y);

const prefs = async () => page.request.get(`${BASE}/api/settings/preferences`).then((r) => r.json());
const setTheme = async (theme) =>
  page.request.put(`${BASE}/api/settings/preferences`, { data: { ...(await prefs()), theme } });

// Pre-login screen from a clean context state, then sign in.
await page.goto(BASE);
await settle(1600); // let the splash finish
await page.screenshot({ path: `${out}/auth.png` });
await signIn(page);

const captureTheme = async (suffix) => {
  await page.goto(BASE + '/');
  await page.waitForSelector('nav a[href="/timeline"]');
  await shot(`overview-top-${suffix}`);
  await scrollMain(9999);
  await shot(`overview-end-${suffix}`);

  await page.locator('nav a[href="/timeline"]').click();
  await shot(`timeline-${suffix}`);
  await page.getByRole('button', { name: 'Month' }).click();
  await shot(`calendar-${suffix}`);
  await page.getByRole('button', { name: 'List' }).click();
  await settle(300);

  await page.locator('nav a[href="/money"]').click();
  await shot(`money-top-${suffix}`);
  await scrollMain(900);
  await shot(`money-mid-${suffix}`);
  await scrollMain(99999);
  await shot(`money-end-${suffix}`);

  await page.locator('nav a[href="/lists"]').click();
  await shot(`lists-shopping-${suffix}`);
  await page.getByRole('button', { name: /Gifts|Geschenke|Cadeaux|Regalos|Regali|Cadeaus/ }).click();
  await shot(`lists-gifts-${suffix}`);

  await page.locator('nav a[href="/household"]').click();
  await shot(`household-${suffix}`);
};

await captureTheme('dark');

// Modals + settings once (dark) — the sheet is theme-tokened like the rest.
await page.locator('nav a[href="/timeline"]').click();
await settle(400);
await page.getByRole('button', { name: /Add event/ }).click();
await shot('modal-event-dark');
await page.keyboard.press('Escape');
await settle(400);
await page.getByRole('button', { name: /Alex/ }).first().click();
await settle(300);
await page.getByText('Settings', { exact: true }).first().click();
await shot('settings-dark');
await page.keyboard.press('Escape');
await settle(400);

await setTheme('light');
await page.reload();
await page.waitForSelector('nav a[href="/timeline"]');
await captureTheme('light');
await setTheme('dark');

console.log(JSON.stringify({ out, problems }, null, 2));
await browser.close();
process.exit(problems.length ? 1 : 0);
