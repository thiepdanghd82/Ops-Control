// @ts-check
/**
 * CSV export path — RFC-4180 serialization, BOM, visible-only sheets,
 * single + multi-tier zip parity, and format=xlsx unchanged (BC).
 */
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  BOM,
  csvEscapeCell,
  isVisibleSheet,
  csvFileName,
  sheetToCsv,
  workbookToCsvEntries,
} from '../csv.js';
import { exportQuote } from '../index.js';

// ── pure serialization ───────────────────────────────────────────────────────

test('csvEscapeCell — RFC 4180 (comma / quote / newline wrap + double quotes)', () => {
  assert.equal(csvEscapeCell('plain'), 'plain');
  assert.equal(csvEscapeCell('has,comma'), '"has,comma"');
  assert.equal(csvEscapeCell('has"quote'), '"has""quote"');
  assert.equal(csvEscapeCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvEscapeCell('carriage\rreturn'), '"carriage\rreturn"');
  assert.equal(csvEscapeCell(null), '');
  assert.equal(csvEscapeCell(undefined), '');
  assert.equal(csvEscapeCell(42), '42');
  assert.equal(csvEscapeCell({ result: 3.14 }), '3.14'); // formula result
  assert.equal(csvEscapeCell({ text: 'link' }), 'link'); // hyperlink
  assert.equal(csvEscapeCell({ richText: [{ text: 'a' }, { text: 'b' }] }), 'ab');
});

test('isVisibleSheet — excludes hidden + underscore forensic sheets', () => {
  assert.equal(isVisibleSheet({ name: '03 Materials', state: undefined }), true);
  assert.equal(isVisibleSheet({ name: '_Audit', state: 'hidden' }), false);
  assert.equal(isVisibleSheet({ name: '_Schema', state: undefined }), false);
  assert.equal(isVisibleSheet({ name: 'X', state: 'veryHidden' }), false);
  assert.equal(isVisibleSheet(null), false);
});

test('csvFileName — "03 Materials" → "03-Materials.csv"', () => {
  assert.equal(csvFileName('03 Materials'), '03-Materials.csv');
  assert.equal(csvFileName('01 RFQ MOQ'), '01-RFQ-MOQ.csv');
  assert.equal(csvFileName('a/b:c'), 'a_b_c.csv');
});

test('sheetToCsv — escapes cells + merged banner not repeated across span', () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('03 Materials');
  s.mergeCells('A1:C1');
  s.getCell('A1').value = 'BANNER';
  s.addRow(['Plain', 'has,comma', 'has"q']);
  const csv = sheetToCsv(s);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'BANNER,,'); // merged slaves emit empty
  assert.equal(lines[1], 'Plain,"has,comma","has""q"');
});

test('workbookToCsvEntries — one CSV per visible sheet, BOM-prefixed, excludes _Audit/_Schema', () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('00 Cover').addRow(['x']);
  wb.addWorksheet('03 Materials').addRow(['y']);
  wb.addWorksheet('_Audit', { state: 'hidden' }).addRow(['secret']);
  wb.addWorksheet('_Schema', { state: 'hidden' }).addRow(['payload']);
  const entries = workbookToCsvEntries(wb);
  const names = entries.map((e) => e.filename).sort();
  assert.deepEqual(names, ['00-Cover.csv', '03-Materials.csv']);
  for (const e of entries) {
    assert.equal(e.buffer.toString('utf8')[0], BOM, `${e.filename} must start with BOM`);
  }
});

test('workbookToCsvEntries — prefix folders the files (multi-tier)', () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('00 Cover').addRow(['x']);
  const entries = workbookToCsvEntries(wb, { prefix: 'Quote_MOQ500' });
  assert.equal(entries[0].filename, 'Quote_MOQ500/00-Cover.csv');
});

// ── fixtures ─────────────────────────────────────────────────────────────────

