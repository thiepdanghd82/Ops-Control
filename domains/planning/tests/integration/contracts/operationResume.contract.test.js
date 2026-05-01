/**
 * Contract: POST /api/planning/v2/operations/:id/resume (MES-2.5)
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
} from '../_operationsHarness.js';

let h, baseUrl, server, jwt;
before(async () => {
  h = buildOpsApp();
  ({ jwt } = mintKioskSession(h));
  ({ baseUrl, server } = await listen(h.app));
});
after(() => close(server));

function freshPausedOp(code) {
  const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code });
  h.service.start(opId, { kiosk_session_jti: 'setup-jti' });
  h.service.scan(opId, woCode, { kiosk_session_jti: 'setup-jti' });
  h.service.pause(opId, 'OPERATOR_BREAK', { kiosk_session_jti: 'setup-jti' });
  return opId;
}

describe('POST /operations/:id/resume — contract', () => {
  test('1. 200 happy path: PAUSED → RUNNING, paused_reason_code cleared', async () => {
    const opId = freshPausedOp('WO-2026-05-02001');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'RUNNING');
    assert.equal(r.json.op.paused_reason_code, null);
  });

  test('2. 400 missing Idempotency-Key', async () => {
    const opId = freshPausedOp('WO-2026-05-02002');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:idempotency-required');
  });

  test('3. 401 missing JWT', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/operations/1/resume', {
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 401);
  });

  test('4. 403 op on different work-centre → kiosk-machine-mismatch', async () => {
    const { opId } = seedOp(h.db, {
      status: 'PAUSED',
      workCentre: 'BROTECH-192',
      code: 'WO-2026-05-02004',
    });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.type, 'urn:ops:kiosk-machine-mismatch');
  });

  test('5. 409 resume from RUNNING → op-no-change translates to op-invalid-transition', async () => {
    const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-02005' });
    h.service.start(opId, { kiosk_session_jti: 'setup-jti' });
    h.service.scan(opId, woCode, { kiosk_session_jti: 'setup-jti' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:op-invalid-transition');
    assert.equal(r.json.reason, 'no-change');
  });

  test('6. idempotency replay: 2 identical resume calls → 1 audit row', async () => {
    const opId = freshPausedOp('WO-2026-05-02006');
    const key = uuid();
    const before = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_RESUME'`)
      .get().n;
    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      idemKey: key,
      body: {},
    });
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/resume`, {
      jwt,
      idemKey: key,
      body: {},
    });
    assert.equal(r1.status, 200);
    assert.deepEqual(r2.json, r1.json);
    const after = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_RESUME'`)
      .get().n;
    assert.equal(after - before, 1);
  });
});
