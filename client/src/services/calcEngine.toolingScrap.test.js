/**
 * Tooling buys WHOLE tools, and each tool is measured in GOOD pieces.
 *
 * Two corrections landed on 2026-09-18, both from Henry reading the formula:
 *
 *   1. `tool_life × layout` is what a tool can PHYSICALLY make. Scrap comes
 *      out of that, so per GOOD piece it wears proportionally faster — the
 *      same reason run_labor and `extra` divide by the yield. It also puts
 *      both sides of the comparison in one unit, since the cap is
 *      good-piece DEMAND.
 *
 *   2. You cannot buy a third of a die. Needing 1.33 tools means buying 2,
 *      so the count is rounded UP and the whole spend is spread over the
 *      pieces — Henry, 2026-09-18: "làm tròn lên 2 cho tôi rồi phân bổ /
 *      tổng số pcs".
 *
 * One formula now covers both branches:
 *
 *     goodPcs = tool_life × cav × yield
 *     tools   = max(1, ceil(eauCap / goodPcs))
 *     tooling = tool_cost × tools / eauCap
 *
 * A tool that outlasts demand needs 1 tool and lands on `cost / eauCap`,
 * which is exactly the old cap branch — so the 0.8 policy floor Henry set on
 * 2026-06-15 survives untouched rather than being quietly removed.
 *
 * WHICH TOTAL THE COUNT IS TAKEN AGAINST, stated because the two readings
 * differ: the count is `eauCap` (0.8 × EAU), not raw EAU. Counting against
 * raw EAU and dividing by raw EAU would give a long-life tool `cost / EAU`
 * instead of `cost / 0.8EAU` — 20% cheaper — which is the 0.8 safety factor
 * removed by a side effect. Using eauCap for both keeps that decision intact
 * and still rounds up. The two agree on Henry's own example.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess } from './calcEngine.js';

const lib = { rate: [{ wc: 'WC', mach_rate: 0, labor_rate: 0, speed_uom: 'shot/min' }], ddl: {} };

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
const CAP = 100000 * 0.8;

test("Henry's own case: 1.33 tools rounds up to 2, spread over the pieces", () => {
  // cost 660, EAU 20000 → cap 16000; life 5000 × layout 3 = 15000 good pieces.
  // One tool cannot cover the run, so two are bought: 2 × 660 / 16000.
  const s = {
    annual_qty: 20000,
    product_lifetime: 1,
    moq: 1000,
    processes: [
      { workcenter: 'WC', tool_cost: 660, tool_life: 5000, tool_type: 'Stencil', layout: 3 },
    ],
  };
  assert.ok(Math.abs(tooling(s) - (2 * 660) / 16000) < 1e-12);
});

test('a tool that outlasts demand still needs exactly one — the cap branch is unmoved', () => {
  // This is the branch 230 of the 324 live tooling rows sit on, including
  // every row of quote 200. It must read cost/eauCap, as it did before.
  const s = st(0.1, { tool_life: 450000 });
  assert.equal(tooling(s), 1000 / CAP);
});

test('scrap can push the job onto one more tool', () => {
  // No scrap: 20000 good pieces per tool → 80000/20000 = exactly 4 tools.
  assert.ok(Math.abs(tooling(st(0)) - (4 * 1000) / CAP) < 1e-12);
  // 10% scrap: 18000 per tool → 4.44 → 5 tools. The extra die is the whole
  // point; charging 4.44 dies would be charging for one nobody can buy.
  assert.ok(Math.abs(tooling(st(0.1)) - (5 * 1000) / CAP) < 1e-12);
});

test('an exact multiple does not round up — no off-by-one from float noise', () => {
  // 20000 × 2 = 40000 = cap/2 exactly → 2 tools, not 3.
  const s = st(0, { tool_life: 20000, layout: 2 });
  assert.ok(Math.abs(tooling(s) - (2 * 1000) / CAP) < 1e-12);
});

test('one piece short of a multiple buys the next tool', () => {
  // 39999 good pieces → 80000/39999 = 2.00005 → 3 tools.
  const s = st(0, { tool_life: 39999, layout: 1 });
  assert.ok(Math.abs(tooling(s) - (3 * 1000) / CAP) < 1e-12);
});

test('a Jig ignores layout, counts good pieces, and is bought whole too', () => {
  // 10000 × 0.9 = 9000 per jig → 80000/9000 = 8.89 → 9 jigs.
  for (const type of ['Jig', 'Jig& Fixture', 'jigfixture']) {
    const s = st(0.1, { tool_type: type });
    assert.ok(Math.abs(tooling(s) - (9 * 1000) / CAP) < 1e-12, type);
  }
});

test('the spend is always a WHOLE number of tools — the invariant worth having', () => {
  // Whatever the inputs, tooling x eauCap must come back to an integer
  // multiple of the tool price. If it ever does not, somebody has
  // reintroduced fractional dies.
  for (const life of [500, 3000, 7777, 10000, 39999, 450000]) {
    for (const scrap of [0, 0.03, 0.1, 0.25]) {
      const spend = tooling(st(scrap, { tool_life: life })) * CAP;
      const n = spend / 1000;
      assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `life=${life} scrap=${scrap} → ${n} tools`);
      assert.ok(n >= 1, 'at least one tool is always bought');
    }
  }
});

test('a longer-lived tool never costs more per piece', () => {
  let prev = Infinity;
  for (const life of [500, 1000, 5000, 10000, 40000, 100000, 450000]) {
    const v = tooling(st(0.1, { tool_life: life }));
    assert.ok(v <= prev + 1e-12, `life ${life} costs more than the shorter one`);
    prev = v;
  }
});

test('100% scrap cannot divide by zero', () => {
  const v = tooling(st(1));
  assert.ok(Number.isFinite(v) && v > 0, `expected a finite cost, got ${v}`);
});

test('no tool cost → no tooling, whatever the scrap', () => {
  assert.equal(tooling(st(0.5, { tool_cost: 0, tool_cost_src: '' })), 0);
});
