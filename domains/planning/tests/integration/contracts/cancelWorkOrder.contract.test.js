/**
 * Contract: POST /api/planning/v2/work-orders/:id/cancel
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

describe('POST /api/planning/v2/work-orders/:id/cancel', () => {
  test('200 — happy path: CREATED → CANCELLED with reason', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'customer pulled order' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'CANCELLED');
    assert.ok(r.json.closed_at);
  });

  test('400 — missing reason → urn:ops:validation', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    const fields = r.json.errors.map((e) => e.field);
    assert.ok(fields.includes('reason'));
  });

  test('400 — reason >500 chars → urn:ops:validation', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'x'.repeat(501) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
  });

  test('409 — cancel on COMPLETED → urn:ops:wo-invalid-transition with allowed_from of 5', async () => {
    const harness = buildApp();
    const { service: svc, repo } = harness;
    const { server: s2, baseUrl: u2 } = await listen(harness.app);
    try {
      const wo = svc.createWorkOrder(VALID_BODY, 'planner1');
      svc.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC' }, 'planner1');
      // Push directly through the repo to land in COMPLETED.
      repo.updateStatus(wo.id, 'RELEASED', new Date().toISOString());
      repo.updateStatus(wo.id, 'SCHEDULED', new Date().toISOString());
      repo.updateStatus(wo.id, 'IN_PROGRESS', new Date().toISOString());
      repo.updateStatus(wo.id, 'COMPLETED', new Date().toISOString());

      const r = await req(u2, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
        user: PLANNER,
        body: { reason: 'too late' },
      });
      assert.equal(r.status, 409);
      assert.equal(r.json.type, 'urn:ops:wo-invalid-transition');
      assert.equal(r.json.from, 'COMPLETED');
      assert.deepEqual([...r.json.allowed_from].sort(), [
        'CREATED',
        'IN_PROGRESS',
        'ON_HOLD',
        'RELEASED',
        'SCHEDULED',
      ]);
    } finally {
      await close(s2);
    }
  });

  test('403 — viewonly cannot cancel', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: VIEWER,
      body: { reason: 'oops' },
    });
    assert.equal(r.status, 403);
  });
});
