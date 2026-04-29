/**
 * HTTP integration — boot the real Express app on an ephemeral port
 * and assert the global middleware pipeline works end-to-end:
 *   - security headers present on every response
 *   - request IDs echoed via X-Request-Id
 *   - /health + /ready respond correctly
 *   - 404 for unknown API routes with JSON body
 *   - global error handler returns the normalized shape (not Express default HTML)
 *
 * Runs in isolation — DATA_DIR + OPS_DB_PATH are overridden to a tmp
 * location per test run so the real library files are never touched.
 * The entry-point guard in server/index.js prevents app.listen() from
 * firing on import; this test creates its own listener on port 0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Set env BEFORE importing the app — initAuth reads DATA_DIR at import.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-http-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
// Sprint 41 — disable role-based 2FA enforcement in tests. The integration
// test seeds a sys user + uses password-only login; forcing TOTP enrollment
// would require threading a secret through the fixture. Tests that care
// about 2FA enforcement live in authService.totpFailClosed.test.js.
process.env.OPS_REQUIRE_2FA_ROLES = '';

// Sprint 24: seed a test user BEFORE the app imports so the golden
// HTTP lifecycle test (login → create quote → fetch) has a real
// credential to hit auth middleware with. Uses the legacy jsHash path
// — simplest for test bootstrap + exercised by the same checkPassword
// branch prod quotes run through after bcrypt miss.
function jsHashForSeed(pwd) {
  const s = 'ccl_2024_' + pwd;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0;
  const hU = h >>> 0;
  if (hU === 0) return '0';
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  let r = '';
  let n = hU;
  while (n > 0) { r = digits[n % 36] + r; n = Math.floor(n / 36); }
  return r;
}

const TEST_USER = 'golden-user';
const TEST_PASS = 'TestGolden123!';
const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(seedUsersPath, JSON.stringify([{
  id: 1, username: TEST_USER, role: 'sys',
  pwd: jsHashForSeed(TEST_PASS),
  lastPwdChange: new Date().toISOString(),
  permissions: { canDeleteQuote: true },
  full_name: 'Golden Test User', english_name: 'Golden', id_no: '', email: '', phone: '',
}], null, 2));

const { default: app } = await import('./index.js');
// Sprint 30 — auth audit dual-writes to SQLite. The test env shares
// one DATA_DIR and needs the schema initialized before the first
// /auth/login fires an INSERT into audit_log. initSchema is idempotent.
const { initSchema } = await import('./db/init.js');
initSchema();

let server, baseUrl;
test.before(() => {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  return new Promise((resolve) => server.close(resolve));
});

// ── Security headers ──

test('GET /health — 200 with uptime + security headers', async () => {
  const r = await fetch(`${baseUrl}/health`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  // Phase 9G.2 headers
  const pp = r.headers.get('permissions-policy');
  assert.ok(pp && pp.includes('camera=()') && pp.includes('geolocation=()'),
    'Permissions-Policy denies sensitive APIs');
  // HSTS only in production; NODE_ENV=test should omit it to avoid
  // breaking dev localhost flows.
  assert.equal(r.headers.get('strict-transport-security'), null,
    'HSTS must NOT be set in non-production NODE_ENV');
  assert.ok(r.headers.get('x-request-id'));
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.uptime_sec === 'number');
});

test('GET /ready — 200 when DATA_DIR is writable', async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});

test('security headers present on 404 responses too', async () => {
  const r = await fetch(`${baseUrl}/api/totally-made-up-route`);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
});

// ── Request ID echo ──

test('X-Request-Id: client-provided header is echoed back', async () => {
  const r = await fetch(`${baseUrl}/health`, {
    headers: { 'X-Request-Id': 'my-test-correlation-abc123' },
  });
  assert.equal(r.headers.get('x-request-id'), 'my-test-correlation-abc123');
});

test('X-Request-Id: generated when client omits', async () => {
  const r = await fetch(`${baseUrl}/health`);
  const id = r.headers.get('x-request-id');
  assert.ok(id && id.length >= 8, `expected generated id, got ${id}`);
});

test('X-Request-Id: client header truncated at 64 chars', async () => {
  const overlong = 'a'.repeat(200);
  const r = await fetch(`${baseUrl}/health`, { headers: { 'X-Request-Id': overlong } });
  const echoed = r.headers.get('x-request-id');
  assert.ok(echoed.length <= 64);
});

// ── Auth-gated routes (unauthenticated) ──

test('GET /api/shared/dashboard — 401 without auth', async () => {
  const r = await fetch(`${baseUrl}/api/shared/dashboard`);
  assert.equal(r.status, 401);
  // Body is JSON, not HTML, so clients can parse it uniformly.
  assert.ok(r.headers.get('content-type')?.includes('application/json'));
});

test('GET /api/planning/orders — 401 without auth', async () => {
  const r = await fetch(`${baseUrl}/api/planning/orders`);
  assert.equal(r.status, 401);
});

// ── 404 shape ──

test('unknown /api/ route returns JSON 404 (not HTML)', async () => {
  const r = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.ok(body.error, 'expected error field in body');
});

// Sprint 11 — regression guard for the 2026-04-23 stale-chunk crash.
// Missing /assets/* chunks MUST return a real 404, not index.html.
// If this ever regresses, browsers loading old bundles hit the SPA
// catch-all, get text/html for a .js request, and crash with a
// Strict-MIME error in the ErrorBoundary. See CLAUDE.md
// "Stale-chunk crash recovery".
test('missing /assets/* returns 404 (not SPA fallback HTML)', async () => {
  const r = await fetch(`${baseUrl}/assets/THIS-DOES-NOT-EXIST-0000.js`);
  assert.equal(r.status, 404, 'unknown assets MUST 404');
  const ct = r.headers.get('content-type') || '';
  assert.ok(!ct.includes('text/html'),
    `content-type must not be HTML (got "${ct}") — otherwise browsers crash with MIME errors`);
});

test('missing top-level .js/.css returns 404 (not SPA fallback HTML)', async () => {
  for (const ext of ['js', 'css', 'map']) {
    const r = await fetch(`${baseUrl}/nonexistent-0000.${ext}`);
    assert.equal(r.status, 404, `*.${ext} must 404`);
  }
});

// ── Phase 9F.2 — error handler whitelist ──
// The global error handler only fires when a handler calls next(err) or
// throws. Most routes here handle errors inline (return 401/400) and
// bypass it — correlation IDs on those responses travel via the
// `X-Request-Id` header rather than the body. We verify the end-to-end
// header contract on both inline-responded and not-found paths.
test('4xx responses carry X-Request-Id header for correlation', async () => {
  const r = await fetch(`${baseUrl}/api/shared/dashboard`, {
    headers: { Authorization: 'malformed' },
  });
  assert.equal(r.status, 401);
  assert.ok(r.headers.get('x-request-id'), 'X-Request-Id header set on auth failures');
  const body = await r.json();
  // 4xx messages ARE still surfaced (client caused it).
  assert.ok(typeof body.error === 'string' && body.error.length > 0);
});

test('404 for unknown /api/ path still echoes X-Request-Id', async () => {
  const r = await fetch(`${baseUrl}/api/totally-nonexistent`);
  assert.equal(r.status, 404);
  assert.ok(r.headers.get('x-request-id'), 'request-id header always set');
});

// ── Phase 9H — auth cookie + CSRF ──

test('POST /api/auth/login is exempt from CSRF (no cookie yet)', async () => {
  // Send an obviously bad credential — expect 401, NOT 403 csrf_failed.
  // This proves the CSRF middleware exempts /auth/login.
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nobody', password: 'nope' }),
  });
  assert.ok(r.status === 401 || r.status === 400, `expected auth failure, got ${r.status}`);
  const body = await r.json();
  // Must NOT be a csrf rejection
  assert.notEqual(body.error, 'csrf_failed');
});

test('POST with Authorization header (no cookie) skips CSRF check', async () => {
  // Legacy clients use Bearer tokens — CSRF doesn't apply because
  // browsers don't auto-attach Authorization cross-origin. The handler
  // reaches auth and returns 401 for bad token (not 403 csrf_failed).
  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
    body: JSON.stringify({}),
  });
  // Either 401 (bad token) or 400 (bad payload) is acceptable — the
  // critical assertion is it did NOT get blocked by CSRF.
  const body = await r.json();
  assert.notEqual(body.error, 'csrf_failed', 'header-auth must skip CSRF');
});

test('POST with cookie session but no X-CSRF-Token header → 403 csrf_failed', async () => {
  // Simulate a browser with auth cookie but missing CSRF header (the
  // classic CSRF forgery shape: attacker posts from evil.com, browser
  // sends the cookie automatically but cannot read/send the CSRF value).
  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'ops_session=stale; ops_csrf=abc123',
    },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.error, 'csrf_failed');
  assert.equal(body.reason, 'missing_csrf_header');
});

test('POST with cookie + matching CSRF header passes the CSRF gate', async () => {
  // CSRF check passes → request proceeds to auth middleware which
  // rejects the stale session token with 401. We just need to confirm
  // the 403 csrf_failed body is NOT present.
  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'ops_session=stale; ops_csrf=match-me',
      'X-CSRF-Token': 'match-me',
    },
    body: JSON.stringify({}),
  });
  const body = await r.json();
  assert.notEqual(body.error, 'csrf_failed', 'CSRF must pass with matching header');
});

test('GET requests never require CSRF (safe method)', async () => {
  const r = await fetch(`${baseUrl}/api/shared/dashboard`, {
    headers: { Cookie: 'ops_session=stale; ops_csrf=abc' },
  });
  // 401 Unauthorized (bad token) — but NOT csrf_failed.
  assert.equal(r.status, 401);
});

test('POST /api/totp/verify exempt from CSRF (pre-auth flow)', async () => {
  // TOTP verify runs after password but before full authentication;
  // the CSRF cookie may not exist yet. Exemption is safe because the
  // endpoint itself validates the pre-auth token + TOTP code.
  const r = await fetch(`${baseUrl}/api/totp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'x', code: '000000' }),
  });
  const body = await r.json();
  assert.notEqual(body.error, 'csrf_failed');
});

// ══════════════════════════════════════════════════════════════════
// Sprint 24 — HTTP lifecycle golden
// ══════════════════════════════════════════════════════════════════
// Full round-trip against the real Express app + disk-backed storage:
//   login → POST /api/quotes (upsertQuote path) → GET /api/shared/quotes
//   → PATCH /api/quotes/:id → verify round-trip.
//
// This is the top-of-stack complement to the reducer-level and engine
// golden tests. Sprint 11's lost-update fix, Sprint 13's /save-all
// isolation, Sprint 18's schema stamping — they all intersect here.
// Bearer auth keeps CSRF out of the picture so the test focuses on
// the persistence + auth contract.

// Cached bearer token — the auth rate limiter blocks 11+ login
// attempts per 60s, and the test suite has grown past that cap as
// we added more lifecycle cases. Caching one token per suite run
// avoids tripping the limiter and matches how real clients behave
// (login once, reuse token across requests).
let _cachedToken = null;
async function login() {
  if (_cachedToken) return _cachedToken;
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
  });
  const body = await r.json();
  assert.equal(r.status, 200, `login failed: ${JSON.stringify(body)}`);
  assert.ok(body.token, 'login response must carry bearer token');
  assert.ok(body.user?.username === TEST_USER, 'user echoed in response');
  _cachedToken = body.token;
  return body.token;
}

function authed(token, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  return { ...opts, headers };
}

test('lifecycle: login with bad credentials → 401', async () => {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: 'wrong' }),
  });
  assert.equal(r.status, 401);
});

test('lifecycle: login with seeded user returns a bearer token + user info', async () => {
  const token = await login();
  assert.ok(token.length > 20, 'token non-trivial length');
});

// ── Sprint 41 — 2FA bypass regression (real HTTP login flow) ──────
// Background: the TOTP incident (Apr 2026) exposed that when the secrets
// file is missing/empty, all users — including sys/admin — got a fully
// verified session from /api/auth/login (bypass). The fix enforces
// enrollment when role policy demands TOTP. These tests lock the fix in
// at the HTTP boundary, not just unit level.

test('2FA enforcement: sys role with OPS_REQUIRE_2FA_ROLES → enrollment_required=true', async () => {
  // Re-enable role-based policy for this test ONLY. Restore at end so
  // the broader suite keeps running with its default "2FA off" setup.
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = 'sys,admin';
  try {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
    });
    const body = await r.json();
    assert.equal(r.status, 200, 'password still correct → 200');
    assert.ok(body.token, 'still issues a token so client can move to enrollment');
    assert.equal(body.totp_enrollment_required, true,
      'sys role with no secret MUST trigger enrollment flow — closes the bypass');

    // The enrollment-pending token must NOT grant app access — getSessionUser
    // rejects it. Fetching a protected route should 401.
    const probe = await fetch(`${baseUrl}/api/shared/quotes`, authed(body.token));
    assert.equal(probe.status, 401,
      'protected routes MUST reject enrollment-pending sessions');
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('2FA enforcement: /api/auth/me exposes totp_enrollment_required flag', async () => {
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = 'sys,admin';
  try {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
    });
    const body = await r.json();
    // /auth/me is reachable with preauth session so the client can decide
    // between "enter OTP" vs "scan QR" without hitting getSessionUser.
    const me = await fetch(`${baseUrl}/api/auth/me`, authed(body.token));
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.equal(meBody.totp_pending, true);
    assert.equal(meBody.totp_enrollment_required, true,
      'client uses this to show QR-setup UI instead of OTP-entry UI');
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('2FA enforcement: enrollment-pending session rejected by /totp/secret (rotation-only endpoint)', async () => {
  // After the atomic-enroll refactor, /totp/secret is rotation-only —
  // requires a FULLY-verified session. First-time enrollment must use
  // the new /totp/enroll endpoint (verify-then-save, atomic). This test
  // locks that contract: even a valid enrollment-pending token cannot
  // persist a secret via /totp/secret.
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = 'sys,admin';
  try {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
    });
    const body = await r.json();
    assert.equal(body.totp_enrollment_required, true);

    const save = await fetch(`${baseUrl}/api/totp/secret`, authed(body.token, {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, secret: 'JBSWY3DPEHPK3PXP' }),
    }));
    assert.equal(save.status, 401,
      '/totp/secret must reject enrollment-pending sessions — forces use of atomic /totp/enroll');
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('lifecycle: POST /api/quotes creates quote + GET /api/shared/quotes round-trips it', async () => {
  const token = await login();

  // Create.
  const payload = {
    type: 'standard',
    state: { rfq_number: 'GOLD-HTTP-001', ccl_pn: 'HT-01', selling_price: 0.08 },
    result: { sp: 0.08, s_ttl: 0.05, gm: 0.375, va: 0.4, s_mat_cost: 0.03, tooling: 0, packing_ship: 0.01 },
    label: 'HTTP golden quote',
  };
  const rCreate = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST', body: JSON.stringify(payload),
  }));
  assert.equal(rCreate.status, 200);
  const bodyCreate = await rCreate.json();
  assert.equal(bodyCreate.ok, true);
  const saved = bodyCreate.quote;
  assert.ok(typeof saved.id === 'number', 'server assigned a numeric id');
  assert.equal(saved.state.rfq_number, 'GOLD-HTTP-001');
  // Server stamps saved_at if caller omitted.
  assert.ok(saved.saved_at, 'saved_at stamped by server');

  // Fetch — GET uses the shared router.
  const rList = await fetch(`${baseUrl}/api/shared/quotes`, authed(token));
  assert.equal(rList.status, 200);
  const list = await rList.json();
  assert.ok(Array.isArray(list), 'shared/quotes returns array');
  const found = list.find(q => q.id === saved.id);
  assert.ok(found, 'new quote visible via GET');
  assert.equal(found.label, 'HTTP golden quote');
  assert.equal(found.state.ccl_pn, 'HT-01');
  assert.equal(found.result.gm, 0.375);
});

test('lifecycle: PATCH /api/quotes/:id replaces fields + preserves untouched ones', async () => {
  const token = await login();
  const create = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST',
    body: JSON.stringify({ type: 'standard', state: { ccl_pn: 'PATCH-TEST', selling_price: 0.1 }, label: 'pre-patch' }),
  }));
  const { quote } = await create.json();

  // Patch — update state + label; result untouched.
  const rPatch = await fetch(`${baseUrl}/api/quotes/${quote.id}`, authed(token, {
    method: 'PATCH',
    body: JSON.stringify({ state: { ccl_pn: 'PATCH-TEST-v2' }, label: 'post-patch' }),
  }));
  assert.equal(rPatch.status, 200);
  const bodyPatch = await rPatch.json();
  assert.equal(bodyPatch.quote.id, quote.id, 'same id preserved');
  assert.equal(bodyPatch.quote.label, 'post-patch');
  assert.equal(bodyPatch.quote.state.ccl_pn, 'PATCH-TEST-v2');
});

test('lifecycle: parallel POST /api/quotes yields N unique ids (race-free)', async () => {
  // Sprint 11 concurrency fix exercised over the real HTTP surface.
  // Pre-fix, `saveQuote` in api.js did GET full history → mutate →
  // POST /save-all. Two concurrent callers could each POST N+1 rows
  // and clobber each other's addition. Post-fix, /api/quotes delegates
  // to upsertQuote with withLock('quotes'), serializing the write.
  const token = await login();
  const N = 8;
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push(fetch(`${baseUrl}/api/quotes`, authed(token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'standard',
        state: { rfq_number: `PARALLEL-${i}`, selling_price: 0.05 },
        label: `Parallel #${i}`,
      }),
    })).then(r => r.json()));
  }
  const results = await Promise.all(promises);
  const ids = results.map(r => r.quote?.id).filter(Boolean).sort((a, b) => a - b);
  assert.equal(ids.length, N, `all ${N} POSTs returned an id`);
  assert.equal(new Set(ids).size, N, 'all ids unique — no lost updates');

  // Verify all landed on disk.
  const list = await fetch(`${baseUrl}/api/shared/quotes`, authed(token)).then(r => r.json());
  const rfqs = new Set(list.map(q => q.state?.rfq_number));
  for (let i = 0; i < N; i++) assert.ok(rfqs.has(`PARALLEL-${i}`), `RFQ PARALLEL-${i} persisted`);
});

test('lifecycle: POST /api/quotes rejects non-object body', async () => {
  const token = await login();
  const r = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST', body: JSON.stringify([1, 2, 3]),
  }));
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.ok(body.error, 'error message present');
});

test('lifecycle: PATCH /api/quotes/:id with non-numeric id → 400', async () => {
  const token = await login();
  const r = await fetch(`${baseUrl}/api/quotes/abc`, authed(token, {
    method: 'PATCH', body: JSON.stringify({ label: 'x' }),
  }));
  assert.equal(r.status, 400);
});

test('lifecycle: POST /api/quotes without auth → 401', async () => {
  const r = await fetch(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'standard', state: {} }),
  });
  assert.equal(r.status, 401);
});

// ══════════════════════════════════════════════════════════════════
// Sprint 31 — audit log filter API
// ══════════════════════════════════════════════════════════════════
// Finance/compliance admins need targeted audit pulls (which user
// did what, when). Sprint 30 moved storage to SQLite (unbounded
// retention); Sprint 31 raised the limit cap + pushes user-filter
// to SQL while keeping event substring + `since` flexible.

test('audit-log: 403 for non-sys user (seeded user role=sys passes)', async () => {
  // The seeded golden-user has role=sys so it should get through. We
  // verify the 403 gate by faking a bad token (no valid session).
  const r = await fetch(`${baseUrl}/api/auth/audit-log?limit=10`, {
    headers: { Authorization: 'Bearer fake-token-no-session' },
  });
  // 401 (bad token) or 403 (no sys role) — either proves the gate.
  assert.ok(r.status === 401 || r.status === 403, `expected auth gate, got ${r.status}`);
});

// One shared login for all audit-log tests — avoids the login rate
// limiter (10/min/IP) which would otherwise kick in once we've run
// quote-lifecycle + audit tests together.
let _sharedSysToken = null;
async function sysToken() {
  if (_sharedSysToken) return _sharedSysToken;
  _sharedSysToken = await login();
  return _sharedSysToken;
}

test('audit-log: sys user pulls tail + filter by event substring', async () => {
  const token = await sysToken();

  // Plain pull — should include the recent LOGIN events from prior tests.
  const r1 = await fetch(`${baseUrl}/api/auth/audit-log?limit=20`, authed(token));
  assert.equal(r1.status, 200);
  const body1 = await r1.json();
  assert.equal(body1.ok, true);
  assert.ok(Array.isArray(body1.entries));
  assert.ok(body1.entries.length >= 1, 'at least one audit row expected after prior logins');
  // Every entry has the expected shape.
  for (const e of body1.entries) {
    assert.ok(typeof e.ts === 'string');
    assert.ok(typeof e.event === 'string');
  }

  // Filter by event substring — case-insensitive partial match.
  const r2 = await fetch(`${baseUrl}/api/auth/audit-log?limit=20&event=login`, authed(token));
  const body2 = await r2.json();
  for (const e of body2.entries) {
    assert.match(e.event.toLowerCase(), /login/,
      `event filter should only return rows with 'login' substring, got ${e.event}`);
  }
});

test('audit-log: filter by exact user pushes to SQL WHERE', async () => {
  const token = await sysToken();
  const r = await fetch(`${baseUrl}/api/auth/audit-log?limit=50&user=${TEST_USER}`, authed(token));
  assert.equal(r.status, 200);
  const body = await r.json();
  // Every row must match the exact user (no prefix / substring matches).
  for (const e of body.entries) {
    assert.equal(e.user, TEST_USER, `user filter: expected '${TEST_USER}', got '${e.user}'`);
  }
});

test('audit-log: since filter drops older entries', async () => {
  const token = await sysToken();
  const futureIso = '2099-01-01T00:00:00Z';
  const r = await fetch(`${baseUrl}/api/auth/audit-log?limit=100&since=${encodeURIComponent(futureIso)}`, authed(token));
  const body = await r.json();
  assert.equal(body.entries.length, 0, 'future since filter must drop all historical entries');
});

test('audit-log: limit cap enforced (max 5000)', async () => {
  const token = await sysToken();
  const r = await fetch(`${baseUrl}/api/auth/audit-log?limit=99999`, authed(token));
  const body = await r.json();
  assert.ok(body.entries.length <= 5000, `limit must cap at 5000, got ${body.entries.length}`);
});

// ══════════════════════════════════════════════════════════════════
// Sprint 39 — API versioning (/api/v1/* alongside /api/*)
// ══════════════════════════════════════════════════════════════════
// Both prefixes mount the same routers. Existing clients calling
// /api/foo keep working; clients that want to pin a contract use
// /api/v1/foo. Future v2 mounts alongside without breaking v1.

test('api-v1: /api/v1/ping returns the same shape as /api/ping', async () => {
  const r1 = await fetch(`${baseUrl}/api/ping`);
  const r2 = await fetch(`${baseUrl}/api/v1/ping`);
  assert.equal(r1.status, r2.status, 'both prefixes return same HTTP status');
  const b1 = await r1.json();
  const b2 = await r2.json();
  // Same keys — server version / status shape stable across prefix.
  assert.deepEqual(Object.keys(b1).sort(), Object.keys(b2).sort());
});

test('api-v1: /api/v1/auth/login works identically to /api/auth/login', async () => {
  const r = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
  });
  const body = await r.json();
  assert.equal(r.status, 200, `login via /api/v1/ should 200, got ${r.status}`);
  assert.ok(body.token);
  assert.equal(body.user.username, TEST_USER);
});

test('api-v1: /api/v1/quotes POST + GET shares storage with /api/quotes', async () => {
  const token = await sysToken();
  // Create via v1 prefix.
  const rCreate = await fetch(`${baseUrl}/api/v1/quotes`, authed(token, {
    method: 'POST',
    body: JSON.stringify({ type: 'standard', state: { rfq_number: 'V1-TEST' }, label: 'v1 test' }),
  }));
  const { quote } = await rCreate.json();
  assert.ok(quote.id);

  // Read via the un-versioned prefix — must see the same row (single
  // storage, two URL aliases).
  const rList = await fetch(`${baseUrl}/api/shared/quotes`, authed(token));
  const list = await rList.json();
  const found = list.find(q => q.id === quote.id);
  assert.ok(found, 'quote created via /api/v1/ visible via /api/shared/quotes');
  assert.equal(found.state.rfq_number, 'V1-TEST');
});

test('api-v1: unknown route under /api/v1 returns 404 JSON (same as /api)', async () => {
  const r = await fetch(`${baseUrl}/api/v1/does-not-exist`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.ok(body.error);
});

// ── Sprint AV — Approval workflow e2e ───────────────────────────────
//
// Walks the critical approval pipeline end-to-end via real HTTP calls:
//
//   1. Sys user logs in, creates a draft quote.
//   2. SUBMIT transition  → state.approval.status = pending_sales.
//   3. APPROVE_SALES      → state.approval.status = pending_finance.
//   4. APPROVE_FINANCE    → state.approval.status = approved.
//   5. REVOKE             → state.approval.status = draft (unlocks
//      pricing fields + clears rates_snapshot server-side).
//
// Each transition returns the authoritative new approval object so the
// client never drifts against server state. This lifecycle is what
// Sprint 6.2 introduced atomic endpoints for; catching a regression
// here means no user ever lands on a mid-state stuck quote.

test('approval-e2e: full lifecycle submit → sales → finance → approve → revoke', async () => {
  const token = await login();

  // 1) Create a draft quote with enough state that the approval
  //    machine's pre-transition validators are happy. Golden path
  //    only — edge cases live in approvalWorkflow.test.js.
  const create = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'standard',
      label: 'e2e approval',
      state: {
        rfq_number: 'E2E-APPR-001',
        ccl_pn: 'E2E-001',
        site: 'VN',
        direct_cu: 'Test CU',
        end_cu: 'Test End',
        npi_owner: 'tester',
        sale_owner: 'tester',
        project: 'e2e',
        moq: 1000,
        selling_price: 0.5,
        annual_qty: 10000,
      },
    }),
  }));
  assert.equal(create.status, 200, 'create quote must succeed');
  const { quote } = await create.json();
  const quoteId = quote.id;
  assert.ok(quoteId, 'created quote has id');

  // Helper — hit the atomic transition endpoint and return the new
  // approval object. Status 200 = applied + persisted.
  async function transition(action, reason) {
    const r = await fetch(`${baseUrl}/api/shared/approvals/${quoteId}/transition`, authed(token, {
      method: 'POST',
      body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
    }));
    const body = await r.json();
    assert.equal(r.status, 200, `${action} must succeed, got ${r.status}: ${JSON.stringify(body)}`);
    return body.approval;
  }

  // 2) SUBMIT → pending_sales
  let appr = await transition('SUBMIT');
  assert.equal(appr.status, 'pending_sales', 'SUBMIT → pending_sales');
  assert.ok(appr.submitted_at, 'submitted_at timestamp recorded');

  // 3) APPROVE_SALES → pending_finance
  appr = await transition('APPROVE_SALES');
  assert.equal(appr.status, 'pending_finance', 'APPROVE_SALES → pending_finance');

  // 4) APPROVE_FINANCE → approved
  appr = await transition('APPROVE_FINANCE');
  assert.equal(appr.status, 'approved', 'APPROVE_FINANCE → approved');
  assert.ok(appr.approved_at, 'approved_at timestamp recorded');

  // 5) Full-list read must reflect the final state — the atomic
  //    endpoint only returns the one changed approval, so we verify
  //    the full-fetch sees the same thing (tests single-source-of-truth).
  const list = await fetch(`${baseUrl}/api/shared/quotes`, authed(token)).then(r => r.json());
  const persisted = list.find(q => q.id === quoteId);
  assert.ok(persisted, 'quote visible in list after approval');
  assert.equal(persisted.state.approval.status, 'approved',
    'persisted approval status matches atomic-endpoint response');

  // 6) REVOKE → draft. Sys role is allowed from any state.
  appr = await transition('REVOKE', 'e2e cleanup');
  assert.equal(appr.status, 'draft', 'REVOKE → draft');
});

test('approval-e2e: SUBMIT on non-draft quote rejected with 400', async () => {
  // Locks the state-machine guard: you can't submit a quote that's
  // already in flight. Regression in approvalWorkflow.js could let
  // a double-submit pass and produce a weird half-transitioned state.
  const token = await login();
  const create = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'standard', label: 'e2e guard',
      state: {
        rfq_number: 'E2E-GUARD', ccl_pn: 'E2E-G', site: 'VN',
        direct_cu: 'CU', end_cu: 'E', npi_owner: 't', sale_owner: 't',
        project: 'g', moq: 1000, selling_price: 0.5, annual_qty: 10000,
      },
    }),
  }));
  const { quote } = await create.json();
  const id = quote.id;

  // First SUBMIT: success.
  const r1 = await fetch(`${baseUrl}/api/shared/approvals/${id}/transition`, authed(token, {
    method: 'POST', body: JSON.stringify({ action: 'SUBMIT' }),
  }));
  assert.equal(r1.status, 200);

  // Second SUBMIT from pending_sales: machine rejects.
  const r2 = await fetch(`${baseUrl}/api/shared/approvals/${id}/transition`, authed(token, {
    method: 'POST', body: JSON.stringify({ action: 'SUBMIT' }),
  }));
  assert.equal(r2.status, 400, 'duplicate SUBMIT must be rejected');
});

test('approval-e2e: REJECT carries reason text through to persistence', async () => {
  const token = await login();
  const create = await fetch(`${baseUrl}/api/quotes`, authed(token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'standard', label: 'e2e reject',
      state: {
        rfq_number: 'E2E-REJ', ccl_pn: 'E2E-R', site: 'VN',
        direct_cu: 'CU', end_cu: 'E', npi_owner: 't', sale_owner: 't',
        project: 'r', moq: 1000, selling_price: 0.5, annual_qty: 10000,
      },
    }),
  }));
  const { quote } = await create.json();
  const id = quote.id;

  // SUBMIT then REJECT with a reason.
  await fetch(`${baseUrl}/api/shared/approvals/${id}/transition`, authed(token, {
    method: 'POST', body: JSON.stringify({ action: 'SUBMIT' }),
  }));
  const reject = await fetch(`${baseUrl}/api/shared/approvals/${id}/transition`, authed(token, {
    method: 'POST', body: JSON.stringify({ action: 'REJECT', reason: 'price too low' }),
  }));
  assert.equal(reject.status, 200);
  const { approval } = await reject.json();
  assert.equal(approval.status, 'rejected');
  // reason is sanitized server-side — should survive unchanged for
  // a simple alphanumeric message. Locks the sanitizer not stripping
  // legitimate input. Field name is `reason` on the approval object
  // (see approvalWorkflow.js line ~231).
  assert.ok(approval.reason && approval.reason.includes('price too low'),
    `approval.reason should include original text, got: ${approval.reason}`);
});
