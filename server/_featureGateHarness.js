/**
 * Shared boot harness for the OPS_FEATURE_PLANNING / OPS_FEATURE_KIOSK
 * outer-gate integration tests.
 *
 * The flags are read once at server/index.js module-load time, so the
 * ON and OFF cases must run in SEPARATE processes. `node --test` isolates
 * each test file in its own process, so we keep one .test.js file per
 * flag state and share the (otherwise identical) tmp-DATA_DIR + seed-user
 * + app-boot setup here. The caller sets the flag env vars BEFORE calling
 * boot() so index.js sees them.
 *
 * Not a *.test.js itself — imported by featureGate.off/on.integration.test.js.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// Legacy jsHash (mirrors http.integration.test.js) — simplest seed path.
function jsHashForSeed(pwd) {
  const s = 'ccl_2024_' + pwd;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0;
  const hU = h >>> 0;
  if (hU === 0) return '0';
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  let r = '';
  let n = hU;
  while (n > 0) {
    r = digits[n % 36] + r;
    n = Math.floor(n / 36);
  }
  return r;
}

/** Set DATA_DIR + seed a sys user. Call BEFORE setting the feature flags. */
export function prepareEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-featgate-'));
  process.env.DATA_DIR = tmp;
  process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
  process.env.NODE_ENV = 'test';
  process.env.OPS_REQUIRE_2FA_ROLES = '';
  const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
  fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
  fs.writeFileSync(
    seedUsersPath,
    JSON.stringify(
      [
        {
          id: 1,
          username: 'gate-user',
          role: 'sys',
          pwd: jsHashForSeed('TestGate123!'),
          lastPwdChange: new Date().toISOString(),
          permissions: {},
          full_name: 'Gate Test User',
        },
      ],
      null,
      2
    )
  );
  return tmp;
}

/** Import the app (reads the flags now) + init schema. Returns the app. */
export async function bootApp() {
  const { default: app } = await import('./index.js');
  const { initSchema } = await import('./db/init.js');
  initSchema();
  return app;
}
