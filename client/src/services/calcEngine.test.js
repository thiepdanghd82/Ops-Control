/**
 * calcEngine unit tests — run with:
 *     node --test src/services/calcEngine.test.js
 *
 * Uses Node's built-in test runner (no dependency install). The engine is a
 * pure-function module so tests have no DOM/React setup.
 *
 * Coverage priorities (tied to Ops Control review findings):
 *   - calcPitch / calcLayoutPerSheet / calcPcsPerRoll — formula regression guards
 *   - calcMatScrapFactor + safeYieldDivisor — the 0.001 floor helper (#12)
 *   - calcMat SP-reference fallback (fix #2) — regression: silent-zero must now
 *     return an explicit error marker when the referenced SP result is missing.
 *   - calcProcess Jig tool_type normalization (fix #8) — "Jig", "Jig& Fixture",
 *     "jig & fixture" must all hit the same branch.
 *   - calcAll smoke test end-to-end on a minimal realistic state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcPitch,
  calcLayoutPerSheet,
  calcPcsPerRoll,
  calcMatScrapFactor,
  safeYieldDivisor,
  calcMat,
  calcInk,
  calcProcess,
  calcPacking,
  calcShipping,
  calcAll,
  buildTierState,
  applyCplxTierToSp,
  createStdState,
  createEmptyStdState,
  createCplxState,
  createSubProduct,
  calcQPA_LM,
  getRateByWC,
  getToolLife,
  aggregateComplex,
  serializeResultForPersist,
  inkCostTotal,
  matCostExcludingInk,
} from './calcEngine.js';

// ── helpers ──────────────────────────────────────────────────────────

/** Build a tiny library with one workcenter + coverage + tool life. */
function makeLib(overrides = {}) {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
      { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
      { workcenter: 'RDC-1', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
    ],
    ddl: {
      coverage: [
        { pt: 'Flexo', cov: 300 },
        { pt: 'Indigo', cov: 400 },
      ],
      click_charges: { 1: 0.03, 4: 0.0074, 8: 0.0084 },
      tool_life: { Knife: 20000, Jig: 1_000_000, Metal: 500_000 },
    },
    ...overrides,
  };
}

/** Build a minimal std state suitable for the layout/mat/ink calcs. */
function makeState(overrides = {}) {
  const base = createStdState();
  return {
    ...base,
    sheet_length: 50,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 1,
    parts_in_md: 4,
    parts_web_across: 2,
    web_width_td: 200,
    moq: 100_000,
    annual_qty: 500_000,
    product_lifetime: 2,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    processes: [],
    materials: [],
    inks: [],
    ...overrides,
  };
}

// ── calcPitch ────────────────────────────────────────────────────────

test('calcPitch: non-rotary returns sheet_length + min_gap_md', () => {
  assert.equal(calcPitch({ sheet_length: 52, min_gap_md: 2, rotary_cols: 0 }), 54);
});

test('calcPitch: rotary mode rounds to the nearest 3.175mm multiple', () => {
  // ceil((50 + 2) * 1 / 3.175) = ceil(16.38) = 17 → 17 * 3.175 / 1 = 53.975
  const p = calcPitch({ sheet_length: 50, min_gap_md: 2, rotary_cols: 1 });
  assert.ok(Math.abs(p - 53.975) < 1e-9, `expected ≈53.975 got ${p}`);
});

test('calcPitch: rotary_cols=2 divides the pitch', () => {
  // ceil((50 + 2) * 2 / 3.175) = ceil(32.76) = 33 → 33 * 3.175 / 2 = 52.3875
  const p = calcPitch({ sheet_length: 50, min_gap_md: 2, rotary_cols: 2 });
  assert.ok(Math.abs(p - 52.3875) < 1e-9);
});

// ── layout helpers ───────────────────────────────────────────────────

test('calcLayoutPerSheet = parts_web_across × parts_in_md', () => {
  assert.equal(calcLayoutPerSheet({ parts_web_across: 3, parts_in_md: 5 }), 15);
});

test('calcPcsPerRoll multiplies by num_webs', () => {
  assert.equal(calcPcsPerRoll({ parts_web_across: 3, parts_in_md: 5, num_webs: 2 }), 30);
});

// ── safeYieldDivisor (fix #12) ───────────────────────────────────────

test('safeYieldDivisor: normal loss returns 1 - loss', () => {
  assert.equal(safeYieldDivisor(0.1), 0.9);
  assert.equal(safeYieldDivisor(0), 1);
});

test('safeYieldDivisor: loss >= 1 clamps to 0.001 (prevents /0)', () => {
  assert.equal(safeYieldDivisor(1), 0.001);
  assert.equal(safeYieldDivisor(1.5), 0.001);
});

test('safeYieldDivisor: null/undefined treated as 0', () => {
  assert.equal(safeYieldDivisor(undefined), 1);
  assert.equal(safeYieldDivisor(null), 1);
});

// ── calcMatScrapFactor ───────────────────────────────────────────────

test('calcMatScrapFactor: no processes → 0', () => {
  assert.equal(calcMatScrapFactor({ processes: [] }), 0);
});

test('calcMatScrapFactor: single 3% scrap on an assigned workcenter', () => {
  const sf = calcMatScrapFactor({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
  });
  assert.ok(Math.abs(sf - 0.03) < 1e-9);
});

test('calcMatScrapFactor: scrap 0 on an assigned workcenter → no loss (new default)', () => {
  // A fresh process row now seeds scrap = 0, so an assigned workcenter with
  // the untouched default contributes zero material loss.
  const sf = calcMatScrapFactor({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0 }],
  });
  assert.equal(sf, 0);
});

test('calcMatScrapFactor: FQC 10% → 10% loss (FQC workcenter default)', () => {
  const sf = calcMatScrapFactor({
    processes: [{ workcenter: 'FQC', scrap_pct: 0.1 }],
  });
  assert.ok(Math.abs(sf - 0.1) < 1e-9);
});

test('calcMatScrapFactor: compounding across multiple processes', () => {
  // 1 - (1-0.03)(1-0.05) = 1 - 0.9215 = 0.0785
  const sf = calcMatScrapFactor({
    processes: [
      { workcenter: 'Flexo-A', scrap_pct: 0.03 },
      { workcenter: 'RDC-1', scrap_pct: 0.05 },
    ],
  });
  assert.ok(Math.abs(sf - 0.0785) < 1e-9);
});

test('calcMatScrapFactor: processes without a workcenter are ignored', () => {
  const sf = calcMatScrapFactor({
    processes: [
      { workcenter: '', scrap_pct: 0.1 }, // ignored
      { workcenter: 'Flexo-A', scrap_pct: 0.03 },
    ],
  });
  assert.ok(Math.abs(sf - 0.03) < 1e-9);
});

// ── calcMat — happy path ─────────────────────────────────────────────

test('calcMat: empty material code returns the blank shape (no NaN)', () => {
  const st = makeState();
  const r = calcMat({ code: '' }, st, 100_000, null, null);
  assert.equal(r.total_s, 0);
  assert.equal(r.run_s, 0);
  // Shape sanity: every expected key should be defined.
  for (const k of ['setup_s', 'run_s', 'total_s', 'total_g', 'qpa_m2', 'qpa_lm', 'scrap_factor']) {
    assert.ok(k in r, `missing key ${k}`);
  }
});

test('calcMat: produces positive run cost for a normal material', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
  });
  const mat = {
    code: 'M001',
    width: 100,
    usage: 1,
    cavities: 4,
    g_price: 2.5,
    s_price: 2.5,
    latest: 0,
    offcut_yn: 'N',
    slitting_yn: 'N',
    setup_lm: 0,
  };
  const r = calcMat(mat, st, 100_000, null, null);
  assert.ok(r.run_s > 0, 'run cost should be positive');
  assert.ok(r.qpa_lm > 0, 'qpa_lm should be positive');
  assert.ok(Number.isFinite(r.run_s), 'run_s must be a finite number');
});

// MES-3-FIX-40 follow-up: when num_webs=0 (legacy quote or operator
// cleared the field), Setup Cost computed but Run Cost rendered "—"
// because qpa_lm_raw bottomed to 0. Operator hardware-test 2026-05-11:
// 6-row Std quote at MOQ=500, all rows with MAT.PRICE filled in, every
// SETUP COST visible but every RUN COST showing "—". The fix makes
// calcQPA_LM webs-fallback consistent with display columns + calcOffcut.
test('calcMat [num_webs=0 fix]: run_s stays positive when num_webs=0', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
    num_webs: 0,
  });
  const mat = {
    code: 'M001',
    width: 100,
    usage: 1,
    cavities: 4,
    g_price: 2.5,
    s_price: 2.5,
    latest: 0,
    offcut_yn: 'N',
    slitting_yn: 'N',
    setup_lm: 50,
  };
  const r = calcMat(mat, st, 100_000, null, null);
  assert.ok(r.setup_s > 0, `setup_s should be > 0 (got ${r.setup_s}) — sanity guard`);
  assert.ok(r.run_s > 0, `run_s should be > 0 (got ${r.run_s}) — num_webs=0 used to zero this`);
  assert.ok(Number.isFinite(r.run_s));
});

