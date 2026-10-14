// @ts-check
/**
 * 01 Layout sheet — the Print Design block.
 *
 * `parts_in_md` is the operator's "Parts in MD" input on the Layout tab
 * (client CalcLayout.jsx, shown on BOTH the Print and Cut sub-tabs). The
 * exported sheet used it twice implicitly — as the Cut block's "Cut Cav"
 * and inside the "Print Total / Shot" product — but never printed it in
 * the Print block, so an operator reading the workbook could see
 * 8 across and 56 total with nothing saying where the 7 came from.
 *
 * These pin the row, its position (the product below it must stay
 * directly derivable from the two rows above), and its label in all
 * three language modes.
 */

process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';

/** Distinct values so no assertion can pass by coincidence: 8 x 7 = 56. */
const ACROSS = 8;
const IN_MD = 7;

function makeQuote(overrides = {}) {
  return {
    id: 1,
    label: 'LAY-1',
    _version: 1,
    state: {
      rfq_number: 'LAY-1',
      end_cu: 'Layout Test',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.1,
      active_moq_idx: 0,
      sheet_length: 193,
      min_gap_md: 3,
      num_webs: 1,
      web_width_td: 270,
      parts_web_across: ACROSS,
      parts_in_md: IN_MD,
      part_width: 25,
      part_length_md: 25,
      print_part_width: 25,
      print_part_length_md: 25,
      bleed_td_mm: 1,
      bleed_md_mm: 1,
      materials_main: [],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: [],
      ...overrides,
    },
    result: {
      sp: 0.1,
      s_ttl: 0.08,
      rows: { materials_main: [], materials_alt: [], inks: [], processes: [] },
    },
  };
}

/** label (col A, first line) -> { row, value } for every populated row. */
async function readLayout(opts) {
  const out = await exportQuote(makeQuote(opts.state), {
    variant: opts.variant || 'internal',
    lang: opts.lang || 'en',
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  const sheet = wb.getWorksheet('01 Layout');
  assert.ok(sheet, 'expected a "01 Layout" worksheet');
  const byLabel = new Map();
  const order = [];
  sheet.eachRow((row, r) => {
    const raw = row.getCell('A').value;
    if (typeof raw !== 'string' || !raw.trim()) return;
    const label = raw.split('\n')[0].trim();
    byLabel.set(label, { row: r, value: row.getCell('B').value, raw });
    order.push(label);
  });
  return { byLabel, order, sheet };
}

test('Layout: the Print block prints Parts in MD', async () => {
  const { byLabel } = await readLayout({});
  const hit = byLabel.get('Parts in MD');
  assert.ok(hit, `no "Parts in MD" row; labels seen: ${[...byLabel.keys()].join(' | ')}`);
  assert.equal(hit.value, IN_MD);
});

test('Layout: Parts in MD sits between Print Cav Across and Print Total / Shot', async () => {
  // Position is the point: the product below must read as the two rows
  // above it multiplied, with no hidden factor.
  const { byLabel } = await readLayout({});
  const across = byLabel.get('Print Cav Across');
  const inMd = byLabel.get('Parts in MD');
  const total = byLabel.get('Print Total / Shot');
  assert.ok(across && inMd && total, 'all three Print rows must exist');
  assert.equal(inMd.row, across.row + 1, 'Parts in MD must follow Print Cav Across');
  assert.equal(total.row, inMd.row + 1, 'Print Total / Shot must follow Parts in MD');
  assert.equal(across.value * inMd.value, total.value, '8 x 7 must equal the printed 56');
});

test('Layout: Parts in MD is a plain number, not percent-formatted', async () => {
  const { byLabel, sheet } = await readLayout({});
  const cell = sheet.getCell(`B${byLabel.get('Parts in MD').row}`);
  assert.equal(typeof cell.value, 'number');
  assert.ok(!/%/.test(cell.numFmt || ''), `unexpected percent numFmt: ${cell.numFmt}`);
});

test('Layout: Parts in MD renders in Vietnamese and bilingual modes', async () => {
  const vi = await readLayout({ lang: 'vi' });
  assert.ok(
    [...vi.byLabel.keys()].some((k) => /MD/.test(k) && !/^Parts in MD$/.test(k)),
    `expected a Vietnamese label, got: ${[...vi.byLabel.keys()].join(' | ')}`
  );
  const bi = await readLayout({ lang: 'bilingual' });
  const biHit = [...bi.byLabel.values()].find((v) => v.raw.startsWith('Parts in MD'));
  assert.ok(biHit, 'bilingual mode must still lead with the EN label');
  assert.ok(biHit.raw.includes('\n'), 'bilingual label must carry both lines');
  assert.equal(biHit.value, IN_MD);
});

test('Layout: a missing parts_in_md degrades to a dash, like Rotary Cols', async () => {
  // writeKVSection prints the raw number and only falls back to the dash
  // when the value is not finite — so 0 stays 0 (same as its sibling
  // Print Cav Across) and only an absent field dashes out.
  const { byLabel } = await readLayout({ state: { parts_in_md: undefined } });
  const hit = byLabel.get('Parts in MD');
  assert.ok(hit, 'the row must still be present when the operator left it empty');
  assert.equal(hit.value, '—');
});

test('Layout: Parts in MD and Cut Cav never disagree', async () => {
  // Both cells read the SAME state field (parts_in_md); the Layout tab
  // shows that one input on both its Print and Cut sub-tabs. Pinning the
  // equality catches a future edit that repoints one of them elsewhere.
  const { byLabel } = await readLayout({});
  assert.equal(byLabel.get('Parts in MD').value, byLabel.get('Cut Cav').value);
  assert.equal(byLabel.get('Parts in MD').value, IN_MD);
});
