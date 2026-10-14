/**
 * importPipeline — rows with no natural key must never be imported.
 *   node --test server/services/importPipeline.keylessRows.test.js
 *
 * Regression 2026-09-10. The operator's IFS Full Inventory export carries
 * 184 junk rows at the tail (positions 8512–8695) — an artefact of the IFS
 * report, each containing nothing but `Inventory Value (USD) = 0`. All 184
 * were imported as records, sorted ahead of the real data, and made the
 * first two pages of the inventory grid render as empty dashes.
 *
 * `requiredHeaders: ['Part No']` was already declared, but the pipeline
 * only ever checked that the COLUMN existed after alias mapping
 * (`!(h in mapping)`), never that a row actually carried a value for it.
 * A row with no natural key is not a record.
 *
 * Skipping is not enough on its own: the count has to reach the preview,
 * or the operator has no way to tell "184 junk rows dropped" apart from
 * "184 rows I needed went missing".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dropKeylessRows } from './importPipeline.js';

const DATASET = { requiredHeaders: ['Part No'] };
const HEADERS = ['Part No', 'Part Description', 'Inventory Value (USD)'];

test('a row missing every required value is dropped', () => {
  const rows = [
    ['20000000A', 'Sample---FB Magic RDC', '0.359'],
    ['', '', '0'], // the IFS tail-junk shape
  ];

  const res = dropKeylessRows({ headers: HEADERS, rows, dataset: DATASET });

  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0][0], '20000000A');
  assert.equal(res.skipped, 1);
});

test('whitespace-only keys count as missing', () => {
  const rows = [['   ', 'x', '1']];

  const res = dropKeylessRows({ headers: HEADERS, rows, dataset: DATASET });

  assert.equal(res.rows.length, 0);
  assert.equal(res.skipped, 1);
});

test('a row that has the key is kept even when every other cell is blank', () => {
  const rows = [['20000000A', '', '']];

  const res = dropKeylessRows({ headers: HEADERS, rows, dataset: DATASET });

  assert.equal(res.rows.length, 1, 'a keyed row is a record even if sparse');
  assert.equal(res.skipped, 0);
});

test('with several required headers, one present value is enough to keep the row', () => {
  const ds = { requiredHeaders: ['Part No', 'Operation No'] };
  const headers = ['Part No', 'Operation No'];
  const rows = [
    ['P1', ''], // partial — keep, and let per-cell validation speak
    ['', ''], // no key at all — drop
  ];

  const res = dropKeylessRows({ headers, rows, dataset: ds });

  assert.equal(res.rows.length, 1);
  assert.deepEqual(res.rows[0], ['P1', '']);
  assert.equal(res.skipped, 1);
});

test('a dataset with no requiredHeaders drops nothing', () => {
  const rows = [
    ['', '', ''],
    ['a', 'b', 'c'],
  ];

  const res = dropKeylessRows({ headers: HEADERS, rows, dataset: {} });

  assert.equal(res.rows.length, 2);
  assert.equal(res.skipped, 0);
});

test('a required header absent from the file drops nothing on its account', () => {
  // Header validation already refuses this import elsewhere; this function
  // must not compound it by silently emptying the file.
  const rows = [['x', 'y']];

  const res = dropKeylessRows({
    headers: ['Some Other Col', 'Another'],
    rows,
    dataset: DATASET,
  });

  assert.equal(res.rows.length, 1);
  assert.equal(res.skipped, 0);
});

test('the real export shape: 2 keyed rows survive, 3 tail-junk rows are dropped', () => {
  const rows = [
    ['20000000A', 'Sample---FB Magic RDC (Non printing)', '0.359'],
    ['20044482', 'Cancel LBL001957 (83mm x 31mm)', '114.465'],
    ['', '', '0'],
    ['', '', '0'],
    ['', '', '0'],
  ];

  const res = dropKeylessRows({ headers: HEADERS, rows, dataset: DATASET });

  assert.equal(res.rows.length, 2);
  assert.equal(res.skipped, 3);
  assert.deepEqual(
    res.rows.map((r) => r[0]),
    ['20000000A', '20044482']
  );
});

test('the input array is not mutated', () => {
  const rows = [
    ['a', 'b', 'c'],
    ['', '', ''],
  ];
  const copy = JSON.parse(JSON.stringify(rows));

  dropKeylessRows({ headers: HEADERS, rows, dataset: DATASET });

  assert.deepEqual(rows, copy);
});
