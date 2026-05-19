// @ts-check
/**
 * Regression — numFmt leak across cells.
 *
 * Bug (2026-05-19): `applyStyle(cell, 'num')` assigned `STYLES.num` by
 * reference; later `c.numFmt = '0.0%;-0.0%;—'` in 08-cost-breakdown
 * mutated the shared STYLES.num.numFmt in place, propagating the
 * percent format to every body-numeric cell in every sheet. Operators
 * saw `4000000.0%` instead of `4,000,000.00` for MOQ etc.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';

function makeQuote() {
  return {
    id: 1,
    label: 'NF-1',
    _version: 1,
    state: {
      rfq_number: 'NF-1',
      end_cu: 'NumFmt Test',
      moq: 4000000,
      annual_qty: 50000000,
      selling_price: 0.138,
      active_moq_idx: 0,
      target_margin: 0.25,
      sheet_length: 209.73,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 2,
      web_width_td: 320,
      part_width: 298.8,
      part_length_md: 103.3,
      materials_main: [
        {
          _mid: 'm1',
          code: 'M1',
          ifs_code: 'IFS1',
          desc: 'PET',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 1,
          usage: 1,
          latest: 3.5,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: [],
    },
    result: {
      sp: 0.138,
      s_ttl: 0.1,
      gm: 0.275,
      va: 0.4,
      contribution: 0.3,
      bd_mat_setup: 0.002,
      bd_mat_run: 0.073,
      rows: {
        materials_main: [{ setup_cost: 0.002, run_cost: 0.073, total: 0.075 }],
        materials_alt: [],
        inks: [],
        processes: [],
      },
    },
  };
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('numFmt: Layout sheet B cells use number format, not percent', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const layout = wb.getWorksheet('02 Layout');
  for (let r = 4; r <= 8; r++) {
    const b = layout.getCell(`B${r}`);
    if (b.value == null) continue;
    assert.ok(
      !/%/.test(b.numFmt || ''),
      `Layout B${r} numFmt should not contain %, got: ${b.numFmt}`
    );
  }
});

test('numFmt: RFQ sheet MOQ + EAU columns render raw integers, not percent', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const rfq = wb.getWorksheet('01 RFQ MOQ');
  // MOQ in col B, EAU in col C must NOT be percent-formatted.
  // Target GM / VA / Contr / GM (cols E-H) legitimately use percent.
  rfq.eachRow((row) => {
    for (const col of ['B', 'C']) {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number' && cell.numFmt) {
        assert.ok(
          !/%/.test(cell.numFmt),
          `RFQ ${col}${row.number} should be raw number, got: ${cell.numFmt}`
        );
      }
    }
  });
});

test('numFmt: Materials sheet numeric body uses number format', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // Check usage / setup_lm / width / latest columns (D..M) for first data row
  // Header is row ~4, first data row ~5
  for (let r = 5; r <= 10; r++) {
    for (const col of ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']) {
      const cell = mat.getCell(`${col}${r}`);
      if (typeof cell.value === 'number' && cell.numFmt) {
        assert.ok(
          !/%/.test(cell.numFmt),
          `Materials ${col}${r} has stray % format: ${cell.numFmt}`
        );
      }
    }
  }
});

test('numFmt: Cost Breakdown pct column DOES use % format (legit case)', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const cb = wb.getWorksheet('08 Cost Breakdown');
  // Pct column is C — at least one numeric value should use percent format
  let foundPct = false;
  cb.eachRow((row) => {
    const c = row.getCell('C');
    if (typeof c.value === 'number' && /%/.test(c.numFmt || '')) {
      foundPct = true;
    }
  });
  assert.ok(foundPct, 'Cost Breakdown pct column should keep % format');
});