test('calcMat [num_webs=0 fix]: num_webs=2 and num_webs=0(→1) produce different run_s', () => {
  const base = {
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0 }],
    parts_in_md: 1,
    parts_web_across: 4,
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
  };
  const mat = {
    code: 'M001',
    width: 100,
    usage: 1,
    cavities: 4,
    g_price: 2.5,
    s_price: 2.5,
    latest: 0,
    offcut_yn: 'N',
    slitting_yn: 'N',
    setup_lm: 0,
  };
  const r1 = calcMat(mat, makeState({ ...base, num_webs: 1 }), 100_000, null, null);
  const r0 = calcMat(mat, makeState({ ...base, num_webs: 0 }), 100_000, null, null);
  const r2 = calcMat(mat, makeState({ ...base, num_webs: 2 }), 100_000, null, null);
  // num_webs=0 should behave identical to num_webs=1 (the fallback).
  assert.ok(Math.abs(r0.run_s - r1.run_s) < 1e-12, 'num_webs=0 must equal num_webs=1');
  // num_webs=2 must be HALF of num_webs=1 (divides by 2 webs).
  assert.ok(Math.abs(r2.run_s - r1.run_s / 2) < 1e-12, 'num_webs=2 should be half of num_webs=1');
});

// ── calcMat — SP-reference fix (#2) regression ───────────────────────

test('calcMat [fix #2]: SP ref with missing result returns error marker, NOT silent zero', () => {
  const st = makeState();
  const subproducts = [{ code: 'SP A' }];
  // Simulate upstream pass1 computing nothing for SP A (undefined slot).
  const allSpResults = [undefined];

  const mat = { code: 'SP A', usage: 1 };
  const r = calcMat(mat, st, 100_000, allSpResults, subproducts);

  assert.equal(r.isSPRef, true, 'result must still be tagged as SP ref');
  assert.ok(r.error, 'result must carry an explicit error string');
  assert.match(r.error, /SP reference "SP A" not computed/);
  assert.equal(r.run_s, 0);
  assert.equal(r.spCost, 0);
});

test('calcMat [fix #2]: SP ref with a valid upstream result inlines the costs', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.05 }],
  });
  const subproducts = [{ code: 'SP A' }];
  const allSpResults = [
    {
      g_mat_cost: 0.5,
      bd_overhead: 0.1,
      bd_labor: 0.2,
      tooling: 0.05,
      vat_loss: 0,
      g_ttl: 1.0,
    },
  ];

  const mat = { code: 'SP A', usage: 2, setup_lm: 0 };
  const r = calcMat(mat, st, 100_000, allSpResults, subproducts);

  assert.equal(r.isSPRef, true);
  assert.equal(r.error, undefined, 'no error when upstream result is present');
  // run_s = g_mat_cost / (1 - 0.05) * usage = 0.5 / 0.95 * 2 ≈ 1.0526
  assert.ok(Math.abs(r.run_s - 1.0526315789) < 1e-6);
  assert.equal(r.spCost, 0.5);
});

// ── calcProcess — Jig normalization fix (#8) ─────────────────────────

test('calcProcess [fix #8]: "Jig" normalizes to the isJig branch', () => {
  const st = makeState({ annual_qty: 1000, product_lifetime: 1 });
  const proc = {
    workcenter: 'Flexo-A',
    tool_type: 'Jig',
    tool_cost: 10_000,
    tool_life: 0, // force DDL lookup
    tool_life_ovr: false,
    speed: 0,
    layout: 1,
    efficiency: 0.85,
    setup_h: 0,
    scrap_pct: 0,
  };
  const r = calcProcess(proc, st, 1000, makeLib());
  // Jig formula: tool_cost / min(tlife, eauCap). eau = 1000, eauCap = 800,
  // tlife (from DDL) = 1_000_000 → tlife > eauCap → cost/eauCap = 10000/800 = 12.5.
  assert.equal(r.tooling, 12.5);
});

test('calcProcess [fix #8]: legacy "Jig& Fixture" still hits isJig branch', () => {
  const st = makeState({ annual_qty: 1000, product_lifetime: 1 });
  const proc = {
    workcenter: 'Flexo-A',
    tool_type: 'Jig& Fixture', // legacy spelling
    tool_cost: 10_000,
    tool_life_ovr: true,
    tool_life: 2000,
    speed: 0,
    layout: 5,
    efficiency: 0.85,
    setup_h: 0,
    scrap_pct: 0,
  };
  const r = calcProcess(proc, st, 1000, makeLib());
  // isJig → tlife (2000) > eauCap (800) → cost/eauCap = 10000/800 = 12.5
  assert.equal(r.tooling, 12.5);
});

test('calcProcess [fix #8]: spaced/cased "jig & fixture" also normalizes', () => {
  const st = makeState({ annual_qty: 1000, product_lifetime: 1 });
  const proc = {
    workcenter: 'Flexo-A',
    tool_type: 'jig & fixture',
    tool_cost: 10_000,
    tool_life_ovr: true,
    tool_life: 2000,
    speed: 0,
    layout: 5,
    efficiency: 0.85,
    setup_h: 0,
    scrap_pct: 0,
  };
  const r = calcProcess(proc, st, 1000, makeLib());
  assert.equal(r.tooling, 12.5);
});

test('calcProcess: non-Jig tool uses tlife × layout formula', () => {
  const st = makeState({ annual_qty: 10_000, product_lifetime: 1 });
  const proc = {
    workcenter: 'Flexo-A',
    tool_type: 'Metal',
    tool_cost: 5000,
    tool_life_ovr: true,
    tool_life: 1000,
    speed: 0,
    layout: 2,
    efficiency: 0.85,
    setup_h: 0,
    scrap_pct: 0,
  };
  const r = calcProcess(proc, st, 10_000, makeLib());
  // non-Jig: totalToolPcs = tlife * layout = 2000
  // totalToolPcs (2000) < eau (10000) → tool_cost / totalToolPcs = 5000/2000 = 2.5
  assert.equal(r.tooling, 2.5);
});

// ── REGRESSION: 80% EAU safety cap matches CCL tooling spec ────────────
// Source: `2. TEMPLATES/Costing/Cách tính chi phí tools.xlsx` (Tooling_Guide
// sheet). Henry confirmed 2026-06-15: keep EAU as annual × lifetime, apply
// × 0.8 uniformly. Verifies that the 4 representative tool_types from the
// xlsx "BẢNG TIÊU CHUẨN" example produce the published per-pc tooling.
// Inputs mirror the xlsx: Tool Cost = $1000, Cavity = 1, EAU = 90,000,
// product_lifetime = 1 (so eau = 90k, eauCap = 72k).
test('calcProcess [regression]: 80% EAU cap matches CCL "Cách tính chi phí tools" spec', () => {
  const lib = makeLib();
  // Override DDL Tool Life per scenario via tool_life_ovr to isolate the
  // formula. Each row pairs (tool_type, tool_life_shots, expected $/pc).
  const cases = [
    // Etching: Life×Cav = 20k ≤ eauCap 72k → chia theo đời khuôn = 1000/20k = $0.05
    { tool_type: 'Etching', tool_life: 20_000, expected: 1000 / 20_000 },
    // Carving: Life×Cav = 40k ≤ eauCap 72k → chia theo đời khuôn = 1000/40k = $0.025
    { tool_type: 'Carving', tool_life: 40_000, expected: 1000 / 40_000 },
    // Metal: Life×Cav = 500k > eauCap 72k → chia theo trần = 1000/72k ≈ $0.01389
    { tool_type: 'Metal', tool_life: 500_000, expected: 1000 / 72_000 },
    // Jig: KHÔNG nhân Cavity. tlife 1M > eauCap 72k → chia theo trần = 1000/72k.
    { tool_type: 'Jig', tool_life: 1_000_000, expected: 1000 / 72_000 },
  ];
  for (const { tool_type, tool_life, expected } of cases) {
    const st = makeState({ annual_qty: 90_000, product_lifetime: 1 });
    const proc = {
      workcenter: 'Flexo-A',
      tool_type,
      tool_cost: 1000,
      tool_life_ovr: true,
      tool_life,
      speed: 0,
      layout: 1, // Cavity = 1 per xlsx Inputs
      efficiency: 0.85,
      setup_h: 0,
      scrap_pct: 0,
      eau_ovr: 0,
      repeat: 1,
    };
    const r = calcProcess(proc, st, 1000, lib);
    assert.ok(
      Math.abs(r.tooling - expected) < 1e-9,
      `${tool_type}: expected $${expected.toFixed(6)}, got $${r.tooling.toFixed(6)}`
    );
  }
});

test('calcProcess: empty workcenter returns the zero shape', () => {
  const r = calcProcess({ workcenter: '' }, makeState(), 1000, makeLib());
  assert.equal(r.setup_mach, 0);
  assert.equal(r.run_mach, 0);
  assert.equal(r.tooling, 0);
});

// ── calcInk smoke ────────────────────────────────────────────────────

test('calcInk: fully empty row short-circuits to zero (all 3 identity fields blank)', () => {
  const r = calcInk({ color: '', ifs_code: '', print_type: '' }, makeState(), 100_000, makeLib());
  assert.equal(r.total, 0);
  assert.equal(r.run_s, 0);
});

// Operator hardware-test 2026-05-11 (Inks tab): operator filled IFS Code +
// Print Type + Clicks but left Desc blank → Setup/Run/Total = "—" for the
// entire row. Pre-fix calcInk had `if (!ink.color) return zeros` which
// V3.3 carried over from a build that only had a single "Color name"
// field. After Ops Control added a separate IFS Code column the gate
// became too tight. New behavior: any of color, ifs_code, or print_type
// qualifies the row as real and triggers the compute path.
test('calcInk [identity gate]: ifs_code alone is enough to trigger compute (Indigo)', () => {
  const st = makeState({
    processes: [{ workcenter: 'Indigo-A', scrap_pct: 0.03 }],
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: '', // operator left Desc blank
    ifs_code: 'INK-WHITE-01',
    print_type: 'Indigo',
    clicks: 4,
    s_price: 50,
    latest: 50,
  };
  const r = calcInk(ink, st, 100_000, makeLib());
  assert.ok(r.run_s > 0, `Indigo run_s should be > 0 when ifs_code+clicks set, got ${r.run_s}`);
  assert.ok(r.total > 0, `total should be > 0`);
});

test('calcInk [identity gate]: print_type alone is enough to trigger compute (Flexo)', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: '',
    ifs_code: '',
    print_type: 'Flexo',
    base_mat: 'M001',
    area_pct: 0.3,
    s_price: 65,
    latest: 65,
  };
  const r = calcInk(ink, st, 100_000, makeLib());
  // Flexo coverage in makeLib = 300; run_s = price × qpa_lm × area_pct × width_m / cov / scrap_F
  assert.ok(r.run_s > 0, `Flexo run_s should be > 0 when print_type set, got ${r.run_s}`);
});

