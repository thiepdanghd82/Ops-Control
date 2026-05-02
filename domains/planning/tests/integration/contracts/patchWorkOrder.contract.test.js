/**
 * Contract: PATCH /api/planning/v2/work-orders/:id (edit header)
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, VIEWER, VALID_BODY } from './_harness.js';

let baseUrl, server, service, woId;
before(async () => {
  const harness = buildApp();
  service = harness.service;
  ({ baseUrl, server } = await listen(harness.app));
  const wo = service.createWorkOrder(VALID_BODY, 'planner1');
  woId = wo.id;
});
after(() => close(server));

describe('PATCH /api/planning/v2/work-orders/:id', () => {
  test('200 — happy path: change customer + priority', async () => {
    const r = await req(baseUrl, 'PATCH', `/api/planning/v2/work-orders/${woId}`, {
      user: PLANNER,
      body: { customer: 'Acme Corp', priority: 8 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.customer, 'Acme Corp');
    assert.equal(r.json.priority, 8);
  });

  test('400 — body with forbidden field "status" → urn:ops:wo-forbidden-fields', async () => {
    const r = await req(baseUrl, 'PATCH', `/api/planning/v2/work-orders/${woId}`, {
      user: PLANNER,
      body: { status: 'RELEASED' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:wo-forbidden-fields');
    assert.deepEqual(r.json.forbidden_fields, ['status']);
  });

  test('400 — multiple forbidden fields surfaced together', async () => {
    const r = await req(baseUrl, 'PATCH', `/api/planning/v2/work-orders/${woId}`, {
      user: PLANNER,
      body: { code: 'FAKE', qty_completed: 99 },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:wo-forbidden-fields');
    assert.deepEqual([...r.json.forbidden_fields].sort(), ['code', 'qty_completed']);
  });

  test('403 — viewonly cannot patch', async () => {
    const r = await req(baseUrl, 'PATCH', `/api/planning/v2/work-orders/${woId}`, {
      user: VIEWER,
      body: { customer: 'X' },
    });
    assert.equal(r.status, 403);
  });

  test('409 — patch on terminal WO (CANCELLED) → urn:ops:wo-terminal-edit', async () => {
    const wo = service.createWorkOrder(VALID_BODY, 'planner1');
    service.cancelWorkOrder(wo.id, 'oops', 'planner1');
    const r = await req(baseUrl, 'PATCH', `/api/planning/v2/work-orders/${wo.id}`, {
      user: PLANNER,
      body: { customer: 'X' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:wo-terminal-edit');
  });
});
