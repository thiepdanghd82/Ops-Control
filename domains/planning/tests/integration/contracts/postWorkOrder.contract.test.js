/**
 * Contract: POST /api/planning/v2/work-orders (create)
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, VIEWER, VALID_BODY } from './_harness.js';

let baseUrl, server;
before(async () => {
  const { app } = buildApp();
  ({ baseUrl, server } = await listen(app));
});
after(() => close(server));

describe('POST /api/planning/v2/work-orders', () => {
  test('201 — happy path returns WO with auto-generated code + status=CREATED', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: PLANNER,
      body: VALID_BODY,
    });
    assert.equal(r.status, 201);
    assert.match(r.json.code, /^WO-\d{4}-\d{2}-\d{5}$/);
    assert.equal(r.json.status, 'CREATED');
    assert.equal(r.json.created_by, 'planner1');
  });

  test('400 — validation: missing required fields → application/problem+json', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: PLANNER,
      body: { ccl_pn: 'PN-X' },
    });
    assert.equal(r.status, 400);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:validation');
    assert.ok(Array.isArray(r.json.errors));
    const fields = r.json.errors.map((e) => e.field).sort();
    for (const f of ['customer', 'qty_planned', 'uom', 'due_date']) {
      assert.ok(fields.includes(f), `missing field error for ${f}`);
    }
  });

  test('403 — viewonly role rejected', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: VIEWER,
      body: VALID_BODY,
    });
    assert.equal(r.status, 403);
  });

  test('401 — no x-test-user header → urn:ops:auth-required', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', { body: VALID_BODY });
    assert.equal(r.status, 401);
    assert.equal(r.json.type, 'urn:ops:auth-required');
  });

  test('409 — explicit duplicate code → wo-code-collision', async () => {
    const code = 'WO-2026-12-99999';
    await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: PLANNER,
      body: { ...VALID_BODY, code },
    });
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: PLANNER,
      body: { ...VALID_BODY, code },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:wo-code-collision');
  });
});