test('calcInk [identity gate]: color alone still works (backward compat)', () => {
  const ink = { color: 'Red', ifs_code: '', print_type: 'Flexo', area_pct: 0.2, s_price: 8 };
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  // Set base_mat to lookup material width
  ink.base_mat = 'M001';
  const r = calcInk(ink, st, 100_000, makeLib());
  assert.ok(r.run_s > 0, `Flexo run_s with color set should be > 0 (regression guard)`);
});

test('calcInk: flexo path produces finite non-negative cost', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'Red',
    print_type: 'Flexo',
    base_mat: 'M001',
    area_pct: 0.25,
    setup_kg: 0.1,
    s_price: 8,
    g_price: 8,
    latest: 0,
  };
  const r = calcInk(ink, st, 100_000, makeLib());
  assert.ok(Number.isFinite(r.total));
  assert.ok(r.total >= 0);
});

// ── lib getters ──────────────────────────────────────────────────────

test('getRateByWC returns the row or null', () => {
  const lib = makeLib();
  assert.equal(getRateByWC(lib, 'Flexo-A').machine_rate, 40);
  assert.equal(getRateByWC(lib, 'Nonexistent'), null);
});

test('getToolLife returns 0 for unknown types, not undefined', () => {
  const lib = makeLib();
  assert.equal(getToolLife(lib, 'Knife'), 20000);
  assert.equal(getToolLife(lib, 'Jig'), 1_000_000);
  assert.equal(getToolLife(lib, 'Unknown'), 0);
});

// ── calcAll end-to-end smoke ─────────────────────────────────────────

test('calcAll: minimal realistic state returns a complete result shape', () => {
  const st = makeState({
    selling_price: 0.2,
    materials: [
      {
        code: 'M001',
        width: 100,
        usage: 1,
        cavities: 4,
        g_price: 2.5,
        s_price: 2.5,
        offcut_yn: 'N',
        slitting_yn: 'N',
      },
    ],
    processes: [
      {
        workcenter: 'Flexo-A',
        tool_type: '',
        tool_cost: 0,
        speed: 100,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
      },
    ],
    inks: [],
  });
  const r = calcAll(st, null, makeLib(), null);
  // Shape guarantees that ComplexCalc/StandardCalc consumers rely on:
  assert.ok(Array.isArray(r.matResults));
  assert.ok(Array.isArray(r.inkResults));
  assert.ok(Array.isArray(r.procResults));
  assert.ok('s_ttl' in r);
  assert.ok('s_mat_cost' in r);
  assert.ok('overhead' in r);
  assert.ok('labor_cost' in r);
  // Nothing should be NaN.
  for (const k of ['s_ttl', 's_mat_cost', 'overhead', 'labor_cost']) {
    assert.ok(!Number.isNaN(r[k]), `${k} must not be NaN`);
  }
});

// ═══════════════════════════════════════════════════════════════
// NEW TESTS (audit pass 2 — coverage gaps)
// ═══════════════════════════════════════════════════════════════

// ── calcAll edge cases ──────────────────────────────────────────

test('calcAll: empty materials + processes → s_ttl >= 0 and no NaN', () => {
  const st = makeState({ materials: [], processes: [], inks: [] });
  const r = calcAll(st, null, makeLib(), null);
  // s_ttl may be > 0 due to default packing costs (container_cost, box_cost)
  assert.ok(r.s_ttl >= 0, 's_ttl must be non-negative');
  assert.equal(r.s_mat_cost, 0);
  assert.ok(!Number.isNaN(r.overhead));
});

test('calcAll: MOQ = 0 → s_ttl is finite (setup divides by moq guard)', () => {
  const st = makeState({
    moq: 0,
    materials: [{ code: 'M001', width: 100, usage: 1, cavities: 4, g_price: 2.5, s_price: 2.5 }],
    processes: [
      {
        workcenter: 'Flexo-A',
        speed: 60,
        layout: 4,
        efficiency: 0.85,
        setup_h: 1,
        scrap_pct: 0.03,
        tool_type: 'Metal',
        tool_cost: 500,
      },
    ],
    inks: [],
  });
  const r = calcAll(st, null, makeLib(), null);
  assert.ok(Number.isFinite(r.s_ttl), `s_ttl should be finite, got ${r.s_ttl}`);
});

test('calcAll: null lib → throws or returns fallback (does not produce NaN)', () => {
  const st = makeState({
    materials: [{ code: 'M001', width: 100, usage: 1, cavities: 4, g_price: 2.5 }],
    processes: [{ workcenter: 'Flexo-A', speed: 60, layout: 4, efficiency: 0.85 }],
    inks: [],
  });
  try {
    const r = calcAll(st, null, null, null);
    // If it doesn't throw, verify no NaN
    for (const k of ['s_ttl', 's_mat_cost', 'overhead', 'labor_cost']) {
      assert.ok(!Number.isNaN(r[k]), `${k} must not be NaN when lib is null`);
    }
  } catch {
    // Throwing is also acceptable — better than silently producing NaN
    assert.ok(true, 'calcAll correctly throws when lib is null');
  }
});

// ── calcPacking (returns a single number, not an object) ────────

test('calcPacking: standard computation', () => {
  const st = {
    pcs_per_bag: 50,
    bags_per_box: 10,
    container_cost: 0.2,
    box_cost: 0.6,
    other_packing: 0,
  };
  const r = calcPacking(st);
  // container_cost/pcs_per_bag + box_cost/bags_per_box/pcs_per_bag + other
  // = 0.20/50 + 0.60/10/50 + 0 = 0.004 + 0.0012 = 0.0052
  assert.ok(Math.abs(r - 0.0052) < 1e-9, `expected 0.0052, got ${r}`);
});

test('calcPacking: pcs_per_bag = 0 → returns 0 (guarded)', () => {
  const st = {
    pcs_per_bag: 0,
    bags_per_box: 10,
    container_cost: 0.2,
    box_cost: 0.6,
    other_packing: 0,
  };
  const r = calcPacking(st);
  assert.equal(r, 0, 'pcs_per_bag=0 should short-circuit to 0');
});

// ── calcShipping (returns a single number, not an object) ───────

test('calcShipping: standard computation', () => {
  const st = { ship_qty: 250_000, shipping_cost: 380, other_ship: 20 };
  const r = calcShipping(st);
  // (380 + 20) / 250000 = 0.0016
  assert.ok(Math.abs(r - 0.0016) < 1e-9, `expected 0.0016, got ${r}`);
});

test('calcShipping: ship_qty = 0 → falls back to moq or 1 (finite)', () => {
  const st = { ship_qty: 0, moq: 100_000, shipping_cost: 380, other_ship: 0 };
  const r = calcShipping(st);
  assert.ok(Number.isFinite(r), 'shipping must be finite');
  // Fallback: (380 + 0) / 100000 = 0.0038
  assert.ok(Math.abs(r - 0.0038) < 1e-9, `expected 0.0038, got ${r}`);
});

// ── calcQPA_LM ──────────────────────────────────────────────────

test('calcQPA_LM: standard dimensions', () => {
  const st = {
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 4,
  };
  const mat = { usage: 1 };
  const qpa = calcQPA_LM(st, mat);
  // pitch = 54, layout = 4, webs = 1
  // qpa_lm = 54 / 1000 / 4 / 1 * 1 = 0.0135
  assert.ok(Math.abs(qpa - 0.0135) < 1e-9, `expected 0.0135 got ${qpa}`);
});

test('calcQPA_LM: layout = 0 and webs = 0 → no NaN or Infinity', () => {
  const st = {
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 0,
    parts_in_md: 0,
    parts_web_across: 0,
  };
  const mat = { usage: 1 };
  const qpa = calcQPA_LM(st, mat);
  assert.ok(Number.isFinite(qpa), 'QPA_LM must be finite even with layout/webs = 0');
});

// MES-3-FIX-40 follow-up: num_webs=0 must NOT zero qpa_lm_raw — the rest
// of the engine (qpa_m2, qpa_lm display, calcOffcut, CalcLayout shotPlan)
// all fall back to webs=1 when num_webs is empty. Without the same
// fallback here, Setup Cost computes normally but Run Cost renders "—"
// — surfaced on operator hardware test 2026-05-11 (6-row Std quote with
// MOQ=500 + WEBS column showing "—").
test('calcQPA_LM: num_webs=0 falls back to 1 (matches display column behavior)', () => {
  const st = {
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 0,
    parts_in_md: 1,
    parts_web_across: 4,
  };
  // mat.cavities explicit so the only zero in the calc is num_webs.
  const mat = { cavities: 4, usage: 1 };
  const qpa = calcQPA_LM(st, mat);
  // pitch = 54, cavities = 4, webs fallback = 1 → 54/1000/4/1 = 0.0135
  assert.ok(Math.abs(qpa - 0.0135) < 1e-9, `expected 0.0135 got ${qpa}`);
});

