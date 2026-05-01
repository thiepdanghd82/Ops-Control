/**
 * Contract: POST /api/planning/v2/kiosks/redeem (MES-2.3)
 * 5 tests — happy + 4 failure-mode shapes.
 *
 * /redeem is unauthenticated by design (the token IS the credential).
 * That gives us a fifth test: 'no x-test-user header → still works'.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildKioskApp, listen, close, req } from '../_kioskHarness.js';

let baseUrl, server, service, db;
before(async () => {
  const built = buildKioskApp();
  ({ db, service } = built);
  ({ baseUrl, server } = await listen(built.app));
});
after(() => close(server));

describe('Kiosk redeem — contract', () => {
  test('1. POST /redeem 200 — happy shape: { session_jwt, machine_code, expires_at, jti }', async () => {
    const issued = service.issuePairing('GALLUS-135', 7, db);
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(r.status, 200);
    assert.match(r.json.session_jwt, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(r.json.machine_code, 'GALLUS-135');
    assert.match(r.json.jti, /^[0-9a-f]{32}$/);
    assert.match(r.json.expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // token_hash must never be echoed back.
    assert.ok(!('token_hash' in r.json));
  });

  test('2. POST /redeem works with NO x-test-user header — token is the credential', async () => {
    const issued = service.issuePairing('BROTECH-192', 7, db);
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.machine_code, 'BROTECH-192');
  });

  test('3. POST /redeem 410 unknown token → urn:ops:kiosk-token-invalid (reason=unknown)', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: crypto.randomBytes(32).toString('base64url') },
    });
    assert.equal(r.status, 410);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:kiosk-token-invalid');
    assert.equal(r.json.reason, 'unknown');
  });

  test('4. POST /redeem 400 missing token → urn:ops:validation', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    assert.deepEqual(r.json.errors, [{ field: 'token', code: 'required' }]);
  });

  test('5. POST /redeem 400 malformed token (too short) → reason=malformed', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: 'short' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:kiosk-token-invalid');
    assert.equal(r.json.reason, 'malformed');
  });
});
