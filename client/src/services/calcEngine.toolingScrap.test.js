/**
 * Tooling amortises over GOOD pieces, not pieces the tool merely produced.
 *
 * `tool_life x layout` is what a tool can PHYSICALLY make. Scrap comes out of
 * that, so per GOOD piece the tool wears proportionally faster — the same
 * reason `run_labor` and `extra` in this function already divide by the
 * yield. Before this fix they did not agree: tooling counted produced pieces
 * while the cap it was compared against (`eau x 0.8`) counts good-piece
 * demand, so the MIN was choosing between two different units.
 *
 * Measured before shipping, across every live quote: 352 tooling rows, 243
 * already on the cap branch and unaffected, 92 rows whose number moves, by
 * 11–26.5%. Quote 200 (the audited RFQ-2026-S0061) does not move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess } from './calcEngine.js';

const lib = { rate: [{ wc: 'WC', mach_rate: 0, labor_rate: 0, speed_uom: 'shot/min' }], ddl: {} };

/** One process carrying a tool, with `scrap` scrap on the workcentre. */
function st(scrap, over = {}) {
  return {
    annual_qty: 100000,
    product_lifetime: 1,
    moq: 1000,
    processes: [
      {
        workcenter: 'WC',
        scrap_pct: scrap,
        tool_cost: 1000,
        tool_life: 10000,
        tool_type: 'Stencil',
        layout: 2,
        ...over,
      },
    ],
  };
}
const tooling = (s) => calcProcess(s.processes[0], s, lib, s.moq).tooling;

test('no scrap → tool capacity is life x layout, unchanged', () => {
  // 10000 x 2 = 20000 good pieces, below the cap (100000 x 0.8 = 80000).
  assert.equal(tooling(st(0)), 1000 / 20000);
});

test('scrap raises the cost per GOOD piece by exactly 1/yield', () => {
  // 10% scrap → the tool yields 20000 x 0.9 = 18000 good pieces.
  const s = st(0.1);
  assert.ok(Math.abs(tooling(s) - 1000 / 18000) < 1e-12);
  // Which is the no-scrap cost divided by the yield — the same shape
  // run_labor and `extra` use. Deleting the yield term reddens this.
  assert.ok(Math.abs(tooling(s) - tooling(st(0)) / 0.9) < 1e-12);
});

test('the cap branch is untouched — it is a policy floor, not a wear model', () => {
  // life x layout x yield = 900000 x 0.9 = 810000, far above the cap, so the
  // cap wins and scrap must NOT inflate it further. This is the branch 243 of
  // the 352 live rows sit on, including every row of quote 200.
  const s = st(0.1, { tool_life: 450000 });
  assert.equal(tooling(s), 1000 / (100000 * 0.8));
});

test('a Jig still ignores layout, and still counts good pieces', () => {
  // A jig holds the part rather than wearing per shot x cavity (MES-3-FIX
  // era decision), but it holds the scrapped pieces too.
  for (const type of ['Jig', 'Jig& Fixture', 'jigfixture']) {
    const s = st(0.1, { tool_type: type });
    assert.ok(Math.abs(tooling(s) - 1000 / (10000 * 0.9)) < 1e-12, type);
  }
});

test('100% scrap cannot divide by zero', () => {
  // safeYieldDivisor floors the yield at 0.001 rather than letting the
  // capacity collapse to 0 and the cost to Infinity.
  const v = tooling(st(1));
  assert.ok(Number.isFinite(v) && v > 0, `expected a finite cost, got ${v}`);
});

test('no tool cost → no tooling, whatever the scrap', () => {
  assert.equal(tooling(st(0.5, { tool_cost: 0, tool_cost_src: '' })), 0);
});
