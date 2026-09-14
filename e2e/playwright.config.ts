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
    // 360×780 is the Galaxy S24's CSS viewport and the narrowest width any
    // mainstream phone reports. This was 390 until a nav change shipped
    // clipping ~9px off each edge of a real S24 — every check had passed,
    // because every check ran at 390. The tight case is the default now.
    viewport: { width: 360, height: 780 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
