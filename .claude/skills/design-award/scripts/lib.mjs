// Shared plumbing for the design-award harness: resolve playwright-core from
// the e2e package and a chromium binary from the preinstalled browsers dir,
// then hand back a logged-in page against a running Katei.
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export async function launch() {
  const require = createRequire(join(repoRoot, 'e2e', 'package.json'));
  // Prefer the package's ESM wrapper — importing the CJS entry directly
  // doesn't surface `chromium` as a named export.
  const pwPath = require.resolve('playwright-core').replace(/index\.js$/, 'index.mjs');
  const mod = await import(pathToFileURL(pwPath).href);
  const chromium = mod.chromium ?? mod.default?.chromium;

  // Prefer the harness's headless shell; fall back to any chromium build.
  const browsersDir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  let executablePath;
  try {
    const entries = readdirSync(browsersDir);
    const shell = entries.filter((e) => e.startsWith('chromium_headless_shell-')).sort().pop();
    const full = entries.filter((e) => /^chromium-\d/.test(e)).sort().pop();
    if (shell) executablePath = join(browsersDir, shell, 'chrome-linux', 'headless_shell');
    else if (full) executablePath = join(browsersDir, full, 'chrome-linux', 'chrome');
  } catch {
    // Directory missing — let Playwright resolve its own browser.
  }

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  return { browser, page };
}

/** Log in (or first-run register) as the given member. */
export async function signIn(page, name = 'Alex', password = 'password123') {
  await page.goto(BASE);
  await page.locator('#name').fill(name);
  await page.locator('#password').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForSelector('nav a[href="/timeline"]', { timeout: 20_000 });
}

/** POST an API path, collecting failures into `problems`. Returns JSON or null. */
export async function post(page, problems, path, data) {
  const r = await page.request.post(`${BASE}/api${path}`, { data });
  if (!r.ok()) {
    problems.push(`POST ${path}: ${r.status()} ${await r.text()}`);
    return null;
  }
  return r.json();
}
