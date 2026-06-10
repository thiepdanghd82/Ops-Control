import test from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, buildCsv } from './csvExport.js';

// UTF-8 BOM that buildCsv prepends so Excel decodes correctly on
// non-UTF-8 default code pages. Strip it in tests that compare body.
const BOM = '﻿';

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

test('buildCsv — starts with UTF-8 BOM (Excel encoding hint)', () => {
  const csv = buildCsv([], ['a', 'b']);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'first code unit is U+FEFF BOM');
  assert.equal(csv, BOM + 'a,b');
});

test('buildCsv — empty rows still emits header', () => {
  const csv = buildCsv([], ['a', 'b', 'c']);
  assert.equal(csv, BOM + 'a,b,c');
});

test('buildCsv — picks fields by column keys', () => {
  const rows = [
    { a: 1, b: 2, c: 3 },
    { a: 4, b: 5, c: 6 },
  ];
  assert.equal(buildCsv(rows, ['a', 'c']), BOM + 'a,c\n1,3\n4,6');
});

test('buildCsv — missing field becomes empty cell', () => {
  const rows = [{ a: 1 }];
  assert.equal(buildCsv(rows, ['a', 'b']), BOM + 'a,b\n1,');
});

test('buildCsv — null row defensively handled', () => {
  assert.equal(buildCsv([null], ['a']), BOM + 'a\n');
});

test('buildCsv — opts.headers overrides header row, body still uses cols keys', () => {
  // Summarize CSV passes operator-facing labels via opts.headers so the
  // header row reads "End Customer" not the internal key `project`
  // (S-PROJFIX / Lesson 21 aliasMap).
  const rows = [{ project: 'WiiM', rfq_no: 'RFQ-1' }];
  const csv = buildCsv(rows, ['rfq_no', 'project'], {
    headers: ['RFQ NO', 'End Customer'],
  });
  assert.equal(csv, BOM + 'RFQ NO,End Customer\nRFQ-1,WiiM');
});

test('buildCsv — opts.headers escaped same as keys (comma in label is quoted)', () => {
  const csv = buildCsv([{ a: 1 }], ['a'], { headers: ['Direct, Customer'] });
  assert.equal(csv, BOM + '"Direct, Customer"\n1');
});

test('buildCsv — missing opts (legacy callers) keeps using cols as header', () => {
  // Backward-compat path: 3rd argument absent should still work.
  const csv = buildCsv([{ x: 1 }], ['x']);
  assert.equal(csv, BOM + 'x\n1');
});

test('buildCsv — opts without headers field falls back to cols', () => {
  const csv = buildCsv([{ x: 1 }], ['x'], {});
  assert.equal(csv, BOM + 'x\n1');
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
  // BOM is prepended to the header line, so the slice starts after it.
  assert.equal(lines[0], BOM + 'rfq_no,direct_cu,description,moq,gm_pct');
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
  // The data row should have exactly 1 field (1 cell, properly quoted).
  // BOM only on header line (line 0), data line is unaffected.
  assert.equal(lines[1], '"BODY,STICKER ""BX"""');
});
