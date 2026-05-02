/**
 * Contract: GET /api/planning/v2/work-orders/:id (detail)
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, NO_PLANNING, VALID_BODY } from './_harness.js';

let baseUrl, server, service;
let woId;
before(async () => {
  const harness = buildApp();
  service = harness.service;
  ({ baseUrl, server } = await listen(harness.app));
  const wo = service.createWorkOrder(VALID_BODY, 'planner1');
  service.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC-FX-01' }, 'planner1');
  woId = wo.id;
});
after(() => close(server));

describe('GET /api/planning/v2/work-orders/:id', () => {
  test('200 — returns header + sorted operations array', async () => {
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}`, { user: PLANNER });
    assert.equal(r.status, 200);
    assert.equal(r.json.id, woId);
    assert.equal(r.json.status, 'CREATED');
    assert.ok(Array.isArray(r.json.operations));
    assert.equal(r.json.operations.length, 1);
    assert.equal(r.json.operations[0].op_type, 'FLEXO');
  });

  test('404 — unknown id returns urn:ops:wo-not-found', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders/999999', { user: PLANNER });
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:wo-not-found');
  });

  test('403 — user without planning module rejected', async () => {
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}`, {
      user: NO_PLANNING,
    });
    assert.equal(r.status, 403);
  });

  test('401 — no auth header', async () => {
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}`);
    assert.equal(r.status, 401);
  });
});
