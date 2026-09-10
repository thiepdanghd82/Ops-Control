/**
 * importParse — CSV/Excel parser tests.
 *   node --test server/services/importParse.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { parseCSVContent, parseExcelFile } from './importParse.js';

test('CSV: comma-delimited basic', () => {
  const r = parseCSVContent('a,b,c\n1,2,3\n4,5,6');
  assert.deepEqual(r.headers, ['a', 'b', 'c']);
  assert.deepEqual(r.rows, [
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]);
  assert.equal(r.delimiter, ',');
});

test('CSV: CRLF line endings', () => {
  const r = parseCSVContent('a,b\r\n1,2\r\n3,4\r\n');
  assert.deepEqual(r.headers, ['a', 'b']);
  assert.deepEqual(r.rows, [
    ['1', '2'],
    ['3', '4'],
  ]);
});

test('CSV: quoted fields with embedded delimiter', () => {
  const r = parseCSVContent('name,desc\n"Smith, John","hello"');
  assert.deepEqual(r.headers, ['name', 'desc']);
  assert.deepEqual(r.rows, [['Smith, John', 'hello']]);
});

test('CSV: doubled quotes inside quoted field', () => {
  const r = parseCSVContent('a\n"she said ""hi"""');
  assert.deepEqual(r.rows, [['she said "hi"']]);
});

test('CSV: multi-line quoted field', () => {
  const r = parseCSVContent('a,b\n"line1\nline2",end');
  assert.deepEqual(r.rows, [['line1\nline2', 'end']]);
});

test('CSV: semicolon delimiter detected from header', () => {
  const r = parseCSVContent('a;b;c\n1;2;3');
  assert.equal(r.delimiter, ';');
  assert.deepEqual(r.rows, [['1', '2', '3']]);
});

test('CSV: tab delimiter', () => {
  const r = parseCSVContent('a\tb\tc\n1\t2\t3');
  assert.equal(r.delimiter, '\t');
  assert.deepEqual(r.headers, ['a', 'b', 'c']);
});

test('CSV: pipe delimiter', () => {
  const r = parseCSVContent('a|b|c\n1|2|3');
  assert.equal(r.delimiter, '|');
});

test('CSV: UTF-8 BOM stripped', () => {
  const bom = '﻿';
  const r = parseCSVContent(bom + 'a,b\n1,2');
  assert.deepEqual(r.headers, ['a', 'b']);
});

test('CSV: empty rows filtered', () => {
  const r = parseCSVContent('a,b\n1,2\n\n\n3,4');
  assert.equal(r.rows.length, 2);
});

test('CSV: trailing whitespace in header trimmed', () => {
  const r = parseCSVContent('  Part No  ,Qty\nA,1');
  assert.deepEqual(r.headers, ['Part No', 'Qty']);
});

test('CSV: single column', () => {
  const r = parseCSVContent('header\n1\n2\n3');
  assert.deepEqual(r.headers, ['header']);
  assert.equal(r.rows.length, 3);
});

test('CSV: empty content', () => {
  const r = parseCSVContent('');
  assert.deepEqual(r.headers, []);
  assert.deepEqual(r.rows, []);
});

// ─── Excel parsing (xlsx ESM fs-wiring regression) ─────────────────
// Bug: xlsx's ESM build (xlsx.mjs — what `import('xlsx')` resolves to in this
// ESM server) does NOT auto-wire node fs, so XLSX.readFile(path) threw
// "Cannot access file" → the import route redacted it to "internal_error" and
// no .xlsx/.xls file could ever be imported. Fix: read the bytes ourselves +
// XLSX.read(buffer). This test parses a real generated .xlsx (RED before fix).
test('Excel: parseExcelFile reads a real .xlsx file', async () => {
  const aoa = [
    ['Material Name', 'Price', 'Type'],
    ['PET SB50', 3.35, 'Silver Bright Gloss PET'],
    ['LR1110', 1.1, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const tmp = path.join(os.tmpdir(), `importParse-xlsx-${process.pid}.xlsx`);
  fs.writeFileSync(tmp, buf);
  try {
    const r = await parseExcelFile(tmp);
    assert.deepEqual(r.headers, ['Material Name', 'Price', 'Type']);
    assert.equal(r.rows.length, 2, 'two non-empty data rows');
    assert.equal(r.rows[0][0], 'PET SB50');
    assert.equal(r.meta.sheets[0], 'Sheet1');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
