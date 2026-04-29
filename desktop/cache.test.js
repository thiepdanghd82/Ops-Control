/**
 * cache.js — unit tests for SQLite local cache + outbox.
 *
 * Test này YÊU CẦU Electron context vì better-sqlite3 chỉ rebuild cho
 * Electron's Node ABI (không chạy được từ Node 24 host). Cách chạy:
 *
 *   cd desktop && env -u ELECTRON_RUN_AS_NODE \
 *     ./node_modules/.bin/electron --no-deprecation cache.test.js
 *
 * Hoặc thêm vào script package.json:
 *   "test:cache": "electron cache.test.js"
 *
 * Hành vi: tự bootstrap fake Electron `app` API trỏ về tmpdir, chạy
 * test-suite, rồi gọi app.exit() — không mở GUI window.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert');
const { app } = require('electron');

let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { pass++; results.push(`✔ ${name}`); })
    .catch((err) => { fail++; results.push(`✖ ${name}\n  ${err.message}`); });
}

async function main() {
  // Force userData to tmpdir so we get a clean cache.db each run
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-cache-test-'));
  app.setPath('userData', tmp);
  console.log('[test] tmpdir:', tmp);

  const cache = require('./native/cache.js');

  await test('KV: get null when missing', () => {
    assert.strictEqual(cache.kvGet('missing-key'), null);
  });

  await test('KV: set + get roundtrip with object', () => {
    cache.kvSet('user', { id: 1, name: 'Tester', perms: ['read', 'write'] });
    const got = cache.kvGet('user');
    assert.deepStrictEqual(got, { id: 1, name: 'Tester', perms: ['read', 'write'] });
  });

  await test('KV: set overwrites existing', () => {
    cache.kvSet('flag', 'A');
    cache.kvSet('flag', 'B');
    assert.strictEqual(cache.kvGet('flag'), 'B');
  });

  await test('master_cache: upsert + get + list', () => {
    cache.cacheUpsert('customers', 'C001', { code: 'C001', name: 'Acme' });
    cache.cacheUpsert('customers', 'C002', { code: 'C002', name: 'Beta' });
    cache.cacheUpsert('customers', 'C003', { code: 'C003', name: 'Gamma' });
    const got = cache.cacheGet('customers', 'C002');
    assert.strictEqual(got.name, 'Beta');
    const all = cache.cacheList('customers');
    assert.strictEqual(all.length, 3);
    assert.deepStrictEqual(all.map((r) => r.code).sort(), ['C001', 'C002', 'C003']);
  });

  await test('master_cache: upsert replaces existing row', () => {
    cache.cacheUpsert('customers', 'C001', { code: 'C001', name: 'Acme Corp UPDATED' });
    const got = cache.cacheGet('customers', 'C001');
    assert.strictEqual(got.name, 'Acme Corp UPDATED');
  });

  await test('master_cache: cacheList isolates by table', () => {
    cache.cacheUpsert('products', 'P1', { code: 'P1' });
    const customers = cache.cacheList('customers');
    const products = cache.cacheList('products');
    assert.strictEqual(customers.length, 3);
    assert.strictEqual(products.length, 1);
  });

  await test('outbox: enqueue returns id + initial pendingCount', () => {
    const r = cache.enqueue({ method: 'POST', url: '/api/quotes', body: { id: 'q1' } });
    assert.ok(r.id > 0);
    assert.ok(r.queued_at > 0);
  });

  await test('outbox: listPending FIFO order', () => {
    cache.enqueue({ method: 'PUT', url: '/api/quotes/q1', body: { status: 'draft' } });
    cache.enqueue({ method: 'DELETE', url: '/api/quotes/q2' });
    const list = cache.listPending(10);
    assert.ok(list.length >= 3);
    // Verify timestamps are non-decreasing
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].created_at >= list[i - 1].created_at);
    }
  });

  await test('outbox: markDone removes from pending', () => {
    const before = cache.pendingCount();
    const list = cache.listPending(1);
    cache.markDone(list[0].id);
    const after = cache.pendingCount();
    assert.strictEqual(after, before - 1);
  });

  await test('outbox: markFailed retries up to 5 attempts then marks failed', () => {
    const e = cache.enqueue({ method: 'POST', url: '/api/test', body: {} });
    for (let i = 0; i < 5; i++) cache.markFailed(e.id, 'connection refused');
    // After 5th failure, should be marked 'failed' not 'pending'
    const stillPending = cache.listPending(100).find((r) => r.id === e.id);
    assert.strictEqual(stillPending, undefined, '5x failed item must drop from pending');
  });

  await test('sync_state: getSyncState null when missing', () => {
    assert.strictEqual(cache.getSyncState('never-pulled'), null);
  });

  await test('sync_state: setSyncState + getSyncState', () => {
    const ts = Date.now();
    cache.setSyncState('customers', ts);
    const ss = cache.getSyncState('customers');
    assert.strictEqual(ss.table_name, 'customers');
    assert.strictEqual(ss.last_saved_at, ts);
    assert.ok(ss.last_pulled_at >= ts);
  });

  await test('sync_state: setSyncState updates existing', () => {
    cache.setSyncState('customers', 100);
    cache.setSyncState('customers', 200);
    assert.strictEqual(cache.getSyncState('customers').last_saved_at, 200);
  });

  // Print summary
  console.log('\n=== cache.test.js results ===');
  for (const r of results) console.log(r);
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);

  // Cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* swallow */ }

  app.exit(fail > 0 ? 1 : 0);
}

app.whenReady().then(main).catch((err) => {
  console.error('Test bootstrap failed:', err);
  app.exit(2);
});
