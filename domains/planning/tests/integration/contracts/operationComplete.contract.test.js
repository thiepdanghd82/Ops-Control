/**
 * Contract: POST /api/planning/v2/operations/:id/complete (MES-2.5)
 * 6 tests — happy + qty/scrap + auth + machine + transition + replay.
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

function freshRunningOp(code) {
  const { opId, woCode } = seedOp(h.db, { status: 'DISPATCHED', code });
  h.service.start(opId, { kiosk_session_jti: 'setup-jti' });
  h.service.scan(opId, woCode, { kiosk_session_jti: 'setup-jti' });
  return opId;
}

describe('POST /operations/:id/complete — contract', () => {
  test('1. 200 happy path: RUNNING → DONE, completed_at set', async () => {
    const opId = freshRunningOp('WO-2026-05-03001');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.status, 'DONE');
    assert.match(r.json.op.completed_at, /^\d{4}-/);
  });

  test('2. 200 records qty_done (mapped to good_count) + scrap_count', async () => {
    const opId = freshRunningOp('WO-2026-05-03002');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: uuid(),
      body: { qty_done: 980, scrap_count: 20 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.op.good_count, 980);
    assert.equal(r.json.op.scrap_count, 20);
  });

  test('3. 401 missing JWT', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/operations/1/complete', {
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 401);
  });

  test('4. 403 op on different work-centre', async () => {
    const { opId } = seedOp(h.db, {
      status: 'RUNNING',
      workCentre: 'BROTECH-192',
      code: 'WO-2026-05-03004',
    });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 403);
  });

  test('5. 409 complete from PENDING → op-invalid-transition', async () => {
    const { opId } = seedOp(h.db, { status: 'PENDING', code: 'WO-2026-05-03005' });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: uuid(),
      body: {},
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:op-invalid-transition');
  });

  test('6. idempotency replay: 2 identical complete calls → 1 audit row', async () => {
    const opId = freshRunningOp('WO-2026-05-03006');
    const key = uuid();
    const before = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_COMPLETE'`)
      .get().n;
    const body = { qty_done: 1000, scrap_count: 0 };
    const r1 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: key,
      body,
    });
    const r2 = await req(baseUrl, 'POST', `/api/planning/v2/operations/${opId}/complete`, {
      jwt,
      idemKey: key,
      body,
    });
    assert.equal(r1.status, 200);
    assert.deepEqual(r2.json, r1.json);
    const after = h.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE event = 'OP_COMPLETE'`)
      .get().n;
    assert.equal(after - before, 1);
  });
});
