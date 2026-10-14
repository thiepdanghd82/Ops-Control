/**
 * sqliteBackend — quotes write-path tests (Sprint 7.1).
 *
 * Uses a per-test isolated SQLite DB under /tmp. Each test drops the
 * connection's path + handle caches so OPS_DB_PATH is freshly read,
 * then runs schema init + exercises upsert/read through the real
 * better-sqlite3 engine. No mocks — catching behaviour drift against
 * ops.db is the whole point of this suite.
 *
 *   node --test server/repositories/backends/sqliteBackend.quotes.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../../db/connection.js';
import { initSchema } from '../../db/init.js';
import backend, { _resetDbReadyForTests } from './sqliteBackend.js';

function freshDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sqlite-quotes-'));
  return path.join(dir, 'ops.db');
}

function setupDb() {
  // Wipe module-scope caches so OPS_DB_PATH is re-read for each test.
  connection._resetForTests();
  _resetDbReadyForTests();
  process.env.OPS_DB_PATH = freshDbPath();
  initSchema();
}

/** DB-only row count. `listQuotes()` falls back to the file backend on
 *  empty → we bypass that here since tests run against a tmp dir with
 *  no quote_history.json and would otherwise pick up prod data. */
function dbRowCount() {
  return connection.getDb().prepare('SELECT COUNT(*) as n FROM quotes').get().n;
}

function setupNoDb() {
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sqlite-absent-'));
  process.env.OPS_DB_PATH = path.join(dir, 'missing.db'); // file never created
  // Do NOT call initSchema — we want to verify behaviour when the db
  // file genuinely doesn't exist.
}

function mkQuote(id, overrides = {}) {
  return {
    id,
    type: 'standard',
    saved_at: new Date(2026, 3, 18, 10, 0, 0).toISOString(),
    version: 0,
    label: `Quote ${id}`,
    result: { gm: 0.22, va: 0.31 },
    state: {
      rfq_number: `RFQ-00${id}`,
      ccl_pn: `CCL-${id}`,
      direct_cu: 'Acme',
      end_cu: 'Globex',
      npi_owner: 'hana',
      sale_owner: 'sonia',
      moq: 1000,
      selling_price: 0.42,
    },
    ...overrides,
  };
}

test('upsertQuote: inserts a new quote and listQuotes reads it back from DB', () => {
  setupDb();
  const r = backend.upsertQuote(mkQuote(1));
  assert.equal(r.ok, true);
  // `listQuotes()` prefers DB rows; when non-empty (as here) it
  // returns them without the file-backend fallback.
  const list = backend.listQuotes();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 1);
  assert.equal(list[0].state.ccl_pn, 'CCL-1');
});

test('upsertQuote: second call with same id REPLACES, does not duplicate', () => {
  setupDb();
  backend.upsertQuote(mkQuote(1));
  const updated = mkQuote(1, { label: 'Revised' });
  updated.state.selling_price = 0.55;
  backend.upsertQuote(updated);
  const list = backend.listQuotes();
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Revised');
  assert.equal(list[0].state.selling_price, 0.55);
});

test('upsertQuote: missing id returns {ok:false,reason:missing-id}', () => {
  setupDb();
  const r = backend.upsertQuote({ state: {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing-id/);
});

test('upsertQuote: null input safe', () => {
  setupDb();
  const r = backend.upsertQuote(null);
  assert.equal(r.ok, false);
});

test('getQuoteById: returns the parsed raw_json for an existing row', () => {
  setupDb();
  backend.upsertQuote(mkQuote(7));
  const q = backend.getQuoteById(7);
  assert.ok(q);
  assert.equal(q.id, 7);
  assert.equal(q.state.ccl_pn, 'CCL-7');
});

test('getQuoteById: returns null for unknown id (DB present, no file fallback)', () => {
  setupDb();
  backend.upsertQuote(mkQuote(1));
  assert.equal(backend.getQuoteById(999), null);
});

test('upsertQuotesBulk: seeds multiple and deletes rows absent from the next save', () => {
  setupDb();
  let r = backend.upsertQuotesBulk([mkQuote(1), mkQuote(2), mkQuote(3)]);
  assert.equal(r.ok, true);
  assert.equal(r.written, 3);
  assert.equal(dbRowCount(), 3);

  r = backend.upsertQuotesBulk([mkQuote(1), mkQuote(3, { label: 'Tier bump' })]);
  assert.equal(r.ok, true);
  assert.equal(r.written, 2);
  assert.equal(r.deleted, 1, 'one row removed');
  const ids = backend
    .listQuotes()
    .map((q) => q.id)
    .sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 3]);
  assert.equal(backend.getQuoteById(3).label, 'Tier bump');
});

test('upsertQuotesBulk: empty list clears the table', () => {
  setupDb();
  backend.upsertQuotesBulk([mkQuote(1), mkQuote(2)]);
  assert.equal(dbRowCount(), 2);
  const r = backend.upsertQuotesBulk([]);
  assert.equal(r.ok, true);
  assert.equal(r.written, 0);
  assert.equal(r.deleted, 2);
  assert.equal(dbRowCount(), 0);
});

test('upsertQuotesBulk: skips records without an id', () => {
  setupDb();
  const r = backend.upsertQuotesBulk([
    mkQuote(1),
    { state: { rfq_number: 'X' } }, // no id → skipped
    mkQuote(2),
    null, // skipped
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.written, 2);
  assert.equal(r.skipped, 2);
});

test('upsertQuote: indexed columns populated for list-view filtering', () => {
  setupDb();
  backend.upsertQuote(mkQuote(42));
  const row = connection
    .getDb()
    .prepare(
      'SELECT id, rfq_number, ccl_pn, direct_cu, end_cu, npi_owner, saved_at FROM quotes WHERE id = ?'
    )
    .get(42);
  assert.equal(row.rfq_number, 'RFQ-0042');
  assert.equal(row.ccl_pn, 'CCL-42');
  assert.equal(row.direct_cu, 'Acme');
  assert.equal(row.end_cu, 'Globex');
  assert.equal(row.npi_owner, 'hana');
  assert.ok(row.saved_at);
});

test('no DB file: upsertQuote returns db-unavailable, does not throw', () => {
  setupNoDb();
  const r = backend.upsertQuote(mkQuote(1));
  assert.equal(r.ok, false);
  assert.match(r.reason, /db-unavailable/);
  const bulk = backend.upsertQuotesBulk([mkQuote(1)]);
  assert.equal(bulk.ok, false);
  assert.match(bulk.reason, /db-unavailable/);
});

test('quotes state.approval payload round-trips through raw_json', () => {
  setupDb();
  const q = mkQuote(9);
  q.state.approval = {
    status: 'pending_sales',
    submitted_by: 'hana',
    submitted_at: new Date().toISOString(),
    history: [
      {
        ts: new Date().toISOString(),
        from: 'draft',
        to: 'pending_sales',
        action: 'SUBMIT',
        actor: 'hana',
      },
    ],
  };
  backend.upsertQuote(q);
  const out = backend.getQuoteById(9);
  assert.equal(out.state.approval.status, 'pending_sales');
  assert.equal(out.state.approval.history.length, 1);
  assert.equal(out.state.approval.submitted_by, 'hana');
});
