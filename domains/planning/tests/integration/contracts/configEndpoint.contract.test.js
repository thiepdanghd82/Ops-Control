/**
 * Contract: GET /api/planning/v2/config (MES-1.5 flag-discovery endpoint)
 *
 * Mounted INSIDE mountPlanning's flag-on conditional, so flag off →
 * endpoint absent → 404. Client uses this as a fail-closed flag probe.
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
import { listen, close, req, PLANNER } from './_harness.js';

let tmpDir;

function setupTmp(flagValue) {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes15-config-'));
  process.env.DATA_DIR = tmpDir;
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  fs.mkdirSync(path.join(tmpDir, 'Library', 'SystemConfig'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'Library', 'SystemConfig', 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': flagValue })
  );
  initSchema();
}

function buildApp() {
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
  const mounted = mountPlanning(app, { authMiddleware: (req, _res, next) => next() });
  return { app, mounted };
}

after(() => {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/planning/v2/config — flag ON', () => {
  let baseUrl, server;
  before(async () => {
    setupTmp(true);
    const { app, mounted } = buildApp();
    assert.equal(mounted, true);
    ({ server, baseUrl } = await listen(app));
  });
  after(async () => close(server));

  test('200 — returns {enabled: true}', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/config', { user: PLANNER });
    assert.equal(r.status, 200);
    assert.equal(r.json.enabled, true);
  });

  test('401 — no auth header still rejects (auth runs at prefix level)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/config');
    assert.equal(r.status, 401);
  });
});

describe('GET /api/planning/v2/config — flag OFF', () => {
  let baseUrl, server;
  before(async () => {
    setupTmp(false);
    const { app, mounted } = buildApp();
    assert.equal(mounted, false);
    ({ server, baseUrl } = await listen(app));
  });
  after(async () => close(server));

  test('404 — endpoint absent when flag off (fail-closed signal for client)', async () => {
    const r = await req(baseUrl, 'GET', '/api/planning/v2/config', { user: PLANNER });
    assert.equal(r.status, 404);
  });
});