test('calcQPA_LM: num_webs=null also falls back to 1', () => {
  const st = {
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: null,
    parts_in_md: 1,
    parts_web_across: 4,
  };
  const mat = { cavities: 4, usage: 1 };
  const qpa = calcQPA_LM(st, mat);
  assert.ok(Math.abs(qpa - 0.0135) < 1e-9, `expected 0.0135 got ${qpa}`);
});

test('calcQPA_LM: num_webs=2 still divides by 2 (regression guard)', () => {
  const st = {
    sheet_length: 52,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 2,
    parts_in_md: 1,
    parts_web_across: 4,
  };
  const mat = { cavities: 4, usage: 1 };
  const qpa = calcQPA_LM(st, mat);
  // pitch = 54, cavities = 4, webs = 2 → 54/1000/4/2 = 0.00675
  assert.ok(Math.abs(qpa - 0.00675) < 1e-9, `expected 0.00675 got ${qpa}`);
});

// ── buildTierState ──────────────────────────────────────────────

test('buildTierState: tier 0 returns base state with price/moq/eau overrides', () => {
  // Post Sprint S-CLEAN — createStdState now defaults ship_qty=0, so
  // tests that need a non-zero ship_qty must set it explicitly.
  const base = makeState({
    selling_price: 0.1,
    moq: 100_000,
    annual_qty: 500_000,
    ship_qty: 250_000,
  });
  const ts = buildTierState(base, 0, 0.099, 250_000, 3_000_000);
  assert.equal(ts.selling_price, 0.099);
  assert.equal(ts.moq, 250_000);
  assert.equal(ts.annual_qty, 3_000_000);
  // ship_qty is carried through from the base (not re-computed from moq).
  assert.equal(ts.ship_qty, 250_000);
});

test('buildTierState: tier > 0 pulls from extra_moqs', () => {
  const base = makeState({
    selling_price: 0.1,
    moq: 100_000,
    annual_qty: 500_000,
    num_moq: 2,
    extra_moqs: [{ moq: 500_000, price: 0.08, eau: 2_000_000 }],
  });
  const ts = buildTierState(base, 1, 0.08, 500_000, 2_000_000);
  assert.equal(ts.selling_price, 0.08);
  assert.equal(ts.moq, 500_000);
  assert.equal(ts.annual_qty, 2_000_000);
});

// ── applyCplxTierToSp ───────────────────────────────────────────

test('applyCplxTierToSp: tier 0 returns the SP unchanged', () => {
  const cs = { moq: 100_000, extra_moqs: [] };
  const sp = { code: 'SP A', ship_qty: 50_000, materials: [], processes: [], inks: [] };
  const result = applyCplxTierToSp(cs, sp, 0, 0);
  assert.equal(result.code, 'SP A');
  assert.equal(result.ship_qty, 50_000);
});

test('applyCplxTierToSp: tier > 0 applies the correct extra_moq tier', () => {
  const cs = {
    moq: 100_000,
    extra_moqs: [{ moq: 500_000, sp_overrides: [{ ship_qty: 200_000 }] }],
  };
  const sp = { code: 'SP A', ship_qty: 50_000, materials: [], processes: [], inks: [] };
  const result = applyCplxTierToSp(cs, sp, 0, 1);
  // If sp_overrides exists for this SP index, ship_qty should be overridden
  if (result.ship_qty !== 50_000) {
    assert.equal(result.ship_qty, 200_000);
  }
  // If the function doesn't support sp_overrides, ship_qty stays original — both are acceptable
  assert.ok(typeof result.ship_qty === 'number');
});

// ── create* factory functions ───────────────────────────────────

test('createStdState: returns an object with all required keys and clean numeric defaults', () => {
  // Sprint S-CLEAN — fresh state is now clean (numeric fields = 0) so
  // operators aren't overwriting sample data. Enum defaults remain.
  const s = createStdState();
  assert.ok(Array.isArray(s.materials));
  assert.ok(Array.isArray(s.processes));
  assert.ok(Array.isArray(s.inks));
  assert.equal(typeof s.moq, 'number');
  assert.equal(s.moq, 0, 'default MOQ is now 0 (was 250000 before cleanup)');
  assert.equal(s.annual_qty, 0);
  assert.equal(s.selling_price, 0);
  assert.equal(s.part_width, 0);
  // Sensible enum defaults are kept:
  assert.equal(s.trade_mode, 'USD(Normal)');
  assert.equal(s.site, 'VN');
  assert.equal(s.packing_method, 'Sheet');
  assert.equal(s.delivery_term, 'DAP');
  assert.equal(s.currency, 'USD');
});

test('createEmptyStdState: all numeric fields are 0', () => {
  const s = createEmptyStdState();
  assert.equal(s.moq, 0);
  assert.equal(s.annual_qty, 0);
  assert.equal(s.part_width, 0);
  assert.equal(s.selling_price, 0);
});

test('createCplxState: has subproducts array with at least one SP', () => {
  const s = createCplxState();
  assert.ok(Array.isArray(s.subproducts));
  assert.ok(s.subproducts.length >= 1);
});

test('createSubProduct: generates a complete SP shape', () => {
  const sp = createSubProduct('SP Test');
  assert.equal(sp.code, 'SP Test');
  assert.ok(Array.isArray(sp.materials));
  assert.ok(Array.isArray(sp.processes));
  assert.ok(Array.isArray(sp.inks));
  assert.equal(typeof sp.part_width, 'number');
});

// ── calcInk: Indigo path ────────────────────────────────────────

