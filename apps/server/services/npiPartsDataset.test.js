/**
 * NPI Parts List dataset — registry mapping, tolerant/order-independent
 * matching, coercion, merge, storage, and the idempotent seed.
 *   node --test server/services/npiPartsDataset.test.js
 *
 * ISOLATED DATA_DIR (Lesson 33 / prod-data-safety): the storage + seed
 * helpers resolve LIBRARY_DIR from DATA_DIR at module-load time, so point it
 * at a throwaway mkdtemp dir BEFORE the dynamic imports. NEVER the live dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npi-parts-ds-'));
process.env.DATA_DIR = tmp;

const {
  mapHeaders,
  matchHeader,
  coerceRows,
  mergeRows,
  writeDataset,
  readExisting,
  datasetFilePath,
} = await import('./importPipeline.js');
const { getDataset } = await import('./importDatasets.js');
const { buildNpiPartsSeedContent, seedNpiPartsIfAbsent } = await import('./dataSync.js');

const NPI = getDataset('npi-parts');

// The 64 canonical headers, in canonical order (what an app export writes).
const CANON = NPI.canonicalHeaders;

function canonRow(obj) {
  return CANON.map((k) => (k in obj ? obj[k] : ''));
}

// ── Registry integrity ───────────────────────────────────────────
test('registered: 64 canonical headers, required + naturalKey, JS-AoA storage, no prettyLabels', () => {
  assert.ok(NPI, 'npi-parts dataset registered');
  assert.equal(NPI.canonicalHeaders.length, 64);
  assert.deepEqual(NPI.requiredHeaders, ['System code', 'Customer']);
  assert.deepEqual(NPI.naturalKey, ['System code', 'Code IFS', 'RFQ date', 'Customer']);
  assert.equal(NPI.storage.kind, 'js-array-of-arrays');
  assert.equal(NPI.storage.folder, 'NpiParts');
  assert.equal(NPI.storage.file, 'npi_parts_data.js');
  assert.equal(NPI.storage.varName, 'window._CCL_NPIPARTS_DATA');
  assert.equal(NPI.prettyLabels, undefined, 'no prettyLabels — headers are canonical');
  assert.equal(NPI.shadow, undefined, 'no shadow block — calc does not consume NPI Parts');
});

// ── Round-trip invariant (Lesson 32): export → re-import is lossless ──
test('round-trip: every canonical header maps back to itself via the matcher', () => {
  for (const k of CANON) {
    const m = matchHeader(k, NPI.aliases);
    assert.equal(m.canonical, k, `canonical "${k}" → ${m.canonical}`);
  }
});

test('the real 64 headers (canonical order) all map — none dropped', () => {
  const res = mapHeaders(CANON, NPI);
  assert.equal(Object.keys(res.mapping).length, 64, 'all 64 canonical mapped');
  assert.equal(res.unmapped.length, 0, 'no unmapped source columns');
  assert.equal(res.missing.length, 0, 'no missing required headers');
});

// ── Order-independent + tolerant (unit/paren/VN/typo variants, shuffled) ──
test('SHUFFLED columns with unit/paren/VN/typo variants all map — none unmatched/duplicate', () => {
  // Substitute the tricky headers with real-world variants, then reverse the
  // order to prove matching is order-independent (Lesson 32).
  const variant = {
    'Unit price (USD)': 'USD Unit Price',
    'Unit price (VND)': 'VND Unit Price',
    'No.': 'STT',
    'INK IN QUOATION': 'INK IN QUOTATION', // corrected spelling
    'Cont %': 'Contribution %',
    'Num. of Webs': 'Number of Webs',
    'Tooling fee (woodie)': 'Woodie Tooling',
    'Tooling fee (Pinacle die)': 'Pinacle die Tooling',
    'Tooling fee (Rotary Die)': 'Rotary Die Tooling',
    'Tooling fee (Dieset)': 'Dieset Tooling',
    'Tooling fee (NC die)': 'NC die Tooling',
    'Quoted Approval (USD)': 'USD Quoted Approval',
    'Quoted Approval (VND)': 'VND Quoted Approval',
    'GP%': 'GP %',
  };
  const shuffled = CANON.map((h) => variant[h] || h).reverse();

  const res = mapHeaders(shuffled, NPI);
  assert.equal(res.unmapped.length, 0, 'no unmapped columns');
  assert.equal(res.missing.length, 0, 'no missing required headers');
  assert.equal(Object.keys(res.mapping).length, 64, 'all 64 canonical mapped');
  // No canonical mapped twice → no source column reported as duplicate.
  assert.ok(!res.columns.some((c) => c.status === 'duplicate'), 'no duplicate claims');
  // Spot-check the specifically tricky ones resolved to the RIGHT canonical.
  for (const k of [
    'Unit price (USD)',
    'Unit price (VND)',
    'Quoted Approval (USD)',
    'Quoted Approval (VND)',
    'Tooling fee (woodie)',
    'Tooling fee (Pinacle die)',
    'Tooling fee (Rotary Die)',
    'Tooling fee (Dieset)',
    'Tooling fee (NC die)',
    'No.',
    'INK IN QUOATION',
    'Cont %',
    'Num. of Webs',
  ]) {
    assert.ok(k in res.mapping, `tricky canonical "${k}" mapped`);
  }
});

// ── Conflict / numericFitness: a text look-alike must not steal a number col ──
test('a text "Unit price note" column does NOT steal Unit price (USD) from the real numeric column', () => {
  const headers = [...CANON, 'Unit price note'];
  const usdIdx = CANON.indexOf('Unit price (USD)');
  const noteIdx = headers.length - 1;
  // Sample data: real USD column is numeric; the note column is free text.
  const sampleRows = [];
  for (let i = 0; i < 20; i++) {
    const row = new Array(headers.length).fill('');
    row[usdIdx] = (0.1 + i / 100).toFixed(4); // numeric
    row[noteIdx] = 'see remark'; // text
    sampleRows.push(row);
  }
  const res = mapHeaders(headers, NPI, sampleRows);
  assert.equal(res.mapping['Unit price (USD)'], usdIdx, 'real numeric column wins');
  assert.ok(res.unmapped.includes(noteIdx), 'the text look-alike is unmapped');
  const noteCol = res.columns.find((c) => c.index === noteIdx);
  assert.notEqual(noteCol.status, 'matched', 'note column not matched to a canonical');
});

// ── Coercion: VND/USD/percent/date coerce; bad cell keeps raw + records issue ──
test('coercion: prices/percent/date coerce; a bad numeric cell keeps its raw value + issue', () => {
  const good = canonRow({
    'System code': 'SYS-1',
    Customer: 'Netgear',
    'Unit price (USD)': '0.1410',
    'Unit price (VND)': '3525',
    MOQ: '64000',
    EAU: '64000',
    'GP%': '0.82',
    'VA %': '0.365',
    'RFQ date': 46024, // Excel serial → Jan 2026
    'Quoted date': 46030,
    Week: 46031,
  });
  const bad = canonRow({ 'System code': 'SYS-2', Customer: 'LG', 'Unit price (USD)': 'N/A' });
  const { rows, issues } = coerceRows(CANON, [good, bad], NPI);
  const idx = (k) => CANON.indexOf(k);

  assert.equal(rows[0][idx('Unit price (USD)')], 0.141, 'USD coerced to number');
  assert.equal(rows[0][idx('Unit price (VND)')], 3525, 'VND coerced to number');
  assert.equal(rows[0][idx('MOQ')], 64000);
  assert.equal(rows[0][idx('GP%')], 0.82, 'percent coerced as fraction number');
  assert.match(rows[0][idx('RFQ date')], /^2026-\d{2}-\d{2}$/, 'Excel serial → ISO date');
  assert.match(rows[0][idx('Week')], /^\d{4}-\d{2}-\d{2}$/);

  // Bad numeric cell: raw kept + an issue recorded (never dropped).
  assert.equal(rows[1][idx('Unit price (USD)')], 'N/A', 'bad cell keeps raw value');
  assert.ok(
    issues.some((i) => i.col === 'Unit price (USD)' && i.row === 1),
    'issue recorded for the bad cell'
  );
});

// ── replace mode wipes prior rows; upsert dedups on the composite key ──
test('replace mode drops all prior rows and writes only the upload', () => {
  const existing = { headers: CANON, rows: [canonRow({ 'System code': 'OLD', Customer: 'Wipe' })] };
  const newCanonical = {
    headers: CANON,
    rows: [canonRow({ 'System code': 'NEW', Customer: 'Fresh' })],
  };
  const merged = mergeRows({ existing, newCanonical, dataset: NPI, mode: 'replace' });
  assert.equal(merged.rows.length, 1);
  const scIdx = CANON.indexOf('System code');
  assert.equal(merged.rows[0][scIdx], 'NEW');
});

test('upsert dedups on (System code, Code IFS, RFQ date, Customer)', () => {
  const base = {
    'System code': 'SYS-9',
    'Code IFS': 'IFS-9',
    'RFQ date': '2026-01-01',
    Customer: 'Netgear',
  };
  const existing = { headers: CANON, rows: [canonRow({ ...base, PIC: 'Old' })] };
  const newCanonical = {
    headers: CANON,
    rows: [
      canonRow({ ...base, PIC: 'New' }), // same key → update
      canonRow({ ...base, 'RFQ date': '2026-02-02', PIC: 'Second' }), // new key → add
    ],
  };
  const merged = mergeRows({ existing, newCanonical, dataset: NPI, mode: 'upsert' });
  assert.equal(merged.rows.length, 2, 'one updated, one added, old dropped');
  const picIdx = CANON.indexOf('PIC');
  const dateIdx = CANON.indexOf('RFQ date');
  const jan = merged.rows.find((r) => r[dateIdx] === '2026-01-01');
  const feb = merged.rows.find((r) => r[dateIdx] === '2026-02-02');
  assert.equal(jan[picIdx], 'New', 'same-key row updated');
  assert.equal(feb[picIdx], 'Second', 'new-key row added');
});

// ── Storage round-trip (JS-AoA {headers, rows}) ───────────────────
test('storage: write → readExisting round-trips the JS-AoA {headers, rows}', () => {
  const p = datasetFilePath(NPI);
  assert.ok(p.includes(path.join('NpiParts', 'npi_parts_data.js')), 'resolves to dataset file');
  const payload = { headers: CANON, rows: [canonRow({ 'System code': 'S1', Customer: 'C1' })] };
  writeDataset(NPI, payload);
  const back = readExisting(NPI);
  assert.deepEqual(back.headers, CANON);
  assert.equal(back.rows.length, 1);
  // File is a window._CCL_NPIPARTS_DATA=...; wrapper, not bare JSON.
  const raw = fs.readFileSync(p, 'utf-8');
  assert.ok(raw.startsWith('window._CCL_NPIPARTS_DATA='), 'JS-AoA var wrapper preserved');
});

// ── Seed: snapshot {columns, rows[obj]} → JS-AoA file, idempotent ──
test('buildNpiPartsSeedContent converts {columns, rows[obj]} → positional AoA', () => {
  const snap = {
    columns: ['System code', 'Customer', 'Unit price (USD)'],
    rows: [
      { 'System code': 'S1', Customer: 'A', 'Unit price (USD)': 0.1 },
      { 'System code': 'S2', Customer: 'B', 'Unit price (USD)': 0.2 },
    ],
  };
  const content = buildNpiPartsSeedContent(snap);
  assert.ok(content.startsWith('window._CCL_NPIPARTS_DATA='));
  const parsed = JSON.parse(content.slice(content.indexOf('=') + 1).replace(/;$/, ''));
  assert.deepEqual(parsed.headers, snap.columns);
  assert.deepEqual(parsed.rows[0], ['S1', 'A', 0.1]);
  assert.deepEqual(parsed.rows[1], ['S2', 'B', 0.2]);
});

test('seedNpiPartsIfAbsent seeds once from a snapshot, then no-ops (idempotent)', () => {
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npi-seed-'));
  const seedPath = path.join(seedDir, 'parts-snapshot.json');
  fs.writeFileSync(
    seedPath,
    JSON.stringify({
      columns: ['System code', 'Customer'],
      rows: [{ 'System code': 'S1', Customer: 'A' }],
    })
  );
  const target = path.join(seedDir, 'npi_parts_data.js');

  const first = seedNpiPartsIfAbsent(target, seedPath);
  assert.equal(first, true, 'seeded on first call');
  assert.ok(fs.existsSync(target), 'file written');
  const mtime1 = fs.statSync(target).mtimeMs;

  const second = seedNpiPartsIfAbsent(target, seedPath);
  assert.equal(second, false, 'no-op when file already present');
  assert.equal(fs.statSync(target).mtimeMs, mtime1, 'file not rewritten');

  // Missing seed source → graceful no-op, no throw.
  const target2 = path.join(seedDir, 'other.js');
  assert.equal(seedNpiPartsIfAbsent(target2, path.join(seedDir, 'nope.json')), false);
  assert.equal(fs.existsSync(target2), false);
});
