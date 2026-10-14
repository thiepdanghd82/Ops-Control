// @ts-check
/**
 * The xlsx Processes sheet must show what a tool actually COST.
 *
 * A process can take its cost from the Layout tab. When it does it carries a
 * `tool_cost_src` and leaves its own `tool_cost` at 0 — so the raw field is 0
 * for exactly the rows that DO have a tool, and the sheet showed 0 for every
 * one of them.
 *
 * Measured on live data 2026-09-24: 48 processes carry a tool_cost_src and all
 * 48 hold tool_cost 0. Two internal workbooks had already gone out that way
 * (quotes 198 + 199, both understated by $134.15). The PRICE was never wrong —
 * calcProcess charged the Layout cost all along — only this column was.
 *
 * The server never recomputes prices, so the effective cost is PERSISTED by
 * the client into result.rows.processes[] and read back here. That is the
 * MVP-1.5 / MES-3-FIX-41 pattern, not a new one.
 */
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { section } from './sections.js';
import { exportQuote } from '../index.js';

const TOOL_COL = 'M'; // PROC_COLS index 13
// section() is RELATIVE: the banner counts as row 1, so the header is row 3
// and the first data row is row 4. (Copying 5 from the Materials test cost a
// debug cycle — those coordinates belong to a different section.)
const ROW1 = 4;

/** @param {object} rowCost extra fields for result.rows.processes[0] */
function quoteWith(rowCost, proc) {
  return {
    id: 1,
    label: 'TC-1',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'TC-1',
      end_cu: 'Tool Cost',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      active_moq_idx: 0,
      processes: [{ _pid: 'p1', process_type: 'Print', workcenter: 'WC1', ...proc }],
    },
    result: {
      sp: 0.5,
      rows: {
        materials_main: [],
        inks: [],
        processes: [{ setup_cost: 0, run_cost: 0, total: 0, ...rowCost }],
      },
    },
    saved_at: '2026-09-24T00:00:00Z',
  };
}

const cell = async (q) => {
  const out = await exportQuote(q, { variant: 'internal', lang: 'en' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  return section(wb, 'Processes').cell(TOOL_COL, ROW1).value;
};

test('a Layout-assigned row shows the EFFECTIVE cost, not its empty cell', async () => {
  // The reported bug: tool_cost 0 + a src → the sheet printed 0.
  const v = await cell(
    quoteWith({ tool_cost_effective: 67.79 }, { tool_cost: 0, tool_cost_src: 'plate' })
  );
  assert.equal(v, 67.79);
});

test('a MANUAL row is unchanged — no src, the row cell is the truth', async () => {
  const v = await cell(
    quoteWith({ tool_cost_effective: 120 }, { tool_cost: 120, tool_cost_src: '' })
  );
  assert.equal(v, 120);
});

test('a LEGACY quote with no persisted field falls back to the raw cell', async () => {
  // Quotes saved before this shipped carry no tool_cost_effective. Falling
  // back keeps a manual cost correct and leaves an assigned one at 0 —
  // unchanged rather than newly wrong. They heal on the next save.
  const v = await cell(quoteWith({}, { tool_cost: 88 }));
  assert.equal(v, 88);
});

test('an explicit 0 is honoured, not treated as missing', async () => {
  // `!= null` rather than `||` on purpose: a genuinely free tool must print 0
  // rather than silently falling through to the raw cell.
  const v = await cell(
    quoteWith({ tool_cost_effective: 0 }, { tool_cost: 999, tool_cost_src: 'plate' })
  );
  assert.equal(v, 0, 'a source that has disappeared resolves to 0 — the stale 999 must not win');
});
