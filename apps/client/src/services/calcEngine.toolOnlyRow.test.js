/**
 * A TOOL-ONLY row: a process with no workcenter that carries a tool.
 *
 * An in-line print+cut press (Brotech, Gallus) runs the plate and the die on
 * one machine, but the two have different costs and tool lives, and a process
 * row carries ONE tool (`tool_cost_src` is a single source). So the press row
 * carries the plate and a second row with no workcenter carries the die —
 * Henry, 2026-09-25: "Brotech với Gallus có trường hợp cả in và cắt
 * all-in-line nhưng plate và cutter có tiền và tool life khác nhau nên cần
 * điền thêm một dòng chỉ tính chi phí tool".
 *
 * Before this, calcProcess returned all zeros for a row without a workcenter,
 * tooling included, so RFQ-2026-S0069's $234.24 Magnetic Rotary die was not in
 * its price while the Lead time & Notice Tooling Cost roll-up still counted it.
 *
 * The rule pinned here: such a row charges its TOOL and nothing else. The
 * machine time is already on the press row, so setup and run stay 0 even when
 * the row carries a speed or setup hours — which is why the fix cannot simply
 * delete the workcenter gate: with `speed > 0` and no machine speed, the
 * manual-labour path would bill the row at the Manual rate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess, calcAll, createStdState } from './calcEngine.js';
import { sumToolingCostStd } from '../modules/cost/tabs/StandardCalc/CalcLeadTimeNotice.helpers.js';

// The Manual rate is present on purpose: it is what a no-workcenter row with a
// speed would be billed at if the gate were removed instead of narrowed.
const LIB = {
  rate: [{ workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' }],
  ddl: { tool_life: {} },
};

// RFQ-2026-S0069, as saved: EAU 200,000 over one year → eauCap 160,000. The
// press row carries 10% scrap, so the quote's yield is 0.9.
const press = {
  workcenter: 'Flexo(1C+ 1Cut Brotech)',
  process_type: 'Print',
  speed: 15,
  layout: 8,
  efficiency: 0.85,
  setup_h: 0.67,
  scrap_pct: 0.1,
  tool_type: 'Pressplate',
  tool_life: 200000,
  tool_cost_src: 'plate',
};
const die = {
  process_type: 'Die_Cut',
  speed: 1,
  layout: 8,
  efficiency: 0.85,
  tool_type: 'Magnetic Rotary',
  tool_life: '200000',
  tool_cost_src: 'cutter-0',
};
const layoutToolCosts = { plate: 25.2072, 'cutter-0': 234.24 };
const MOQ = 20000;
const st = (processes) => ({
  annual_qty: 200000,
  product_lifetime: 1,
  moq: MOQ,
  trade_mode: 'USD(Normal)',
  processes,
});
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

// Derived by hand, not copied from the engine (Lesson 47): one die makes
// 200,000 shots × 8 across × 0.9 yield = 1,440,000 good pieces ≥ 160,000, so
// ONE die is bought, and $234.24 spread over 160,000 pieces is 0.001464/pc.
const DIE_PER_PC = 0.001464;
const PLATE_PER_PC = 25.2072 / 160000;

test('a row with no workcenter charges the tooling of the die it carries', () => {
  const r = calcProcess(die, st([press, die]), MOQ, LIB, { layoutToolCosts });
  close(r.tooling, DIE_PER_PC, 'tooling');
  assert.equal(r.tool_cost_effective, 234.24);
});

test('a tool-only row charges its tool and nothing else — no setup, no run', () => {
  const r = calcProcess({ ...die, setup_h: 1 }, st([press, die]), MOQ, LIB, { layoutToolCosts });
  for (const k of [
    'setup_mach',
    'setup_labor',
    'run_mach',
    'run_labor',
    'extra',
    'uph',
    'total_time',
  ]) {
    assert.equal(r[k], 0, `${k} must stay 0 on a row with no machine of its own`);
  }
  assert.ok(r.tooling > 0);
});

test('a manual tool cost on a tool-only row is charged the same way', () => {
  const manual = { ...die, tool_cost_src: '', tool_cost: 234.24 };
  const r = calcProcess(manual, st([press, manual]), MOQ, LIB, {});
  close(r.tooling, DIE_PER_PC, 'tooling');
});

test('a row with no workcenter and no tool still costs nothing', () => {
  const blank = { process_type: 'Die_Cut', speed: 1, layout: 8 };
  const r = calcProcess(blank, st([press, blank]), MOQ, LIB, { layoutToolCosts });
  for (const k of ['setup_mach', 'setup_labor', 'run_mach', 'run_labor', 'tooling', 'extra']) {
    assert.equal(r[k], 0, k);
  }
});

test("a tool-only row's own scrap does not enter the yield — the press row carries it", () => {
  const scrappy = { ...die, scrap_pct: 0.5 };
  const r = calcProcess(scrappy, st([press, scrappy]), MOQ, LIB, { layoutToolCosts });
  close(r.tooling, DIE_PER_PC, 'tooling');
});

test('S0069 end to end: every tool the Lead time roll-up counts is in the price', () => {
  const s = createStdState();
  Object.assign(s, st([press, die]));
  const res = calcAll(s, [], LIB, undefined, { layoutToolCosts });
  close(res.tooling, PLATE_PER_PC + DIE_PER_PC, 'quote tooling');
  // Each tool here needs exactly one unit, so the roll-up over eauCap IS the
  // charge — the two surfaces #425 said could not disagree, now agreeing.
  close(res.tooling, sumToolingCostStd(s.processes, layoutToolCosts) / 160000, 'roll-up');
});
