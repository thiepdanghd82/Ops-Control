/**
 * Contract: GET /api/planning/v2/work-orders (list with filters + pagination)
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, VALID_BODY } from './_harness.js';

let baseUrl, server;
before(async () => {
  const { app, service } = buildApp();
  // Seed: 3 CREATED, 1 RELEASED, 1 CANCELLED
  for (let i = 0; i < 5; i++) {
    const wo = service.createWorkOrder(
      { ...VALID_BODY, ccl_pn: `PN-${i}`, customer: i === 4 ? 'Beta' : 'Acme' },
      'planner1'
    );
    if (i === 0) {
      service.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC' }, 'planner1');
      service.releaseWorkOrder(wo.id, 'planner1');
    }
    if (i === 1) service.cancelWorkOrder(wo.id, 'oops', 'planner1');
  }
  ({ baseUrl, server } = await listen(app));
});
after(() => close(server));

describe('GET /api/planning/v2/work-orders', () => {
  test('200 — default pagination returns {items, total, limit:50, offset:0}', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', { user: PLANNER });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 5);
    assert.equal(r.json.limit, 50);
    assert.equal(r.json.offset, 0);
    assert.equal(r.json.items.length, 5);
    for (const item of r.json.items) {
      assert.ok('operations_count' in item, 'each item exposes operations_count');
    }
  });

  test('200 — filter by status=RELEASED returns only released', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', {
      user: PLANNER,
      query: { status: 'RELEASED' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 1);
    assert.equal(r.json.items[0].status, 'RELEASED');
  });

  test('200 — q free-text matches customer LIKE', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', {
      user: PLANNER,
      query: { q: 'Beta' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 1);
  });

  test('200 — limit cap at 200', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', {
      user: PLANNER,
      query: { limit: '99999' },
    });
    assert.equal(r.json.limit, 200);
  });
});
