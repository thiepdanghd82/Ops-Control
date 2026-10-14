/**
 * auditStore — insert + tail + filter + bulk tests.
 * Runner: node --test server/repositories/auditStore.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../db/connection.js';
import { initSchema } from '../db/init.js';
import {
  appendAudit,
  tailAudit,
  auditRowCount,
  bulkAppendAudit,
  quoteCreators,
} from './auditStore.js';

function setupTmp() {
  connection._resetForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-audit-store-'));
  process.env.OPS_DB_PATH = path.join(dir, 'ops.db');
  initSchema();
  return dir;
}

test('auditStore: appendAudit + tailAudit round-trip', () => {
  setupTmp();
  const ok = appendAudit({
    ts: '2026-04-19T10:00:00Z',
    event: 'LOGIN',
    user: 'alice',
    ip: '10.0.0.1',
    detail: 'ok',
  });
  assert.equal(ok, true);
  const rows = tailAudit(10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'LOGIN');
  assert.equal(rows[0].user, 'alice');
});

test('auditStore: tailAudit returns newest first', () => {
  setupTmp();
  appendAudit({ ts: '2026-04-19T10:00:00Z', event: 'A' });
  appendAudit({ ts: '2026-04-19T10:00:01Z', event: 'B' });
  appendAudit({ ts: '2026-04-19T10:00:02Z', event: 'C' });
  const rows = tailAudit(10);
  assert.deepEqual(
    rows.map((r) => r.event),
    ['C', 'B', 'A']
  );
});

test('auditStore: tailAudit limit caps result count', () => {
  setupTmp();
  for (let i = 0; i < 20; i++) {
    appendAudit({ ts: `2026-04-19T10:00:${String(i).padStart(2, '0')}Z`, event: `E${i}` });
  }
  assert.equal(tailAudit(5).length, 5);
  assert.equal(tailAudit(100).length, 20);
});

test('auditStore: filter by event', () => {
  setupTmp();
  appendAudit({ ts: '2026-04-19T10:00:00Z', event: 'LOGIN', user: 'a' });
  appendAudit({ ts: '2026-04-19T10:00:01Z', event: 'APPROVE', user: 'b' });
  appendAudit({ ts: '2026-04-19T10:00:02Z', event: 'LOGIN', user: 'c' });
  const rows = tailAudit(10, { event: 'LOGIN' });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.user),
    ['c', 'a']
  );
});

test('auditStore: filter by user', () => {
  setupTmp();
  appendAudit({ ts: '2026-04-19T10:00:00Z', event: 'LOGIN', user: 'alice' });
  appendAudit({ ts: '2026-04-19T10:00:01Z', event: 'LOGIN', user: 'bob' });
  appendAudit({ ts: '2026-04-19T10:00:02Z', event: 'APPROVE', user: 'alice' });
  const rows = tailAudit(10, { user: 'alice' });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.event),
    ['APPROVE', 'LOGIN']
  );
});

test('auditStore: auditRowCount returns correct count', () => {
  setupTmp();
  assert.equal(auditRowCount(), 0);
  for (let i = 0; i < 7; i++) appendAudit({ ts: `2026-04-19T10:00:${i}Z`, event: 'X' });
  assert.equal(auditRowCount(), 7);
});

test('auditStore: bulkAppendAudit inserts all rows in single transaction', () => {
  setupTmp();
  const rows = Array.from({ length: 500 }, (_, i) => ({
    ts: `2026-04-19T10:00:${String(i).padStart(3, '0')}Z`,
    event: 'SEED',
    user: `u${i}`,
    ip: '10.0.0.1',
    detail: `row ${i}`,
  }));
  const inserted = bulkAppendAudit(rows);
  assert.equal(inserted, 500);
  assert.equal(auditRowCount(), 500);
});

test('auditStore: bulkAppendAudit empty array → 0', () => {
  setupTmp();
  assert.equal(bulkAppendAudit([]), 0);
  assert.equal(auditRowCount(), 0);
});

test('auditStore: DB missing → fail-open (no throw, returns false / empty / null)', () => {
  connection._resetForTests();
  // Point to a dir that exists but no DB file.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-audit-nodb-'));
  process.env.OPS_DB_PATH = path.join(dir, 'missing.db');
  assert.equal(appendAudit({ ts: 't', event: 'X' }), false, 'append fail-open returns false');
  assert.deepEqual(tailAudit(10), [], 'tail returns [] when DB missing');
  assert.equal(auditRowCount(), null, 'row count null when DB offline');
});

test('auditStore: null/undefined fields coerced to empty-ish defaults', () => {
  setupTmp();
  appendAudit({ ts: '2026-04-19T10:00:00Z', event: 'X' });
  const rows = tailAudit(1);
  assert.equal(rows[0].user, '-');
  assert.equal(rows[0].ip, '-');
  assert.equal(rows[0].detail, '');
});

test('auditStore: index by event speeds up filter (smoke)', () => {
  // Not a perf test — just confirms the EXPLAIN QUERY PLAN uses the
  // idx_audit_event index when filtering by event. Guards against a
  // future migration that accidentally drops the index.
  setupTmp();
  const db = connection.getDb();
  const plan = db
    .prepare('EXPLAIN QUERY PLAN SELECT * FROM audit_log WHERE event = ? ORDER BY id DESC LIMIT 10')
    .all('LOGIN');
  const uses = plan.some((r) => String(r.detail || '').includes('idx_audit_event'));
  assert.ok(uses, `expected idx_audit_event use — got: ${JSON.stringify(plan)}`);
});

// ── quoteCreators: who created each quote, from POST /api/quotes's audit rows ──

function quoteSave(user, detail) {
  appendAudit({
    ts: '2026-09-30T00:00:00Z',
    event: 'QUOTE_SAVE',
    user,
    ip: '10.0.0.1',
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
  });
}

test('auditStore: quoteCreators maps each quote to the user whose save created it', () => {
  setupTmp();
  quoteSave('Jet', { id: 140, version: 1, type: 'standard', is_new: true });
  quoteSave('Hana', { id: 140, version: 2, type: 'standard', is_new: false }); // a later update
  quoteSave('Administrator', { id: 141, version: 1, type: 'complex', is_new: true });
  appendAudit({
    ts: '2026-09-30T00:00:01Z',
    event: 'QUOTE_TRASH',
    user: 'Hana',
    detail: 'trashed quote #141',
  });
  const creators = quoteCreators();
  assert.equal(creators.size, 2);
  assert.equal(creators.get(140), 'Jet');
  assert.equal(creators.get(141), 'Administrator');
});

test('auditStore: quoteCreators — a reused id belongs to its latest creation', () => {
  // upsertQuote assigns max(id) + 1, so purging the newest quote hands its
  // id to the next new one.
  setupTmp();
  quoteSave('Hana', { id: 150, is_new: true });
  quoteSave('Jet', { id: 150, is_new: true });
  assert.equal(quoteCreators().get(150), 'Jet');
});

test('auditStore: quoteCreators skips rows it cannot attribute', () => {
  setupTmp();
  quoteSave('-', { id: 1, is_new: true });
  quoteSave('Jet', 'not json');
  quoteSave('Jet', { is_new: true });
  assert.equal(quoteCreators().size, 0);
});

test('auditStore: quoteCreators is empty when the DB is unavailable', () => {
  connection._resetForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-audit-nodb-'));
  process.env.OPS_DB_PATH = path.join(dir, 'missing.db');
  assert.equal(quoteCreators().size, 0);
});
