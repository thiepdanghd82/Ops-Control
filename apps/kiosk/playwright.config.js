// MES-2.8 — Playwright config for the kiosk PWA e2e suite.
// Chromium-only this sprint (cross-browser deferred to MES-3 per plan §17).
// `webServer` boots the planner node server with an isolated DATA_DIR +
// DB so specs don't fight the operator's dev state.
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEST_RUN_ID = String(Date.now());
const TEST_DATA_DIR = path.join(REPO_ROOT, '.playwright-tmp', TEST_RUN_ID);
const TEST_DB = path.join(TEST_DATA_DIR, 'kiosk-e2e.sqlite');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // sequential — both specs share the test server + DB
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  globalSetup: './tests/e2e/_globalSetup.js',
  use: {
    baseURL: 'http://localhost:3000/kiosk/',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      // Pass the test data dir via header so fixtures can hit
      // server-side test endpoints if needed.
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 600 } },
    },
  ],
  webServer: {
    command: 'node server/index.js',
    cwd: REPO_ROOT,
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      DATA_DIR: TEST_DATA_DIR,
      OPS_DB_PATH: TEST_DB,
      NODE_ENV: 'development',
      // Persist for fixtures to read.
      OPS_E2E_TEST_DB_PATH: TEST_DB,
      OPS_E2E_TEST_DATA_DIR: TEST_DATA_DIR,
    },
  },
});

// Exposed so _globalSetup can resolve the same paths.
export const TEST_PATHS = { TEST_DATA_DIR, TEST_DB };
