/**
 * Contract: GET /api/planning/v2/work-orders/:id/audit
 *
 * Per-WO audit timeline. Returns newest-first events filtered by
 * detail.wo_id — both header-level (WO_*) and op-level (OP_*) events
 * surface, since operationService embeds wo_id into every OP_* detail
 * payload. 404 when WO id doesn't exist; 400 when id is non-numeric.
 *
 * Mounted directly on the v2 router (next to /config) inside
 * mountPlanning's flag-on conditional.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../../../../../server/db/connection.js';
import { initSchema } from '../../../../../server/db/init.js';
import { mountPlanning } from '../../../server/index.js';
import { createWorkOrderRepo } from '../../../server/repositories/workOrderRepo.js';
import { createWoCodeGenerator } from '../../../server/services/woCodeGenerator.js';
import { createWorkOrderService } from '../../../server/services/workOrderService.js';
import { listen, close, req, PLANNER, VALID_BODY } from './_harness.js';

let tmpDir;
let baseUrl;
let server;
let svc;
let woId;

before(async () => {
  connection._resetForTests();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes16-audit-'));
  process.env.DATA_DIR = tmpDir;
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  fs.mkdirSync(path.join(tmpDir, 'Library', 'SystemConfig'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'Library', 'SystemConfig', 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': true })
  );
  initSchema();

  // Drive a small lifecycle so audit_log has WO_CREATE + WO_OP_ADD + WO_RELEASE
  // for one WO, plus a separate WO_CREATE for another WO (to verify filter).
  const db = connection.getDb();
  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const audit = (row) =>
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  svc = createWorkOrderService({ db, repo, codeGen, audit });

  const wo = svc.createWorkOrder(VALID_BODY, 'planner1');
  svc.attachOperation(wo.id, { op_type: 'FLEXO', work_centre_no: 'WC' }, 'planner1');
  svc.releaseWorkOrder(wo.id, 'planner1', 'go');
  woId = wo.id;
  // Other WO — should NOT appear in our timeline.
  svc.createWorkOrder({ ...VALID_BODY, ccl_pn: 'OTHER' }, 'planner2');

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const h = req.headers['x-test-user'];
    if (!h) {
      return res
        .status(401)
        .type('application/problem+json')
        .json({ type: 'urn:ops:auth-required', status: 401 });
    }
    const u = JSON.parse(h);
    req.user = { ok: true, user: u, role: u.role, modules: u.modules || {} };
    next();
  });
  mountPlanning(app, { authMiddleware: (req, _res, next) => next() });
  ({ server, baseUrl } = await listen(app));
});

after(async () => {
  await close(server);
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/planning/v2/work-orders/:id/audit', () => {
  test('200 — returns WO_* events for the given WO, newest-first, filtered by detail.wo_id', async () => {
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}/audit`, {
      user: PLANNER,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.ok(Array.isArray(r.json.rows));
    assert.ok(
      r.json.rows.length >= 3,
      `expected ≥3 events for WO ${woId}, got ${r.json.rows.length}`
    );
    // newest-first
    const events = r.json.rows.map((row) => row.event);
    assert.deepEqual(events, ['WO_RELEASE', 'WO_OP_ADD', 'WO_CREATE']);
    // every row's detail.wo_id matches
    for (const row of r.json.rows) {
      const detail = JSON.parse(row.detail);
      assert.equal(detail.wo_id, woId, `row leaks across WOs: ${row.event}`);
    }
  });

  test('404 — unknown WO id returns urn:ops:wo-not-found RFC-7807', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders/999999/audit', {
      user: PLANNER,
    });
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:wo-not-found');
  });

  test('400 — non-numeric id returns urn:ops:validation', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders/abc/audit', {
      user: PLANNER,
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
  });

  test('401 — no auth header rejected at prefix level', async () => {
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}/audit`);
    assert.equal(r.status, 401);
  });

  test('200 — OP_* events with matching detail.wo_id also surface; non-JSON noise rows ignored', async () => {
    // operationService writes OP_* rows with detail.wo_id; verify the
    // endpoint includes them alongside WO_* without a separate fetch.
    //
    // Noise rows reproduce the production shape (MES-3-FIX-3): legacy
    // LOGIN_OK writes detail='' and LOGIN_FAIL writes plain text. Without
    // the json_valid() guard in the query, SQLite aborts the whole scan
    // with "malformed JSON" on the first invalid row — even WO/OP events
    // never surface. With the guard those rows are silently skipped.
    const db = connection.getDb();
    const ins = db.prepare(
      'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run(new Date().toISOString(), 'LOGIN_OK', 'administrator', '-', '');
    ins.run(new Date().toISOString(), 'LOGIN_FAIL', 'administrator', '-', 'bad password');
    ins.run(
      new Date().toISOString(),
      'OP_COMPLETE',
      'kiosk:test',
      '-',
      JSON.stringify({ op_id: 1, wo_id: woId, from: 'RUNNING', to: 'DONE', event: 'complete' })
    );
    const r = await req(baseUrl, 'GET', `/api/planning/v2/work-orders/${woId}/audit`, {
      user: PLANNER,
    });
    assert.equal(r.status, 200);
    const events = r.json.rows.map((row) => row.event);
    assert.ok(events.includes('OP_COMPLETE'), `expected OP_COMPLETE in ${events.join(',')}`);
    // OP_COMPLETE was inserted last → newest-first means it's at index 0
    assert.equal(events[0], 'OP_COMPLETE');
    // Noise rows must not leak into the WO timeline
    assert.ok(!events.includes('LOGIN_OK'), 'LOGIN_OK leaked into WO timeline');
    assert.ok(!events.includes('LOGIN_FAIL'), 'LOGIN_FAIL leaked into WO timeline');
  });
});
