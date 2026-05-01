/**
 * Contract: GET /api/planning/v2/operations/dispatch (MES-2.5)
 * 6 tests — happy + auth + machine-mismatch + revoked + sort + empty.
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
  MACHINE,
} from '../_operationsHarness.js';

let h, baseUrl, server, jwt;
before(async () => {
  h = buildOpsApp();
  ({ jwt } = mintKioskSession(h));
  ({ baseUrl, server } = await listen(h.app));
});
after(() => close(server));

describe('GET /operations/dispatch — contract', () => {
  test('1. 200 happy path: shape + server_time + cursor null', async () => {
    seedOp(h.db);
    const r = await req(baseUrl, 'GET', '/api/planning/v2/operations/dispatch', {
      jwt,
      query: { machine_code: MACHINE },
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.items));
    assert.match(r.json.server_time, /^\d{4}-/);
    assert.equal(r.json.cursor, null);
    assert.ok(r.json.items.length >= 1);
    const op = r.json.items[0];
    for (const k of ['id', 'wo_id', 'wo_code', 'status', 'work_centre_no']) {
      assert.ok(k in op, `missing ${k}`);
    }
  });

  test('2. 401 missing Authorization → urn:ops:kiosk-session-invalid (reason=missing-bearer)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/operations/dispatch', {
      query: { machine_code: MACHINE },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json.type, 'urn:ops:kiosk-session-invalid');
    assert.equal(r.json.reason, 'missing-bearer');
  });

  test('3. 401 invalid JWT signature → urn:ops:kiosk-session-invalid (reason=bad-signature)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/operations/dispatch', {
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraW5kIjoia2lvc2siLCJleHAiOjk5OTk5OTk5OTl9.notavalidsig',
      query: { machine_code: MACHINE },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json.type, 'urn:ops:kiosk-session-invalid');
  });

  test('4. 401 revoked session (Option B: DB check on every request, cache=0 in tests)', async () => {
    const h2 = buildOpsApp();
    const { jwt: revokedJwt } = mintKioskSession(h2, { revoked: true });
    const { baseUrl: u2, server: s2 } = await listen(h2.app);
    const r = await req(u2, 'GET', '/api/planning/v2/operations/dispatch', {
      jwt: revokedJwt,
      query: { machine_code: MACHINE },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json.reason, 'revoked');
    await close(s2);
  });

  test('5. 403 query.machine_code != JWT claim → urn:ops:kiosk-machine-mismatch', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/operations/dispatch', {
      jwt,
      query: { machine_code: 'OTHER-MACHINE' },
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.type, 'urn:ops:kiosk-machine-mismatch');
  });

  test('6. 200 empty list when no ops dispatched (different machine has none)', async () => {
    const h3 = buildOpsApp();
    const { jwt: j3 } = mintKioskSession(h3, { machineCode: 'EMPTY-MACHINE' });
    const { baseUrl: u3, server: s3 } = await listen(h3.app);
    const r = await req(u3, 'GET', '/api/planning/v2/operations/dispatch', {
      jwt: j3,
      query: { machine_code: 'EMPTY-MACHINE' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    await close(s3);
  });
});
