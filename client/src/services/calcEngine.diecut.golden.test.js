/**
 * Die-cut tooling golden tests — Phase 1.2 of Debug Playbook
 * (2026-06-20). Mirrors calcEngine.golden.test.js pattern (node:test,
 * locked numeric outputs) but focuses on tooling cost formula across
 * die types + edge cases identified in
 * docs/tests/diecut-coverage-gap.md.
 *
 * Coverage targets the 6 real gaps in the gap doc:
 * - T1  0.8 EAU cap factor explicit pin (Henry 2026-06-15 spec)
 * - T2  Non-Jig formula `tool_cost / (tlife × layout)` within cap
 * - T3  Jig amortization `tool_cost / tlife` ignores layout
 * - T4  Jig spelling variants (Jig / Jig& Fixture / jig / jigfixture)
 * - T5  Production die `Pinacle die` (NPI canonical) reads DDL
 * - T6  Production die `woodie` (NPI canonical) reads DDL
 * - T7  `tool_life_ovr=true` overrides DDL
 * - T8  Unknown die-type fallback (silent 100k× overcharge risk)
 * - T9  Mixed-die Cpx quote (SP-A Pinacle + SP-B Rotary + SP-C Jig)
 * - T10 Lesson 24 magnetic die min gap = 1.5mm (HARD_MIN_GAP_MM)
 *
 *   node --test client/src/services/calcEngine.diecut.golden.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcAll, aggregateComplex, createSubProduct, buildTierState } from './calcEngine.js';
import { DIE_MIN_GAP_MM } from '../modules/cost/tabs/DesignTools/presses/gallusEngine.js';

// ─── Fixtures ────────────────────────────────────────────────────

/**
 * Library covering all 5 production die types from
 * NpiPartsList.jsx:80-84 TOOLING_KEYS + Jig (production-spec).
 * Round numbers chosen so per-unit tooling math stays inspectable
 * by hand without floating-point chasing.
 */
function makeDieCutLib() {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
      { workcenter: 'Die-A', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
    ],
    mat: [{ code: 'PET-80', type: 'face', s_price: 8.0, g_price: 9.0, thickness: 80 }],
    ddl: {
      coverage: [{ pt: 'Flexo', cov: 300 }],
      click_charges: {},
      // CCL production die-type names per NPI Parts canonical spelling
      // (NpiPartsList.jsx TOOLING_KEYS). 'Jig' added separately to test
      // the isJig classification path.
      tool_life: {
        'Pinacle die': 60000,
        'Rotary Die': 100000,
        woodie: 30000,
        Dieset: 80000,
        'NC die': 50000,
        'RDC Die': 100000,
        Jig: 500000,
      },
      print_type_list: ['Flexo'],
    },
    finance: { summary: { sga_rate_pct_by_site: { VN: 5 }, version: 1 } },
    inkCalc: {},
  };
}

/**
 * Minimal Std state for tooling math — strips Print process + Inks
 * to one workcenter so only die-cut tooling drives the tooling field.
 * Overrides parameter lets each test tweak die-type / tool_cost /
 * tool_life / annual_qty / layout without restating the boilerplate.
 */
