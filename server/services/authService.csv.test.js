/**
 * Regression guard for CSV injection in authService.toCsvBytes.
 *
 * Prior impl always double-quoted every cell but did NOT prefix the CSV
 * formula chars (=, +, -, @). Excel strips whitespace + outer quotes
 * before interpreting a formula, so `"=HYPERLINK(...)"` still executes.
 *
 * toCsvBytes is used in server/routes/costApi.js to write
 * quote_history.csv, summarize_db.csv, materials.csv + two /download
 * endpoints. A malicious customer name / project description could
 * execute arbitrary formulas when an admin opens the export in Excel.
 *
 * Fix: toCsvBytes now delegates to `escapeCsvCell` in utils/csvSafe.js
 * which both prefixes formula chars AND applies RFC 4180 quoting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsvBytes } from './authService.js';

function decode(buf) { return Buffer.from(buf).toString('utf-8'); }

test('toCsvBytes: prepends UTF-8 BOM so Excel reads Vietnamese diacritics correctly', () => {
  const s = decode(toCsvBytes(['Customer'], [['CCL Vinh Long']]));
  assert.ok(s.startsWith('\uFEFF'), 'missing BOM');
});

test('toCsvBytes: escapes = + - @ formula prefix (CSV injection guard)', () => {
  const s = decode(toCsvBytes(['Name'], [
    ['=SUM(A1)'],
    ['+cmd|/c calc'],
    ['-2+3'],
    ['@HYPERLINK(...)'],
  ]));
  // Each dangerous cell must start with an apostrophe so Excel treats it literal.
  assert.match(s, /'=SUM\(A1\)/);
  assert.match(s, /'\+cmd\|\/c calc/);
  assert.match(s, /'-2\+3/);
  assert.match(s, /'@HYPERLINK\(\.\.\.\)/);
});

test('toCsvBytes: formula prefix applies even with leading whitespace (Excel strips it before parsing)', () => {
  const s = decode(toCsvBytes(['x'], [['  =A1']]));
  assert.match(s, /'  =A1/);
});

test('toCsvBytes: quotes cells containing commas', () => {
  const s = decode(toCsvBytes(['x'], [['a,b,c']]));
  assert.match(s, /"a,b,c"/);
});

test('toCsvBytes: doubles embedded quotes per RFC 4180', () => {
  const s = decode(toCsvBytes(['x'], [['she said "hi"']]));
  assert.match(s, /"she said ""hi"""/);
});

test('toCsvBytes: null / undefined → empty cell (not the string "null")', () => {
  const s = decode(toCsvBytes(['a', 'b'], [[null, undefined]]));
  // After BOM + header + CRLF, the data row should be just a comma
  assert.ok(s.includes('\r\n,\r\n'), `expected empty cells, got: ${JSON.stringify(s)}`);
});

test('toCsvBytes: uses CRLF line endings for Excel compat', () => {
  const s = decode(toCsvBytes(['h'], [['a'], ['b']]));
  assert.ok(s.includes('\r\n'), 'missing CRLF');
});

test('toCsvBytes: benign strings pass through untouched', () => {
  const s = decode(toCsvBytes(['Customer', 'Qty'], [['Brady', '1000']]));
  assert.match(s, /Brady/);
  assert.match(s, /1000/);
  assert.doesNotMatch(s, /'Brady/);
});
