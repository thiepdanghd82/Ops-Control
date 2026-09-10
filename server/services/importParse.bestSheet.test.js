/**
 * importParse — best-sheet auto-selection + header-row detection.
 *   node --test server/services/importParse.bestSheet.test.js
 *
 * Fixtures are built in a throwaway tmp dir with the `xlsx` package (no
 * binary committed). Sheet scoring is exercised against the real
 * RFQ_TRACKING_DATASET via the wizard's mapHeaders matcher.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

import { parseExcelFile } from './importParse.js';
import { mapHeaders } from './importPipeline.js';
import { getDataset } from './importDatasets.js';

const RFQ = getDataset('rfq-tracking');
const scoreHeaders = (headers) => Object.keys(mapHeaders(headers, RFQ).mapping).length;

const RFQ_MASTER_HEADERS = [
  'RFQ No',
  'Qtn #',
  'Customer',
  'End Customer/Project',
  'Part Number',
  'Description',
  'Main Material',
  'Design Process',
  'Print (LP/Flexo)',
  'SilkScreen',
  'MOQ',
  'RFQ Date',
  'Target Date',
  'Actual Quote Date',
  'Days in Process',
  'Month',
  'NPI Stage',
  'NPI PIC',
  'Control Flag',
  'CCL Price ($)',
  'Target Price ($)',
  'VA %',
  'Contr %',
  'GM %',
  'EAU / Qty',
  'Est. Revenue ($)',
  'Sales PIC',
  'Sale Stage',
  'Notes / Reason',
];
const RFQ_ROW_1 = [
  2367,
  '1st',
  'Netgear',
  '',
  3205921800,
  'New',
  'PC Film',
  'SS',
  '',
  7,
  1000,
  46024,
  46025,
  46027,
  3,
  'Jan 2026',
  '6. Quoted',
  'Hana',
  'Closed',
  0.496,
  '',
  '',
  '',
  -0.2777,
  '',
  0.496,
  '',
  '',
  '',
];
const RFQ_ROW_2 = [
  2368,
  '1st',
  'LG',
  '',
  'MEZ678',
  'New',
  'PET',
  'HP',
  7,
  '',
  20000,
  46027,
  46028,
  46028,
  1,
  'Jan 2026',
  '6. Quoted',
  'Hana',
  'Closed',
  0.0918,
  '',
  '',
  '',
  0.3,
  '40K',
  0.0918,
  '',
  '',
  '',
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-bestsheet-'));

function writeWorkbook(name, sheetsSpec) {
  // sheetsSpec: [{ name, aoa }]
  const wb = XLSX.utils.book_new();
  for (const s of sheetsSpec) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name);
  }
  const p = path.join(tmp, name);
  // xlsx ESM build has no fs wired → write to a buffer then fs.writeFileSync
  // (mirrors parseExcelFile's read-bytes approach).
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(p, buf);
  return p;
}

// The 3-sheet workbook mirroring RFQ_Master_combined.xlsx.
const THREE_SHEET = writeWorkbook('rfq3.xlsx', [
  {
    name: 'Dashboard',
    aoa: [
      ['Tự động cập nhật số liệu RFQ'],
      ['1. New RFQ', 42],
      ['10. On hold', 3],
      ['Tổng Est. Revenue', 123456],
    ],
  },
  {
    name: 'Lists',
    aoa: [
      ['NPI Stage', 'Control Flag', 'Sale Stage'],
      ['1. New', 'Open', 'Lead'],
      ['6. Quoted', 'Closed', 'Won'],
    ],
  },
  { name: 'RFQ Master', aoa: [RFQ_MASTER_HEADERS, RFQ_ROW_1, RFQ_ROW_2] },
]);

test('multi-sheet + scorer → auto-picks "RFQ Master" (29 matched), Dashboard/Lists score low', async () => {
  const r = await parseExcelFile(THREE_SHEET, { scoreHeaders });
  assert.equal(r.meta.sheet, 'RFQ Master');
  assert.equal(r.headers.length, 29);
  assert.equal(r.rows.length, 2, 'both data rows land');
  assert.equal(scoreHeaders(r.headers), 29, 'all 29 canonicals matched');

  const byName = Object.fromEntries(r.meta.sheetScores.map((s) => [s.sheet, s]));
  assert.equal(byName['RFQ Master'].matched, 29);
  assert.ok(
    byName['Dashboard'].matched < byName['RFQ Master'].matched,
    'Dashboard scores below RFQ Master'
  );
  assert.ok(
    byName['Lists'].matched < byName['RFQ Master'].matched,
    'Lists scores below RFQ Master'
  );
});

test('explicit opts.sheet overrides the auto-pick (Lists honored even though it is a poor match)', async () => {
  const r = await parseExcelFile(THREE_SHEET, { sheet: 'Lists', scoreHeaders });
  assert.equal(r.meta.sheet, 'Lists');
  assert.deepEqual(r.headers, ['NPI Stage', 'Control Flag', 'Sale Stage']);
  assert.equal(r.meta.sheetScores, null, 'no scoring when an explicit sheet is given');
});

test('no scorer + multi-sheet → legacy first-sheet default (unchanged for non-wizard callers)', async () => {
  const r = await parseExcelFile(THREE_SHEET, {});
  assert.equal(r.meta.sheet, 'Dashboard'); // first sheet, legacy behavior
  assert.equal(r.meta.sheetScores, null);
});

test('single-sheet workbook → that sheet chosen, no scoring, row-0 headers', async () => {
  const single = writeWorkbook('single.xlsx', [
    { name: 'Only', aoa: [RFQ_MASTER_HEADERS, RFQ_ROW_1] },
  ]);
  const r = await parseExcelFile(single, { scoreHeaders });
  assert.equal(r.meta.sheet, 'Only');
  assert.equal(r.meta.sheetScores, null, 'single sheet needs no scoring');
  assert.equal(r.headers.length, 29);
  assert.equal(r.rows.length, 1);
});

test('header-row detection: a banner row 0 + headers on row 1 → headers resolved from row 1', async () => {
  const banner = writeWorkbook('banner.xlsx', [
    {
      name: 'Sheet1',
      aoa: [
        ['RFQ MASTER — CONFIDENTIAL (updated automatically)'], // banner, 1 cell, 0 matches
        RFQ_MASTER_HEADERS, // real header row
        RFQ_ROW_1,
        RFQ_ROW_2,
      ],
    },
  ]);
  const r = await parseExcelFile(banner, { scoreHeaders });
  assert.equal(r.headers.length, 29, 'headers taken from row 1, not the banner row 0');
  assert.equal(scoreHeaders(r.headers), 29);
  assert.equal(r.rows.length, 2, 'banner + header skipped, 2 data rows remain');
  assert.equal(r.rows[0][0], 2367, 'first data cell is the real RFQ No, not banner text');
});

test('legacy path (no scorer) keeps row 0 as headers even if row 0 is a banner', async () => {
  const banner = writeWorkbook('banner2.xlsx', [
    { name: 'Sheet1', aoa: [['A BANNER ROW'], RFQ_MASTER_HEADERS, RFQ_ROW_1] },
  ]);
  const r = await parseExcelFile(banner, {}); // no scorer
  assert.equal(r.headers[0], 'A BANNER ROW', 'legacy: row 0 used as header verbatim');
  assert.ok(scoreHeaders(r.headers) <= 1, 'banner row barely matches (no header-row detection)');
});
