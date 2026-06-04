/**
 * Outer-gate integration — flags OFF (the shipped default).
 *
 * With OPS_FEATURE_PLANNING / OPS_FEATURE_KIOSK unset, the composition
 * root must fail closed: /api/planning/* + /kiosk/* return 404 and
 * /api/runtime-config reports both features false. The planning/kiosk
 * MODULE code is untouched — only the entry points are gated.
 *
 * Runner: node --test server/featureGate.off.integration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEnv, bootApp } from './_featureGateHarness.js';

prepareEnv();
// Flags intentionally left unset → default OFF.
delete process.env.OPS_FEATURE_PLANNING;
delete process.env.OPS_FEATURE_KIOSK;
const app = await bootApp();

let server, baseUrl;
test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(() => new Promise((resolve) => server.close(resolve)));

test('runtime-config reports planning + kiosk OFF', async () => {
  const r = await fetch(`${baseUrl}/api/runtime-config`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.features.planning, false);
  assert.equal(body.features.kiosk, false);
});

test('GET /api/planning/* → 404 feature_disabled (legacy router not mounted)', async () => {
  const r = await fetch(`${baseUrl}/api/planning/work-orders`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.feature, 'planning');
});

test('GET /api/planning/v2/work-orders → 404 (mountPlanning skipped)', async () => {
  const r = await fetch(`${baseUrl}/api/planning/v2/work-orders`);
  assert.equal(r.status, 404);
});

test('GET /kiosk/ → 404 plain-text "not enabled"', async () => {
  const r = await fetch(`${baseUrl}/kiosk/`);
  assert.equal(r.status, 404);
  const text = await r.text();
  assert.match(text, /not enabled/i);
});

test('costing endpoint is unaffected by the gate (health stays 200)', async () => {
  const r = await fetch(`${baseUrl}/health`);
  assert.equal(r.status, 200);
});
