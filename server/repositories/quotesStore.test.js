/**
 * quotesStore — load/save/get tests. Exercises the file+SQLite
 * shadow-write path end-to-end against tmp fixtures.
 *   node --test server/repositories/quotesStore.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../db/connection.js';
import { initSchema } from '../db/init.js';
import { _resetDbReadyForTests } from './backends/sqliteBackend.js';
import {
  loadQuotes,
  saveQuotes,
  getQuoteById,
  quotesBackendStatus,
  upsertQuote,
  VersionConflictError,
} from './quotesStore.js';

function setupTmp() {
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-qstore-'));
  process.env.OPS_QUOTE_HISTORY_FILE = path.join(dir, 'quote_history.json');
  process.env.OPS_DB_PATH = path.join(dir, 'ops.db');
  initSchema();
  return { dir };
}

function sampleQuote(id, overrides = {}) {
  return {
    id,
    type: 'standard',
    saved_at: new Date().toISOString(),
    version: 0,
    state: { ccl_pn: `CCL-${id}`, rfq_number: `RFQ-${id}` },
    ...overrides,
  };
}

function dbQuoteCount() {
  return connection.getDb().prepare('SELECT COUNT(*) as n FROM quotes').get().n;
}

test('loadQuotes: missing file → []', () => {
  setupTmp();
  assert.deepEqual(loadQuotes(), []);
});

test('loadQuotes: corrupt JSON → [] (never throws)', () => {
  const { dir } = setupTmp();
  fs.writeFileSync(path.join(dir, 'quote_history.json'), 'not json{{{');
  assert.deepEqual(loadQuotes(), []);
});

test('saveQuotes: writes the JSON file atomically', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(2)]);
  const written = JSON.parse(fs.readFileSync(process.env.OPS_QUOTE_HISTORY_FILE, 'utf-8'));
  assert.equal(written.length, 2);
  assert.equal(written[0].id, 1);
});

test('saveQuotes: shadow-writes the SQLite mirror', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(2), sampleQuote(3)]);
  assert.equal(dbQuoteCount(), 3);
});

test('saveQuotes: SQLite mirror reflects deletes (full-sync semantics)', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(2), sampleQuote(3)]);
  saveQuotes([sampleQuote(1), sampleQuote(3, { version: 2 })]);
  assert.equal(dbQuoteCount(), 2);
  const q3 = connection.getDb().prepare('SELECT raw_json FROM quotes WHERE id = 3').get();
  assert.equal(JSON.parse(q3.raw_json).version, 2);
});

test('saveQuotes: returns informational result object', () => {
  setupTmp();
  const r = saveQuotes([sampleQuote(1)]);
  assert.equal(r.file, true);
  assert.equal(r.sqlite.ok, true);
  assert.equal(r.sqlite.written, 1);
});

test('saveQuotes: SQLite failure does not throw (file is authoritative)', () => {
  setupTmp();
  // Point OPS_DB_PATH at a directory that can't be opened as a DB so
  // the mirror write fails cleanly. Since we never call initSchema
  // here, sqliteBackend reports db-unavailable rather than throwing.
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-qstore-no-db-'));
  process.env.OPS_QUOTE_HISTORY_FILE = path.join(dir, 'quote_history.json');
  process.env.OPS_DB_PATH = path.join(dir, 'does-not-exist.db');
  // Capture the console.warn call so we can assert the diagnostic fires.
  const origWarn = console.warn;
  let warned = '';
  console.warn = (...args) => {
    warned += args.join(' ') + '\n';
  };
  try {
    const r = saveQuotes([sampleQuote(1)]);
    assert.equal(r.file, true);
    assert.equal(r.sqlite.ok, false);
  } finally {
    console.warn = origWarn;
  }
  // File still persisted even though mirror failed.
  const onDisk = JSON.parse(fs.readFileSync(process.env.OPS_QUOTE_HISTORY_FILE, 'utf-8'));
  assert.equal(onDisk.length, 1);
  assert.match(warned, /shadow-write/);
});

test('getQuoteById: finds existing, returns null otherwise', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(42), sampleQuote(99)]);
  assert.equal(getQuoteById(42).state.ccl_pn, 'CCL-42');
  assert.equal(getQuoteById(7), null);
  assert.equal(getQuoteById('nonsense'), null);
});

test('saveQuotes: empty list clears the store (both file and mirror)', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(2)]);
  saveQuotes([]);
  assert.deepEqual(loadQuotes(), []);
  assert.equal(dbQuoteCount(), 0);
});

// ── Sprint 7.3: per-dataset cutover routing ──
test('OPS_BACKEND_QUOTES=file: reads come from JSON even if SQLite has different data', () => {
  setupTmp();
  // Seed SQLite with id=99, but write file with id=1.
  // Do that by: saveQuotes writes both, then we directly fiddle the
  // DB to set a different row. Simulates drift during cutover.
  saveQuotes([sampleQuote(1)]);
  connection.getDb().prepare('DELETE FROM quotes').run();
  connection
    .getDb()
    .prepare(
      `
    INSERT INTO quotes (id, type, state_json, raw_json)
    VALUES (99, 'standard', '{}', ?)
  `
    )
    .run(JSON.stringify({ id: 99, state: { ccl_pn: 'CCL-99' } }));
  // Force file backend
  process.env.OPS_BACKEND_QUOTES = 'file';
  try {
    const list = loadQuotes();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 1);
    assert.equal(getQuoteById(99), null, 'file has no id 99');
    assert.equal(getQuoteById(1).state.ccl_pn, 'CCL-1');
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
  }
});

test('OPS_BACKEND_QUOTES=sqlite: reads come from SQLite', () => {
  setupTmp();
  saveQuotes([sampleQuote(1)]);
  // Fiddle DB to set different content.
  connection.getDb().prepare('DELETE FROM quotes').run();
  connection
    .getDb()
    .prepare(
      `
    INSERT INTO quotes (id, type, state_json, raw_json)
    VALUES (99, 'standard', '{}', ?)
  `
    )
    .run(JSON.stringify({ id: 99, state: { ccl_pn: 'CCL-99' } }));
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  try {
    const list = loadQuotes();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 99);
    assert.equal(getQuoteById(99).state.ccl_pn, 'CCL-99');
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
  }
});

test('quotesBackendStatus: reports in_sync=true after a round-trip', () => {
  setupTmp();
  saveQuotes([sampleQuote(1), sampleQuote(2)]);
  const s = quotesBackendStatus();
  assert.equal(s.file_count, 2);
  assert.equal(s.sqlite_count, 2);
  assert.equal(s.in_sync, true);
  // default effective backend is file (no env set)
  assert.equal(s.effective_backend, 'file');
});

test('quotesBackendStatus: reports in_sync=false when file and SQLite diverge', () => {
  setupTmp();
  saveQuotes([sampleQuote(1)]);
  // Simulate drift by wiping SQLite only.
  connection.getDb().prepare('DELETE FROM quotes').run();
  const s = quotesBackendStatus();
  assert.equal(s.file_count, 1);
  assert.equal(s.sqlite_count, 0);
  assert.equal(s.in_sync, false);
});

test('quotesBackendStatus: honors OPS_BACKEND_QUOTES override in effective_backend', () => {
  setupTmp();
  saveQuotes([sampleQuote(1)]);
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  try {
    assert.equal(quotesBackendStatus().effective_backend, 'sqlite');
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
  }
});

test('quotesBackendStatus: no DB file → sqlite_count=null, sqlite_reason set', () => {
  // Setup file but point OPS_DB_PATH somewhere without initSchema.
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-qstore-no-db-2-'));
  process.env.OPS_QUOTE_HISTORY_FILE = path.join(dir, 'quote_history.json');
  process.env.OPS_DB_PATH = path.join(dir, 'missing.db'); // never initialized
  // Write file manually (saveQuotes would try SQLite → fail but still write file).
  fs.writeFileSync(process.env.OPS_QUOTE_HISTORY_FILE, JSON.stringify([sampleQuote(1)]));
  const s = quotesBackendStatus();
  assert.equal(s.file_count, 1);
  assert.equal(s.sqlite_count, null);
  assert.match(s.sqlite_reason, /db-file-missing/);
  assert.equal(s.in_sync, false);
});

// ── Sprint 7.4: strict mode (no file fallback) ──
test('strict mode: loadQuotes reads ONLY SQLite, ignores file drift', () => {
  setupTmp();
  saveQuotes([sampleQuote(1)]);
  // Introduce drift — file says [7,8], SQLite still holds [1].
  fs.writeFileSync(
    process.env.OPS_QUOTE_HISTORY_FILE,
    JSON.stringify([sampleQuote(7), sampleQuote(8)])
  );
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  process.env.OPS_QUOTES_STRICT_SQLITE = '1';
  try {
    const list = loadQuotes();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 1, 'strict mode bypasses file');
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
    delete process.env.OPS_QUOTES_STRICT_SQLITE;
  }
});

test('strict mode: getQuoteById returns SQLite match, no file fallback', () => {
  setupTmp();
  saveQuotes([sampleQuote(42)]);
  // File diverges with id=42 but different content.
  fs.writeFileSync(
    process.env.OPS_QUOTE_HISTORY_FILE,
    JSON.stringify([sampleQuote(42, { state: { ccl_pn: 'CCL-STALE' } })])
  );
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  process.env.OPS_QUOTES_STRICT_SQLITE = '1';
  try {
    const q = getQuoteById(42);
    assert.ok(q);
    assert.equal(q.state.ccl_pn, 'CCL-42', 'SQLite value wins');
    assert.equal(getQuoteById(7), null, 'null on missing, not file fallback');
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
    delete process.env.OPS_QUOTES_STRICT_SQLITE;
  }
});

test('strict mode: DB missing → loadQuotes throws (fail-loud, not silent stale)', () => {
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-strict-no-db-'));
  process.env.OPS_QUOTE_HISTORY_FILE = path.join(dir, 'quote_history.json');
  process.env.OPS_DB_PATH = path.join(dir, 'never-created.db');
  // Put content in file so we can verify it's NOT returned.
  fs.writeFileSync(
    process.env.OPS_QUOTE_HISTORY_FILE,
    JSON.stringify([sampleQuote(1), sampleQuote(2)])
  );
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  process.env.OPS_QUOTES_STRICT_SQLITE = '1';
  try {
    assert.throws(() => loadQuotes(), /ops\.db missing/);
    assert.throws(() => getQuoteById(1), /ops\.db missing/);
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
    delete process.env.OPS_QUOTES_STRICT_SQLITE;
  }
});

test('strict mode: saveQuotes still writes file for rollback safety', () => {
  setupTmp();
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  process.env.OPS_QUOTES_STRICT_SQLITE = '1';
  try {
    saveQuotes([sampleQuote(1), sampleQuote(2)]);
    // File still contains both rows even though strict-mode reads bypass it.
    const onDisk = JSON.parse(fs.readFileSync(process.env.OPS_QUOTE_HISTORY_FILE, 'utf-8'));
    assert.equal(onDisk.length, 2);
    // SQLite mirror is authoritative during strict reads.
    assert.equal(loadQuotes().length, 2);
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
    delete process.env.OPS_QUOTES_STRICT_SQLITE;
  }
});

test('strict mode off: missing DB does NOT throw (contrast with strict on)', () => {
  // Invariant check: strict=off is the lenient path. Even when the
  // DB file is gone, loadQuotes must not throw — the whole point of
  // the shadow-read stage is that SQLite outages can't break the
  // read path. We assert "doesn't throw + returns an array" rather
  // than a specific count; fileBackend's default-path lookup is not
  // the object under test here.
  connection._resetForTests();
  _resetDbReadyForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-strict-off-'));
  process.env.OPS_QUOTE_HISTORY_FILE = path.join(dir, 'quote_history.json');
  process.env.OPS_DB_PATH = path.join(dir, 'never-created.db');
  process.env.OPS_BACKEND_QUOTES = 'sqlite';
  // OPS_QUOTES_STRICT_SQLITE intentionally unset — strict OFF.
  try {
    const list = loadQuotes();
    assert.ok(Array.isArray(list), 'returns an array (no throw)');
    // No strict-mode error despite DB missing.
    assert.doesNotThrow(() => getQuoteById(1));
  } finally {
    delete process.env.OPS_BACKEND_QUOTES;
  }
});

// ── Sprint 11: upsertQuote concurrency regression ─────────────
// The client used to GET full history → mutate → POST full history
// via /save-all. Two concurrent admin saves could each read N rows
// and each POST N+1, with the second POST clobbering the first
// admin's added quote. upsertQuote + withLock serializes the
// read-modify-write server-side; these tests pin the contract.

test('upsertQuote: assigns next-free id when id is missing', async () => {
  setupTmp();
  const q = await upsertQuote({ type: 'standard', state: { rfq_number: 'A' } });
  assert.equal(q.id, 1);
  const q2 = await upsertQuote({ type: 'standard', state: { rfq_number: 'B' } });
  assert.equal(q2.id, 2);
});

test('upsertQuote: replaces existing quote by id (merge with current)', async () => {
  setupTmp();
  const first = await upsertQuote({
    type: 'standard',
    state: { rfq_number: 'A' },
    version: 0,
    label: 'first',
  });
  await upsertQuote({ id: first.id, state: { rfq_number: 'A-REV' } });
  const list = loadQuotes();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, first.id);
  assert.equal(list[0].state.rfq_number, 'A-REV');
  // Shallow merge preserves top-level fields the caller didn't send.
  assert.equal(list[0].label, 'first');
});

test('upsertQuote: concurrent creates never lose a row (lost-update guard)', async () => {
  setupTmp();
  // 20 parallel creates. With the old /save-all flow, half would be
  // lost to concurrent array writes. Under upsertQuote + withLock the
  // final file must contain all 20 with unique ids 1..20.
  const N = 20;
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push(upsertQuote({ type: 'standard', state: { rfq_number: `R-${i}` } }));
  }
  const saved = await Promise.all(promises);
  const ids = saved.map((q) => q.id).sort((a, b) => a - b);
  assert.deepEqual(
    ids,
    Array.from({ length: N }, (_, i) => i + 1)
  );
  const onDisk = loadQuotes();
  assert.equal(onDisk.length, N);
  // Every rfq_number should have landed — no silent drops.
  const rfqs = new Set(onDisk.map((q) => q.state.rfq_number));
  for (let i = 0; i < N; i++) assert.ok(rfqs.has(`R-${i}`), `missing R-${i}`);
});

test('upsertQuote: concurrent updates to different ids all land', async () => {
  setupTmp();
  // Seed 5 quotes.
  for (let i = 0; i < 5; i++)
    await upsertQuote({ type: 'standard', state: { rfq_number: `A-${i}` } });
  // 5 concurrent PATCHes, each on a different row.
  const patches = [];
  for (let i = 1; i <= 5; i++) {
    patches.push(upsertQuote({ id: i, state: { rfq_number: `PATCHED-${i}` } }));
  }
  await Promise.all(patches);
  const list = loadQuotes();
  assert.equal(list.length, 5);
  for (let i = 1; i <= 5; i++) {
    const q = list.find((x) => x.id === i);
    assert.ok(q, `id ${i} missing after concurrent patches`);
    assert.equal(q.state.rfq_number, `PATCHED-${i}`);
  }
});

test('upsertQuote: non-object payload rejected before touching disk', async () => {
  setupTmp();
  await assert.rejects(() => upsertQuote(null), /plain object/);
  await assert.rejects(() => upsertQuote('str'), /plain object/);
  await assert.rejects(() => upsertQuote([]), /plain object/);
  assert.equal(loadQuotes().length, 0, 'file must remain untouched');
});

test('upsertQuote: saved_at is stamped when caller omits it', async () => {
  setupTmp();
  const q = await upsertQuote({ type: 'standard', state: {} });
  assert.ok(q.saved_at, 'saved_at missing');
  assert.doesNotThrow(() => new Date(q.saved_at).toISOString());
});

// ── Sprint 11 P0-2: optimistic locking ────────────────────────────

test('upsertQuote: new quote is stamped with _version=1', async () => {
  setupTmp();
  const q = await upsertQuote({ type: 'standard', state: {} });
  assert.equal(q._version, 1);
});

test('upsertQuote: patching bumps _version', async () => {
  setupTmp();
  const created = await upsertQuote({ type: 'standard', state: { rfq: 'A' } });
  const patched = await upsertQuote({ id: created.id, _version: 1, state: { rfq: 'B' } });
  assert.equal(patched._version, 2);
  assert.equal(patched.state.rfq, 'B');
});

test('upsertQuote: stale _version throws VersionConflictError', async () => {
  setupTmp();
  const created = await upsertQuote({ type: 'standard', state: { rfq: 'A' } });
  // First client patches → version bumps to 2.
  await upsertQuote({ id: created.id, _version: 1, state: { rfq: 'B' } });
  // Second client's cached copy still shows v1 — should collide.
  await assert.rejects(
    () => upsertQuote({ id: created.id, _version: 1, state: { rfq: 'C' } }),
    (err) => {
      assert.ok(err instanceof VersionConflictError);
      assert.equal(err.code, 'VERSION_CONFLICT');
      assert.equal(err.expectedVersion, 1);
      assert.equal(err.actualVersion, 2);
      assert.equal(err.current.state.rfq, 'B');
      return true;
    }
  );
});

test('upsertQuote: omitting _version opts out of the check (legacy callers)', async () => {
  setupTmp();
  const created = await upsertQuote({ type: 'standard', state: { rfq: 'A' } });
  await upsertQuote({ id: created.id, _version: 1, state: { rfq: 'B' } }); // v2
  // No _version on the patch → no conflict raised even though cache is stale.
  const patched = await upsertQuote({ id: created.id, state: { rfq: 'C' } });
  assert.equal(patched.state.rfq, 'C');
  assert.equal(patched._version, 3); // still bumps
});
