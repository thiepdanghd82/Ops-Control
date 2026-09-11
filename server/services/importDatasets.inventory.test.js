/**
 * importDatasets — IFS Full Inventory header mapping.
 *   node --test server/services/importDatasets.inventory.test.js
 *
 * Regression 2026-09-10. The operator's real IFS export
 * (`inventory_export.csv`, 8695 rows) mapped only 2 of its 29 headers —
 * Part No and Site. The other 27 were dropped silently, including the two
 * that matter most: `Part Description In Use` (the real part description)
 * and `Inventory Value (VND)` / `(USD)` (the only cost figures in the file).
 * Importing it as-is would have produced 8695 rows with two populated
 * columns, worse than the stale data it replaced.
 *
 * Root cause is the exact-match alias lookup described in CLAUDE.md
 * Lesson 32: `aliases[normKey(header)]` with no token or unit tolerance,
 * so a header only maps if it equals an alias verbatim.
 *
 * These tests pin the real exported header set so the next export change
 * fails here instead of silently blanking columns in production.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDataset, normKey } from './importDatasets.js';

/** The literal header row of the operator's IFS Full Inventory export. */
const CCL_INVENTORY_EXPORT_HEADERS = [
  'Part No',
  'Part Description In Use',
  'Accounting Group Description',
  'Part Product Family Description',
  'Inventory UoM',
  'Type Designation',
  'Thick',
  'Width',
  'Len',
  'Uldes',
  'Dimension/ Quality',
  'Part Status Description',
  'Inventory Value (VND)',
  'Inventory Value (USD)',
  'Supplier',
  'Customer',
  'Name',
  'Association No',
  'Accounting Group',
  'Part Type',
  'Planner',
  'Part Product Family',
  'Lead Time Code',
  'Site',
  'Site Description',
  'Created',
  'Changed',
  'Part Status',
  'Std Lot Size',
];

function mapHeader(ds, header) {
  return ds.aliases[normKey(header)] || null;
}

test('every header of the real IFS inventory export maps to a canonical', () => {
  const ds = getDataset('inventory');
  const unmapped = CCL_INVENTORY_EXPORT_HEADERS.filter((h) => !mapHeader(ds, h));

  assert.deepEqual(
    unmapped,
    [],
    `these columns would be silently dropped on import: ${unmapped.join(' | ')}`
  );
});

test('the real description lands in Part Description, not the accounting group', () => {
  const ds = getDataset('inventory');

  // The export carries BOTH. Getting these the wrong way round is what put
  // the literal string "Finished Goods" in the description column for all
  // 9096 rows of the previous import.
  assert.equal(mapHeader(ds, 'Part Description In Use'), 'Part Description');
  assert.notEqual(
    mapHeader(ds, 'Accounting Group Description'),
    'Part Description',
    'the accounting group is a category, never the description'
  );
});

test('VND and USD inventory value stay two distinct columns', () => {
  const ds = getDataset('inventory');
  const vnd = mapHeader(ds, 'Inventory Value (VND)');
  const usd = mapHeader(ds, 'Inventory Value (USD)');

  assert.ok(vnd, 'Inventory Value (VND) must map');
  assert.ok(usd, 'Inventory Value (USD) must map');
  assert.notEqual(vnd, usd, 'the two currencies must not collapse into one column');
});

test('both inventory-value columns are declared numeric', () => {
  const ds = getDataset('inventory');
  const vnd = mapHeader(ds, 'Inventory Value (VND)');
  const usd = mapHeader(ds, 'Inventory Value (USD)');

  assert.equal(ds.columnTypes[vnd], 'number');
  assert.equal(ds.columnTypes[usd], 'number');
});

test('round trip: every canonical header maps back to itself', () => {
  // The durable guard from CLAUDE.md Lesson 32 — export then re-import must
  // be lossless, and this catches alias drift the moment it is introduced.
  for (const key of ['inventory', 'finished-goods', 'npi-materials']) {
    // getDataset returns null (it does not throw) for an unknown key.
    const ds = getDataset(key);
    if (!ds) continue;
    for (const canonical of ds.canonicalHeaders) {
      assert.equal(
        mapHeader(ds, canonical),
        canonical,
        `${key}: canonical "${canonical}" does not map back to itself`
      );
    }
  }
});

test('no alias is claimed by two different canonicals', () => {
  const ds = getDataset('inventory');
  const seen = new Map();
  for (const [alias, canonical] of Object.entries(ds.aliases)) {
    const prev = seen.get(alias);
    assert.equal(
      prev,
      undefined,
      `alias "${alias}" maps to both ${prev} and ${canonical} — one of them will lose silently`
    );
    seen.set(alias, canonical);
  }
});
