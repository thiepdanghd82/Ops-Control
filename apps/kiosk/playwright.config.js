// MES-2.8 — Playwright config for the kiosk PWA e2e suite.
// Chromium-only this sprint (cross-browser deferred to MES-3 per plan §17).
// `webServer` boots the planner node server with an isolated DATA_DIR +
// DB so specs don't fight the operator's dev state.
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema } from '../../server/db/init.js';
import { closeDb, _resetForTests } from '../../server/db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEST_RUN_ID = String(Date.now());
const TEST_DATA_DIR = path.join(REPO_ROOT, '.playwright-tmp', TEST_RUN_ID);
const TEST_DB = path.join(TEST_DATA_DIR, 'kiosk-e2e.sqlite');
// Fixed-location JSON handoff file: this config writes a bag of env-shaped
// values (TEST_DB path, OPS_KIOSK_KEY, …) here, fixtures read it once.
// MUST live outside test-results (Playwright clears that dir before runs).
const TEST_ENV_FILE = path.join(REPO_ROOT, '.playwright-tmp', '.e2e-env.json');

// Module-load setup — runs synchronously before Playwright spawns webServer.
// globalSetup races webServer in parallel, so state read at server boot
// (feature flags, DB schema) MUST land here. Workers re-import this module
// on fork; TEST_WORKER_INDEX guard skips redundant work + DB races.
if (!process.env.TEST_WORKER_INDEX) {
  const cfgDir = path.join(TEST_DATA_DIR, 'Library', 'SystemConfig');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': true }, null, 2)
  );
  const mpDir = path.join(TEST_DATA_DIR, 'Library', 'MachineProfiles');
  fs.mkdirSync(mpDir, { recursive: true });
  fs.writeFileSync(
    path.join(mpDir, 'profiles.json'),
    JSON.stringify({ profiles: [{ id: 'TEST-MACHINE-01', name: 'Test Machine 01' }] }, null, 2)
  );
  // Init schema before mountPlanning's validateReasonCodeIntegrity runs
  // (which queries reason_code and crashes on missing tables).
  process.env.OPS_DB_PATH = TEST_DB;
  _resetForTests();
  initSchema();
  closeDb();
  // Resolve OPS_KIOSK_KEY (shell env > project .env) and hand env-shaped
  // values to test workers via the JSON file.
  let kioskKey = process.env.OPS_KIOSK_KEY;
  if (!kioskKey) {
    const envPath = path.join(REPO_ROOT, '.env');
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, 'utf-8').match(/^OPS_KIOSK_KEY=(.+)$/m);
      if (m) kioskKey = m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  fs.mkdirSync(path.dirname(TEST_ENV_FILE), { recursive: true });
  const envBag = { OPS_E2E_TEST_DB_PATH: TEST_DB, OPS_KIOSK_KEY: kioskKey || null };
  fs.writeFileSync(TEST_ENV_FILE, JSON.stringify(envBag, null, 2));
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // sequential — both specs share the test server + DB
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  globalTeardown: './tests/e2e/_globalTeardown.js',
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
export const TEST_PATHS = { TEST_DATA_DIR, TEST_DB, TEST_ENV_FILE, REPO_ROOT };
