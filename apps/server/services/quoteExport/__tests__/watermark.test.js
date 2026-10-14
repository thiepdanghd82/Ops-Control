// @ts-check
/**
 * MVP-2 Item E — customer-variant watermark cell.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';
import { _internal as _wmInternal } from '../watermark.js';

const HMAC_KEY = 'd'.repeat(64);
const WM_COL = 27; // col AA — matches stampWatermarkCell()

function makeQuote() {
  return {
    id: 1,
    label: 'WM-1',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'WM-1',
      end_cu: 'X',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      active_moq_idx: 0,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 100,
      materials_main: [],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      gm: 0.3,
      rows: { materials_main: [], materials_alt: [], inks: [], processes: [] },
    },
  };
}

async function loadWb(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

test('watermark: customer variant renders "CUSTOMER COPY" cell on every visible sheet', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  const visible = wb.worksheets.filter((s) => s.state !== 'hidden' && !s.name.startsWith('_'));
  assert.ok(visible.length >= 5, 'post-consolidation baseline — see protect.test.js');
  for (const sheet of visible) {
    const cell = sheet.getCell(1, WM_COL);
    assert.equal(
      cell.value,
      _wmInternal.WATERMARK_TEXT,
      `${sheet.name} should have watermark text`
    );
  }
});

test('watermark: internal variant has NO watermark cell', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  const visible = wb.worksheets.filter((s) => s.state !== 'hidden' && !s.name.startsWith('_'));
  for (const sheet of visible) {
    const cell = sheet.getCell(1, WM_COL);
    assert.notEqual(
      cell.value,
      _wmInternal.WATERMARK_TEXT,
      `${sheet.name} should NOT have watermark text in internal variant`
    );
  }
});

test('watermark: hidden _Audit + _Schema sheets do NOT get watermark', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  for (const name of ['_Audit', '_Schema']) {
    const sheet = wb.getWorksheet(name);
    assert.ok(sheet);
    const cell = sheet.getCell(1, WM_COL);
    assert.notEqual(cell.value, _wmInternal.WATERMARK_TEXT);
  }
});

test('watermark: fill color is the documented pink-grey ARGB', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  const cover = wb.getWorksheet('00 Cover');
  const cell = cover.getCell(1, WM_COL);
  const fill = cell.fill;
  assert.ok(fill, 'watermark cell has fill');
  assert.equal(fill.type, 'pattern');
  assert.equal(fill.fgColor?.argb, _wmInternal.WATERMARK_BG);
});

test('watermark: cell AA1 is outside every banner merge', async () => {
  // Was written against '05 Processes', whose banner ended at col S (19).
  // After the 2026-09-14 consolidation the widest banner is 02 Summarize's
  // 22 columns (to V), so AA (27) still clears it — but the margin shrank
  // from 8 columns to 5, and the old test could not have noticed because the
  // sheet it checked no longer exists. This walks every visible sheet.
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  const wmRef = `${columnLetter(WM_COL)}1`;
  const visible = wb.worksheets.filter((sh) => sh.state !== 'hidden' && !sh.name.startsWith('_'));
  assert.ok(visible.length >= 5);
  for (const sheet of visible) {
    const merges = sheet.model?.merges || [];
    const collision = merges.some(
      (m) => typeof m === 'string' && m.split(':').some((c) => c === wmRef)
    );
    assert.equal(collision, false, `${sheet.name}: watermark cell is inside a merged range`);
  }
});

function columnLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}
