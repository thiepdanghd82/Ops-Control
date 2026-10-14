// @ts-check
/**
 * Audit router contract tests.
 *
 * v1.3 O2 (closes ADR-0013 debt). Drives `createAuditRouter` through
 * stubbed deps so query-string filters + role gate are pinned without
 * booting the real auth middleware + better-sqlite3 audit store.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuditRouter } from './audit.js';

let backingRows;

beforeEach(() => {
  backingRows = [
    { ts: '2026-04-29T10:00:00Z', event: 'LOGIN_OK', user: 'alice', ip: '1.1.1.1', detail: '' },
    { ts: '2026-04-29T11:00:00Z', event: 'PWD_CHANGE', user: 'bob', ip: '1.1.1.2', detail: '' },
    {
      ts: '2026-04-29T12:00:00Z',
      event: 'CYLINDER_ADD',
      user: 'admin1',
      ip: '1.1.1.3',
      detail: 'Z=120',
    },
    { ts: '2026-04-30T09:00:00Z', event: 'LOGIN_OK', user: 'alice', ip: '1.1.1.1', detail: '' },
  ];
});

function buildApp() {
  const app = express();
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { role }, role };
    next();
  };
  const stubRequireRole = (level) => (req, res, next) => {
    const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };
    const r = req.user?.user?.role || req.user?.role;
    if ((ROLE_LEVELS[r] || 0) < level) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
  const router = createAuditRouter({
    auth: stubAuth,
    requireRole: stubRequireRole,
    tailAudit: (limit, filter = {}) => {
      let rows = backingRows.slice();
      if (filter.event) rows = rows.filter((r) => r.event === filter.event);
      if (filter.user) rows = rows.filter((r) => r.user === filter.user);
      return rows.slice(0, limit).reverse();
    },
    auditRowCount: () => backingRows.length,
  });
  app.use('/api/audit', router);
  return app;
}

async function request(app, opts) {
  const { path, headers = {} } = opts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('audit router — ADR-0013 minimum coverage', () => {
  test('unauth → 401', async () => {
    const r = await request(buildApp(), { path: '/api/audit' });
    assert.equal(r.status, 401);
  });

  test('admin role (4) → 403 (sys-only)', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(r.status, 403);
  });

  test('sys role → 200 with full row list + total', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.data.rows.length, 4);
    assert.equal(r.body.data.total, 4);
  });

  test('event filter passes through to tailAudit', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit?event=LOGIN_OK',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.rows.every((row) => row.event === 'LOGIN_OK'));
    assert.equal(r.body.data.rows.length, 2);
  });

  test('user filter passes through', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit?user=bob',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.body.data.rows.length, 1);
    assert.equal(r.body.data.rows[0].event, 'PWD_CHANGE');
  });

  test('from/to ISO timestamps filter post-fetch', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit?from=2026-04-29T11:00:00Z&to=2026-04-29T23:00:00Z',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.body.data.rows.length, 2); // PWD_CHANGE + CYLINDER_ADD
  });

  test('limit=0 falls back to default 200 (Number(0)||200 short-circuits)', async () => {
    // The router does `Number(req.query.limit) || 200` — 0 is falsy so
    // it uses the default. limit=99999 would clamp to 10000. This test
    // pins the falsy-fallback behaviour so a refactor that swaps `||`
    // for `??` (which would let 0 through) is caught.
    const r = await request(buildApp(), {
      path: '/api/audit?limit=0',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.body.data.rows.length, 4); // all backing rows fit in 200
  });
  test('limit=2 honoured (passes through to tailAudit)', async () => {
    const r = await request(buildApp(), {
      path: '/api/audit?limit=2',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.body.data.rows.length, 2);
  });

  test('tailAudit throws → 500 with safe error message', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { user: { role: 'sys' }, role: 'sys' };
      next();
    });
    app.use(
      '/api/audit',
      createAuditRouter({
        auth: (_req, _res, next) => next(),
        requireRole: () => (_req, _res, next) => next(),
        tailAudit: () => {
          throw new Error('db lock');
        },
        auditRowCount: () => 0,
      })
    );
    const r = await request(app, { path: '/api/audit' });
    assert.equal(r.status, 500);
    assert.match(r.body.error.message, /db lock/);
  });
});
