/**
 * Contract: POST /api/planning/v2/kiosks/pairings + GET .../pairings (MES-2.3)
 * 5 tests covering happy shape + auth + RFC-7807 envelopes.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildKioskApp, listen, close, req, PLANNER, VIEWER } from '../_kioskHarness.js';

let baseUrl, server;
before(async () => {
  const { app } = buildKioskApp();
  ({ baseUrl, server } = await listen(app));
});
after(() => close(server));

describe('Kiosk pairings — contract', () => {
  test('1. POST /pairings 201 — happy shape: { id, token, pairing_url, expires_at }', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      body: { machine_code: 'GALLUS-135' },
    });
    assert.equal(r.status, 201);
    assert.equal(typeof r.json.id, 'number');
    assert.match(r.json.token, /^[A-Za-z0-9_-]+$/);
    assert.match(r.json.pairing_url, /^\/kiosk\/pair\?t=/);
    assert.match(r.json.expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('2. POST /pairings 401 — no x-test-user header → urn:ops:auth-required', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      body: { machine_code: 'GALLUS-135' },
    });
    assert.equal(r.status, 401);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:auth-required');
  });

  test('3. POST /pairings 403 — viewonly rejected', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: VIEWER,
      body: { machine_code: 'GALLUS-135' },
    });
    assert.equal(r.status, 403);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:insufficient-role');
  });

  test('4. GET /pairings 200 — list shape includes prior issues', async () => {
    await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      body: { machine_code: 'BROTECH-192' },
    });
    const r = await req(baseUrl, 'GET', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.rows));
    assert.ok(r.json.rows.length >= 1);
    const row = r.json.rows[0];
    for (const k of [
      'id',
      'machine_code',
      'issued_by_user_id',
      'issued_at_utc',
      'expires_at_utc',
    ]) {
      assert.ok(k in row, `row missing ${k}`);
    }
    // token + token_hash MUST NOT leak through the list endpoint.
    assert.ok(!('token' in row));
    assert.ok(!('token_hash' in row));
  });

  test('5. GET /pairings?active=1 200 — filter applied (no revoked or expired)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      query: { active: '1' },
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.rows));
    for (const row of r.json.rows) {
      assert.equal(row.revoked_at_utc, null);
    }
  });
});
