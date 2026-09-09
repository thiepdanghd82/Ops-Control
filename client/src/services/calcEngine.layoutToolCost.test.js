/**
 * calcEngine.layoutToolCost.test — money-path for Layout-assigned tool costs.
 *
 * A process row may assign a Layout-computed cost (Plate / Cutter i) to its
 * TOOL COST via proc.tool_cost_src. calcProcess resolves the effective tool
 * cost from options.layoutToolCosts and tooling flows into the quote total.
 * Unassigned rows keep manual tool_cost → golden calcEngine byte-identical.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess, calcAll, createStdState } from './calcEngine.js';

const LIB = {
  rate: [
    { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
    { workcenter: 'FQC', machine_rate: 0, labor_rate: 3.0, crew: 1, speed_uom: '' },
  ],
  ddl: {
    plate_base_cost: { 'Letter Press': 80, 'Film cost': 5 },
    cutter_cost: { 'Knife/Wood': 91 },
    tool_life: {},
  },
};

function makeSt(proc, extra = {}) {
  return {
    processes: [proc],
    sheet_length: 50,
    min_gap_md: 2,
    annual_qty: 100000, // eau = 100000 × 1 → eauCap = 80000
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    ...extra,
  };
}

// tool_life 1000, layout 1 → totalToolPcs 1000 < eauCap → tooling = cost/1000.
const baseProc = {
  workcenter: 'FQC',
  tool_type: 'Knife',
  tool_life: 1000,
  layout: 1,
  tool_cost: 0,
  scrap_pct: 0,
};

// ── calcProcess — assigned source drives tooling ─────────────────────────────

test('assigned Layout source raises tooling = source.cost / tool_life', () => {
  const proc = { ...baseProc, tool_cost_src: 'cutter-0' };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB, {
    layoutToolCosts: { 'cutter-0': 36.4 },
  });
  assert.ok(Math.abs(r.tooling - 36.4 / 1000) < 1e-12, `tooling ${r.tooling}`);
});

test('live sync — flipping the source cost changes tooling proportionally', () => {
  const proc = { ...baseProc, tool_cost_src: 'cutter-0' };
  const a = calcProcess(proc, makeSt(proc), 1000, LIB, { layoutToolCosts: { 'cutter-0': 36.4 } });
  const b = calcProcess(proc, makeSt(proc), 1000, LIB, { layoutToolCosts: { 'cutter-0': 72.8 } });
  assert.ok(Math.abs(b.tooling - 2 * a.tooling) < 1e-12);
});

test('assigned but source GONE → effective 0 → tooling 0 (even with stale tool_cost)', () => {
  const proc = { ...baseProc, tool_cost: 999, tool_cost_src: 'cutter-0' };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB, { layoutToolCosts: {} });
  assert.equal(r.tooling, 0);
});

test('unassigned row → manual tool_cost (BC), map ignored', () => {
  const proc = { ...baseProc, tool_cost: 1000, tool_cost_src: '' };
  const withMap = calcProcess(proc, makeSt(proc), 1000, LIB, {
    layoutToolCosts: { plate: 5, 'cutter-0': 9 },
  });
  const noOpts = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(withMap.tooling, noOpts.tooling);
  assert.ok(Math.abs(withMap.tooling - 1000 / 1000) < 1e-12, `tooling ${withMap.tooling}`);
});

// ── calcAll — builds the map internally from live (st, lib) ───────────────────

test('calcAll builds layoutToolCosts internally: process assigned to plate uses plate cost', () => {
  const st = createStdState();
  // Plate source: Letter Press 80 base, 2 colors, W200×L300, film 5 → 23.056.
  st.pl_print_type = 'Letter Press';
  st.pl_num_colors = 2;
  st.web_width_td = 200;
  st.sheet_length = 300;
  st.pl_film_lp_cost = 5;
  st.annual_qty = 100000;
  st.product_lifetime = 1;
  st.moq = 1000;
  st.processes = [{ ...baseProc, tool_cost_src: 'plate', _mid: 'p1' }];
  const res = calcAll(st, [], LIB, undefined, {});
  // tooling = plateCost(23.056) / tool_life(1000).
  assert.ok(Math.abs(res.tooling - 23.056 / 1000) < 1e-9, `res.tooling ${res.tooling}`);
  assert.ok(Math.abs(res.procResults[0].tooling - 23.056 / 1000) < 1e-9);
});

test('calcAll BC — no tool_cost_src anywhere → identical with/without a bogus map', () => {
  const st = createStdState();
  st.moq = 1000;
  st.annual_qty = 100000; // eauCap 80000 > totalToolPcs → no cap
  st.product_lifetime = 1;
  st.processes = [{ ...baseProc, tool_cost: 500, _mid: 'p1' }]; // manual, unassigned
  const plain = calcAll(st, [], LIB, undefined, {});
  const withBogus = calcAll(st, [], LIB, undefined, {
    layoutToolCosts: { plate: 1, 'cutter-0': 2 },
  });
  assert.equal(plain.tooling, withBogus.tooling);
  assert.ok(Math.abs(plain.tooling - 500 / 1000) < 1e-12, `tooling ${plain.tooling}`);
});

// ── Cpx per-SP: each SP's own plate cost resolves independently ──────────────

test('createStdState process factory seeds tool_cost_src: ""', () => {
  const st = createStdState();
  assert.equal(st.processes[0].tool_cost_src, '');
});
