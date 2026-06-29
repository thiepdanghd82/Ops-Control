/**
 * Regression: Backup/Restore must restore deleted quotes under the SQLite
 * backend (P0 data-loss, 2026-06-29).
 *
 * The prod box runs OPS_DATA_BACKEND=sqlite — Quote History reads ops.db ›
 * quotes, not quote_history.json. restoreFromSnapshot used to writeJson() the
 * quoteHistory file ONLY, leaving ops.db at its post-delete state, so a quote
 * deleted after the backup never came back. The fix routes quoteHistory through
 * saveQuotesStore (JSON + ops.db reconcile).
 *
 * SAFETY (CLAUDE.md Lesson 33 / prod-data-safety skill): this box is BOTH dev
 * and the live prod SERVER. This test runs ENTIRELY in a throwaway temp dir via
 * OPS_DB_PATH + authService.init(tmp) — it NEVER touches the live userData dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../db/connection.js';
import { initSchema } from '../db/init.js';
import { _resetDbReadyForTests } from '../repositories/backends/sqliteBackend.js';
import * as authService from '../services/authService.js';

// Isolate ops.db + the quote_history.json path to a temp dir BEFORE the stores
// resolve any path. authService.init() drives getLibDir()/getDataDir() that
// both costApi (buildBackupSnapshot/restoreFromSnapshot) and quotesStore use.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-restore-sqlite-'));
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.OPS_DATA_BACKEND = 'sqlite';
delete process.env.OPS_QUOTE_HISTORY_FILE; // use getDataDir()/Library/... (matches costApi)
authService.init(tmp);
connection._resetForTests();
_resetDbReadyForTests();
initSchema();

const { upsertQuote, loadQuotes } = await import('../repositories/quotesStore.js');
const { buildBackupSnapshot, restoreFromSnapshot } = await import('./costApi.js');

const active = () => loadQuotes().filter((q) => q && !q.deleted_at);

test('restore brings back a quote deleted after the backup (sqlite backend)', async () => {
  // Seed a quote → dual-writes JSON + ops.db.
  await upsertQuote({ id: 1, type: 'standard', state: { rfq_number: 'KEEP-1' } });
  assert.equal(active().length, 1, 'precondition: 1 active quote');

  // Backup BEFORE the delete (reads the JSON the snapshot is built from).
  const snap = buildBackupSnapshot();
  assert.ok(Array.isArray(snap.quoteHistory), 'snapshot has quoteHistory');
  assert.equal(snap.quoteHistory.length, 1, 'snapshot captured the quote');

  // Add a quote AFTER the backup, and soft-delete the original via the real
  // store path (the route does upsertQuote({id, deleted_at, deleted_by})).
  await upsertQuote({ id: 2, type: 'standard', state: { rfq_number: 'EXTRA-2' } });
  await upsertQuote({ id: 1, deleted_at: new Date().toISOString(), deleted_by: 'tester' });
  assert.equal(active().length, 1, 'after delete+add: only EXTRA-2 active');
  assert.ok(
    loadQuotes().find((q) => q.id === 1)?.deleted_at,
    'quote #1 is tombstoned in ops.db pre-restore'
  );

  // Restore the pre-delete snapshot.
  const { restored, failed } = restoreFromSnapshot(snap);
  assert.ok(restored.includes('quoteHistory'), 'quoteHistory restored');
  assert.equal(failed.length, 0, 'no restore failures');

  // ops.db (the canonical read) must now match the snapshot exactly:
  //  - quote #1 active again (deleted_at cleared)  ← the bug
  //  - quote #2 (added after backup) removed by delete-not-in reconcile
  const all = loadQuotes();
  const q1 = all.find((q) => q.id === 1);
  assert.ok(q1, 'quote #1 present after restore');
  assert.ok(!q1.deleted_at, 'quote #1 active again (deleted_at cleared)');
  assert.ok(!all.find((q) => q.id === 2), 'post-backup quote #2 removed by reconcile');
  assert.equal(all.length, snap.quoteHistory.length, 'ops.db count == snapshot count');
});

test('restore reconciles ops.db row count to the snapshot (no stragglers)', async () => {
  // Fresh DB state via a clean snapshot of two quotes.
  await upsertQuote({ id: 10, type: 'standard', state: { rfq_number: 'A' } });
  await upsertQuote({ id: 11, type: 'standard', state: { rfq_number: 'B' } });
  const snap = buildBackupSnapshot();
  const snapCount = snap.quoteHistory.length;

  // Mutate beyond the snapshot, then restore.
  await upsertQuote({ id: 12, type: 'standard', state: { rfq_number: 'C' } });
  restoreFromSnapshot(snap);

  const dbCount = connection.getDb().prepare('SELECT COUNT(*) AS n FROM quotes').get().n;
  assert.equal(dbCount, snapCount, 'ops.db quotes row count == snapshot quote count');
});
