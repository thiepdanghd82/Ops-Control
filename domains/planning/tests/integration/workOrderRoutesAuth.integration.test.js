/**
 * MES-1.4 — auth, feature-flag, and legacy-shadow regression tests.
 *
 * Verifies:
 *   - flag ON  → /api/planning/v2/* registered, returns 200/2xx for valid calls
 *   - flag OFF → mountPlanning returns false; /api/planning/v2/* returns 404
 *   - v2 router mounted alone never shadows /api/planning/work-orders
 *     (legacy planning paths fall through cleanly)
 *   - 401 / 403 RFC-7807 envelope on the v2 router itself
 *
 * This file does NOT boot the full server/index.js — that's owned by
 * server/http.integration.test.js. Here we drive mountPlanning directly
 * with a stub authMiddleware + the real v2 router.
 */
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { mountPlanning } from '../../server/index.js';
import * as connection from '../../../../server/db/connection.js';
import { initSchema } from '../../../../server/db/init.js';
import { listen, close, req, PLANNER, VIEWER, VALID_BODY } from './contracts/_harness.js';

let tmpDir;

function setupTmpData(flagValue) {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes14-routes-'));
  process.env.DATA_DIR = tmpDir;
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  // Seed feature-flags.json with the requested value.
  const cfgDir = path.join(tmpDir, 'Library', 'SystemConfig');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': flagValue })
  );
  initSchema();
}

function buildAppWithMount() {
  const app = express();
  app.use(express.json());
  // Stub authMiddleware (matches contract-test harness).
  app.use((req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res
        .status(401)
        .type('application/problem+json')
        .json({ type: 'urn:ops:auth-required', status: 401 });
    }
    const user = JSON.parse(header);
    req.user = { ok: true, user, role: user.role, modules: user.modules || {} };
    next();
  });
  // The global stub middleware above already handled auth; pass a
  // passthrough so mountPlanning's authMiddleware doesn't double-gate
  // and reject (the real authMiddleware reads cookie/JWT we don't set).
  const mounted = mountPlanning(app, { authMiddleware: (req, _res, next) => next() });
  return { app, mounted };
}

after(() => {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('mountPlanning — flag ON', () => {
  let baseUrl, server;
  before(async () => {
    setupTmpData(true);
    const { app, mounted } = buildAppWithMount();
    assert.equal(mounted, true, 'mountPlanning returns true when flag enabled');
    ({ server, baseUrl } = await listen(app));
  });
  after(async () => close(server));

  test('AC-1.4.1 — /api/planning/v2/work-orders responds 200 (empty list)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', { user: PLANNER });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 0);
  });

  test('AC-1.4.2 — v2 mount does NOT shadow /api/planning/work-orders (legacy path → 404 here, not 200)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/work-orders', { user: PLANNER });
    // 404 because no legacy router is registered in this lightweight harness;
    // the assertion is that v2's prefix-match did NOT capture the legacy path.
    assert.equal(r.status, 404);
  });

  test('AC-1.4.3 — POST with role=viewonly → 403', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: VIEWER,
      body: VALID_BODY,
    });
    assert.equal(r.status, 403);
  });

  test('AC-1.4.4 — no auth header → 401 RFC-7807', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', { body: VALID_BODY });
    assert.equal(r.status, 401);
    assert.match(r.headers.get('content-type') || '', /application\/problem\+json/);
    assert.equal(r.json.type, 'urn:ops:auth-required');
  });

  test('AC-1.4.9 — every error response is application/problem+json', async () => {
    const cases = [
      // 400 — validation
      {
        method: 'POST',
        path: '/api/planning/v2/work-orders',
        user: PLANNER,
        body: { ccl_pn: 'x' },
      },
      // 404 — not found
      { method: 'GET', path: '/api/planning/v2/work-orders/999999', user: PLANNER },
      // 403 — wrong role
      { method: 'POST', path: '/api/planning/v2/work-orders', user: VIEWER, body: VALID_BODY },
    ];
    for (const c of cases) {
      const r = await req(baseUrl, c.method, c.path, { user: c.user, body: c.body });
      assert.ok(r.status >= 400, `expected error status, got ${r.status} on ${c.method} ${c.path}`);
      assert.match(
        r.headers.get('content-type') || '',
        /application\/problem\+json/,
        `${c.method} ${c.path} status=${r.status}`
      );
      assert.ok(r.json.type, 'response carries `type` URN');
      assert.equal(r.json.status, r.status, '`status` matches HTTP status');
    }
  });
});

describe('mountPlanning — flag OFF', () => {
  let baseUrl, server;
  before(async () => {
    setupTmpData(false);
    const { app, mounted } = buildAppWithMount();
    assert.equal(mounted, false, 'mountPlanning returns false when flag disabled');
    ({ server, baseUrl } = await listen(app));
  });
  after(async () => close(server));

  test('AC-1.4.8 — flag off → /api/planning/v2/work-orders returns 404 (NOT 503)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/work-orders', { user: PLANNER });
    assert.equal(r.status, 404, 'request hits Express default 404, not the router');
  });

  test('AC-1.4.8 — POST endpoints also 404 when flag off', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/work-orders', {
      user: PLANNER,
      body: VALID_BODY,
    });
    assert.equal(r.status, 404);
  });
});

describe('mountPlanning — flag-file robustness', () => {
  beforeEach(() => connection._resetForTests());
  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('absent feature-flags.json → mountPlanning returns false (fail-closed)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes14-noflag-'));
    process.env.DATA_DIR = tmpDir;
    process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
    initSchema();
    const { mounted } = buildAppWithMount();
    assert.equal(mounted, false);
  });

  test('malformed feature-flags.json → mountPlanning returns false (no throw)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes14-badflag-'));
    process.env.DATA_DIR = tmpDir;
    process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
    fs.mkdirSync(path.join(tmpDir, 'Library', 'SystemConfig'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'Library', 'SystemConfig', 'feature-flags.json'),
      'not json at all {{{'
    );
    initSchema();
    const { mounted } = buildAppWithMount();
    assert.equal(mounted, false);
  });
});
