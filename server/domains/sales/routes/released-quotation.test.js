// @ts-check
/**
 * Released-quotation router — factory contract tests.
 * Run: node --test server/domains/sales/routes/released-quotation.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createReleasedQuotationRouter } from './released-quotation.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-rq-test-'));
  fs.mkdirSync(path.join(tmpDir, 'ReleasedQuotation'), { recursive: true });
});

function buildApp() {
  const app = express();
  app.use(express.json());

  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { role }, role };
    next();
  };
  const canWrite = (u) => {
    const r = u?.user?.role || u?.role;
    return r && r !== 'viewonly';
  };

  const router = createReleasedQuotationRouter({
    auth: stubAuth,
    canWrite,
    getLibDir: () => tmpDir,
    safeFn: (s) => String(s).replace(/[^\w.-]/g, '_'),
    readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
    writeJson: (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2)),
  });
  app.use('/api/sales/quotations', router);
  return app;
}

async function request(app, opts) {
  const { method = 'GET', path: p, headers = {}, body } = opts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('released-quotation router — factory contract', () => {
  test('GET / unauth → 401', async () => {
    const r = await request(buildApp(), { path: '/api/sales/quotations' });
    assert.equal(r.status, 401);
  });

  test('GET / empty dir → empty list', async () => {
    const r = await request(buildApp(), {
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.files, []);
  });

  test('POST / writes a quotation file with ref_no-derived name', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'user' },
      body: { ref_no: 'Q-2026-001', items: [{ sku: 'A', qty: 10 }] },
    });
    assert.equal(r.status, 200);
    assert.match(r.body.filename, /^Q-2026-001_[\d-]+\.json$/);
    assert.ok(fs.existsSync(path.join(tmpDir, 'ReleasedQuotation', r.body.filename)));
  });

  test('POST / viewonly → 403', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'viewonly' },
      body: { ref_no: 'Q-X' },
    });
    assert.equal(r.status, 403);
  });

  test('POST / non-object payload → 400', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'user' },
      body: ['not an object'],
    });
    assert.equal(r.status, 400);
  });

  test('POST / oversized ref_no → 400', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'user' },
      body: { ref_no: 'X'.repeat(200) },
    });
    assert.equal(r.status, 400);
  });

  test('GET /:name fetches a quotation', async () => {
    const fname = 'Q-T_20260429120000.json';
    fs.writeFileSync(
      path.join(tmpDir, 'ReleasedQuotation', fname),
      JSON.stringify({ ref_no: 'Q-T', items: [] }),
    );
    const r = await request(buildApp(), {
      path: `/api/sales/quotations/${fname}`,
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ref_no, 'Q-T');
  });

  test('GET /:name not found → 404', async () => {
    const r = await request(buildApp(), {
      path: '/api/sales/quotations/nope.json',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 404);
  });

  test('POST / no ref_no → falls back to QUOT prefix', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotations',
      headers: { 'x-test-role': 'user' },
      body: { items: [] },
    });
    assert.equal(r.status, 200);
    assert.match(r.body.filename, /^QUOT_/);
  });
});
