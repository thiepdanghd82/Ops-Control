// @ts-check
/**
 * Rate library router — factory contract tests.
 * Run: node --test server/domains/library/routes/rate.test.js
 *
 * The router is extracted but NOT YET mounted in server/index.js
 * (full plumbing waits for helper extraction). These tests exercise
 * the factory through an Express app with all deps stubbed — proves
 * the contract holds before we wire it live.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRateRouter } from './rate.js';

// ─── Stubs ───────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-rate-test-'));
fs.mkdirSync(path.join(tmpDir, 'Rate', 'backups'), { recursive: true });

function buildApp(roleFromHeader = true) {
  const app = express();
  app.use(express.json());

  const stubAuth = (req, res, next) => {
    if (!roleFromHeader) return next();
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { role }, role };
    next();
  };
  const isAdminPlus = (u) => {
    const r = u?.user?.role || u?.role;
    return r === 'admin' || r === 'sys';
  };
  const canWrite = (u) => {
    const r = u?.user?.role || u?.role;
    return r && r !== 'viewonly';
  };
  const passthroughBody = (_req, _res, next) => next();

  const router = createRateRouter({
    auth: stubAuth,
    isAdminPlus,
    canWrite,
    getLibDir: () => tmpDir,
    safeFn: (s) => String(s).replace(/[^\w.-]/g, '_'),
    readJson: (p, def) => {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
      catch { return def !== undefined ? def : null; }
    },
    writeJson: (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2)),
    atomicWriteFileSync: (p, data) => fs.writeFileSync(p, data),
    siteToCsvKey: (site) => String(site).toLowerCase(),
    rateRows: (data) => [['code', 'rate'], data.map((r) => [r.code, r.rate])],
    toCsvBytes: (headers, rows) =>
      Buffer.from([headers.join(','), ...rows.map((r) => r.join(','))].join('\n')),
    validateBackupBody: passthroughBody,
    validateRestoreBody: passthroughBody,
  });
  app.use('/api/library/rate', router);
  return app;
}

async function request(app, opts) {
  const { method = 'GET', path, headers = {}, body } = opts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

describe('rate library router — factory contract', () => {
  test('GET /backups unauth → 401', async () => {
    const app = buildApp();
    const r = await request(app, { path: '/api/library/rate/backups' });
    assert.equal(r.status, 401);
  });

  test('GET /backups user → empty list (no files yet)', async () => {
    const app = buildApp();
    const r = await request(app, {
      path: '/api/library/rate/backups',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.files, []);
  });

  test('POST /backups admin → creates file', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/backups',
      headers: { 'x-test-role': 'admin' },
      body: { site: 'VN', data: [{ code: 'LBR', rate: 50 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    // Filename format mirrors legacy costApi.js: rate_<sitekey>_<ts>.json
    // where ts retains date-dashes (regex /[:.T]/g only strips :.T).
    assert.match(r.body.filename, /^rate_vn_[\d-]+\.json$/);
    assert.ok(fs.existsSync(path.join(tmpDir, 'Rate', 'backups', r.body.filename)));
  });

  test('POST /backups non-admin → 403', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/backups',
      headers: { 'x-test-role': 'user' },
      body: { site: 'VN', data: [] },
    });
    assert.equal(r.status, 403);
  });

  test('POST /restore admin loads previously-saved backup', async () => {
    const app = buildApp();
    // Plant a backup
    const fname = 'rate_vn_20260429120000.json';
    fs.writeFileSync(
      path.join(tmpDir, 'Rate', 'backups', fname),
      JSON.stringify({ site: 'VN', data: [{ code: 'LBR', rate: 60 }] }),
    );
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/restore',
      headers: { 'x-test-role': 'admin' },
      body: { filename: fname, site: 'VN' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data[0].code, 'LBR');
    assert.equal(r.body.data[0].rate, 60);
  });

  test('POST /restore missing file → 404', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/restore',
      headers: { 'x-test-role': 'admin' },
      body: { filename: 'nope.json', site: 'VN' },
    });
    assert.equal(r.status, 404);
  });

  test('POST /export-csv viewonly → 403', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/export-csv',
      headers: { 'x-test-role': 'viewonly' },
      body: { site: 'VN', data: [] },
    });
    assert.equal(r.status, 403);
  });

  test('POST /export-csv user writes CSV file', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/library/rate/export-csv',
      headers: { 'x-test-role': 'user' },
      body: { site: 'VN', data: [{ code: 'LBR', rate: 70 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.file, 'rate_vn.csv');
    const csv = fs.readFileSync(path.join(tmpDir, 'Rate', 'rate_vn.csv'), 'utf8');
    assert.match(csv, /code,rate/);
    assert.match(csv, /LBR,70/);
  });
});
