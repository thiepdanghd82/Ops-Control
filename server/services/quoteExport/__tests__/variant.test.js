// @ts-check
/**
 * Variant column-visibility tests — customer hides Ref Price (Mat + Ink),
 * Tool Cost + Tool Life (Processes), and rolls Cost Breakdown to 5 buckets.
 */

// MVP-2: ensure HMAC key is set for tests that pre-date MVP-2.
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import { section } from './sections.js';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';

function makeQuote() {
  return {
    id: 1,
    label: 'V-TEST',
    _version: 1,
    state: {
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      active_moq_idx: 0,
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
          s_price: 3.4,
          latest: 3.5,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [
        {
          _mid: 'i1',
          label: 'Ink 1',
          ifs_code: 'INK-W',
          color: 'White',
          print_type: 'Indigo',
          clicks: 4,
          s_price: 49,
          latest: 50,
        },
      ],
      processes: [
        {
          _mid: 'p1',
          process_type: 'Print',
          workcenter: 'WC1',
          tool_cost: 200,
          tool_life: 50000,
          tool_type: 'Plate',
        },
      ],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      g_ttl: 0.35,
      gm: 0.3,
      va: 0.4,
      contribution: 0.35,
      s_mat_cost: 0.2,
      g_mat_cost: 0.2,
      overhead: 0.02,
      labor_cost: 0.03,
      tooling: 0.01,
      packing_ship: 0.005,
      vat_loss: 0,
      bd_mat_setup: 0.05,
      bd_mat_run: 0.1,
      bd_ink_setup: 0.02,
      bd_ink_run: 0.03,
      bd_setup_labor: 0.005,
      bd_setup_mach: 0.005,
      rows: {
        materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
        materials_alt: [],
        inks: [{ setup_cost: 0.02, run_cost: 0.03, total: 0.05, clicks: 4 }],
        processes: [{ setup_cost: 0.01, run_cost: 0.02, total: 0.03 }],
      },
    },
  };
}

async function parseBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

/**
 * 2026-09-14 — these used to assert `getColumn('M').hidden`. Column hiding was
 * how the customer variant suppressed cost-revealing fields when Materials,
 * Inks and Processes each owned a sheet.
 *
 * They now share "02 Summarize", where the same letter carries a different
 * field per section: column O is tool_life in Processes, which a customer must
 * not see, but qpa_m2 in Materials and setup_cost in Inks, which they are
 * meant to. Hiding by letter is therefore wrong in both directions — hide the
 * union and real figures vanish, hide the intersection and tool_life leaks.
 *
 * The builders blank those cells at write time instead, so that is what these
 * assert: the cell reads '—' for a customer and carries a number internally.
 */

/**
 * Data cells down one column of a section.
 *
 * Keeps only numbers and the em-dash, which is what a data cell ever holds.
 * That drops the column header, the "per-row breakdown" footnote and the next
 * section's banner without having to know where any of them sit — the reason
 * an earlier version of this helper reported a footnote as an unsuppressed
 * value.
 */
function columnValues(sec, col, depth = 14) {
  const out = [];
  for (let i = 3; i <= depth; i++) {
    const v = sec.cell(col, i).value;
    if (typeof v === 'number' || v === '—') out.push(v);
  }
  return out;
}

test('variant.customer: Materials Ref Price is blanked but QPA m² survives', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = section(wb, 'Main materials');
  const refPrice = columnValues(mat, 'M');
  assert.ok(refPrice.length > 0, 'fixture must produce Ref Price cells to judge');
  assert.ok(
    refPrice.every((v) => v === '—'),
    `Ref Price must be suppressed for a customer, got ${JSON.stringify(refPrice)}`
  );
  // Column O is tool_life in Processes — which a customer must NOT see — but
  // qpa_m2 here. Hiding column O would have blanked this.
  assert.ok(
    columnValues(mat, 'O').some((v) => typeof v === 'number'),
    'QPA m² shares column O with Processes tool_life and must survive for a customer'
  );
});

test('variant.customer: Inks Ref Price is blanked but Setup Cost survives', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const inks = section(wb, 'Inks');
  const refPrice = columnValues(inks, 'M');
  assert.ok(refPrice.length > 0);
  assert.ok(refPrice.every((v) => v === '—'));
  assert.ok(
    columnValues(inks, 'O').some((v) => typeof v === 'number'),
    'Setup Cost shares column O with Processes tool_life and must survive'
  );
});

test('variant.customer: Processes blanks BOTH Tool Cost and Tool Life', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const proc = section(wb, 'Processes');
  for (const col of ['M', 'O']) {
    const vals = columnValues(proc, col);
    assert.ok(vals.length > 0, `fixture must produce ${col} cells`);
    assert.ok(
      vals.every((v) => v === '—'),
      `${col} must be suppressed for a customer, got ${JSON.stringify(vals)}`
    );
  }
});

test('variant.internal: Materials Ref Price column is visible', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = section(wb, 'Main materials');
  const col = mat.getColumn('M');
  // ExcelJS leaves `hidden` undefined when not set
  assert.notEqual(col.hidden, true, 'col M (Ref Price) must be visible in internal variant');
});

test('variant.internal: Processes Tool Cost + Tool Life visible', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const proc = section(wb, 'Processes');
  assert.notEqual(proc.getColumn('M').hidden, true);
  assert.notEqual(proc.getColumn('O').hidden, true);
});
