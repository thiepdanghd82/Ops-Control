/**
 * Outer-gate integration — flags ON (behaves exactly as before the gate).
 *
 * With OPS_FEATURE_PLANNING=1 / OPS_FEATURE_KIOSK=1 the composition root
 * mounts planning + serves the kiosk shell just like the pre-gate server:
 * /api/runtime-config reports both features true, /api/planning/* no
 * longer returns the feature_disabled 404, and /kiosk/* no longer returns
 * the "not enabled" stub.
 *
 * Runner: node --test server/featureGate.on.integration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEnv, bootApp } from './_featureGateHarness.js';

prepareEnv();
process.env.OPS_FEATURE_PLANNING = '1';
process.env.OPS_FEATURE_KIOSK = '1';
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

test('runtime-config reports planning + kiosk ON', async () => {
  const r = await fetch(`${baseUrl}/api/runtime-config`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.features.planning, true);
  assert.equal(body.features.kiosk, true);
});

test('GET /api/planning/* is NOT feature-gated (router mounted; auth/other, not feature_disabled 404)', async () => {
  const r = await fetch(`${baseUrl}/api/planning/work-orders`);
  // Mounted → reaches auth/route logic. It must NOT be the gate's
  // feature_disabled 404. (401/403/200/real-404 are all acceptable here;
  // the point is the OUTER gate let it through.)
  if (r.status === 404) {
    const body = await r.json().catch(() => ({}));
    assert.notEqual(body.feature, 'planning', 'must not be the outer-gate 404');
  } else {
    assert.ok(true);
  }
});

test('GET /kiosk/ is served (NOT the "not enabled" stub)', async () => {
  const r = await fetch(`${baseUrl}/kiosk/`);
  const text = await r.text();
  assert.doesNotMatch(text, /Kiosk is not enabled/i, 'kiosk shell served, not the gate stub');
});
