/**
 * RBAC consistency regression test.
 *
 * This is a STATIC-ANALYSIS test — it scans every route file for
 * `router.post/put/patch/delete(...)` declarations and asserts each
 * handler either:
 *   (a) has an inline session check (getSessionUser / requireWriter /
 *       requireUser / isAdminPlus / isSys / roleLevel / cu.role),
 *   (b) uses requireRole(...) or requireModule(...) middleware in its
 *       signature,
 *   (c) is in a file mounted with authMiddleware at the app level
 *       (shared, planning, import, chat — tracked via APP_LEVEL_AUTH),
 *   (d) is on the short allowlist of intentionally-public endpoints.
 *
 * The point: when someone adds a new mutating endpoint, CI fails until
 * they explicitly enroll it in one of the buckets above. That's the
 * regression guard we were missing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.resolve(__dirname);
const INDEX_JS = path.resolve(__dirname, '..', 'index.js');

// Files mounted in index.js with `authMiddleware` — every route in
// these files inherits auth at the app level. Source: grep of index.js
// for `app.use('...', authMiddleware, ...)`.
//
// Map: route file → mount path used in index.js. The companion test
// below ("app-level authMiddleware mounts are still wired up") greps
// index.js for each pair to detect drift.
const APP_LEVEL_AUTH_MOUNTS = {
  'routes/shared.js': '/api/shared',
  // routes/planning.js removed 2026-07-22 with the Planning module.
  'routes/import.js': '/api/import',
  'routes/importWizard.js': '/api/import-wizard',
  'routes/sync.js': '/api/sync',
};
const APP_LEVEL_AUTH = Object.keys(APP_LEVEL_AUTH_MOUNTS);

// Intentionally-public endpoints (login lives here; CSRF & rate limit
// are their guards instead of session auth). Add with justification.
const PUBLIC_ALLOWLIST = new Set([
  'POST /auth/login', // no session yet; rate-limited + password-verified
  'POST /auth/logout', // idempotent; verifies token before clearing
  'POST /totp/verify', // preauth session; verifies OTP
  'POST /totp/enroll', // preauth session; atomic verify-then-save
  'POST /auth/verify-pwd', // explicit password re-check (used by modal gates)
]);

function scanRouteFile(rel) {
  const abs = path.join(ROUTES_DIR, path.basename(rel));
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  const appLevelAuth = APP_LEVEL_AUTH.some((p) => rel.endsWith(path.basename(p)));
  // Capture file-level router.use(requireX) gates too.
  const fileUseGate = /router\.use\(\s*require(Role|Module|Writer)/.test(src);

  const findings = [];
  const routeRe = /^router\.(post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(routeRe);
    if (!m) continue;
    // Crude range: up to ~200 lines of handler body, or end-of-file.
    const body = lines.slice(i, Math.min(i + 200, lines.length)).join('\n');
    const sig = lines.slice(i, Math.min(i + 8, lines.length)).join(' ');
    const inlineAuth =
      /getSessionUser\s*\(|getPreauthSession\s*\(|requireWriter\s*\(|requireUser\s*\(|isAdminPlus\s*\(|isSys\s*\(|roleLevel\s*\(|cu\.role|req\.user\?\./.test(
        body
      );
    const sigAuth = /require(Role|Module|Writer)/.test(sig);
    findings.push({
      file: rel,
      line: i + 1,
      verb: m[1].toUpperCase(),
      path: m[2],
      protected: inlineAuth || sigAuth || appLevelAuth || fileUseGate,
      source: sigAuth
        ? 'middleware-sig'
        : inlineAuth
          ? 'inline-check'
          : appLevelAuth
            ? 'app-level-authMiddleware'
            : fileUseGate
              ? 'router-use-gate'
              : 'NONE',
    });
  }
  return findings;
}

test('every mutating route has an auth/role gate or is on the public allowlist', () => {
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => `routes/${f}`);

  const all = files.flatMap(scanRouteFile);
  const unprotected = all.filter(
    (r) => !r.protected && !PUBLIC_ALLOWLIST.has(`${r.verb} ${r.path}`)
  );

  if (unprotected.length > 0) {
    const lines = unprotected.map((r) => `  ${r.file}:${r.line}  ${r.verb} ${r.path}`);
    assert.fail(
      `Found ${unprotected.length} mutating route(s) with no auth/role gate:\n${lines.join('\n')}\n\n` +
        `Fix: either add an inline requireWriter(req,res)/getSessionUser check, apply ` +
        `requireRole(N) as a middleware argument, mount the file under authMiddleware in ` +
        `index.js, OR document a public exception in PUBLIC_ALLOWLIST in this test.`
    );
  }
  // Sanity: we should find SOME routes, not zero (false green from a bad regex).
  assert.ok(all.length > 20, `expected >20 mutating routes scanned, got ${all.length}`);
});

test('app-level authMiddleware mounts are still wired up in index.js', () => {
  const src = fs.readFileSync(INDEX_JS, 'utf8');
  for (const [rel, mount] of Object.entries(APP_LEVEL_AUTH_MOUNTS)) {
    // Escape regex metacharacters in the mount path (e.g. the `-` in
    // `/api/import-wizard` is fine but be defensive).
    const esc = mount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`app\\.use\\(\\s*['"]${esc}['"]\\s*,\\s*authMiddleware`);
    assert.ok(
      pattern.test(src),
      `${rel} is on APP_LEVEL_AUTH_MOUNTS but index.js no longer mounts ${mount} with ` +
        `authMiddleware — update this test OR restore the mount before shipping.`
    );
  }
});
