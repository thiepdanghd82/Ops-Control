/**
 * Contract: POST /api/planning/v2/work-orders/:id/release
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

describe('POST /api/planning/v2/work-orders/:id/release', () => {
  test('200 — happy path: CREATED → RELEASED with op attached', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    service.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC' }, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/release`, {
      user: PLANNER,
      body: { notes: 'go' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'RELEASED');
    assert.ok(r.json.released_at);
  });

  test('422 — release on 0-op WO → urn:ops:wo-no-operations', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/release`, {
      user: PLANNER,
    });
    assert.equal(r.status, 422);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:wo-no-operations');
  });

  test('409 — release on already-RELEASED WO → urn:ops:wo-invalid-transition with allowed_from', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    service.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC' }, 'planner1');
    service.releaseWorkOrder(wo.id, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/release`, {
      user: PLANNER,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:wo-invalid-transition');
    assert.equal(r.json.from, 'RELEASED');
    assert.equal(r.json.to, 'RELEASED');
    assert.deepEqual([...r.json.allowed_from].sort(), ['CREATED']);
  });

  test('403 — viewonly cannot release', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/release`, {
      user: VIEWER,
    });
    assert.equal(r.status, 403);
  });

  test('404 — release on non-existent WO', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders/999999/release', {
      user: PLANNER,
    });
    assert.equal(r.status, 404);
    assert.equal(r.json.type, 'urn:ops:wo-not-found');
  });
});
