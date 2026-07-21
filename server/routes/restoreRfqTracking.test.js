/**
 * Regression: the RFQ Tracking master-list (Library/RFQTracking/rfq_tracking.json,
 * PR #232) must be captured by buildBackupSnapshot and written back by
 * restoreFromSnapshot. It was omitted from both maps, so a disk failure or a
 * Restore silently dropped ~1,974 rows of production RFQ data (P1 data-loss).
 *
 * Unlike quoteHistory (SQLite-backed — Lesson 34), rfq_tracking.json is a plain
 * JSON file behind GET/POST /api/rfq-tracking, so the restore loop's raw
 * writeJson (else-branch) is the correct path for it.
 *
 * SAFETY (CLAUDE.md Lesson 33 / prod-data-safety skill): this box is BOTH dev
 * and the live prod SERVER. This test runs ENTIRELY in a throwaway temp dir via
 * authService.init(tmp) — it NEVER touches the live userData dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as authService from '../services/authService.js';

// Isolate getLibDir()/getDataDir() to a temp dir BEFORE costApi resolves paths.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-restore-rfqtrack-'));
authService.init(tmp);

const { buildBackupSnapshot, restoreFromSnapshot } = await import('./costApi.js');

const RFQ_DIR = path.join(authService.getLibDir(), 'RFQTracking');
const RFQ_FILE = path.join(RFQ_DIR, 'rfq_tracking.json');
const ROWS = [
  { rfq_no: '2367', customer: 'Netgear', sale_stage: 'Approved', notes: '' },
  { rfq_no: '2368', customer: 'LG', sale_stage: 'Rejected', notes: 'no budget' },
];

function writeRows(rows) {
  fs.mkdirSync(RFQ_DIR, { recursive: true });
  fs.writeFileSync(RFQ_FILE, JSON.stringify(rows, null, 2));
}

test('buildBackupSnapshot captures rfq_tracking.json rows', () => {
  writeRows(ROWS);
  const snap = buildBackupSnapshot();
  assert.ok(Array.isArray(snap.rfqTrackingDB), 'snapshot has rfqTrackingDB array');
  assert.equal(snap.rfqTrackingDB.length, 2, 'both rows captured');
  assert.deepEqual(snap.rfqTrackingDB, ROWS, 'rows captured verbatim');
});

test('restoreFromSnapshot writes rfq_tracking.json back identically', () => {
  writeRows(ROWS);
  const snap = buildBackupSnapshot();

  // Simulate the data loss: wipe the file (disk failure / bad restore).
  fs.rmSync(RFQ_FILE, { force: true });
  assert.equal(fs.existsSync(RFQ_FILE), false, 'precondition: file gone');

  const { restored, failed } = restoreFromSnapshot(snap);
  assert.ok(restored.includes('rfqTrackingDB'), 'rfqTrackingDB restored');
  assert.equal(failed.length, 0, 'no restore failures');

  assert.equal(fs.existsSync(RFQ_FILE), true, 'file written back');
  const back = JSON.parse(fs.readFileSync(RFQ_FILE, 'utf8'));
  assert.deepEqual(back, ROWS, 'restored rows match the snapshot exactly');
});

test('snapshot omits rfqTrackingDB when the file is absent (no empty write)', () => {
  fs.rmSync(RFQ_FILE, { force: true });
  const snap = buildBackupSnapshot();
  assert.equal('rfqTrackingDB' in snap, false, 'absent file → key omitted');
  // Restoring a snapshot that never had the key must not throw or create it.
  const { restored, failed } = restoreFromSnapshot(snap);
  assert.equal(failed.length, 0, 'no failures');
  assert.equal(restored.includes('rfqTrackingDB'), false, 'nothing to restore');
});
