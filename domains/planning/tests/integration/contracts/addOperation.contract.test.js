/**
 * Contract: POST /api/planning/v2/work-orders/:id/operations
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, VIEWER, VALID_BODY } from './_harness.js';

let baseUrl, server, service;
before(async () => {
  const harness = buildApp();
  service = harness.service;
  ({ baseUrl, server } = await listen(harness.app));
});
after(() => close(server));

describe('POST /api/planning/v2/work-orders/:id/operations', () => {
  test('201 — happy path: attach FLEXO op with auto-seq', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: PLANNER,
      body: { op_type: 'FLEXO', work_centre_no: 'WC-FX-01' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.work_order_id, wo.id);
    assert.equal(r.json.seq, 10);
    assert.equal(r.json.op_type, 'FLEXO');
    assert.equal(r.json.status, 'PENDING');
  });

  test('400 — invalid op_type rejected by validator', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: PLANNER,
      body: { op_type: 'BOGUS_OP', work_centre_no: 'WC' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    const optErr = r.json.errors.find((e) => e.field === 'op_type');
    assert.ok(optErr, 'op_type validation error present');
  });

  test('409 — duplicate seq rejected by UNIQUE constraint surfacing as 500/409', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: PLANNER,
      body: { op_type: 'FLEXO', work_centre_no: 'WC', seq: 100 },
    });
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: PLANNER,
      body: { op_type: 'PRE_PRESS', work_centre_no: 'WC', seq: 100 },
    });
    // SQLite UNIQUE failure surfaces as a non-BmesError → service rethrows →
    // route maps to 500 internal-error (no leak of SQL detail per safeError
    // discipline).
    assert.equal(r.status, 500);
    assert.equal(r.json.type, 'urn:ops:internal-error');
  });

  test('409 — attach op on terminal (CANCELLED) WO → urn:ops:wo-terminal-edit', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    service.cancelWorkOrder(wo.id, 'oops', 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: PLANNER,
      body: { op_type: 'FLEXO', work_centre_no: 'WC' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:wo-terminal-edit');
  });

  test('403 — viewonly cannot add op', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/operations`, {
      user: VIEWER,
      body: { op_type: 'FLEXO', work_centre_no: 'WC' },
    });
    assert.equal(r.status, 403);
  });
});
