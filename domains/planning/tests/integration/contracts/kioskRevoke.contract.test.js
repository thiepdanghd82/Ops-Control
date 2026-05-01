/**
 * Contract: DELETE /api/planning/v2/kiosks/pairings/:id (MES-2.3)
 * 5 tests — happy + auth + role + 404 + bad-id shapes.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildKioskApp, listen, close, req, PLANNER, SYS } from '../_kioskHarness.js';

let baseUrl, server, service, db;
before(async () => {
  const built = buildKioskApp();
  ({ db, service } = built);
  ({ baseUrl, server } = await listen(built.app));
});
after(() => close(server));

describe('Kiosk revoke — contract', () => {
  test('1. DELETE /pairings/:id 204 — happy path, sys role', async () => {
    const issued = service.issuePairing('GALLUS-135', 7, db);
    const r = await req(baseUrl, 'DELETE', `/api/planning/v2/kiosks/pairings/${issued.id}`, {
      user: SYS,
    });
    assert.equal(r.status, 204);
    assert.equal(r.text, '');
  });

  test('2. DELETE /pairings/:id 401 — no x-test-user header', async () => {
    const issued = service.issuePairing('BROTECH-192', 7, db);
    const r = await req(baseUrl, 'DELETE', `/api/planning/v2/kiosks/pairings/${issued.id}`);
    assert.equal(r.status, 401);
    assert.equal(r.json.type, 'urn:ops:auth-required');
  });

  test('3. DELETE /pairings/:id 403 — planner role rejected (sys-only)', async () => {
    const issued = service.issuePairing('HP-INDIGO', 7, db);
    const r = await req(baseUrl, 'DELETE', `/api/planning/v2/kiosks/pairings/${issued.id}`, {
      user: PLANNER,
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.type, 'urn:ops:insufficient-role');
    assert.equal(r.json.required_level, 5);
  });

  test('4. DELETE /pairings/99999 404 — urn:ops:kiosk-pairing-not-found', async () => {
    const r = await req(baseUrl, 'DELETE', '/api/planning/v2/kiosks/pairings/99999', {
      user: SYS,
    });
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:kiosk-pairing-not-found');
    assert.equal(r.json.pairing_id, 99999);
  });

  test('5. DELETE /pairings/abc 400 — non-numeric id → urn:ops:validation', async () => {
    const r = await req(baseUrl, 'DELETE', '/api/planning/v2/kiosks/pairings/abc', {
      user: SYS,
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    assert.deepEqual(r.json.errors, [{ field: 'id', code: 'integer' }]);
  });
});
