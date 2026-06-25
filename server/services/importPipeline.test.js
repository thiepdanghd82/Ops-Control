/**
 * importPipeline — header mapping, diff, merge tests.
 *   node --test server/services/importPipeline.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapHeaders,
  matchHeader,
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
import { getDataset, DATASETS } from './importDatasets.js';

const BOM = getDataset('bom');
const ROUTING = getDataset('routing');
const NPI = getDataset('npi-materials');
const SOURCING = getDataset('sourcing-db');

// The real headers CCL's "Export Current Data" / report writes (Lesson 32).
const CCL_NPI_HEADERS = [
  'UPDATE DATE',
  'MATERIAL NAME',
  'USD / M² PRICE',
  'TYPE / DESCRIPTION',
  'MM THICKNESS',
  'COLOR',
  'SURFACE',
  'ADHESIVE',
  'M² MOQ',
  'DAYS LEAD TIME',
  'SUPPLIER',
  'NOTES / REMARKS',
];

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

// ─── Tolerant header matching (Lesson 32) ──────────────────────────
// Real CCL export headers carry units/punctuation ("USD / M² PRICE",
// "MM THICKNESS", "M² MOQ", "DAYS LEAD TIME", "NOTES / REMARKS") that the
// old exact-equality matcher dropped → Price/Thickness/MOQ/Lead/Notes blank.

test('mapHeaders: real CCL NPI export — ALL 12 columns map (none dropped)', () => {
  const r = mapHeaders(CCL_NPI_HEADERS, NPI);
  for (const k of NPI.canonicalHeaders) {
    assert.ok(k in r.mapping, `column "${k}" must be mapped`);
  }
  assert.deepEqual(r.unmapped, [], 'no unmapped columns');
  assert.deepEqual(r.missing, [], 'no missing required headers');
});

test('mapHeaders: the 5 previously-dropped NPI columns now map', () => {
  assert.equal(mapHeaders(['USD / M² PRICE'], NPI).mapping.price, 0);
  assert.equal(mapHeaders(['MM THICKNESS'], NPI).mapping.thick, 0);
  assert.equal(mapHeaders(['M² MOQ'], NPI).mapping.moq, 0);
  assert.equal(mapHeaders(['DAYS LEAD TIME'], NPI).mapping.lt, 0);
  assert.equal(mapHeaders(['NOTES / REMARKS'], NPI).mapping.note, 0);
});

test('round-trip invariant: every dataset label/canonical maps back to its key', () => {
  for (const ds of Object.values(DATASETS)) {
    for (const k of ds.canonicalHeaders) {
      const label = (ds.prettyLabels && ds.prettyLabels[k]) || k;
      const r = mapHeaders([label], ds);
      assert.equal(r.mapping[k], 0, `${ds.key}: export label "${label}" must re-import to "${k}"`);
    }
  }
});

test('matchHeader: cascade confidence + canonical', () => {
  assert.deepEqual(
    {
      c: matchHeader('Material Name', NPI.aliases).canonical,
      conf: matchHeader('Material Name', NPI.aliases).confidence,
    },
    { c: 'name', conf: 1 },
    'exact alias → 1.0'
  );
  const price = matchHeader('USD / M² PRICE', NPI.aliases);
  assert.equal(price.canonical, 'price');
  assert.ok(price.confidence >= 0.9, 'token-set equal → ≥0.9');
  const note = matchHeader('NOTES / REMARKS', NPI.aliases);
  assert.equal(note.canonical, 'note');
  assert.ok(note.confidence >= 0.6, 'subset → ≥0.6');
});

test('matchHeader: unknown column → unmatched + suggestions, never a silent canonical', () => {
  const r = matchHeader('Totally Unrelated Column 123', NPI.aliases);
  assert.equal(r.canonical, null);
  assert.equal(r.status, 'unmatched');
  assert.ok(Array.isArray(r.suggestions));
});

test('mapHeaders: per-column report carries status/confidence/suggestions', () => {
  const r = mapHeaders(['MATERIAL NAME', 'USD / M² PRICE', 'ZzzUnknown'], NPI);
  assert.ok(Array.isArray(r.columns));
  const by = Object.fromEntries(r.columns.map((c) => [c.raw, c]));
  assert.equal(by['MATERIAL NAME'].status, 'matched');
  assert.equal(by['MATERIAL NAME'].canonical, 'name');
  assert.equal(by['USD / M² PRICE'].canonical, 'price');
  assert.ok(['matched', 'low'].includes(by['USD / M² PRICE'].status));
  assert.equal(by['ZzzUnknown'].status, 'unmatched');
  assert.equal(by['ZzzUnknown'].canonical, null);
});

test('mapHeaders: still flags genuinely unknown columns (no false positives)', () => {
  const r = mapHeaders(['Parent Part No', 'Component Part', 'GiberishCol123'], BOM);
  assert.ok(r.unmapped.includes(2), 'gibberish column stays unmapped');
});

// ─── Finished Goods = catalog/deal-price schema, keyed by Catalog No ───
// FG is a customer deal-price agreement list, NOT a parts-on-hand inventory.
// It previously inherited the Part-No inventory schema, so the app's own FG
// export ("Catalog No, Deal Price, …") failed to re-import ("Missing required
// columns: Part No"). Full Inventory + Raw Materials stay Part-No keyed.
const FG = getDataset('finished-goods');
const CCL_FG_HEADERS = [
  'Catalog No',
  'Catalog Desc',
  'Min Quantity',
  'Currency Code',
  'Deal Price',
  'Deal Price Incl Tax',
  'Deal Price Base',
  'Deal Price Incl Tax Base',
  'Valid From Date',
  'Valid Until',
  'Agreement Id',
  'Customer No',
  'Site',
  'Name',
  'Association No',
];

test('Finished Goods dataset is catalog/deal-price keyed (Catalog No, not Part No)', () => {
  assert.deepEqual(FG.requiredHeaders, ['Catalog No']);
  assert.ok(FG.canonicalHeaders.includes('Catalog No'));
  assert.ok(FG.canonicalHeaders.includes('Deal Price'));
  assert.ok(!FG.canonicalHeaders.includes('Part No'), 'FG has no Part No column');
  // Full Inventory + Raw Materials stay Part-No keyed.
  assert.deepEqual(getDataset('inventory').requiredHeaders, ['Part No']);
  assert.deepEqual(getDataset('raw-materials').requiredHeaders, ['Part No']);
});

test('mapHeaders: real Finished Goods export maps, no missing required', () => {
  const r = mapHeaders(CCL_FG_HEADERS, FG);
  assert.deepEqual(r.missing, [], 'Catalog No present → nothing missing');
  for (const k of FG.canonicalHeaders) assert.ok(k in r.mapping, `"${k}" must map`);
  assert.deepEqual(r.unmapped, []);
});

test('mapHeaders: FG "Deal Price Base (VND)" variant maps to Deal Price Base', () => {
  assert.equal(mapHeaders(['Deal Price Base (VND)'], FG).mapping['Deal Price Base'], 0);
});

test('mergeRows replace: wipes prior rows, keeps only uploaded (NPI)', () => {
  const existing = [
    { name: 'OLD-A', supplier: 'X', price: 1 },
    { name: 'OLD-B', supplier: 'Y', price: 2 },
  ];
  const newCanonical = {
    headers: NPI.canonicalHeaders,
    rows: [NPI.canonicalHeaders.map((h) => (h === 'name' ? 'NEW-1' : h === 'supplier' ? 'Z' : ''))],
  };
  const out = mergeRows({ existing, newCanonical, dataset: NPI, mode: 'replace' });
  assert.equal(out.length, 1, 'only the uploaded row survives');
  assert.equal(out[0].name, 'NEW-1');
  assert.ok(!out.some((r) => String(r.name).startsWith('OLD')), 'no prior rows remain');
});

// ─── IFS Materials (SupplierforPurchaseParts export) ───────────────
const IFS = getDataset('ifs-materials');
// The real data headers the IFS "SupplierforPurchaseParts" upload carries
// (the operator-trimmed 16-col export, minus the "#" row-index column).
const IFS_HEADERS = [
  'Part No',
  'Part Description',
  'Supplier ID',
  'Supplier Name',
  'Conversion Factor',
  'Price',
  'Price incl. Tax',
  'Currency',
  'Price Unit Measure',
  'Tax Code',
  'Supplier Manufacturing Leadtime',
  'Tax Code Description',
  'Status Code',
  'Status Code Description',
  'Country of Origin',
];

test('IFS_DATASET registered: part_no required, [part_no,supplier_id] natural key', () => {
  assert.ok(IFS, 'ifs-materials dataset is registered');
  assert.deepEqual(IFS.requiredHeaders, ['part_no']);
  assert.deepEqual(IFS.naturalKey, ['part_no', 'supplier_id']);
  assert.equal(IFS.storage.file, 'ifs_materials.json');
  assert.equal(IFS.canonicalHeaders.length, 15);
});

test('mapHeaders: real IFS export headers — all 15 map, none dropped', () => {
  const r = mapHeaders(IFS_HEADERS, IFS);
  for (const k of IFS.canonicalHeaders) assert.ok(k in r.mapping, `"${k}" must map`);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unmapped, []);
});

test('mapHeaders: the 6 added IFS columns map (Tax/Status/Leadtime/Country)', () => {
  const r = mapHeaders(IFS_HEADERS, IFS);
  for (const k of [
    'tax_code',
    'leadtime',
    'tax_code_desc',
    'status_code',
    'status_code_desc',
    'country',
  ]) {
    assert.ok(k in r.mapping, `"${k}" must map`);
  }
});

test('mapHeaders: "#" row-index column is unmapped, not a canonical', () => {
  const r = mapHeaders(['#', ...IFS_HEADERS], IFS);
  assert.ok(r.unmapped.includes(0), '"#" stays unmapped (passthrough)');
  assert.deepEqual(r.missing, []);
});

test('mapHeaders: IFS unknown extra column → UNMATCHED, never silent-drop', () => {
  const r = mapHeaders([...IFS_HEADERS, 'Some Weird Extra Col'], IFS);
  assert.ok(r.unmapped.includes(IFS_HEADERS.length), 'extra column index is unmapped');
  assert.deepEqual(r.missing, [], 'required still satisfied');
  // the extra column is surfaced in the per-column report, not dropped
  const extra = r.columns.find((c) => c.raw === 'Some Weird Extra Col');
  assert.equal(extra.status, 'unmatched');
});

test('mapHeaders: missing Part No blocks (required)', () => {
  const r = mapHeaders(['Supplier ID', 'Price'], IFS);
  assert.deepEqual(r.missing, ['part_no']);
});

test('IFS coercion: conv / price / price_tax coerce to number', () => {
  const headers = IFS.canonicalHeaders;
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const row = headers.map((h) =>
    h === 'part_no'
      ? 'P1'
      : h === 'conv'
        ? '1,5'
        : h === 'price'
          ? '2.50'
          : h === 'price_tax'
            ? '2.75'
            : ''
  );
  const { rows: out } = coerceRows(headers, [row], IFS);
  assert.equal(out[0][idx.conv], 1.5);
  assert.equal(out[0][idx.price], 2.5);
  assert.equal(out[0][idx.price_tax], 2.75);
});

test('mergeRows replace wipes prior IFS rows, keeps only uploaded', () => {
  const existing = [{ part_no: 'OLD', supplier_id: 'S1' }];
  const newCanonical = {
    headers: IFS.canonicalHeaders,
    rows: [
      IFS.canonicalHeaders.map((h) => (h === 'part_no' ? 'NEW' : h === 'supplier_id' ? 'S2' : '')),
    ],
  };
  const out = mergeRows({ existing, newCanonical, dataset: IFS, mode: 'replace' });
  assert.equal(out.length, 1);
  assert.equal(out[0].part_no, 'NEW');
  assert.ok(!out.some((r) => r.part_no === 'OLD'));
});