function makeDieCutStdState(overrides = {}) {
  const proc = overrides.process || {};
  return {
    rfq_number: 'RFQ-DC-001',
    ccl_pn: 'DC-01',
    moq: 50000,
    annual_qty: overrides.annual_qty ?? 500000,
    product_lifetime: overrides.product_lifetime ?? 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.1,
    num_moq: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    part_width: 80,
    part_length_md: 50,
    web_width_td: 82,
    sheet_length: 52,
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    min_gap_md: 2,
    rotary_cols: 0,
    pcs_per_roll: 5000,
    materials: [
      {
        code: 'PET-80',
        width: 82,
        usage: 1,
        setup_lm: 0,
        cavities: 0,
        free_liner: 0,
        pitch_ovr: 0,
        offcut_yn: 'N',
        slitting_yn: 'N',
        df_yn: '',
        offcut_pct: 0,
        s_price: 8.0,
        g_price: 9.0,
        latest: 0,
      },
    ],
    inks: [],
    processes: [
      {
        process_type: 'Die_Cut',
        workcenter: 'Die-A',
        speed: 40,
        layout: proc.layout ?? 1,
        efficiency: 0.85,
        setup_h: 0,
        scrap_pct: 0,
        tool_cost: proc.tool_cost ?? 500,
        tool_type: proc.tool_type ?? 'RDC Die',
        tool_life: proc.tool_life ?? 0,
        tool_life_ovr: proc.tool_life_ovr ?? false,
        manual_uph: 0,
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
    pcs_per_bag: 500,
    bags_per_box: 20,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    shipping_cost: 0,
    other_ship: 0,
    ship_qty: 50000,
  };
}

function runStdTooling(state, lib) {
  const tierSt = buildTierState(state, 0, state.selling_price, state.moq, state.annual_qty);
  const r = calcAll(tierSt, null, lib, null);
  return r.tooling;
}

// ─── T1 — 0.8 EAU cap factor explicit pin ────────────────────────

test('T1 die-cut: 0.8 EAU cap factor is enforced exactly (Henry 2026-06-15 spec)', () => {
  // Scenario engineered to TRIGGER the cap: tlife × layout (1,000,000)
  // > eauCap (40,000). Without the 0.8 factor, eauCap would be 50,000
  // and tooling would be 500 / 50,000 = 0.01 → assertion would fail.
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 50000,
    product_lifetime: 1,
    process: {
      tool_cost: 500,
      tool_type: 'RDC Die',
      tool_life: 1000000, // operator override via tool_life_ovr next
      tool_life_ovr: true,
      layout: 1,
    },
  });

  const tooling = runStdTooling(st, lib);

  // eau = 50,000 × 1 = 50,000
  // eauCap = 50,000 × 0.8 = 40,000
  // totalToolPcs = 1,000,000 × 1 = 1,000,000
  // totalToolPcs > eauCap → cap triggers
  // tooling = 500 / 40,000 = 0.0125 USD/pc
  assert.equal(
    tooling,
    0.0125,
    `0.8 EAU cap factor must be applied exactly. If this changes to 0.9 or 1.0 by accidental refactor, ` +
      `tooling drops/rises silently. Spec: calcEngine.js:645 const eauCap = eau * 0.8;`
  );
});

// ─── T2 — Non-Jig formula within cap ─────────────────────────────

test('T2 die-cut non-Jig: tooling = tool_cost / (tlife × layout) when totalToolPcs ≤ eauCap', () => {
  // No cap path: totalToolPcs (400,000) < eauCap (800,000)
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 1000000,
    product_lifetime: 1,
    process: {
      tool_cost: 1000,
      tool_type: 'Rotary Die', // DDL value 100,000
      layout: 4, // 4-up across — non-Jig multiplies tlife by layout
    },
  });

  const tooling = runStdTooling(st, lib);

  // eau = 1,000,000 → eauCap = 800,000
  // totalToolPcs = 100,000 × 4 = 400,000 ≤ 800,000 → no cap
  // tooling = 1000 / 400,000 = 0.0025 USD/pc
  assert.equal(
    tooling,
    0.0025,
    `Non-Jig formula must amortize over (tlife × layout). If layout multiplier dropped, ` +
      `tooling = 1000/100,000 = 0.01 (4× overcharge). Spec: calcEngine.js:666-667`
  );
});

// ─── T3 — Jig amortization ignores layout cavity multiplier ──────

test('T3 die-cut Jig: tooling = tool_cost / tlife (ignores layout cavity multiplier)', () => {
  // Jig holds the SP physically; does NOT wear per cavity.
  // No cap: tlife (50,000) < eauCap (80,000)
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 100000,
    product_lifetime: 1,
    process: {
      tool_cost: 1000,
      tool_type: 'Jig',
      tool_life: 50000,
      tool_life_ovr: true, // force tlife = 50,000 (override DDL Jig=500,000)
      layout: 4, // Jig path MUST ignore this
    },
  });

  const tooling = runStdTooling(st, lib);

  // eau = 100,000 → eauCap = 80,000
  // Jig path: tlife (50,000) ≤ eauCap (80,000) → no cap
  // tooling = 1000 / 50,000 = 0.02 USD/pc (NOT divided by layout=4)
  assert.equal(
    tooling,
    0.02,
    `Jig formula must NOT multiply by layout. If Jig regresses to non-Jig path, ` +
      `tooling = 1000/(50,000×4) = 0.005 (4× undercharge). Spec: calcEngine.js:662-664`
  );
});

// ─── T4 — Jig spelling variants all classify as Jig ──────────────

