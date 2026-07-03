import { defineConfig } from '@playwright/test';

// Smoke suite against the production shape: one server on E2E_BASE_URL serving
// both the built SPA and /api (CI boots it; see .github/workflows/docker.yml).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  // The journey registers the one first-run admin — it cannot run twice
  // against the same database, so no repeats/shards.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 390, height: 844 }, // the phone size the app is designed at
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
