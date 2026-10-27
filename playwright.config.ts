/**
 * End-to-end journeys against the dev server (5173, proxying /api to the web API instance on 4101).
 * Run with `npm run e2e`; the browsers come from PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers.
 * The global setup reseeds the expenso_web database first (E2E_SKIP_SEED=1 skips it).
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
