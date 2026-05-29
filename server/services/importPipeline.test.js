/**
 * importPipeline — header mapping, diff, merge tests.
 *   node --test server/services/importPipeline.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapHeaders,
  applyMappingOverrides,
  coerceRows,
  buildCanonical,
  diffRows,
  mergeRows,
  rowsAsObjects,
  createPreviewToken,
  consumePreviewToken,
  _resetTokens,
} from './importPipeline.js';
import { getDataset } from './importDatasets.js';

const BOM = getDataset('bom');
const ROUTING = getDataset('routing');
const NPI = getDataset('npi-materials');

test('mapHeaders: exact match for canonical headers', () => {
  const r = mapHeaders(['Parent Part No', 'Component Part', 'Qty Per Assembly'], BOM);
  assert.deepEqual(r.normalisedHeaders, ['Parent Part No', 'Component Part', 'Qty Per Assembly']);
  assert.deepEqual(r.missing, []);
});

test('mapHeaders: alias resolves to canonical (BOM)', () => {
  const r = mapHeaders(['Parent', 'Component', 'SL/Cụm'], BOM);
  assert.equal(r.normalisedHeaders[0], 'Parent Part No');
  assert.equal(r.normalisedHeaders[1], 'Component Part');
  assert.equal(r.normalisedHeaders[2], 'Qty Per Assembly');
});

test('mapHeaders: VN aliases for routing', () => {
  const r = mapHeaders(['Mã hàng', 'Op No', 'Workcenter', 'Trạm'], ROUTING);
  // 'Mã hàng' → Part No, 'Op No' → Operation No, 'Workcenter' → Work Centre No,
  // 'Trạm' is also Work Centre No alias — should not double-map.
  assert.equal(r.normalisedHeaders[0], 'Part No');
  assert.equal(r.normalisedHeaders[1], 'Operation No');
  assert.equal(r.normalisedHeaders[2], 'Work Centre No');
  // Second 'Work Centre No' alias should be ignored (mapping keeps first only)
  assert.equal(r.mapping['Work Centre No'], 2);
});

test('mapHeaders: unmapped columns flagged', () => {
  const r = mapHeaders(['Parent Part No', 'Component Part', 'GiberishCol123'], BOM);
  assert.deepEqual(r.unmapped, [2]);
  assert.equal(r.normalisedHeaders[2], null);
});

test('mapHeaders: missing required headers detected', () => {
  const r = mapHeaders(['Parent Part No'], BOM);
  assert.deepEqual(r.missing, ['Component Part']);
});

test('applyMappingOverrides: force-map an unrecognised column', () => {
  const initial = mapHeaders(['Parent Part No', 'Component Part', 'My Custom Col'], BOM);
  const overridden = applyMappingOverrides(initial, { 2: 'Pitch' }, BOM);
  assert.equal(overridden.normalisedHeaders[2], 'Pitch');
  assert.equal(overridden.mapping['Pitch'], 2);
  assert.ok(!overridden.unmapped.includes(2));
});

test('applyMappingOverrides: __skip__ unmaps an auto-mapped column', () => {
  const initial = mapHeaders(['Parent Part No', 'Component Part'], BOM);
  const overridden = applyMappingOverrides(initial, { 1: '__skip__' }, BOM);
  assert.equal(overridden.normalisedHeaders[1], null);
  assert.deepEqual(overridden.missing, ['Component Part']);
});

test('coerceRows: converts numbers per columnTypes', () => {
  const headers = ['Parent Part No', 'Component Part', 'Qty Per Assembly'];
  const rows = [
    ['A001', 'B001', '1,5'],
    ['A002', 'B002', '2.000'],
  ];
  const r = coerceRows(headers, rows, BOM);
  assert.equal(r.rows[0][2], 1.5);
  assert.equal(r.rows[1][2], 2);
  assert.equal(r.issues.length, 0);
});

test('coerceRows: bad number recorded as issue, raw kept', () => {
  const headers = ['Parent Part No', 'Component Part', 'Qty Per Assembly'];
  const rows = [['A', 'B', 'not-a-number']];
  const r = coerceRows(headers, rows, BOM);
  assert.equal(r.issues.length, 1);
  assert.equal(r.rows[0][2], 'not-a-number');
});

test('buildCanonical: orders by canonical headers, appends extras', () => {
  const rawHeaders = ['Component Part', 'Parent Part No', 'Custom Notes'];
  const rawRows = [
    ['B', 'A', 'note1'],
    ['B2', 'A2', 'note2'],
  ];
  const mapping = mapHeaders(rawHeaders, BOM);
  const out = buildCanonical({
    headers: rawHeaders,
    rows: rawRows,
    dataset: BOM,
    headerMapping: mapping,
    includeUnmapped: true,
  });
  // Canonical order: Parent Part No first, then Component Part…
  assert.equal(out.headers[0], 'Parent Part No');
  assert.equal(out.headers[1], 'Parent Part Description');
  assert.equal(out.headers[2], 'Component Part');
  // Extra appended at end
  assert.equal(out.headers[out.headers.length - 1], 'Custom Notes');
  // Row values placed correctly
  assert.equal(out.rows[0][0], 'A');
  assert.equal(out.rows[0][2], 'B');
  assert.equal(out.rows[0][out.headers.length - 1], 'note1');
});

test('diffRows: detects added/updated/unchanged + removed-if-replace', () => {
  const headers = ['Parent Part No', 'Component Part', 'Alternative No', 'Qty Per Assembly'];
  const existing = [
    ['A1', 'B1', '*', '1'],
    ['A1', 'B2', '*', '2'],
    ['A2', 'B3', '*', '3'],
  ];
  const incoming = [
    ['A1', 'B1', '*', '1'], // unchanged
    ['A1', 'B2', '*', '5'], // updated
    ['A4', 'B9', '*', '7'], // added
  ];
  const r = diffRows({
    existingRows: existing,
    existingHeaders: headers,
    newRows: incoming,
    newHeaders: headers,
    naturalKey: BOM.naturalKey,
  });
  assert.equal(r.counts.unchanged, 1);
  assert.equal(r.counts.updated, 1);
  assert.equal(r.counts.added, 1);
  assert.equal(r.counts.removedIfReplace, 1);
});

test('diffRows: detects duplicate keys within upload', () => {
  const headers = ['Parent Part No', 'Component Part', 'Alternative No'];
  const incoming = [
    ['A1', 'B1', '*'],
    ['A1', 'B1', '*'], // duplicate
  ];
  const r = diffRows({
    existingRows: [],
    existingHeaders: headers,
    newRows: incoming,
    newHeaders: headers,
    naturalKey: BOM.naturalKey,
  });
  assert.equal(r.counts.duplicates, 1);
});

test('mergeRows: replace mode drops existing entirely', () => {
  const existing = { headers: ['Parent Part No', 'Component Part'], rows: [['A', 'B']] };
  const incoming = { headers: ['Parent Part No', 'Component Part'], rows: [['X', 'Y']] };
  const r = mergeRows({ existing, newCanonical: incoming, dataset: BOM, mode: 'replace' });
  assert.deepEqual(r.rows, [['X', 'Y']]);
});

test('mergeRows: append mode concats', () => {
  const existing = { headers: ['Parent Part No', 'Component Part'], rows: [['A', 'B']] };
  const incoming = { headers: ['Parent Part No', 'Component Part'], rows: [['X', 'Y']] };
  const r = mergeRows({ existing, newCanonical: incoming, dataset: BOM, mode: 'append' });
  assert.equal(r.rows.length, 2);
});

test('mergeRows: upsert updates by natural key, keeps untouched', () => {
  const existing = {
    headers: ['Parent Part No', 'Component Part', 'Alternative No', 'Qty Per Assembly'],
    rows: [
      ['A1', 'B1', '*', '1'],
      ['A1', 'B2', '*', '2'],
    ],
  };
  const incoming = {
    headers: ['Parent Part No', 'Component Part', 'Alternative No', 'Qty Per Assembly'],
    rows: [
      ['A1', 'B1', '*', '99'], // update existing
      ['A3', 'B9', '*', '7'], // new
    ],
  };
  const r = mergeRows({ existing, newCanonical: incoming, dataset: BOM, mode: 'upsert' });
  // Updated + new + untouched (A1/B2)
  assert.equal(r.rows.length, 3);
  // Updated row should have Qty=99
  const updated = r.rows.find((row) => row[0] === 'A1' && row[1] === 'B1');
  assert.equal(updated[3], '99');
  // Untouched row preserved
  const untouched = r.rows.find((row) => row[0] === 'A1' && row[1] === 'B2');
  assert.equal(untouched[3], '2');
});

test('mergeRows: upsert for JSON-AoO dataset (NPI)', () => {
  const existing = [
    { name: 'Sticker A', supplier: 'Vendor1', price: 1.5 },
    { name: 'Sticker B', supplier: 'Vendor2', price: 2.0 },
  ];
  const incoming = {
    headers: ['name', 'supplier', 'price'],
    rows: [
      ['Sticker A', 'Vendor1', 1.75], // update
      ['Sticker C', 'Vendor3', 3.0], // new
    ],
  };
  const r = mergeRows({ existing, newCanonical: incoming, dataset: NPI, mode: 'upsert' });
  assert.equal(r.length, 3);
  const a = r.find((o) => o.name === 'Sticker A');
  assert.equal(a.price, 1.75);
  const c = r.find((o) => o.name === 'Sticker C');
  assert.equal(c.price, 3.0);
});

test('rowsAsObjects: header→value mapping', () => {
  const out = rowsAsObjects(
    ['a', 'b'],
    [
      ['1', '2'],
      ['3', '4'],
    ]
  );
  assert.deepEqual(out, [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('preview tokens: create + consume = single-use', () => {
  _resetTokens();
  const t = createPreviewToken({ stageFile: '/tmp/x', datasetKey: 'bom' });
  assert.match(t, /^[a-f0-9]+$/);
  const e1 = consumePreviewToken(t);
  assert.equal(e1.datasetKey, 'bom');
  const e2 = consumePreviewToken(t);
  assert.equal(e2, null);
});

test('preview tokens: unknown token returns null', () => {
  _resetTokens();
  assert.equal(consumePreviewToken('nonexistent'), null);
});