function makeSingleTierQuote() {
  return {
    id: 11,
    label: 'RFQ-CSV',
    _version: 2,
    type: 'standard',
    state: {
      rfq_number: 'RFQ-CSV',
      end_cu: 'CSV Customer',
      moq: 500,
      annual_qty: 10000,
      selling_price: 0.6,
      active_moq_idx: 0,
      target_margin: 0.3,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 2,
      parts_in_md: 4,
      web_width_td: 300,
      materials_main: [
        {
          _mid: 'm1',
          code: 'M1',
          ifs_code: 'IFS1',
          desc: 'PET',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 4,
          usage: 1,
          latest: 3.5,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [{ _mid: 'i1', label: 'Ink 1', color: 'White', print_type: 'Indigo' }],
      processes: [],
      extra_moqs: [],
    },
    result: {
      sp: 0.6,
      s_ttl: 0.35,
      gm: 0.3,
      va: 0.4,
      contribution: 0.35,
      bd_mat_setup: 0.05,
      bd_mat_run: 0.1,
      rows: {
        materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
        materials_alt: [],
        inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
        processes: [],
      },
    },
  };
}

function makeMultiTierQuote() {
  const q = makeSingleTierQuote();
  q.id = 12;
  q.state.extra_moqs = [
    { moq: 1000, selling_price: 0.55, eau: 10000 },
    { moq: 5000, selling_price: 0.5, eau: 10000 },
  ];
  q.result.tiers = [
    { rows: q.result.rows },
    {
      rows: {
        materials_main: [{ setup_cost: 0.04, run_cost: 0.09, total: 0.13 }],
        materials_alt: [],
        inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
        processes: [],
      },
    },
    {
      rows: {
        materials_main: [{ setup_cost: 0.03, run_cost: 0.08, total: 0.11 }],
        materials_alt: [],
        inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
        processes: [],
      },
    },
  ];
  return q;
}

const VISIBLE_SHEETS = 11; // 00 Cover … 10 Pricing Snapshot

// ── end-to-end CSV export ────────────────────────────────────────────────────

test('format=csv single-tier → _csv.zip with one CSV per visible tab, no _Audit/_Schema', async () => {
  const out = await exportQuote(makeSingleTierQuote(), {
    variant: 'internal',
    lang: 'en',
    format: 'csv',
    now: new Date('2026-09-08T00:00:00Z'),
  });
  assert.equal(out.kind, 'zip');
  assert.match(out.filename, /_csv\.zip$/);
  assert.match(out.filename, /^Quote_RFQ-CSV_CSV_Customer_MOQ500_internal_v2_20260908_csv\.zip$/);

  const zip = await JSZip.loadAsync(out.buffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  assert.equal(
    names.length,
    VISIBLE_SHEETS,
    `expected ${VISIBLE_SHEETS} CSVs, got ${names.length}`
  );
  names.forEach((n) => assert.match(n, /\.csv$/));
  assert.ok(!names.some((n) => /_Audit|_Schema/.test(n)), 'forensic sheets must be excluded');
  assert.ok(names.includes('00-Cover.csv'));
  assert.ok(names.includes('10-Pricing-Snapshot.csv'));

  // BOM present at the head of each CSV (VN-locale Excel decode).
  const cover = await zip.file('00-Cover.csv').async('string');
  assert.equal(cover[0], BOM);
});

test('format=csv multi-tier → per-tier folders, each with the full visible set', async () => {
  const out = await exportQuote(makeMultiTierQuote(), {
    variant: 'customer',
    lang: 'en',
    format: 'csv',
    tiers: 'all',
    now: new Date('2026-09-08T00:00:00Z'),
  });
  assert.equal(out.kind, 'zip');
  assert.match(out.filename, /_csv\.zip$/);

  const zip = await JSZip.loadAsync(out.buffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  assert.equal(names.length, VISIBLE_SHEETS * 3, `expected ${VISIBLE_SHEETS * 3} CSVs`);
  const prefixes = new Set(names.map((n) => n.split('/')[0]));
  assert.equal(prefixes.size, 3, 'three per-tier folders');
  assert.ok([...prefixes].some((p) => /MOQ500_customer/.test(p)));
  assert.ok([...prefixes].some((p) => /MOQ1000_customer/.test(p)));
  assert.ok([...prefixes].some((p) => /MOQ5000_customer/.test(p)));
  names.forEach((n) => assert.match(n, /\/\d\d-[\w-]+\.csv$/));
});

test('format=xlsx (default) unchanged — single-tier returns an .xlsx, not a zip', async () => {
  const out = await exportQuote(makeSingleTierQuote(), { variant: 'internal', lang: 'en' });
  assert.equal(out.kind, 'xlsx');
  assert.match(out.filename, /\.xlsx$/);
  assert.ok(Buffer.isBuffer(out.buffer) && out.buffer.length > 0);
});

test('format=csv rejects an invalid format value', async () => {
  await assert.rejects(
    () => exportQuote(makeSingleTierQuote(), { variant: 'internal', format: 'pdf' }),
    /format must be/
  );
});
