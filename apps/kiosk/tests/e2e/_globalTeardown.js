// MES-2.8 — Playwright globalTeardown. Removes the env-handoff JSON
// file written by _globalSetup so a stale path/key can't leak into a
// subsequent run that picks a different TEST_RUN_ID.
import fs from 'node:fs';
import { TEST_PATHS } from '../../playwright.config.js';

export default function globalTeardown() {
  fs.rmSync(TEST_PATHS.TEST_ENV_FILE, { force: true });
}
