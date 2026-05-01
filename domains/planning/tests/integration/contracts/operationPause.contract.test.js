/**
 * Contract: POST /api/planning/v2/operations/:id/pause (MES-2.5)
 * 6 tests — happy + reason validation + auth + machine + transition + replay.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
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

// Helper: bring an op to RUNNING via service so /pause has work to do.
function freshRunningOp(code) {
  const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code });
  h.service.start(opId, { kiosk_session_jti: 'setup-jti' });
  h.service.scan(opId, woCode, { kiosk_session_jti: 'setup-jti' });
  return opId;
}

describe('POST /operations/:id/pause — contract', () => {
  test('1. 200 happy path: RUNNING → PAUSED with valid reason_code', async () => {
    const opId = freshRunningOp('WO-2026-05-01001');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: uuid(),
      body: { reason_code: 'OPERATOR_BREAK' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'PAUSED');
    assert.equal(r.json.op.paused_reason_code, 'OPERATOR_BREAK');
  });

  test('2. 422 unknown reason_code → urn:ops:reason-code-unknown', async () => {
    const opId = freshRunningOp('WO-2026-05-01002');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: uuid(),
      body: { reason_code: 'NOT_REAL' },
    });
    assert.equal(r.status, 422);
    assert.equal(r.json.type, 'urn:ops:reason-code-unknown');
  });

  test('3. 400 missing reason_code → op-reason-required', async () => {
    const opId = freshRunningOp('WO-2026-05-01003');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:op-reason-required');
  });

  test('4. 401 missing JWT', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/operations/1/pause', {
      idemKey: uuid(),
      body: { reason_code: 'OPERATOR_BREAK' },
    });
    assert.equal(r.status, 401);
  });

  test('5. 409 pause from DISPATCHED → op-invalid-transition (allowed_from=[RUNNING])', async () => {
    const { opId } = seedOp(h.db, { status: 'DISPATCHED', code: 'WO-2026-05-01005' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: uuid(),
      body: { reason_code: 'OPERATOR_BREAK' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:op-invalid-transition');
    assert.ok(r.json.allowed_from.includes('RUNNING'));
  });

  test('6. idempotency replay: 2 identical pause calls → 1 audit row', async () => {
    const opId = freshRunningOp('WO-2026-05-01006');
    const key = uuid();
    const auditBefore = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_PAUSE'`)
      .get().n;
    const body = { reason_code: 'QUALITY_HOLD' };
    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: key,
      body,
    });
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/pause`, {
      jwt,
      idemKey: key,
      body,
    });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.json, r1.json);
    const auditAfter = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_PAUSE'`)
      .get().n;
    assert.equal(auditAfter - auditBefore, 1);
  });
});
