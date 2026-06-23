import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * Tests run against the production build to exercise minified, tree-shaken code.
 * Start the server manually before running:  npm run build && npx next start
 *
 * NEXT_PUBLIC_MOCK_WALLET=true must be set at build time so the mock freighter
 * module is bundled instead of the real extension bridge.
 */

const PORT = process.env.PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* Each test must complete within 10 seconds as per the issue requirements */
  timeout: 10_000,
  expect: { timeout: 8_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the production Next.js server automatically during CI runs */
  webServer: process.env.CI
    ? {
        command: 'npx next start -p 3000',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_MOCK_WALLET: 'true',
        },
      }
    : undefined,
});
