/**
 * RFQ Tracking dataset — registry mapping, coercion, merge, storage tests.
 *   node --test server/services/rfqTrackingDataset.test.js
 *
 * ISOLATED DATA_DIR per Lesson 33 / prod-data-safety — the storage helpers
 * (writeDataset/backupDataset/readExisting) resolve LIBRARY_DIR from DATA_DIR
 * at module-load time, so we point it at a throwaway mkdtemp dir BEFORE the
 * dynamic import. NEVER the live data dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rfq-tracking-ds-'));
process.env.DATA_DIR = tmp;

const {
  mapHeaders,
  matchHeader,
  coerceRows,
  buildCanonical,
  mergeRows,
  writeDataset,
  readExisting,
  backupDataset,
  datasetFilePath,
} = await import('./importPipeline.js');
const { getDataset } = await import('./importDatasets.js');

const RFQ = getDataset('rfq-tracking');

// The verbatim "RFQ Master" sheet header row (RFQ_Master_combined.xlsx).
const RFQ_MASTER_HEADERS = [
  'RFQ No',
  'Qtn #',
  'Customer',
  'End Customer/Project',
  'Part Number',
  'Description',
  'Main Material',
  'Design Process',
  'Print (LP/Flexo)',
  'SilkScreen',
  'MOQ',
  'RFQ Date',
  'Target Date',
  'Actual Quote Date',
  'Days in Process',
  'Month',
  'NPI Stage',
  'NPI PIC',
  'Control Flag',
  'CCL Price ($)',
  'Target Price ($)',
  'VA %',
  'Contr %',
  'GM %',
  'EAU / Qty',
  'Est. Revenue ($)',
  'Sales PIC',
  'Sale Stage',
  'Notes / Reason',
];

// canonical-ordered row builder for coerce/merge tests
function canonRow(obj) {
  return RFQ.canonicalHeaders.map((k) => (k in obj ? obj[k] : ''));
}

// ── Registry integrity ───────────────────────────────────────────
test('dataset is registered with 29 canonical headers + required + naturalKey', () => {
  assert.ok(RFQ, 'rfq-tracking dataset registered');
  assert.equal(RFQ.canonicalHeaders.length, 29);
  assert.deepEqual(RFQ.requiredHeaders, ['rfq_no']);
  assert.deepEqual(RFQ.naturalKey, ['rfq_no', 'qtn']);
  assert.equal(RFQ.storage.folder, 'RFQTracking');
  assert.equal(RFQ.storage.file, 'rfq_tracking.json');
  // prettyLabels cover every canonical key
  for (const k of RFQ.canonicalHeaders) {
    assert.equal(typeof RFQ.prettyLabels[k], 'string', `prettyLabels.${k}`);
  }
});

// ── Round-trip invariant (Lesson 32) ─────────────────────────────
test('round-trip: every prettyLabels[k] maps back to k via the matcher', () => {
  for (const k of RFQ.canonicalHeaders) {
    const m = matchHeader(RFQ.prettyLabels[k], RFQ.aliases);
    assert.equal(m.canonical, k, `prettyLabel "${RFQ.prettyLabels[k]}" → ${k}`);
  }
});

// ── Per-column mapping for the real 29 headers ───────────────────
test('real "RFQ Master" 29 headers all map — none dropped', () => {
  const res = mapHeaders(RFQ_MASTER_HEADERS, RFQ);
  // every canonical key is mapped
  for (const k of RFQ.canonicalHeaders) {
    assert.ok(k in res.mapping, `canonical ${k} mapped`);
  }
  assert.equal(Object.keys(res.mapping).length, 29, 'all 29 canonical mapped');
  assert.equal(res.unmapped.length, 0, 'no unmapped source columns');
  assert.equal(res.missing.length, 0, 'no missing required headers');
});

// ── Extra / unknown header → UNMATCHED, never silent-dropped ─────
test('an extra unknown header is reported UNMATCHED, not silently dropped', () => {
  const headers = [...RFQ_MASTER_HEADERS, 'Some Random Column XYZ'];
  const res = mapHeaders(headers, RFQ);
  const strayIdx = headers.length - 1;
  assert.ok(res.unmapped.includes(strayIdx), 'stray column index is in unmapped');
  const col = res.columns.find((c) => c.index === strayIdx);
  assert.ok(col, 'stray column present in per-column report');
  assert.equal(col.canonical, null);
  assert.equal(col.status, 'unmatched');
  // the 29 real ones still all map
  assert.equal(Object.keys(res.mapping).length, 29);
});

// ── Type coercion: Excel-serial dates → ISO, numbers, GM fraction ─
test('coercion: Excel-serial dates → ISO YYYY-MM-DD, numbers coerce, GM fraction preserved', () => {
  const row = canonRow({
    rfq_no: 2367,
    qtn: '1st',
    customer: 'Netgear',
    moq: '1000',
    rfq_date: 46024, // Excel serial → Jan 2026
    target_date: 46025,
    actual_quote_date: 46027,
    days_in_process: 3,
    ccl_price: 0.496,
    gm: -0.277757960964442,
    eau: 0.496,
  });
  const { rows } = coerceRows(RFQ.canonicalHeaders, [row], RFQ);
  const out = rows[0];
  const idx = (k) => RFQ.canonicalHeaders.indexOf(k);

  const iso = out[idx('rfq_date')];
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/, 'rfq_date coerced to ISO');
  assert.ok(iso.startsWith('2026'), `serial 46024 → 2026 (got ${iso})`);
  assert.match(out[idx('target_date')], /^2026-\d{2}-\d{2}$/);

  assert.equal(out[idx('moq')], 1000, 'moq coerced to number');
  assert.equal(out[idx('days_in_process')], 3);
  assert.equal(out[idx('ccl_price')], 0.496);
  assert.equal(out[idx('gm')], -0.277757960964442, 'GM fraction preserved exactly');
});

// ── naturalKey upsert dedups on (rfq_no, qtn) ────────────────────
test('upsert dedups on (rfq_no, qtn): same round updates, new round adds', () => {
  const existing = [{ rfq_no: '2367', qtn: '1st', customer: 'Old Name' }];
  const newCanonical = {
    headers: RFQ.canonicalHeaders,
    rows: [
      canonRow({ rfq_no: '2367', qtn: '1st', customer: 'New Name' }), // same key → update
      canonRow({ rfq_no: '2367', qtn: '2nd', customer: 'Second Round' }), // new key → add
    ],
  };
  const merged = mergeRows({ existing, newCanonical, dataset: RFQ, mode: 'upsert' });
  assert.equal(merged.length, 2, 'one updated, one added, old dropped');
  const first = merged.find((r) => r.rfq_no === '2367' && r.qtn === '1st');
  const second = merged.find((r) => r.rfq_no === '2367' && r.qtn === '2nd');
  assert.equal(first.customer, 'New Name', 'existing (2367,1st) updated to new value');
  assert.equal(second.customer, 'Second Round', '(2367,2nd) added as a new quote round');
});

// ── replace mode wipes prior rows ────────────────────────────────
test('replace mode drops all prior rows and writes only the upload', () => {
  const existing = [{ rfq_no: '999', qtn: '1st', customer: 'Should Be Wiped' }];
  const newCanonical = {
    headers: RFQ.canonicalHeaders,
    rows: [canonRow({ rfq_no: '2367', qtn: '1st', customer: 'Fresh' })],
  };
  const merged = mergeRows({ existing, newCanonical, dataset: RFQ, mode: 'replace' });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].rfq_no, '2367');
  assert.ok(!merged.find((r) => r.rfq_no === '999'), 'old row wiped');
});

// ── Storage round-trip + auto-backup (isolated DATA_DIR) ─────────
test('storage: write → readExisting round-trips; second save writes a sibling backup', () => {
  const p = datasetFilePath(RFQ);
  assert.ok(p.includes(path.join('RFQTracking', 'rfq_tracking.json')), 'resolves to dataset file');

  writeDataset(RFQ, [{ rfq_no: '2367', qtn: '1st', customer: 'A' }]);
  let back = readExisting(RFQ);
  assert.equal(back.length, 1);
  assert.equal(back[0].customer, 'A');

  // second save: back up the existing file first (mirrors the POST handler)
  const backup = backupDataset(RFQ);
  assert.ok(backup && fs.existsSync(backup), 'sibling backup written');
  assert.match(path.basename(backup), /^rfq_tracking_backup_[\dT-]+\.json$/);

  writeDataset(RFQ, [{ rfq_no: '2368', qtn: '1st', customer: 'B' }]);
  back = readExisting(RFQ);
  assert.equal(back.length, 1, 'replaced content');
  assert.equal(back[0].customer, 'B');
});

// ── Missing file tolerated → [] ──────────────────────────────────
test('readExisting tolerates a missing file → []', () => {
  const fresh = getDataset('rfq-tracking');
  // point at a never-written dataset copy by using a fresh folder is overkill;
  // instead assert the contract on a dataset whose file we delete.
  const p = datasetFilePath(fresh);
  if (fs.existsSync(p)) fs.rmSync(p);
  const rows = readExisting(fresh);
  assert.deepEqual(rows, []);
});