test('T4 die-cut Jig spelling: "Jig" / "Jig& Fixture" / "jig" / "JIGFIXTURE" all normalize', () => {
  // The normalization at calcEngine.js:658-661 lowercases + strips
  // whitespace+ampersand, then checks against {jig, jigfixture}.
  // All 4 spellings should produce identical tooling cost.
  const lib = makeDieCutLib();
  const expected = 0.02; // matches T3
  const variants = ['Jig', 'Jig& Fixture', 'jig', 'JIGFIXTURE', 'jig & fixture', 'JIG & FIXTURE'];
  for (const variant of variants) {
    const st = makeDieCutStdState({
      annual_qty: 100000,
      product_lifetime: 1,
      process: {
        tool_cost: 1000,
        tool_type: variant,
        tool_life: 50000,
        tool_life_ovr: true,
        layout: 4,
      },
    });
    const tooling = runStdTooling(st, lib);
    assert.equal(
      tooling,
      expected,
      `Variant "${variant}" must classify as Jig (tooling=${expected}). Got ${tooling}. ` +
        `Spec: calcEngine.js:658-661 ttNorm.replace(/[\\s&]/g,'')`
    );
  }
});

// ─── T5 — Production die "Pinacle die" reads DDL ─────────────────

test('T5 die-cut Pinacle die (NPI canonical spelling) reads tool_life from DDL', () => {
  // Production NPI Parts uses "Pinacle die" (single n). If operator
  // types "Pinnacle Die" (double n, Legend doc spelling), getToolLife
  // returns null and tlife falls back to proc.tool_life || 1.
  // This test pins that the EXACT canonical spelling resolves.
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 100000,
    product_lifetime: 1,
    process: {
      tool_cost: 1200,
      tool_type: 'Pinacle die', // NPI canonical (1n)
      tool_life: 0, // operator left blank — rely on DDL lookup
      tool_life_ovr: false,
      layout: 1,
    },
  });

  const tooling = runStdTooling(st, lib);

  // DDL: 'Pinacle die' → 60,000
  // eau = 100,000 → eauCap = 80,000
  // totalToolPcs = 60,000 × 1 = 60,000 ≤ 80,000 → no cap
  // tooling = 1200 / 60,000 = 0.02 USD/pc
  assert.equal(
    tooling,
    0.02,
    `"Pinacle die" must resolve to DDL value 60,000. If DDL lookup case- or spelling-sensitive ` +
      `mismatch causes fallback to tool_life=1, tooling = 1200/1 = $1200/pc (60,000× overcharge).`
  );
});

// ─── T6 — Production die "woodie" reads DDL ──────────────────────

test('T6 die-cut woodie (NPI canonical lowercase) reads tool_life from DDL', () => {
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 50000,
    product_lifetime: 1,
    process: {
      tool_cost: 300,
      tool_type: 'woodie', // NPI canonical (all-lowercase)
      tool_life: 0,
      tool_life_ovr: false,
      layout: 1,
    },
  });

  const tooling = runStdTooling(st, lib);

  // DDL: 'woodie' → 30,000
  // eau = 50,000 → eauCap = 40,000
  // totalToolPcs = 30,000 × 1 = 30,000 ≤ 40,000 → no cap
  // tooling = 300 / 30,000 = 0.01 USD/pc
  assert.equal(
    tooling,
    0.01,
    `"woodie" (lowercase) must resolve to DDL value 30,000. If a future refactor uppercases ` +
      `the DDL lookup, this falls back to tool_life=1 → 300/1 = $300/pc (30,000× overcharge).`
  );
});

// ─── T7 — tool_life_ovr=true overrides DDL ───────────────────────

test('T7 die-cut tool_life_ovr=true: operator value overrides DDL', () => {
  // proc.tool_type = 'Rotary Die' (DDL: 100,000)
  // proc.tool_life = 50,000 + tool_life_ovr = true
  // → tlife should be 50,000 (override), NOT 100,000 (DDL)
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 100000,
    product_lifetime: 1,
    process: {
      tool_cost: 1000,
      tool_type: 'Rotary Die',
      tool_life: 50000, // override value
      tool_life_ovr: true,
      layout: 1,
    },
  });

  const tooling = runStdTooling(st, lib);

  // tlife = 50,000 (from override, not DDL 100,000)
  // eau = 100,000 → eauCap = 80,000
  // totalToolPcs = 50,000 ≤ 80,000 → no cap
  // tooling = 1000 / 50,000 = 0.02 USD/pc
  // If override flag ignored: 1000 / 100,000 = 0.01 (half)
  assert.equal(
    tooling,
    0.02,
    `tool_life_ovr=true must use proc.tool_life over DDL. ` +
      `If flag silently ignored, tooling = 0.01 instead of 0.02. Spec: calcEngine.js:650-653`
  );
});

