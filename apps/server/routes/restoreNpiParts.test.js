/**
 * NPI Parts List (Library/NpiParts/npi_parts_data.js) must be captured by
 * buildBackupSnapshot and written back by restoreFromSnapshot so an imported
 * parts set survives a disk failure / Restore.
 *
 * Unlike the JSON datasets, this is a JS-AoA file (window._CCL_NPIPARTS_DATA=…),
 * so a raw writeJson would corrupt it — the snapshot round-trips it through the
 * dataset reader/writer instead (Lesson 34: restore via the same writer the
 * read path consumes).
 *
 * SAFETY (Lesson 33 / prod-data-safety): runs ENTIRELY in a throwaway temp dir.
 * process.env.DATA_DIR is set BEFORE the imports (importPipeline resolves its
 * LIBRARY_DIR at module-load), and authService.init(tmp) isolates costApi's
 * getLibDir() to the SAME dir. NEVER the live userData dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-restore-npiparts-'));
process.env.DATA_DIR = tmp;

import * as authService from '../services/authService.js';
authService.init(tmp);

const { buildBackupSnapshot, restoreFromSnapshot } = await import('./costApi.js');
const { writeDataset, readExisting, datasetFilePath } =
  await import('../services/importPipeline.js');
const { getDataset } = await import('../services/importDatasets.js');

const NPI = getDataset('npi-parts');
const NPI_FILE = datasetFilePath(NPI);
const PAYLOAD = {
  headers: NPI.canonicalHeaders,
  rows: [
    NPI.canonicalHeaders.map((h) =>
      h === 'System code' ? 'SYS-1' : h === 'Customer' ? 'Netgear' : ''
    ),
    NPI.canonicalHeaders.map((h) => (h === 'System code' ? 'SYS-2' : h === 'Customer' ? 'LG' : '')),
  ],
};

test('buildBackupSnapshot captures the NPI Parts JS-AoA file as npiPartsDB', () => {
  writeDataset(NPI, PAYLOAD);
  const snap = buildBackupSnapshot();
  assert.ok(snap.npiPartsDB, 'snapshot has npiPartsDB');
  assert.deepEqual(snap.npiPartsDB.headers, NPI.canonicalHeaders);
  assert.equal(snap.npiPartsDB.rows.length, 2, 'both rows captured');
});

test('restoreFromSnapshot writes the JS-AoA file back (wrapper preserved)', () => {
  writeDataset(NPI, PAYLOAD);
  const snap = buildBackupSnapshot();

  // Simulate data loss: delete the file.
  fs.rmSync(NPI_FILE, { force: true });
  assert.equal(fs.existsSync(NPI_FILE), false, 'precondition: file gone');

  const { restored, failed } = restoreFromSnapshot(snap);
  assert.ok(restored.includes('npiPartsDB'), 'npiPartsDB restored');
  assert.equal(failed.length, 0, 'no restore failures');

  // File exists again, is the JS-AoA wrapper, and round-trips the rows.
  assert.equal(fs.existsSync(NPI_FILE), true, 'file written back');
  const raw = fs.readFileSync(NPI_FILE, 'utf-8');
  assert.ok(
    raw.startsWith('window._CCL_NPIPARTS_DATA='),
    'JS-AoA wrapper preserved (not raw JSON)'
  );
  const back = readExisting(NPI);
  assert.equal(back.rows.length, 2, 'rows restored');
  const scIdx = NPI.canonicalHeaders.indexOf('System code');
  assert.deepEqual(back.rows.map((r) => r[scIdx]).sort(), ['SYS-1', 'SYS-2']);
});

test('snapshot omits npiPartsDB when the file is empty/absent (no empty write)', () => {
  fs.rmSync(NPI_FILE, { force: true });
  const snap = buildBackupSnapshot();
  assert.equal('npiPartsDB' in snap, false, 'absent file → key omitted');
  const { restored, failed } = restoreFromSnapshot(snap);
  assert.equal(failed.length, 0, 'no failures');
  assert.equal(restored.includes('npiPartsDB'), false, 'nothing to restore');
});