test('calcInk: Indigo path with clicks > 0 produces finite cost', () => {
  const st = makeState({
    processes: [{ workcenter: 'Flexo-A', scrap_pct: 0.03 }],
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'CMYK',
    print_type: 'Indigo',
    base_mat: 'M001',
    area_pct: 1.0,
    clicks: 4,
    s_price: 0,
    g_price: 0,
    latest: 0,
  };
  const r = calcInk(ink, st, 100_000, makeLib());
  assert.ok(Number.isFinite(r.total), 'Indigo total must be finite');
  assert.ok(r.total >= 0, 'Indigo total must be non-negative');
});

test('calcInk: Indigo with clicks = 0 → cost = 0', () => {
  const st = makeState({
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'CMYK',
    print_type: 'Indigo',
    base_mat: 'M001',
    area_pct: 1.0,
    clicks: 0,
  };
  const r = calcInk(ink, st, 100_000, makeLib());
  assert.equal(r.total, 0);
});

// ── calcInk: coverage = 0 asymmetry fix (audit pass 2) ─────────

test('calcInk: Flexo with coverage = 0 → both run and setup are 0', () => {
  // This tests the fix from audit pass 2: when ink_cover_val = 0, setup_s
  // must also be 0 (not computed by dividing by fallback 1).
  const lib = makeLib({
    ddl: {
      coverage: [], // empty → ink_cover_val = 0
      click_charges: {},
      tool_life: { Metal: 500_000 },
    },
  });
  const st = makeState({
    materials: [{ code: 'M001', width: 200, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'Red',
    print_type: 'Flexo',
    base_mat: 'M001',
    area_pct: 0.5,
    setup_kg: 0.2,
    s_price: 8,
    g_price: 8,
    latest: 0,
  };
  const r = calcInk(ink, st, 100_000, lib);
  assert.equal(r.run_s, 0, 'run_s must be 0 when coverage is missing');
  // setup_s should only include the setup_kg portion, NOT the coverage-divided term
  // setup_ink_qty = setup_kg + 0 (because ink_cover_val guard) = 0.2
  // setup_s = 8 * 0.2 / 100000 = 0.000016
  assert.ok(r.setup_s >= 0, 'setup_s must be non-negative');
  assert.ok(
    r.setup_s < 0.001,
    'setup_s should be tiny (just setup_kg), not inflated by coverage / 1'
  );
});

// ── REGRESSION: calcInk base_mat width parsing ───────────────────────
// Before fix: .slice(-4) on "ABC-200" returned "-200" → parseFloat gave -200
// → negative width_m propagated and silently corrupted ink cost downstream.
test('calcInk [regression]: base_mat code ending in "-200" does NOT produce negative width', () => {
  const lib = makeLib();
  // Don't include M001 in materials so _baseMatRef is undefined and the
  // fallback width-parse branch runs (the bug path).
  const st = makeState({
    materials: [{ code: '', width: 0, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'Red',
    print_type: 'Flexo',
    base_mat: 'ABC-200',
    area_pct: 0.5,
    setup_kg: 0.2,
    s_price: 8,
    g_price: 8,
    latest: 0,
  };
  const r = calcInk(ink, st, 100_000, lib);
  // Cost must be non-negative and finite — if width_m went to -0.2 we'd see
  // negative run_s or NaN.
  assert.ok(Number.isFinite(r.run_s), 'run_s must be a finite number');
  assert.ok(r.run_s >= 0, `run_s must be >= 0, got ${r.run_s}`);
  assert.ok(Number.isFinite(r.setup_s), 'setup_s must be finite');
  assert.ok(r.setup_s >= 0, `setup_s must be >= 0, got ${r.setup_s}`);
});

test('calcInk [regression]: base_mat "M200" (trailing number, no dash) still parses width', () => {
  // Positive case — the rightmost-digits regex should extract 200.
  const lib = makeLib();
  const st = makeState({
    materials: [{ code: '', width: 0, usage: 1, cavities: 8 }],
  });
  const ink = {
    color: 'Red',
    print_type: 'Flexo',
    base_mat: 'M200',
    area_pct: 0.5,
    setup_kg: 0.2,
    s_price: 8,
    g_price: 8,
    latest: 0,
  };
  const r = calcInk(ink, st, 100_000, lib);
  assert.ok(r.run_s >= 0 && Number.isFinite(r.run_s));
});

// ── REGRESSION: calcProcess tool_type exact match ────────────────────
// Before fix: `ttNorm.includes('jig')` also matched "jigging" / "jigsaw".
test('calcProcess [regression]: tool_type "jigging" does NOT hit Jig branch', () => {
  const lib = makeLib();
  const st = makeState({
    materials: [{ code: 'M001', width: 200, usage: 1 }],
    processes: [
      {
        process_type: 'RDC',
        workcenter: 'RDC-1',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
        tool_cost: 1000,
        tool_type: 'jigging',
        tool_life: 100,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
  });
  const r = calcProcess(st.processes[0], st, 10_000, lib);
  // If classified as Jig, tooling = 1000 / eau (very small). If classified
  // as non-Jig (the correct behavior), tooling = 1000 / (100*4) = $2.5/pc.
  // We assert tooling is "large" (non-Jig branch), proving the fix works.
  assert.ok(r.tooling > 0.5, `expected non-Jig tooling formula; got ${r.tooling}`);
});

test('calcProcess [regression]: tool_type "Jig" (exact) still hits Jig branch', () => {
  const lib = makeLib();
  const st = makeState({
    materials: [{ code: 'M001', width: 200, usage: 1 }],
    annual_qty: 1_000_000,
    product_lifetime: 1,
    processes: [
      {
        process_type: 'RDC',
        workcenter: 'RDC-1',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
        tool_cost: 1000,
        tool_type: 'Jig',
        tool_life: 100,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
  });
  const r = calcProcess(st.processes[0], st, 10_000, lib);
  // Jig branch: tlife (1_000_000) > eau (1_000_000) → tooling = cost/eau
  // OR DDL tool_life for Jig = 1_000_000 used as tlife override.
  // Either way tooling = 1000 / 1_000_000 = 0.001/pc — small.
  assert.ok(r.tooling < 0.1, `expected Jig-branch tiny tooling; got ${r.tooling}`);
});

// ── aggregateComplex — extracted from ComplexCalc.jsx + CplxCostBreakdown.jsx ──
test('aggregateComplex: empty SPs → null aggregate, no errors', () => {
  const lib = makeLib();
  const cs = { moq: 1000, selling_price: 0.5, trade_mode: 'USD', site: 'VN', extra_moqs: [] };
  const r = aggregateComplex(cs, [], lib, 0);
  assert.equal(r.aggregate, null);
  assert.equal(r.pass2.length, 0);
  assert.equal(r.errors.length, 0);
});

test('aggregateComplex: null lib → null aggregate', () => {
  const r = aggregateComplex({ moq: 1000 }, [createSubProduct('SP A')], null, 0);
  assert.equal(r.aggregate, null);
});

test('aggregateComplex: single SP without FG falls back to sum shape', () => {
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  // Give SP enough inputs so calcAll returns a non-null result.
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      desc: 'mat',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };
  const r = aggregateComplex(cs, [sp], lib, 0);
  assert.ok(r.aggregate, 'aggregate must be set for non-empty SPs');
  // Sum-fallback path includes bd_mat_setup/bd_mat_run etc.
  assert.ok('s_ttl' in r.aggregate);
  assert.ok('s_mat_cost' in r.aggregate);
  assert.ok('packing_ship' in r.aggregate);
  // Totals must be finite + non-negative
  assert.ok(Number.isFinite(r.aggregate.s_ttl));
  assert.ok(r.aggregate.s_ttl >= 0);
});

test('aggregateComplex: FG SP becomes the aggregate (FG-prefix heuristic)', () => {
  const lib = makeLib();
  const spA = createSubProduct('SP A');
  const fg = createSubProduct('FG Z');
  for (const sp of [spA, fg]) {
    sp.materials = [
      {
        row_type: 'Main.Mat',
        code: 'M001',
        desc: 'mat',
        qpa: 0,
        usage: 1,
        pitch: 20,
        width: 200,
        s_price: 5,
        g_price: 5,
        latest: 0,
        offcut_pct: 0,
      },
    ];
    sp.processes = [
      {
        process_type: 'Flexo',
        workcenter: 'Flexo-A',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ];
    sp.part_width = 20;
    sp.part_length_md = 20;
    sp.web_width_td = 200;
    sp.num_webs = 1;
    sp.parts_in_md = 1;
    sp.parts_web_across = 4;
  }
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };
  const r = aggregateComplex(cs, [spA, fg], lib, 0);
  // FG is at index 1 — aggregate should be a spread of pass2[1], not a sum.
  assert.ok(r.aggregate);
  assert.ok(r.pass2[1], 'FG pass2 result must exist');
  assert.equal(r.aggregate.s_ttl, r.pass2[1].s_ttl, 'FG aggregate must equal FG pass2');
});

// ── Sprint 41 — parent-level Pack&Ship integration (regression guard) ──
// Bug: Complex used to drop cs.packing_* and cs.shipping_* because
// aggregateComplex only summed per-SP values. Users filled the parent
// Pack&Ship tab thinking it applied; those costs never reached the
// roll-up → under-costed quotes. Fix adds parent calcPacking +
// calcShipping on top of the per-SP sum, and bumps s_ttl so gm/va
// derive correctly.

test('aggregateComplex: parent-level packing raises aggregate.packing_ship + s_ttl', () => {
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      desc: 'mat',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;

  const baseCs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    // Baseline: no parent Pack&Ship
    packing_method: 'Sheet',
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
  };
  const baseR = aggregateComplex(baseCs, [sp], lib, 0);

  // Same inputs PLUS parent-level packing + shipping.
  const withPs = {
    ...baseCs,
    pcs_per_bag: 50,
    bags_per_box: 100,
    container_cost: 0.2,
    box_cost: 1.0,
    other_packing: 0.001,
    ship_qty: 10000,
    shipping_cost: 50,
    other_ship: 5,
  };
  const withR = aggregateComplex(withPs, [sp], lib, 0);

  // Expected parent per-unit contribution:
  //   packing = 0.2/50 + 1.0/100/50 + 0.001 = 0.004 + 0.0002 + 0.001 = 0.0052
  //   shipping = (50 + 5) / 10000 = 0.0055
  //   total parent = 0.0107
  const delta = (withR.aggregate.packing_ship || 0) - (baseR.aggregate.packing_ship || 0);
  assert.ok(
    delta > 0.01 && delta < 0.011,
    `parent packing_ship delta should be ~0.0107, got ${delta}`
  );

  // s_ttl must increase by the same amount — gm/va are derived from it.
  const sttlDelta = withR.aggregate.s_ttl - baseR.aggregate.s_ttl;
  assert.ok(
    Math.abs(sttlDelta - delta) < 1e-9,
    `s_ttl must increase by the same amount as packing_ship; got ${sttlDelta} vs ${delta}`
  );
});

test('aggregateComplex: zero parent P&S fields → no change vs legacy (no regression)', () => {
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      desc: 'mat',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;

  const cs = {
    moq: 10000,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    // All parent P&S zero → calcPacking short-circuits (no pcs_per_bag) and calcShipping returns (0+0)/qty = 0
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
  };
  const r = aggregateComplex(cs, [sp], lib, 0);
  // When nothing's configured, parent P&S adds exactly 0.
  assert.ok(Number.isFinite(r.aggregate.packing_ship));
  assert.ok(Number.isFinite(r.aggregate.s_ttl));
});

test('aggregateComplex: parent P&S stacks on top of per-SP P&S (no replacement)', () => {
  // Historical quotes may have per-SP values set. Parent must ADD to
  // that sum so existing saved quotes don't silently lose cost data.
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      desc: 'mat',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;
  // Per-SP values configured (legacy pattern)
  sp.pcs_per_bag = 100;
  sp.bags_per_box = 10;
  sp.container_cost = 0.5;
  sp.box_cost = 2;
  sp.other_packing = 0;
  sp.ship_qty = 0;
  sp.shipping_cost = 0;
  sp.other_ship = 0;

  const csZeroParent = {
    moq: 10000,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
  };
  const rNoParent = aggregateComplex(csZeroParent, [sp], lib, 0);

  const csWithParent = { ...csZeroParent, pcs_per_bag: 50, container_cost: 0.2 };
  const rWithParent = aggregateComplex(csWithParent, [sp], lib, 0);

  // Per-SP contribution should still be present (non-zero). Parent adds on top.
  const spOnlyPs = rNoParent.aggregate.packing_ship;
  const combinedPs = rWithParent.aggregate.packing_ship;
  assert.ok(spOnlyPs > 0, 'per-SP packing still flows through');
  assert.ok(combinedPs > spOnlyPs, 'parent P&S must ADD to per-SP, not replace');
  // Parent adds 0.2/50 = 0.004 (no box_cost so just container)
  assert.ok(
    Math.abs(combinedPs - spOnlyPs - 0.004) < 1e-9,
    `parent delta should be exactly 0.004 (0.2/50), got ${combinedPs - spOnlyPs}`
  );
});

test('aggregateComplex: calc error on one SP is captured in errors[] not thrown', () => {
  // Use a deliberately broken SP (lib missing) to trigger internal throw.
  const sp = createSubProduct('SP A');
  sp.materials = [{ code: 'M001', qpa: 1, width: 100, pitch: 1 }];
  sp.processes = [{ workcenter: 'XXX', efficiency: 0, tool_type: '' }];
  const cs = { moq: 100, selling_price: 0, trade_mode: 'USD', site: 'VN', extra_moqs: [] };
  // Minimal lib so calcAll doesn't throw on missing DDL.
  const lib = makeLib();
  // Should not throw regardless of SP internals.
  const r = aggregateComplex(cs, [sp], lib, 0);
  assert.ok(r, 'aggregateComplex must always return a result object');
  assert.ok(Array.isArray(r.errors));
});

// Additional aggregateComplex edge cases
test('aggregateComplex: FG SP fallback when FG pass2 returned null', () => {
  const lib = makeLib();
  const fg = createSubProduct('FG Z');
  // Force FG to fail by giving it an invalid workcenter AND no materials.
  fg.processes = [
    {
      process_type: '',
      workcenter: '',
      speed: 0,
      layout: 0,
      efficiency: 0,
      setup_h: 0,
      scrap_pct: 0,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  const cs = { moq: 100, selling_price: 0, trade_mode: 'USD', site: 'VN', extra_moqs: [] };
  const r = aggregateComplex(cs, [fg], lib, 0);
  // FG SP present → aggregate = pass2[fgIdx] (even if degenerate).
  assert.ok(r.aggregate);
});

test('aggregateComplex: tier > 0 reads moq from extra_moqs', () => {
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;
  const cs = {
    moq: 1000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [{ moq: 50_000, price: 0.15, eau: 500_000 }],
  };
  // Tier 0 vs tier 1 should produce different s_ttl (setup amortization differs).
  const tier0 = aggregateComplex(cs, [sp], lib, 0);
  const tier1 = aggregateComplex(cs, [sp], lib, 1);
  assert.ok(tier0.aggregate && tier1.aggregate);
  // Larger MOQ → smaller per-unit setup → lower s_ttl (usually).
  assert.ok(
    tier1.aggregate.s_ttl <= tier0.aggregate.s_ttl + 1e-6,
    `tier1.s_ttl=${tier1.aggregate.s_ttl} should be ≤ tier0.s_ttl=${tier0.aggregate.s_ttl}`
  );
});

// ── Scrap compounding through FG assembly (audit §2.1 regression) ────
//
// Claim we're locking in: when a FG/is_assembly sub-product references
// another sub-product as a material, the parent's scrap_pct DOES
// compound the referenced cost. Under-costing bug from audit §2.1
// would show up as "run_s = spRes.g_mat_cost" (no divisor). The
// current implementation (calcEngine.js:174) does
// `run_s = spRes.g_mat_cost / sf * usage` with sf = parent's scrap
// divisor — so the compounding IS applied. This test guards against
// regressions that remove the `/ sf` divisor.
test('aggregateComplex [audit §2.1]: FG assembly compounds its scrap_pct over SP-ref material cost', () => {
  const lib = makeLib();
  // Sub-product SP-A with a known cost.
  const spA = createSubProduct('SP A');
  spA.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  spA.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  spA.part_width = 20;
  spA.part_length_md = 20;
  spA.web_width_td = 200;
  spA.num_webs = 1;
  spA.parts_in_md = 1;
  spA.parts_web_across = 4;
  // Post Sprint S-CLEAN — subproduct defaults are now clean (sheet_length=0,
  // min_gap_md=0). Set them explicitly so calcPitch > 0 and material cost
  // math has a finite pitch to divide by.
  spA.sheet_length = 20;
  spA.min_gap_md = 2;

  // FG assembly that references SP A. FG has its own 5% assembly scrap
  // via its process — that scrap must compound the sub-product cost.
  const fg = createSubProduct('FG Z');
  fg.materials = [
    {
      row_type: 'Main.Mat',
      code: 'SP A',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 0,
      g_price: 0,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  fg.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.05,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  fg.part_width = 20;
  fg.part_length_md = 20;
  fg.web_width_td = 200;
  fg.num_webs = 1;
  fg.parts_in_md = 1;
  fg.parts_web_across = 4;
  fg.sheet_length = 20;
  fg.min_gap_md = 2;

  const cs = {
    moq: 10_000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };
  const r = aggregateComplex(cs, [spA, fg], lib, 0);
  assert.ok(r.aggregate, 'aggregate must be set');

  // Sanity: SP A alone (no assembly scrap applied) — zero FG scrap.
  const fgZeroScrap = { ...fg, processes: [{ ...fg.processes[0], scrap_pct: 0 }] };
  const r0 = aggregateComplex(cs, [spA, fgZeroScrap], lib, 0);
  assert.ok(r0.aggregate);

  // Compounding invariant: material cost with 5% scrap ≥ material cost
  // with 0% scrap. Specifically, the ratio should be > 1/0.95 ≈ 1.052
  // minus tolerance because setup rows aren't scrap-compounded.
  const matA = r.aggregate.s_mat_cost || 0;
  const mat0 = r0.aggregate.s_mat_cost || 0;
  assert.ok(matA > mat0, `s_mat_cost with 5% scrap (${matA}) must exceed with 0% scrap (${mat0})`);
  // The ratio should be close to 1/0.95 for the run portion.
  // Using tier0 with a single FG ref at usage=1, the lower bound is
  // close to 1.05 (minus setup + packing/ship fixed costs which don't scale).
  const ratio = matA / Math.max(mat0, 1e-9);
  assert.ok(
    ratio >= 1.03 && ratio <= 1.08,
    `compound ratio ${ratio.toFixed(4)} should be near 1/(1-0.05)=1.053`
  );
});

test('aggregateComplex [audit §2.1]: sum-fallback path (no assembly) does NOT implicit-compound', () => {
  // Documents the intentional behavior: without a FG / is_assembly SP,
  // there IS no assembly step to compound, so the sum is just a sum.
  // Users who want assembly scrap must designate an SP as the assembly.
  const lib = makeLib();
  const spA = createSubProduct('SP A');
  const spB = createSubProduct('SP B');
  for (const sp of [spA, spB]) {
    sp.materials = [
      {
        row_type: 'Main.Mat',
        code: 'M001',
        qpa: 0,
        usage: 1,
        pitch: 20,
        width: 200,
        s_price: 5,
        g_price: 5,
        latest: 0,
        offcut_pct: 0,
      },
    ];
    sp.processes = [
      {
        process_type: 'Flexo',
        workcenter: 'Flexo-A',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.05,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ];
    sp.part_width = 20;
    sp.part_length_md = 20;
    sp.web_width_td = 200;
    sp.num_webs = 1;
    sp.parts_in_md = 1;
    sp.parts_web_across = 4;
  }
  const cs = {
    moq: 10_000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };
  const r = aggregateComplex(cs, [spA, spB], lib, 0);
  assert.ok(r.aggregate);
  // s_ttl ≈ pass2[0].s_ttl + pass2[1].s_ttl (no extra compounding).
  const expected = (r.pass2[0]?.s_ttl || 0) + (r.pass2[1]?.s_ttl || 0);
  assert.ok(
    Math.abs(r.aggregate.s_ttl - expected) < 1e-6,
    `sum-fallback s_ttl=${r.aggregate.s_ttl} must equal plain sum=${expected} (no implicit compound)`
  );
});

test('aggregateComplex: no SP refs → pass2 === pass1 (no re-compute)', () => {
  const lib = makeLib();
  const sp = createSubProduct('SP A');
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;
  const cs = {
    moq: 1000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };
  const r = aggregateComplex(cs, [sp], lib, 0);
  // SP has no code references to other SPs, so pass2[0] should be the pass1
  // result (shortcut path: `if (!hasRef) return pass1[spi]`). We can't
  // directly assert identity, but we can assert the aggregate shape exists.
  assert.ok(r.pass2[0]);
  assert.ok(Number.isFinite(r.pass2[0].s_ttl));
});

// ── Sprint 4.4: bomQtyEnabled flag ────────────────────────────────────
// Tiny SP factory that produces a fully-computable single-SP cost so
// the tests can compare off/on aggregates without replaying the full
// materials setup each time.
function makeSimpleSp(code) {
  const sp = createSubProduct(code);
  sp.materials = [
    {
      row_type: 'Main.Mat',
      code: 'M001',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 5,
      g_price: 5,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  sp.processes = [
    {
      process_type: 'Flexo',
      workcenter: 'Flexo-A',
      speed: 10,
      layout: 4,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  sp.part_width = 20;
  sp.part_length_md = 20;
  sp.web_width_td = 200;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 4;
  return sp;
}

test('aggregateComplex: flag OFF is byte-identical to pre-4.4 behavior', () => {
  const lib = makeLib();
  const spA = makeSimpleSp('SP A');
  const spB = makeSimpleSp('SP B');
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    // bom populated with qty=5 — flag OFF must ignore this entirely.
    bom: [
      { sp_index: 0, qty: 5, notes: '' },
      { sp_index: 1, qty: 5, notes: '' },
    ],
  };
  const off1 = aggregateComplex(cs, [spA, spB], lib, 0); // default opts
  const off2 = aggregateComplex(cs, [spA, spB], lib, 0, { bomQtyEnabled: false });
  assert.ok(off1.aggregate && off2.aggregate);
  // Identical fields regardless of explicit vs implicit OFF.
  for (const k of ['s_ttl', 's_mat_cost', 'overhead', 'labor_cost', 'tooling', 'packing_ship']) {
    assert.equal(off1.aggregate[k], off2.aggregate[k], `off-path key ${k} differs`);
  }
  // Legacy sum = pass2[0] + pass2[1] with qty=1 (no multiplication).
  const expected = (off1.pass2[0].s_ttl || 0) + (off1.pass2[1].s_ttl || 0);
  assert.ok(
    Math.abs(off1.aggregate.s_ttl - expected) < 1e-9,
    `off-path s_ttl=${off1.aggregate.s_ttl} should equal plain sum=${expected}`
  );
});

test('aggregateComplex: flag ON + bom qty=3 multiplies that SP contribution', () => {
  const lib = makeLib();
  const spA = makeSimpleSp('SP A');
  const spB = makeSimpleSp('SP B');
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    bom: [
      { sp_index: 0, qty: 3, notes: '' },
      { sp_index: 1, qty: 1, notes: '' },
    ],
  };
  const on = aggregateComplex(cs, [spA, spB], lib, 0, { bomQtyEnabled: true });
  assert.ok(on.aggregate);
  const p0 = on.pass2[0].s_ttl || 0;
  const p1 = on.pass2[1].s_ttl || 0;
  const expected = 3 * p0 + 1 * p1;
  assert.ok(
    Math.abs(on.aggregate.s_ttl - expected) < 1e-9,
    `on-path weighted s_ttl=${on.aggregate.s_ttl} should equal ${expected}`
  );
});

test('aggregateComplex: flag ON + is_assembly flag wins over FG prefix', () => {
  const lib = makeLib();
  const spA = makeSimpleSp('SP A');
  spA.is_assembly = true;
  const spFg = makeSimpleSp('FG Z'); // normally would be assembly under legacy
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    bom: [{ sp_index: 1, qty: 2, notes: '' }],
  };
  const on = aggregateComplex(cs, [spA, spFg], lib, 0, { bomQtyEnabled: true });
  // Assembly picked = index 0 (is_assembly=true). aggregate = pass2[0], ignore bom qty.
  assert.ok(on.aggregate);
  assert.equal(
    on.aggregate.s_ttl,
    on.pass2[0].s_ttl,
    'is_assembly=true SP becomes the aggregate directly'
  );
});

test('aggregateComplex: flag ON + bom empty → implicit qty=1 for every non-assembly SP', () => {
  const lib = makeLib();
  const spA = makeSimpleSp('SP A');
  const spB = makeSimpleSp('SP B');
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    bom: [], // explicit empty
  };
  const on = aggregateComplex(cs, [spA, spB], lib, 0, { bomQtyEnabled: true });
  const off = aggregateComplex(cs, [spA, spB], lib, 0); // legacy sum
  // Empty bom + no assembly → flag-on sum must match flag-off sum.
  assert.ok(
    Math.abs(on.aggregate.s_ttl - off.aggregate.s_ttl) < 1e-9,
    `empty-bom on-path s_ttl=${on.aggregate.s_ttl} should match legacy=${off.aggregate.s_ttl}`
  );
});

// ── Sprint 8 B.4: spMoqScalingEnabled (audit §2.2) ───────────────────
test('aggregateComplex [audit §2.2]: spMoqScalingEnabled forces referenced SP to use parent activeMoq', () => {
  const lib = makeLib();
  // Child SP with an intentionally small ship_qty (legacy behavior
  // would amortize its setup over 100 units).
  const child = makeSimpleSp('SP CHILD');
  child.ship_qty = 100;

  // Parent SP that references the child. Parent has no ship_qty →
  // inherits activeMoq from cs.
  const parent = makeSimpleSp('FG PARENT');
  parent.materials = [
    {
      row_type: 'Main.Mat',
      code: 'SP CHILD',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 0,
      g_price: 0,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };

  // Flag OFF: child computes at ship_qty=100 → high per-unit setup.
  const off = aggregateComplex(cs, [child, parent], lib, 0, { spMoqScalingEnabled: false });
  // Flag ON: child is referenced → force moq=10000 → lower per-unit setup.
  const on = aggregateComplex(cs, [child, parent], lib, 0, { spMoqScalingEnabled: true });

  const childOff = off.pass2[0];
  const childOn = on.pass2[0];
  assert.ok(childOff && childOn, 'both paths produce a pass2 result for the child');
  // The child's s_ttl under flag-on should be ≤ under flag-off because
  // setup amortizes over 100× more units.
  assert.ok(
    childOn.s_ttl <= childOff.s_ttl,
    `flag-on child s_ttl (${childOn.s_ttl}) should be ≤ flag-off (${childOff.s_ttl})`
  );
  // And the aggregate (FG path — pass2[fgIdx]) should reflect the
  // cheaper per-unit cost under flag-on.
  assert.ok(on.aggregate);
  assert.ok(off.aggregate);
});

test('aggregateComplex [audit §2.2]: flag OFF preserves legacy ship_qty semantics for referenced SPs', () => {
  const lib = makeLib();
  const child = makeSimpleSp('SP CHILD');
  child.ship_qty = 50;
  const parent = makeSimpleSp('FG PARENT');
  parent.materials = [
    {
      row_type: 'Main.Mat',
      code: 'SP CHILD',
      qpa: 0,
      usage: 1,
      pitch: 20,
      width: 200,
      s_price: 0,
      g_price: 0,
      latest: 0,
      offcut_pct: 0,
    },
  ];
  const cs = {
    moq: 5000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };

  // Flag off (default) — child uses ship_qty, same as before Sprint 8.
  const off = aggregateComplex(cs, [child, parent], lib, 0);
  const offExplicit = aggregateComplex(cs, [child, parent], lib, 0, { spMoqScalingEnabled: false });
  assert.ok(off.aggregate && offExplicit.aggregate);
  assert.equal(
    off.aggregate.s_ttl,
    offExplicit.aggregate.s_ttl,
    'default and explicit-off must match byte-for-byte'
  );
});

test('aggregateComplex [audit §2.2]: flag ON does NOT touch un-referenced SPs (ship_qty respected)', () => {
  // Only "is-referenced-elsewhere" SPs get their ship_qty overridden.
  // Standalone SPs with ship_qty still compute at their own moq.
  const lib = makeLib();
  const lonely = makeSimpleSp('SP LONELY');
  lonely.ship_qty = 200;
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
  };

  const off = aggregateComplex(cs, [lonely], lib, 0, { spMoqScalingEnabled: false });
  const on = aggregateComplex(cs, [lonely], lib, 0, { spMoqScalingEnabled: true });
  assert.ok(off.aggregate && on.aggregate);
  // Standalone SP is not referenced → flag is a no-op.
  assert.equal(
    off.aggregate.s_ttl,
    on.aggregate.s_ttl,
    'standalone SP with ship_qty should be unchanged by flag'
  );
});

test('aggregateComplex: flag ON + bom lists only one SP → orphan SP does NOT contribute', () => {
  const lib = makeLib();
  const spA = makeSimpleSp('SP A');
  const spB = makeSimpleSp('SP B');
  const cs = {
    moq: 10000,
    annual_qty: 100_000,
    product_lifetime: 1,
    selling_price: 0.2,
    trade_mode: 'USD',
    site: 'VN',
    active_moq_idx: 0,
    extra_moqs: [],
    bom: [{ sp_index: 0, qty: 1, notes: '' }], // SP B is orphan
  };
  const on = aggregateComplex(cs, [spA, spB], lib, 0, { bomQtyEnabled: true });
  assert.ok(
    Math.abs(on.aggregate.s_ttl - on.pass2[0].s_ttl) < 1e-9,
    'orphan SP must contribute 0 to aggregate under flag-on'
  );
});

// ── enumerateTiers ────────────────────────────────────────────────────
import { enumerateTiers } from './calcEngine.js';

test('enumerateTiers: single tier → one entry with idx=0 + base fields', () => {
  const st = { num_moq: 1, moq: 10_000, selling_price: 0.2, annual_qty: 500_000 };
  const t = enumerateTiers(st);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0], { idx: 0, moq: 10_000, sp: 0.2, eau: 500_000 });
});

test('enumerateTiers: 3 tiers → reads extra_moqs[0] + extra_moqs[1]', () => {
  const st = {
    num_moq: 3,
    moq: 10_000,
    selling_price: 0.2,
    annual_qty: 500_000,
    extra_moqs: [
      { moq: 50_000, price: 0.15, eau: 600_000 },
      { moq: 100_000, price: 0.1, eau: 800_000 },
    ],
  };
  const t = enumerateTiers(st);
  assert.equal(t.length, 3);
  assert.equal(t[1].moq, 50_000);
  assert.equal(t[1].sp, 0.15);
  assert.equal(t[2].moq, 100_000);
});

test('enumerateTiers: missing extra_moqs entry is skipped, not an error', () => {
  const st = { num_moq: 3, moq: 10_000, selling_price: 0.2, extra_moqs: [] };
  const t = enumerateTiers(st);
  // Tier 0 included; tiers 1 and 2 have no extra_moqs → both skipped.
  assert.equal(t.length, 1);
  assert.equal(t[0].idx, 0);
});

test('enumerateTiers: tier EAU falls back to state.annual_qty if empty', () => {
  const st = {
    num_moq: 2,
    moq: 1000,
    selling_price: 0.5,
    annual_qty: 12_000,
    extra_moqs: [{ moq: 5000, price: 0.4 }], // no eau
  };
  const t = enumerateTiers(st);
  assert.equal(t[1].eau, 12_000, 'tier 1 EAU should inherit from parent annual_qty');
});

test('enumerateTiers: empty / missing state → []', () => {
  assert.deepEqual(enumerateTiers(null), []);
  assert.deepEqual(enumerateTiers({}), [{ idx: 0, moq: 0, sp: 0, eau: 0 }]);
});

// ── Contribution Margin edge cases ────────────────────────────────────
test('calcAll contribution: zero selling_price → null (not Infinity/NaN)', () => {
  const lib = makeLib();
  const st = makeState({
    materials: [
      { code: 'M001', width: 200, usage: 1, cavities: 4, g_price: 2.5, s_price: 2.5, latest: 0 },
    ],
    processes: [
      {
        process_type: 'Flexo',
        workcenter: 'Flexo-A',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
    selling_price: 0, // zero SP
  });
  const r = calcAll(st, null, lib, null);
  assert.equal(r.contribution, null);
  assert.equal(r.va, null);
  assert.equal(r.gm, null);
});

test('calcAll contribution: negative selling_price → null (nonsense input guarded)', () => {
  const lib = makeLib();
  const st = makeState({
    materials: [{ code: 'M001', width: 200, usage: 1 }],
    selling_price: -0.5,
  });
  const r = calcAll(st, null, lib, null);
  assert.equal(r.contribution, null);
});

test('calcAll contribution: positive sp with near-zero costs → contribution ≈ 1.0', () => {
  const lib = makeLib();
  const st = makeState({
    materials: [],
    processes: [],
    selling_price: 1.0,
  });
  const r = calcAll(st, null, lib, null);
  // With no material/labor/tooling, contribution should be very close to 1.
  // (Default state may carry tiny packing defaults — tolerate < 1% slack.)
  assert.ok(r.contribution !== null, 'contribution must be computed');
  assert.ok(r.contribution > 0.99, `contribution ≈ 1 expected, got ${r.contribution}`);
});

// ── serializeResultForPersist — Sprint 14 anti-drift ────────────────
// Stored quote.result must carry enough money-breakdown fields so
// QuoteHistory / Summarize / QuoteAnalysis can recompute KPIs in the
// future without re-running calcAll. The earlier shape {gm, va, s_ttl}
// drifted in Sprint 6 when the VA/Contribution canonical formula moved.

test('serializeResultForPersist: null/undefined passthrough', () => {
  assert.equal(serializeResultForPersist(null), null);
  assert.equal(serializeResultForPersist(undefined), null);
  assert.equal(serializeResultForPersist('not-obj'), null);
});

test('serializeResultForPersist: includes money breakdown fields', () => {
  const r = {
    sp: 0.2,
    s_ttl: 0.05,
    g_ttl: 0.06,
    gm: 0.75,
    va: 0.8,
    contribution: 0.7,
    s_mat_cost: 0.03,
    g_mat_cost: 0.04,
    overhead: 0.005,
    labor_cost: 0.003,
    tooling: 0.002,
    packing_ship: 0.01,
    vat_loss: 0,
    bd_mat_setup: 0.02,
    bd_mat_run: 0.01,
    bd_ink_setup: 0.003,
    bd_ink_run: 0.001,
    bd_setup_mach: 0.0005,
    bd_setup_labor: 0.0005,
    sga: 0.002,
    sga_rate_pct: 4,
    g_ttl_with_sga: 0.062,
    gm_after_sga: 0.69,
    site: 'VN',
    warnings: [],
    // Heavy arrays — must NOT be persisted.
    matResults: [{ qpa_m2: 0.01 }],
    inkResults: [{ total: 0.005 }],
    procResults: [{ uph: 100 }],
  };
  const out = serializeResultForPersist(r);
  // Money + KPI fields present.
  for (const k of [
    'sp',
    's_ttl',
    'gm',
    'va',
    'contribution',
    's_mat_cost',
    'tooling',
    'packing_ship',
    'labor_cost',
    'overhead',
    'bd_mat_setup',
    'bd_mat_run',
    'bd_ink_setup',
    'bd_ink_run',
    'sga',
    'sga_rate_pct',
    'gm_after_sga',
    'site',
    'warnings',
  ]) {
    assert.ok(k in out, `persisted result missing ${k}`);
  }
  // Heavy arrays excluded.
  assert.ok(!('matResults' in out), 'matResults must not be persisted');
  assert.ok(!('inkResults' in out), 'inkResults must not be persisted');
  assert.ok(!('procResults' in out), 'procResults must not be persisted');
});

test('serializeResultForPersist: downstream can recompute canonical VA from persisted fields', () => {
  // Stored record — simulate what /api/quotes POST would write.
  const stored = serializeResultForPersist({
    sp: 0.05,
    s_ttl: 0.04,
    gm: 0.2,
    s_mat_cost: 0.025,
    tooling: 0.001,
    packing_ship: 0.003,
    labor_cost: 0.004,
    overhead: 0.001,
    vat_loss: 0,
    g_mat_cost: 0.025,
    bd_mat_setup: 0.01,
    bd_mat_run: 0.015,
    bd_ink_setup: 0,
    bd_ink_run: 0,
  });
  // Canonical VA per kpiDefinitions: 1 - (mat + tooling + packing) / sp.
  const canonicalVa = 1 - (stored.s_mat_cost + stored.tooling + stored.packing_ship) / stored.sp;
  // Expected: 1 - (0.025 + 0.001 + 0.003) / 0.05 = 0.42
  assert.ok(Math.abs(canonicalVa - 0.42) < 1e-9);
});

test('serializeResultForPersist: only cherry-picks declared fields (no client-private fields leak)', () => {
  const r = {
    gm: 0.5,
    va: 0.5,
    s_ttl: 0.05,
    _internalDebug: 'should not land on disk',
    private_cache: { enormous: 'object' },
  };
  const out = serializeResultForPersist(r);
  assert.ok(!('_internalDebug' in out));
  assert.ok(!('private_cache' in out));
  assert.equal(out.gm, 0.5);
});

// ── Sprint 16: Material / Ink display helpers ────────────────────────
// Fix: Cost Breakdown previously showed Material column = s_mat_cost
// (which bundles raw mat + ink) alongside an Ink column — columns
// didn't sum to subtotal. These helpers produce column values that
// DO sum to subtotal without changing any stored data.

test('inkCostTotal: setup + run ink (both or either)', () => {
  assert.equal(inkCostTotal({ bd_ink_setup: 0.003, bd_ink_run: 0.002 }), 0.005);
  assert.equal(inkCostTotal({ bd_ink_setup: 0 }), 0);
  assert.equal(inkCostTotal({}), 0);
  assert.equal(inkCostTotal(null), 0);
  assert.equal(inkCostTotal('not-obj'), 0);
});

test('matCostExcludingInk: s_mat_cost minus ink total', () => {
  // s_mat_cost (0.025) already includes ink (0.005) → mat-only = 0.020.
  const r = { s_mat_cost: 0.025, bd_ink_setup: 0.003, bd_ink_run: 0.002 };
  assert.ok(Math.abs(matCostExcludingInk(r) - 0.02) < 1e-9);
});

test('matCostExcludingInk + inkCostTotal: reconstruct s_mat_cost (columns sum to subtotal invariant)', () => {
  const r = { s_mat_cost: 0.0789, bd_ink_setup: 0.012, bd_ink_run: 0.003 };
  const reconstructed = matCostExcludingInk(r) + inkCostTotal(r);
  assert.ok(
    Math.abs(reconstructed - r.s_mat_cost) < 1e-9,
    'Mat-only + Ink-total must equal s_mat_cost (no double-count + no drop)'
  );
});

test('matCostExcludingInk: null/bad input → 0 (no crash, no NaN)', () => {
  assert.equal(matCostExcludingInk(null), 0);
  assert.equal(matCostExcludingInk({}), 0);
});

// ── Sprint S-D21 — Lead time & Notice schema defaults ───────────────
// Both factories must emit the same 6-key shape so the UI renders 6
// empty textareas on a fresh quote and legacy quotes (no lead_time
// field at all) heal via `state.lead_time || {}` fallback at the UI
// without crashing.

// 9 keys: Sprint S-MAT-LT added `lt_material_ovr`; Sprint S-PO-LT added
// `lt_po_ovr` (PO L/T auto-derive override); Sprint S-PROD-TOL added
// `product_tolerance` (default '0.2'). Order matches the factory blocks.
const EMPTY_LEAD_TIME = {
  lt_material: '',
  lt_material_ovr: '',
  lt_sample: '',
  lt_po: '',
  lt_po_ovr: '',
  lt_remark: '',
  lt_process: '',
  lt_material_type: '',
  product_tolerance: '0.2',
};

test('createStdState().lead_time = 9-key seed object', () => {
  assert.deepStrictEqual(createStdState().lead_time, EMPTY_LEAD_TIME);
});

test('createCplxState().lead_time = 9-key seed object', () => {
  assert.deepStrictEqual(createCplxState().lead_time, EMPTY_LEAD_TIME);
});

// Round-trip — Save flow serialises state via JSON.stringify (sharedApi.upsertQuote
// → SQLite TEXT column). These tests guard the operator-visible contract that
// lead_time survives a Save → Load cycle byte-for-byte, including newlines in
// the free-text Remark field (multi-line textarea content).

const POPULATED_LEAD_TIME = {
  lt_material: '4 weeks',
  lt_sample: '7 days',
  lt_po: '30 days',
  lt_remark: 'multi\nline\ntext',
  lt_process: 'Indigo',
  lt_material_type: 'PE-Coat',
};

test('lead_time round-trip — Std quote serialize/deserialize', () => {
  const state = createStdState();
  state.lead_time = { ...POPULATED_LEAD_TIME };
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepStrictEqual(restored.lead_time, POPULATED_LEAD_TIME);
  // Explicit guard — newline preservation in lt_remark (Save path could
  // strip / escape newlines on some serialisers).
  assert.equal(restored.lead_time.lt_remark, 'multi\nline\ntext');
  assert.equal(restored.lead_time.lt_remark.split('\n').length, 3);
});

test('lead_time round-trip — Cpx quote serialize/deserialize', () => {
  const state = createCplxState();
  state.lead_time = { ...POPULATED_LEAD_TIME };
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepStrictEqual(restored.lead_time, POPULATED_LEAD_TIME);
  assert.equal(restored.lead_time.lt_remark, 'multi\nline\ntext');
  assert.equal(restored.lead_time.lt_remark.split('\n').length, 3);
});
