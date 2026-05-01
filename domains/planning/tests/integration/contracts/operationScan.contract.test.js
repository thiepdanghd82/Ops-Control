/**
 * Contract: POST /api/planning/v2/operations/:id/scan (MES-2.5)
 * 6 tests — happy + auto-transition + auth + barcode validation + replay + idem-mismatch.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpsApp,
  mintKioskSession,
  seedOp,
  listen,
  close,
  req,
  uuid,
} from '../_operationsHarness.js';

let h, baseUrl, server, jwt;
before(async () => {
  h = buildOpsApp();
  ({ jwt } = mintKioskSession(h));
  ({ baseUrl, server } = await listen(h.app));
});
after(() => close(server));

describe('POST /operations/:id/scan — contract', () => {
  test('1. 200 happy: scan in RUNNING returns op + scan_event_id; no auto-transition', async () => {
    const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-04001' });
    h.service.start(opId, { kiosk_session_jti: 'setup' });
    h.service.scan(opId, woCode, { kiosk_session_jti: 'setup' }); // → RUNNING
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: uuid(),
      body: { barcode: woCode },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'RUNNING');
    assert.equal(r.json.auto_transitioned, false);
    assert.equal(typeof r.json.scan_event_id, 'number');
  });

  test('2. 200 scan in SETUP with matching barcode → auto-transition to RUNNING', async () => {
    const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-04002' });
    h.service.start(opId, { kiosk_session_jti: 'setup' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: uuid(),
      body: { barcode: woCode },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'RUNNING');
    assert.equal(r.json.auto_transitioned, true);
  });

  test('3. 400 missing barcode → urn:ops:validation', async () => {
    const { opId } = seedOp(h.db, { status: 'RUNNING', code: 'WO-2026-05-04003' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
  });

  test('4. 401 missing JWT', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/operations/1/scan', {
      idemKey: uuid(),
      body: { barcode: 'X' },
    });
    assert.equal(r.status, 401);
  });

  test('5. idempotency mismatch: same key + different body → 409 idempotency-mismatch', async () => {
    const { opId, woCode } = seedOp(h.db, { status: 'RUNNING', code: 'WO-2026-05-04005' });
    const key = uuid();
    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: key,
      body: { barcode: woCode },
    });
    assert.equal(r1.status, 200);
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: key,
      body: { barcode: 'DIFFERENT-BARCODE' },
    });
    assert.equal(r2.status, 409);
    assert.equal(r2.json.type, 'urn:ops:idempotency-mismatch');
  });

  test('6. idempotency replay: scan auto-transition + replay returns identical body', async () => {
    const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-04006' });
    h.service.start(opId, { kiosk_session_jti: 'setup' });
    const key = uuid();
    const auditBefore = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_SCAN'`)
      .get().n;
    const body = { barcode: woCode };
    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: key,
      body,
    });
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/scan`, {
      jwt,
      idemKey: key,
      body,
    });
    assert.equal(r1.status, 200);
    assert.equal(r1.json.auto_transitioned, true);
    assert.deepEqual(r2.json, r1.json);
    assert.equal(r2.headers.get('x-idempotency-replayed'), 'true');
    const auditAfter = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_SCAN'`)
      .get().n;
    assert.equal(auditAfter - auditBefore, 1);
  });
});
