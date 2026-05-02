// @ts-check
/**
 * DDL library router — factory contract tests.
 * Mirrors rate.test.js shape; differences captured in createDdlRouter.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDdlRouter } from './ddl.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-ddl-test-'));
fs.mkdirSync(path.join(tmpDir, 'DDL', 'backups'), { recursive: true });

function buildApp() {
  const app = express();
  app.use(express.json());

  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { role }, role };
    next();
  };
  const isAdminPlus = (u) => ['admin', 'sys'].includes(u?.user?.role || u?.role);
  const canWrite = (u) => {
    const r = u?.user?.role || u?.role;
    return r && r !== 'viewonly';
  };
  const passthrough = (_req, _res, next) => next();

  const router = createDdlRouter({
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
    ddlToCsvRows: (data) => {
      const sections = Object.keys(data).filter((k) => k !== '_custom_sections');
      const rows = sections.map((s) => [s, JSON.stringify(data[s])]);
      return [['section', 'values'], rows];
    },
    toCsvBytes: (headers, rows) =>
      Buffer.from([headers.join(','), ...rows.map((r) => r.join(','))].join('\n')),
    validateBackupBody: passthrough,
    validateRestoreBody: passthrough,
  });
  app.use('/api/library/ddl', router);
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
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('ddl library router — factory contract', () => {
  test('GET /backups unauth → 401', async () => {
    const r = await request(buildApp(), { path: '/api/library/ddl/backups' });
    assert.equal(r.status, 401);
  });

  test('GET /backups returns plain string array (legacy contract)', async () => {
    const r = await request(buildApp(), {
      path: '/api/library/ddl/backups',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.backups));
  });

  test('POST /backups admin creates file', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/library/ddl/backups',
      headers: { 'x-test-role': 'admin' },
      body: { site: 'VN', data: { material_grade: ['A', 'B'], finish: ['matte', 'gloss'] } },
    });
    assert.equal(r.status, 200);
    assert.match(r.body.filename, /^ddl_vn_[\d-]+\.json$/);
  });

  test('POST /restore admin loads previously-saved object data', async () => {
    const fname = 'ddl_vn_20260429120000.json';
    fs.writeFileSync(
      path.join(tmpDir, 'DDL', 'backups', fname),
      JSON.stringify({ site: 'VN', data: { material_grade: ['A'] } }),
    );
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/library/ddl/restore',
      headers: { 'x-test-role': 'admin' },
      body: { filename: fname, site: 'VN' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.material_grade, ['A']);
  });

  test('POST /export-csv writes ddl_<site>.csv + reports section count', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/library/ddl/export-csv',
      headers: { 'x-test-role': 'user' },
      body: {
        site: 'VN',
        data: { material_grade: ['A', 'B'], finish: ['matte'], _custom_sections: [] },
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.file, 'ddl_vn.csv');
    // _custom_sections excluded → 2 sections
    assert.equal(r.body.sections, 2);
    const csv = fs.readFileSync(path.join(tmpDir, 'DDL', 'ddl_vn.csv'), 'utf8');
    assert.match(csv, /section,values/);
    assert.match(csv, /material_grade/);
  });

  test('POST /export-csv viewonly → 403', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/library/ddl/export-csv',
      headers: { 'x-test-role': 'viewonly' },
      body: { site: 'VN', data: {} },
    });
    assert.equal(r.status, 403);
  });
});
