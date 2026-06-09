// @ts-check
/**
 * Variant column-visibility tests — customer hides Ref Price (Mat + Ink),
 * Tool Cost + Tool Life (Processes), and rolls Cost Breakdown to 5 buckets.
 */

// MVP-2: ensure HMAC key is set for tests that pre-date MVP-2.
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
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

test('variant.customer: Materials Ref Price column is hidden', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // Ref Price is col M (13th) after drw_material column inserted at position 3.
  const col = mat.getColumn('M');
  assert.equal(col.hidden, true, 'col M (Ref Price) must be hidden in customer variant');
});

test('variant.internal: Materials Ref Price column is visible', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  const col = mat.getColumn('M');
  // ExcelJS leaves `hidden` undefined when not set
  assert.notEqual(col.hidden, true, 'col M (Ref Price) must be visible in internal variant');
});

test('variant.customer: Inks Ref Price column hidden', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const inks = wb.getWorksheet('04 Inks');
  // Ink Ref Price is col 12 (L)
  const col = inks.getColumn('L');
  assert.equal(col.hidden, true);
});

test('variant.customer: Processes Tool Cost + Tool Life hidden', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const proc = wb.getWorksheet('05 Processes');
  // Tool Cost col 10 (J), Tool Life col 12 (L)
  assert.equal(proc.getColumn('J').hidden, true, 'Tool Cost must be hidden');
  assert.equal(proc.getColumn('L').hidden, true, 'Tool Life must be hidden');
});

test('variant.internal: Processes Tool Cost + Tool Life visible', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const proc = wb.getWorksheet('05 Processes');
  assert.notEqual(proc.getColumn('J').hidden, true);
  assert.notEqual(proc.getColumn('L').hidden, true);
});
