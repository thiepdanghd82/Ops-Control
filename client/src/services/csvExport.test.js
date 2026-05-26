import test from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, buildCsv } from './csvExport.js';

test('csvEscape — null + undefined → empty string', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('csvEscape — plain string passes through', () => {
  assert.equal(csvEscape('hello'), 'hello');
  assert.equal(csvEscape('Panasonic'), 'Panasonic');
});

test('csvEscape — empty string → empty', () => {
  assert.equal(csvEscape(''), '');
});

test('csvEscape — number → toString without quoting', () => {
  assert.equal(csvEscape(0), '0');
  assert.equal(csvEscape(1234.56789), '1234.56789');
  assert.equal(csvEscape(-5), '-5');
});

test('csvEscape — comma triggers wrap', () => {
  assert.equal(csvEscape('a, b'), '"a, b"');
  assert.equal(csvEscape('Body sticker, gold'), '"Body sticker, gold"');
});

test('csvEscape — embedded double-quote escaped to ""', () => {
  // RFC 4180 — embedded " becomes "" and the field gets wrapped in "...".
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape('"hello"'), '"""hello"""');
});

test('csvEscape — newline triggers wrap', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape('cr\rlf'), '"cr\rlf"');
});

test('csvEscape — combination: comma + quote + newline', () => {
  // Was buggy pre-fix: only wrapped on comma, embedded quote leaked.
  assert.equal(csvEscape('a, "b", c\n'), '"a, ""b"", c\n"');
});

test('buildCsv — empty rows still emits header', () => {
  const csv = buildCsv([], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c');
});

test('buildCsv — picks fields by column keys', () => {
  const rows = [
    { a: 1, b: 2, c: 3 },
    { a: 4, b: 5, c: 6 },
  ];
  assert.equal(buildCsv(rows, ['a', 'c']), 'a,c\n1,3\n4,6');
});

test('buildCsv — missing field becomes empty cell', () => {
  const rows = [{ a: 1 }];
  assert.equal(buildCsv(rows, ['a', 'b']), 'a,b\n1,');
});

test('buildCsv — null row defensively handled', () => {
  assert.equal(buildCsv([null], ['a']), 'a\n');
});

test('buildCsv — operator-style row with all quoting cases', () => {
  const rows = [
    {
      rfq_no: 'RFQ-2026-S0019',
      direct_cu: 'Panasonic',
      description: 'BODY STICKER, FC AS "TL1G"',
      moq: 1000,
      gm_pct: 0.158,
    },
  ];
  const csv = buildCsv(rows, ['rfq_no', 'direct_cu', 'description', 'moq', 'gm_pct']);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'rfq_no,direct_cu,description,moq,gm_pct');
  assert.equal(lines[1], 'RFQ-2026-S0019,Panasonic,"BODY STICKER, FC AS ""TL1G""",1000,0.158');
});

test('buildCsv — pre-fix bug regression: embedded quote no longer leaks', () => {
  // Pre-fix: csv = `BODY,STICKER "BX"` → splits into 2 cells, second has unmatched quote.
  // Post-fix: wrapped + doubled quote = 1 cell, parses cleanly.
  const rows = [{ desc: 'BODY,STICKER "BX"' }];
  const csv = buildCsv(rows, ['desc']);
  // Round-trip parse check: regex-based naïve CSV parser
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  // The data row should have exactly 1 field (1 cell, properly quoted)
  assert.equal(lines[1], '"BODY,STICKER ""BX"""');
});
