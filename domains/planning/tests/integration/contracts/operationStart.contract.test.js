/**
 * Contract: POST /api/planning/v2/operations/:id/start (MES-2.5)
 * 6 tests — happy + auth + idem + machine + transition + replay.
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
  MACHINE,
} from '../_operationsHarness.js';

let h, baseUrl, server, jwt;
before(async () => {
  h = buildOpsApp();
  ({ jwt } = mintKioskSession(h));
  ({ baseUrl, server } = await listen(h.app));
});
after(() => close(server));

describe('POST /operations/:id/start — contract', () => {
  test('1. 200 happy path: DISPATCHED → SETUP, op snapshot returned', async () => {
    const { opId } = seedOp(h.db, { status: 'DISPATCHED' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'SETUP');
    assert.match(r.json.op.started_at, /^\d{4}-/);
  });

  test('2. 400 missing Idempotency-Key → urn:ops:idempotency-required', async () => {
    const { opId } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-00100' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:idempotency-required');
  });

  test('3. 401 invalid JWT', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/operations/1/start', {
      jwt: 'bogus.jwt.value',
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 401);
    assert.equal(r.json.type, 'urn:ops:kiosk-session-invalid');
  });

  test('4. 403 op on a different work-centre → kiosk-machine-mismatch', async () => {
    const { opId } = seedOp(h.db, {
      status: 'DISPATCHED',
      workCentre: 'BROTECH-192',
      code: 'WO-2026-05-00200',
    });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.type, 'urn:ops:kiosk-machine-mismatch');
  });

  test('5. 409 invalid transition: start from PENDING → op-invalid-transition with allowed_from', async () => {
    const { opId } = seedOp(h.db, { status: 'PENDING', code: 'WO-2026-05-00300' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:op-invalid-transition');
    assert.ok(Array.isArray(r.json.allowed_from));
    assert.ok(r.json.allowed_from.includes('DISPATCHED'));
  });

  test('6. idempotency replay: same key+body returns cached body, audit row count stays 1', async () => {
    const { opId } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-00400' });
    const key = uuid();
    const auditBefore = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_START'`)
      .get().n;

    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      idemKey: key,
      body: {},
    });
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/start`, {
      jwt,
      idemKey: key,
      body: {},
    });

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.json, r1.json, 'replay body byte-for-byte equal');
    assert.equal(r2.headers.get('x-idempotency-replayed'), 'true');
    const auditAfter = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_START'`)
      .get().n;
    assert.equal(auditAfter - auditBefore, 1, 'service called only once across the 2 requests');
  });
});
