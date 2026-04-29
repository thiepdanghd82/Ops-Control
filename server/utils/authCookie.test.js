/**
 * authCookie — Phase 9H tests.
 *
 * Covers pure helpers only; the Express integration of res.cookie +
 * login endpoint flow is exercised in http.integration.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCookies, generateCsrfToken, readSessionToken, checkCsrf,
  SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER,
} from './authCookie.js';

function req(cookieHeader, extraHeaders = {}, method = 'GET') {
  return {
    method,
    headers: {
      ...(cookieHeader != null ? { cookie: cookieHeader } : {}),
      ...extraHeaders,
    },
  };
}

// ── parseCookies ──

test('parseCookies: empty / missing header → {}', () => {
  assert.deepEqual(parseCookies(req()), {});
  assert.deepEqual(parseCookies(req('')), {});
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({}), {});
});

test('parseCookies: single cookie', () => {
  const c = parseCookies(req('ops_session=abc123'));
  assert.equal(c.ops_session, 'abc123');
});

test('parseCookies: multiple cookies separated by ; ', () => {
  const c = parseCookies(req('ops_session=abc; ops_csrf=def456; theme=dark'));
  assert.equal(c.ops_session, 'abc');
  assert.equal(c.ops_csrf, 'def456');
  assert.equal(c.theme, 'dark');
});

test('parseCookies: URI-decoded values', () => {
  const c = parseCookies(req('name=John%20Doe'));
  assert.equal(c.name, 'John Doe');
});

test('parseCookies: malformed pairs skipped', () => {
  const c = parseCookies(req('onlyname; =onlyvalue; a=1; ; b=2'));
  assert.equal(c.a, '1');
  assert.equal(c.b, '2');
  assert.equal(c.onlyname, undefined);
});

test('parseCookies: duplicate cookie — last wins (matches browser behavior)', () => {
  const c = parseCookies(req('k=first; k=second'));
  assert.equal(c.k, 'second');
});

// ── generateCsrfToken ──

test('generateCsrfToken: 16 random bytes base64url', () => {
  const t = generateCsrfToken();
  assert.ok(typeof t === 'string' && t.length >= 20, 'token length suggests 16 bytes b64url');
  // base64url: A-Z a-z 0-9 - _  (no padding)
  assert.ok(/^[A-Za-z0-9_-]+$/.test(t), 'only base64url chars');
});

test('generateCsrfToken: unique per call', () => {
  const a = generateCsrfToken();
  const b = generateCsrfToken();
  assert.notEqual(a, b);
});

// ── readSessionToken ──

test('readSessionToken: cookie preferred over header', () => {
  const r = readSessionToken(req('ops_session=cookieTok', { authorization: 'Bearer headerTok' }));
  assert.equal(r.token, 'cookieTok');
  assert.equal(r.source, 'cookie');
});

test('readSessionToken: header fallback when no cookie', () => {
  const r = readSessionToken(req(undefined, { authorization: 'Bearer headerTok' }));
  assert.equal(r.token, 'headerTok');
  assert.equal(r.source, 'header');
});

test('readSessionToken: no token at all', () => {
  const r = readSessionToken(req());
  assert.equal(r.token, null);
  assert.equal(r.source, 'none');
});

test('readSessionToken: non-Bearer Authorization ignored', () => {
  const r = readSessionToken(req(undefined, { authorization: 'Basic xyz' }));
  assert.equal(r.source, 'none');
});

// ── checkCsrf ──

test('checkCsrf: GET/HEAD/OPTIONS always pass (safe methods)', () => {
  assert.equal(checkCsrf(req(undefined, {}, 'GET')).ok, true);
  assert.equal(checkCsrf(req(undefined, {}, 'HEAD')).ok, true);
  assert.equal(checkCsrf(req(undefined, {}, 'OPTIONS')).ok, true);
});

test('checkCsrf: header-auth request skips CSRF (legacy path)', () => {
  const r = checkCsrf(req(undefined, { authorization: 'Bearer tok' }, 'POST'));
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'header-auth-skip');
});

test('checkCsrf: cookie-auth POST without header → 403 missing_csrf_header', () => {
  const r = checkCsrf(req('ops_session=s; ops_csrf=c', {}, 'POST'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_csrf_header');
});

test('checkCsrf: cookie-auth POST with matching header → ok', () => {
  const r = checkCsrf(req('ops_session=s; ops_csrf=matching', { [CSRF_HEADER]: 'matching' }, 'POST'));
  assert.equal(r.ok, true);
});

test('checkCsrf: cookie-auth POST with mismatched header → 403 csrf_mismatch', () => {
  const r = checkCsrf(req('ops_session=s; ops_csrf=expected', { [CSRF_HEADER]: 'forged' }, 'POST'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'csrf_mismatch');
});

test('checkCsrf: cookie without ops_csrf value → missing_csrf_cookie', () => {
  // Session cookie present but CSRF cookie wasn't set (shouldn't
  // happen in practice — login sets both — but we defend the boundary).
  const r = checkCsrf(req('ops_session=s', { [CSRF_HEADER]: 'anything' }, 'POST'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_csrf_cookie');
});

// ── constants ──

test('exported constants match the conventions used elsewhere', () => {
  assert.equal(SESSION_COOKIE, 'ops_session');
  assert.equal(CSRF_COOKIE, 'ops_csrf');
  assert.equal(CSRF_HEADER, 'x-csrf-token');
});