// ─── T8 — Unknown die-type silent 100k× overcharge risk ──────────

test('T8 die-cut unknown type: misspelled die_type falls through to tlife=1 → cost explodes', () => {
  // This is the SILENT MISQUOTE catastrophe pattern. Operator types
  // a die_type that does NOT exist in DDL (typo / new variant), the
  // lookup returns undefined, and the formula falls back to
  // `proc.tool_life || 1`. If operator ALSO left tool_life blank,
  // tlife = 1 → die amortizes over 1 piece → tool_cost charged at
  // full to one unit. For a $1200 Pinnacle die, that's $1200/pc.
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 100000,
    product_lifetime: 1,
    process: {
      tool_cost: 1200,
      tool_type: 'pinncle die', // intentional typo — not in DDL
      tool_life: 0,
      tool_life_ovr: false,
      layout: 1,
    },
  });

  const tooling = runStdTooling(st, lib);

  // tlife = getToolLife(lib, 'pinncle die') ?? (0 || 1) = 1
  // eau = 100,000 → eauCap = 80,000
  // totalToolPcs = 1 × 1 = 1 ≤ 80,000 → no cap
  // tooling = 1200 / 1 = 1200 USD/pc !!!
  //
  // This test EXISTS to lock in the catastrophe pattern: if anyone
  // changes the formula to fall back to a more sensible default
  // (e.g. annual_qty), update this test AND remove the fragility.
  // Today the fix is in S-DIE-TYPE-DROPDOWN-VALIDATOR (P2 ticket)
  // restricting tool_type entry to DDL keys only.
  assert.equal(
    tooling,
    1200,
    `Unknown die_type "pinncle die" silently falls through to tlife=1 → $1200/pc overcharge. ` +
      `This test pins the catastrophe pattern so any future change to the fallback default ` +
      `(e.g. tlife = annual_qty) is an explicit refactor. Real fix: DDL-dropdown validator.`
  );
});

// ─── T9 — Mixed-die Cpx quote (3 SPs, 3 die types) ───────────────

test('T9 die-cut mixed Cpx: SP-A Pinacle + SP-B Rotary + SP-C Jig — each independent', () => {
  const lib = makeDieCutLib();
  // aggregateComplex signature is (cs, sps, lib, tierIdx, opts) — the
  // parent cs and sps array are SEPARATE positional args, not nested.
  // Return: { aggregate, pass2, errors } where pass2[i] is the per-SP
  // calcAll result holding .tooling per the calcAll contract.
  const cs = {
    rfq_number: 'RFQ-DC-CPX-001',
    ccl_pn: 'DC-CPX-01',
    moq: 50000,
    annual_qty: 100000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.5,
    num_moq: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    pcs_per_bag: 500,
    bags_per_box: 20,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    shipping_cost: 0,
    other_ship: 0,
    ship_qty: 50000,
  };
  const sps = [
    makeSpWithDie('SP-A', 'Pinacle die', 1200, 1),
    makeSpWithDie('SP-B', 'Rotary Die', 1000, 1),
    makeSpWithDie('SP-C', 'Jig', 800, 1),
  ];

  const result = aggregateComplex(cs, sps, lib);

  // Per-SP expected tooling (eau=100k, eauCap=80k):
  // SP-A Pinacle: tlife=60,000 × layout=1 = 60,000 ≤ 80,000 → no cap → 1200/60,000 = 0.02
  // SP-B Rotary:  tlife=100,000 × layout=1 = 100,000 > 80,000 → cap → 1000/80,000 = 0.0125
  // SP-C Jig:     tlife=500,000 > 80,000 (Jig path no layout mult) → cap → 800/80,000 = 0.01
  assert.ok(Array.isArray(result.pass2), 'aggregateComplex returns pass2 array');
  assert.equal(result.pass2.length, 3, '3 SP results in pass2');
  assert.equal(result.pass2[0].tooling, 0.02, 'SP-A Pinacle tooling = 1200/60,000 = 0.02');
  assert.equal(result.pass2[1].tooling, 0.0125, 'SP-B Rotary tooling = 1000/80,000 (cap) = 0.0125');
  assert.equal(
    result.pass2[2].tooling,
    0.01,
    'SP-C Jig tooling = 800/80,000 (cap, Jig path no layout mult) = 0.01'
  );
});

