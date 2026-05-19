// @ts-check
/**
 * Subtotal rows on Materials / Inks / Processes — show aggregate from
 * quote.result so operators don't see all em-dash when per-row breakdown
 * isn't persisted (MES-3-FIX-41 hardening for MVP-1).
 */

// MVP-2: ensure HMAC key is set for tests that pre-date MVP-2.
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';

function makeQuote(resultOverrides = {}) {
  return {
    id: 1,
    label: 'ST-1',
    _version: 1,
    state: {
      rfq_number: 'ST-1',
      end_cu: 'Subtotal Test',
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
          latest: 3.5,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [
        {
          _mid: 'i1',
          label: 'Ink 1',
          color: 'White',
          print_type: 'Flexo',
          clicks: 4,
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
        },
      ],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      gm: 0.3,
      bd_mat_setup: 0.002,
      bd_mat_run: 0.073,
      bd_ink_setup: 0.01,
      bd_ink_run: 0.025,
      bd_setup_mach: 0.004,
      bd_setup_labor: 0.005,
      bd_overhead: 0.02,
      bd_labor: 0.015,
      tooling: 0.003,
      rows: {
        materials_main: [{ setup_cost: 0.002, run_cost: 0.073, total: 0.075 }],
        materials_alt: [],
        inks: [{ setup_cost: 0.01, run_cost: 0.025, total: 0.035 }],
        processes: [{ setup_cost: 0.009, run_cost: 0.029, total: 0.038 }],
      },
      ...resultOverrides,
    },
  };
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function findSubtotalRow(sheet, label) {
  for (let r = 1; r <= 50; r++) {
    const a = sheet.getCell(`A${r}`);
    if (typeof a.value === 'string' && a.value.includes(label)) return r;
  }
  return null;
}

test('subtotal: Materials shows bd_mat_setup + bd_mat_run', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  const r = findSubtotalRow(mat, 'Subtotal');
  assert.ok(r, 'Subtotal row not found on Materials');
  // setup_cost (col N=14), run_cost (col O=15), total (col P=16)
  const setup = mat.getCell(r, 14).value;
  const run = mat.getCell(r, 15).value;
  const total = mat.getCell(r, 16).value;
  assert.equal(setup, 0.002);
  assert.equal(run, 0.073);
  assert.ok(Math.abs(Number(total) - 0.075) < 1e-9);
});

test('subtotal: Inks shows bd_ink_setup + bd_ink_run', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const inks = wb.getWorksheet('04 Inks');
  const r = findSubtotalRow(inks, 'Subtotal');
  assert.ok(r, 'Subtotal row not found on Inks');
  const setup = inks.getCell(r, 14).value;
  const run = inks.getCell(r, 15).value;
  const total = inks.getCell(r, 16).value;
  assert.equal(setup, 0.01);
  assert.equal(run, 0.025);
  assert.ok(Math.abs(Number(total) - 0.035) < 1e-9);
});

test('subtotal: Processes derives Setup + Run + Total from bd_setup_*/bd_labor/bd_overhead/tooling', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const proc = wb.getWorksheet('05 Processes');
  const r = findSubtotalRow(proc, 'Subtotal');
  assert.ok(r, 'Subtotal row not found on Processes');
  // setup_cost = col 17 (Q), run_cost = 18 (R), total = 19 (S)
  const setup = proc.getCell(r, 17).value;
  const run = proc.getCell(r, 18).value;
  const total = proc.getCell(r, 19).value;
  // setup = 0.004 + 0.005 = 0.009
  // total = 0.02 + 0.015 + 0.003 = 0.038
  // run = total - setup = 0.029
  assert.ok(Math.abs(Number(setup) - 0.009) < 1e-9);
  assert.ok(Math.abs(Number(total) - 0.038) < 1e-9);
  assert.ok(Math.abs(Number(run) - 0.029) < 1e-9);
});

test('subtotal: omitted when result has no aggregate (legacy/empty quote)', async () => {
  const q = makeQuote();
  // Strip all bd_ keys but keep `rows` so the legacy_no_rows gate passes.
  q.result = {
    sp: 0.5,
    s_ttl: 0.35,
    rows: {
      materials_main: [{ setup_cost: 0, run_cost: 0, total: 0 }],
      materials_alt: [],
      inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
      processes: [{ setup_cost: 0, run_cost: 0, total: 0 }],
    },
  };
  const out = await exportQuote(q, { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // No subtotal row should exist
  assert.equal(findSubtotalRow(mat, 'Subtotal'), null);
});
