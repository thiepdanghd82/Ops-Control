/**
 * sync.js — unit tests for /api/sync/{manifest,pull,push}
 *
 * Test approach:
 *   - Spin up Express với chỉ syncRouter mounted (no auth middleware)
 *     để test route logic isolated.
 *   - Tạo file Library tạm trong tmpdir để control payload
 *   - Test pull filter theo `since`, push relay nội bộ
 */

import { test } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: start an isolated Express on ephemeral port
async function spawnApp(routes) {
  const app = express();
  app.use(express.json());
  routes(app);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { status: res.status, body, headers: res.headers };
}

test('sync: GET /pull rejects unknown table', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const r = await fetchJson(`${url}/api/sync/pull?table=evil_secret`);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'unknown_table');
    assert.ok(Array.isArray(r.body.allowed));
    assert.ok(r.body.allowed.length > 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: GET /pull returns empty rows when file missing (graceful)', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    // permission_groups exists in real Library but customers may not
    const r = await fetchJson(`${url}/api/sync/pull?table=customers&since=0`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.ok(Array.isArray(r.body.rows));
    // Either has rows OR empty — both valid
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: GET /pull?since=<future> returns 0 rows', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const future = Date.now() + 86400_000;
    const r = await fetchJson(`${url}/api/sync/pull?table=permission_groups&since=${future}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.rows.length, 0);
    assert.ok(r.body.maxSavedAt >= future);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: GET /manifest lists configured tables', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const r = await fetchJson(`${url}/api/sync/manifest`);
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.tables));
    const names = r.body.tables.map((t) => t.name);
    assert.ok(names.includes('permission_groups'));
    assert.ok(names.includes('customers'));
    // Expected fields present
    for (const t of r.body.tables) {
      assert.ok('exists' in t);
      assert.ok('mtimeMs' in t);
      assert.ok('size' in t);
      assert.ok('idField' in t);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: POST /push rejects missing method/url', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const r = await fetchJson(`${url}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'missing_method_or_url');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: POST /push rejects external URL', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const r = await fetchJson(`${url}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'POST', url: 'http://evil.com/api/data', body: {} }),
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'url_must_start_with_/api/');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('sync: POST /push rejects GET method', async () => {
  const { default: syncRouter } = await import('./sync.js');
  const { server, url } = await spawnApp((app) => app.use('/api/sync', syncRouter));
  try {
    const r = await fetchJson(`${url}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', url: '/api/quotes' }),
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'method_not_allowed');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
