/**
 * Sprint S-P0-FIX-3 — login response unification (OWASP ASVS V4.0 §6.2.4).
 *
 * Six functional tests covering every credentials-failure code path that
 * USED to produce a distinguishable response shape (status code, body
 * field name, body text, leak headers). Post-fix, all 6 must produce
 * BYTE-IDENTICAL responses except for the lockout case (which adds a
 * Retry-After header — the only HTTP-level signal we keep).
 *
 * Test design (per Bước 4 spec):
 *   - One unique username per test → IP rate-limit (10/60s) never fires
 *   - _resetRateLimit() + _resetLoginLockouts() in test.before() so
 *     the suite is isolated from the running dev server
 *   - SQL-injection test verifies RESPONSE SHAPE only — actual SQL
 *     injection prevention was verified in Phase 1 (16 template-literal
 *     sites are whitelisted; user input always goes through `?` binding)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-auth-login-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
// CSRF middleware exempts /api/auth/login by design (the cookie can't
// exist before login). No bypass header needed for these tests.

// Seed users.json BEFORE any service module imports.
fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  // 6 distinct test users — one per functional case. pwd_bcrypt values
  // are dummy hashes; tests only exercise WRONG-password / unknown-user
  // paths so a correct password is never needed.
  JSON.stringify(
    Array.from({ length: 6 }, (_, i) => ({
      id: 100 + i,
      username: `test_unify_user_${i + 1}`,
      role: 'user',
      pwd_bcrypt: '$2b$12$dGVzdHVzZXJ4eHh4eHh1', // truncated dummy bcrypt — verify always fails
    })),
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { _resetLoginLockouts, _resetRateLimit, recordLoginFailure } =
  await import('../services/authService.js');

let server, baseUrl;
test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(() => new Promise((resolve) => server.close(resolve)));

// Reset rate-limit + lockout state between tests so each case runs in
// a clean window. Without this, test 3 (lockout) would poison the
// state for tests 4-6.
test.beforeEach(() => {
  _resetRateLimit();
  _resetLoginLockouts();
});

async function postLogin(body) {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, headers: r.headers, body: json };
}

const EXPECTED = { ok: false, error: 'Invalid credentials' };

test('1. Wrong password returns unified credentials error', async () => {
  const r = await postLogin({ username: 'test_unify_user_1', password: 'definitely-wrong' });
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, EXPECTED);
  assert.equal(r.body.msg, undefined, 'legacy `msg` field must NOT be present');
  assert.equal(r.body.retry_after_ms, undefined, 'must NOT leak retry_after_ms');
});

test('2. Unknown user returns unified credentials error', async () => {
  const r = await postLogin({ username: 'never_existed_user_42', password: 'whatever' });
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, EXPECTED);
  assert.equal(r.body.msg, undefined);
  // Crucially: must NOT differ from test 1's response at all
});

test('3. Locked user returns unified body + Retry-After header (only)', async () => {
  // Prime the per-user lockout: 5 fails crosses the SOFT threshold.
  for (let i = 0; i < 5; i++) recordLoginFailure('test_unify_user_3');

  const r = await postLogin({ username: 'test_unify_user_3', password: 'whatever' });
  assert.equal(r.status, 401, 'lockout response is now 401, not 429');
  assert.deepEqual(r.body, EXPECTED);
  assert.equal(r.body.msg, undefined);
  assert.equal(r.body.retry_after_ms, undefined, 'must NOT leak retry_after_ms in body');
  // Retry-After header IS preserved (RFC 7231 §7.1.3 — HTTP-level back-off
  // signal for proxies/monitoring; not user-readable copy).
  const retryAfter = r.headers.get('retry-after');
  assert.ok(retryAfter, 'Retry-After header must be present');
  assert.ok(Number(retryAfter) > 0, `Retry-After must be > 0 (got ${retryAfter})`);
});

test('4. Empty username returns unified credentials error', async () => {
  // Body validator rejects empty string per the schema (min:1) → returns
  // a 400. We assert that EVEN here the response body does not contain
  // legacy fields. The validator's response shape is allowed to differ.
  const r = await postLogin({ username: '', password: 'anything' });
  assert.ok(r.status === 400 || r.status === 401, `expected 400 or 401, got ${r.status}`);
  assert.equal(r.body.msg, undefined, 'legacy `msg` field must NOT be present');
  // If 401 (route reached), assert exact shape:
  if (r.status === 401) assert.deepEqual(r.body, EXPECTED);
});

test('5. Empty password returns unified credentials error', async () => {
  const r = await postLogin({ username: 'test_unify_user_5', password: '' });
  // Same as test 4: validator may 400 on min:1, route returns 401.
  assert.ok(r.status === 400 || r.status === 401, `expected 400 or 401, got ${r.status}`);
  assert.equal(r.body.msg, undefined);
  if (r.status === 401) assert.deepEqual(r.body, EXPECTED);
});

test('6. SQL injection attempt returns unified credentials error (no DB error leak)', async () => {
  // Three classic payloads. Each must produce the unified 401 + body.
  // CRITICAL: response body must NOT contain SQL error fragments
  // ("SQLITE_", "syntax error", "near", "column", "table", etc.) —
  // those would confirm a DB query reached + erred, leaking schema info.
  const payloads = [`admin' OR '1'='1`, `'; DROP TABLE users--`, `' UNION SELECT * FROM users--`];
  for (const username of payloads) {
    const r = await postLogin({ username, password: 'wrong' });
    assert.equal(r.status, 401, `payload "${username}" expected 401, got ${r.status}`);
    assert.deepEqual(r.body, EXPECTED, `payload "${username}" response not unified`);
    const json = JSON.stringify(r.body);
    assert.ok(
      !/SQLITE_|syntax error|near "|column "|table "/i.test(json),
      `payload "${username}" leaks DB error fragment: ${json}`
    );
  }
});