function makeSpWithDie(code, toolType, toolCost, layout) {
  const sp = createSubProduct();
  sp.code = code;
  sp.part_width = 80;
  sp.part_length_md = 50;
  sp.web_width_td = 82;
  sp.sheet_length = 52;
  sp.num_webs = 1;
  sp.parts_in_md = 1;
  sp.parts_web_across = 1;
  // aggregateComplex pass1 (calcEngine.js:2174) injects moq + selling_price
  // + trade_mode + site from parent but NOT annual_qty / product_lifetime.
  // Each SP must carry its own EAU drivers for tooling cap math.
  sp.annual_qty = 100000;
  sp.product_lifetime = 1;
  sp.materials = [
    {
      code: 'PET-80',
      width: 82,
      usage: 1,
      setup_lm: 0,
      cavities: 0,
      free_liner: 0,
      pitch_ovr: 0,
      offcut_yn: 'N',
      slitting_yn: 'N',
      df_yn: '',
      offcut_pct: 0,
      s_price: 8.0,
      g_price: 9.0,
      latest: 0,
    },
  ];
  sp.inks = [];
  sp.processes = [
    {
      process_type: 'Die_Cut',
      workcenter: 'Die-A',
      speed: 40,
      layout,
      efficiency: 0.85,
      setup_h: 0,
      scrap_pct: 0,
      tool_cost: toolCost,
      tool_type: toolType,
      tool_life: 0,
      tool_life_ovr: false,
      manual_uph: 0,
      extra_cost: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  return sp;
}

// ─── T10 — Lesson 24 magnetic die min gap = 1.5mm ────────────────

// ─── T11 — Dieset (production NPI canonical) reads DDL ───────────

test('T11 die-cut Dieset (production NPI canonical) reads tool_life from DDL', () => {
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 200000,
    product_lifetime: 1,
    process: {
      tool_cost: 1600,
      tool_type: 'Dieset',
      tool_life: 0,
      tool_life_ovr: false,
      layout: 1,
    },
  });
  const tooling = runStdTooling(st, lib);
  // DDL: 'Dieset' → 80,000
  // eau = 200,000 → eauCap = 160,000
  // totalToolPcs = 80,000 ≤ 160,000 → no cap
  // tooling = 1600 / 80,000 = 0.02 USD/pc
  assert.equal(tooling, 0.02, '"Dieset" must resolve to DDL value 80,000');
});

// ─── T12 — NC die (production NPI canonical) reads DDL ───────────

test('T12 die-cut NC die (production NPI canonical) reads tool_life from DDL', () => {
  const lib = makeDieCutLib();
  const st = makeDieCutStdState({
    annual_qty: 100000,
    product_lifetime: 1,
    process: {
      tool_cost: 500,
      tool_type: 'NC die',
      tool_life: 0,
      tool_life_ovr: false,
      layout: 1,
    },
  });
  const tooling = runStdTooling(st, lib);
  // DDL: 'NC die' → 50,000
  // eau = 100,000 → eauCap = 80,000
  // totalToolPcs = 50,000 ≤ 80,000 → no cap
  // tooling = 500 / 50,000 = 0.01 USD/pc
  assert.equal(tooling, 0.01, '"NC die" must resolve to DDL value 50,000');
});

test('T10 die-cut Lesson 24: DIE_MIN_GAP_MM.rotary_magnetic = 1.5 (NOT 1.0 pre-Sprint-S-FLEXO-1)', () => {
  // Pinning the 3 die-type minimum gaps so a future "looks-like-mm
  // standardization" PR doesn't accidentally revert magnetic to 1.0mm
  // (which would let chip particles wedge between lanes — Lesson 24).
  // HARD_MIN_GAP_MM (internal alias of rotary_magnetic) is module-local,
  // not exported; this assertion covers the public surface that drives it.
  assert.equal(
    DIE_MIN_GAP_MM.rotary_magnetic,
    1.5,
    'Rotary magnetic die min gap = 1.5mm. Reverting to 1.0mm (pre-Sprint S-FLEXO-1 default) ' +
      'breaks chip clearance on long runs. Lesson 24.'
  );
  assert.equal(DIE_MIN_GAP_MM.laser, 0.3, 'Laser die min gap = 0.3mm');
  assert.equal(DIE_MIN_GAP_MM.flat, 2.0, 'Flat die min gap = 2.0mm');
});
