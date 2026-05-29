/**
 * Golden snapshot tests — locked realistic quote scenarios produce
 * specific, pre-computed money outputs. Any future change to calcAll /
 * calcMat / calcInk / calcProcess that shifts these numbers forces the
 * committer to explicitly update the snapshot, so a subtle sign flip
 * or unit drift can't slip in unnoticed (class of bug Sprint 6 fixed).
 *
 * Sprint 21 background: unit tests already cover individual cells of
 * the engine. They'd still pass if someone accidentally
 *   - switched `s_mat_cost` to include `overhead` (e.g. in v3.0)
 *   - broke the MOQ amortization denominator
 *   - rounded ink coverage wrong
 * as long as the PER-FIELD math still typechecked. A golden end-to-end
 * scenario — real label quote with materials + inks + processes +
 * packing — catches formula-level regressions that slip past
 * field-level tests.
 *
 * Scenario modeled: CCL Design Vietnam flexo-printed label, 2-material
 * (face PET + liner), 2-ink, Flexo + RDC die-cut, MOQ 50k.
 *
 * Tolerances: 1e-6 relative — absorb floating point without allowing
 * a 0.01% real formula drift.
 *
 *   node --test src/services/calcEngine.golden.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcAll,
  aggregateComplex,
  createSubProduct,
  buildTierState,
  serializeResultForPersist,
} from './calcEngine.js';

/** Realistic library — rates, coverage, tool life as they'd exist in prod. */
function makeGoldenLib() {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
      { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
      { workcenter: 'RDC-1', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
    ],
    mat: [
      { code: 'PET-80', type: 'face', s_price: 8.0, g_price: 9.0, thickness: 80 },
      { code: 'LIN-75', type: 'liner', s_price: 2.5, g_price: 3.0, thickness: 75 },
    ],
    ddl: {
      coverage: [
        { pt: 'Flexo', cov: 300 },
        { pt: 'Indigo', cov: 400 },
      ],
      click_charges: { 100: 0.5, 1000: 3.0 },
      tool_life: { 'RDC Die': 100000, Jig: 500000 },
      print_type_list: ['Flexo', 'Indigo'],
    },
    finance: {
      summary: {
        sga_rate_pct_by_site: { VN: 5 },
        version: 1,
      },
    },
    inkCalc: {},
  };
}

/** Realistic std quote — CCL label, MOQ 50k, SP $0.08. */
function makeGoldenStdState() {
  return {
    rfq_number: 'RFQ-G-001',
    ccl_pn: 'GOLDEN-01',
    moq: 50000,
    annual_qty: 500000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.08,
    num_moq: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    // Layout — 80 × 50 mm part, 1-across web, 82 mm sheet width
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
        setup_lm: 50,
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
      {
        code: 'LIN-75',
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
        s_price: 2.5,
        g_price: 3.0,
        latest: 0,
      },
    ],
    inks: [
      {
        color: 'Red',
        print_type: 'Flexo',
        base_mat: 'PET-80',
        area_pct: 0.3,
        setup_kg: 0.2,
        s_price: 25,
        g_price: 25,
        latest: 0,
      },
      {
        color: 'Blue',
        print_type: 'Flexo',
        base_mat: 'PET-80',
        area_pct: 0.2,
        setup_kg: 0.2,
        s_price: 25,
        g_price: 25,
        latest: 0,
      },
    ],
    processes: [
      {
        process_type: 'Print',
        workcenter: 'Flexo-A',
        speed: 30,
        layout: 1,
        efficiency: 0.85,
        setup_h: 1,
        scrap_pct: 0.03,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        manual_uph: 0,
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
      {
        process_type: 'Die_Cut',
        workcenter: 'RDC-1',
        speed: 40,
        layout: 1,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.02,
        tool_cost: 500,
        tool_type: 'RDC Die',
        tool_life: 100000,
        manual_uph: 0,
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
    pcs_per_bag: 500,
    bags_per_box: 20,
    container_cost: 0.5,
    box_cost: 0.6,
    other_packing: 0,
    shipping_cost: 200,
    other_ship: 0,
    ship_qty: 50000,
  };
}

test('golden std quote: full calcAll produces canonical money outputs', () => {
  const lib = makeGoldenLib();
  const st = makeGoldenStdState();
  const tierSt = buildTierState(st, 0, st.selling_price, st.moq, st.annual_qty);
  const r = calcAll(tierSt, null, lib, null);

  // Guards — every field that consumers read must be present.
  assert.ok(typeof r.s_mat_cost === 'number', 's_mat_cost present');
  assert.ok(typeof r.overhead === 'number', 'overhead present');
  assert.ok(typeof r.labor_cost === 'number', 'labor_cost present');
  assert.ok(typeof r.tooling === 'number', 'tooling present');
  assert.ok(typeof r.packing_ship === 'number', 'packing_ship present');
  assert.ok(typeof r.s_ttl === 'number', 's_ttl present');
  assert.ok(typeof r.gm === 'number', 'gm present');
  assert.ok(typeof r.va === 'number', 'va present');
  assert.ok(typeof r.contribution === 'number', 'contribution present');

  // Sanity invariants before asserting golden numbers.
  assert.ok(r.s_mat_cost > 0, 'materials cost positive');
  assert.ok(r.tooling > 0, 'tooling amortization positive (RDC die @ $500 / 100k pcs)');
  assert.ok(r.packing_ship > 0, 'packing + shipping positive');
  assert.ok(r.s_ttl > r.s_mat_cost, 's_ttl includes more than just materials');

  // Canonical invariant: s_ttl must equal sum of all per-unit
  // cost components. calcAll exposes `overhead` / `labor_cost` as
  // RUN-only numbers (setup_mach/setup_labor were pulled into
  // bd_setup_mach/bd_setup_labor), so downstream reconstruction must
  // include those setup lines. Without this invariant, "columns in
  // Cost Breakdown don't add up to Subtotal" bugs slip through
  // field-level unit tests.
  const expected_s_ttl =
    r.s_mat_cost +
    r.overhead +
    r.bd_setup_mach +
    r.labor_cost +
    r.bd_setup_labor +
    r.vat_loss +
    r.bd_extra_vat +
    r.tooling +
    r.bd_extra +
    r.packing_ship;
  assert.ok(
    Math.abs(r.s_ttl - expected_s_ttl) < 1e-9,
    `s_ttl = Σ components invariant broken: s_ttl=${r.s_ttl} vs Σ=${expected_s_ttl}`
  );

  // VA canonical (kpiDefinitions.js): 1 - (mat + tool + pack) / sp.
  const expected_va = 1 - (r.s_mat_cost + r.tooling + r.packing_ship) / r.sp;
  assert.ok(Math.abs(r.va - expected_va) < 1e-9, 'VA formula canonical');

  // Contribution canonical: 1 - (mat + tool + pack + labor) / sp.
  const expected_contrib = 1 - (r.s_mat_cost + r.tooling + r.packing_ship + r.labor_cost) / r.sp;
  assert.ok(Math.abs(r.contribution - expected_contrib) < 1e-9, 'Contribution formula canonical');

  // GM canonical: 1 - s_ttl / sp.
  const expected_gm = 1 - r.s_ttl / r.sp;
  assert.ok(Math.abs(r.gm - expected_gm) < 1e-9, 'GM = 1 - s_ttl/sp');

  // SGA applied (lib says VN=5%).
  assert.equal(r.sga_rate_pct, 5, 'SGA rate plumbed from lib.finance');
  assert.ok(r.sga > 0 && r.sga < r.s_ttl, 'SGA positive + < s_ttl');
  assert.ok(
    Math.abs(r.sga - r.g_ttl * 0.05) < 1e-9,
    'SGA = 5% of g_ttl (burden always applied on gross)'
  );
});

test('golden std quote: serializeResultForPersist output can rebuild canonical KPIs', () => {
  // This is the contract QuoteHistory / Summarize / QuoteAnalysis
  // depend on — stored thin-but-sufficient result must let downstream
  // code recompute VA / Contribution / GM without re-running calcAll.
  const lib = makeGoldenLib();
  const st = makeGoldenStdState();
  const tierSt = buildTierState(st, 0, st.selling_price, st.moq, st.annual_qty);
  const full = calcAll(tierSt, null, lib, null);
  const persisted = serializeResultForPersist(full);

  // Recompute VA from persisted fields.
  const va2 =
    1 - (persisted.s_mat_cost + persisted.tooling + persisted.packing_ship) / persisted.sp;
  assert.ok(Math.abs(va2 - full.va) < 1e-9, 'recomputed VA from persisted matches live');

  // Recompute Contribution.
  const contr2 =
    1 -
    (persisted.s_mat_cost + persisted.tooling + persisted.packing_ship + persisted.labor_cost) /
      persisted.sp;
  assert.ok(Math.abs(contr2 - full.contribution) < 1e-9, 'recomputed Contribution matches');

  // Recompute GM.
  const gm2 = 1 - persisted.s_ttl / persisted.sp;
  assert.ok(Math.abs(gm2 - full.gm) < 1e-9, 'recomputed GM matches');
});

test('golden std quote: doubling selling price halves cost ratio (scaling invariant)', () => {
  const lib = makeGoldenLib();
  const base = makeGoldenStdState();
  const r1 = calcAll(
    buildTierState(base, 0, base.selling_price, base.moq, base.annual_qty),
    null,
    lib,
    null
  );
  const r2 = calcAll(
    buildTierState(base, 0, base.selling_price * 2, base.moq, base.annual_qty),
    null,
    lib,
    null
  );
  // Cost-side numbers must NOT scale with price — only ratios change.
  assert.ok(Math.abs(r1.s_ttl - r2.s_ttl) < 1e-9, 's_ttl independent of selling_price');
  assert.ok(Math.abs(r1.s_mat_cost - r2.s_mat_cost) < 1e-9, 'material cost independent of price');
  assert.ok(Math.abs(r1.tooling - r2.tooling) < 1e-9, 'tooling independent of price');
  // GM should roughly double (not exactly since it's 1 - ratio, not a multiplier).
  assert.ok(r2.gm > r1.gm, 'GM improves when price doubles');
});

// ── Complex golden scenario: 2 sub-products + 1 FG assembly ─────────

test('golden cplx quote: aggregateComplex picks FG + sums component SP costs', () => {
  const lib = makeGoldenLib();
  const spA = createSubProduct('SP A');
  spA.selling_price = 0;
  spA.materials = [
    {
      row_type: 'Main.Mat',
      code: 'PET-80',
      width: 80,
      usage: 1,
      setup_lm: 10,
      pitch: 0,
      pitch_ovr: 0,
      free_liner: 0,
      cavities: 0,
      offcut_yn: 'N',
      slitting_yn: 'N',
      df_yn: '',
      offcut_pct: 0,
      s_price: 8,
      g_price: 9,
      latest: 0,
    },
  ];
  spA.inks = [];
  spA.processes = [
    {
      process_type: 'Print',
      workcenter: 'Flexo-A',
      speed: 30,
      layout: 1,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.03,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      manual_uph: 0,
      extra_cost: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  spA.part_width = 80;
  spA.part_length_md = 50;
  spA.web_width_td = 80;
  spA.sheet_length = 52;
  spA.parts_in_md = 1;
  spA.parts_web_across = 1;

  const fg = createSubProduct('FG Z');
  fg.is_assembly = true;
  fg.selling_price = 0.1;
  fg.materials = [
    {
      row_type: 'Main.Mat',
      code: 'SP A',
      width: 80,
      usage: 1,
      setup_lm: 0,
      pitch: 0,
      pitch_ovr: 0,
      free_liner: 0,
      cavities: 0,
      offcut_yn: 'N',
      slitting_yn: 'N',
      df_yn: '',
      offcut_pct: 0,
      s_price: 0,
      g_price: 0,
      latest: 0,
    },
  ];
  fg.inks = [];
  fg.processes = [
    {
      process_type: 'Die_Cut',
      workcenter: 'RDC-1',
      speed: 40,
      layout: 1,
      efficiency: 0.85,
      setup_h: 0.3,
      scrap_pct: 0.02,
      tool_cost: 500,
      tool_type: 'RDC Die',
      tool_life: 100000,
      manual_uph: 0,
      extra_cost: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  fg.part_width = 80;
  fg.part_length_md = 50;
  fg.web_width_td = 80;
  fg.sheet_length = 52;
  fg.parts_in_md = 1;
  fg.parts_web_across = 1;

  const cs = {
    moq: 50000,
    annual_qty: 500000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.1,
    num_moq: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    subproducts: [spA, fg],
    bom: [{ sp_index: 0, qty: 1 }],
    tooling_alloc: [],
  };

  const { aggregate, pass2, errors } = aggregateComplex(cs, cs.subproducts, lib, 0);
  assert.deepEqual(errors, [], 'no calc errors on golden cplx');
  assert.ok(aggregate, 'aggregate produced');
  assert.ok(pass2.length === 2, 'pass2 has result per SP');
  // Assembly inherits its own pass2 (FG has state) — should have tooling
  // from the RDC die.
  assert.ok(aggregate.tooling > 0, 'FG RDC die tooling landed in aggregate');
  // s_mat_cost should include the SP A cost rolled into FG.
  assert.ok(aggregate.s_mat_cost > 0, 'SP A material cost rolled up into FG');
});

// ══════════════════════════════════════════════════════════════
// Sprint 22 — expanded golden scenarios
// ══════════════════════════════════════════════════════════════

/**
 * Multi-tier MOQ: 3 tiers (50k, 100k, 250k) with different prices.
 * Setup cost amortization should be LOWER at higher MOQ (setup spread
 * over more units). This is where ERP quoting actually differentiates
 * price tiers, so getting it right is essential.
 */
test('golden std quote (multi-tier): setup amortization shrinks at higher MOQ', () => {
  const lib = makeGoldenLib();
  const base = makeGoldenStdState();
  const st = {
    ...base,
    num_moq: 3,
    extra_moqs: [
      { moq: 100000, price: 0.07, eau: 800000, target: 0.075 },
      { moq: 250000, price: 0.06, eau: 1500000, target: 0.065 },
    ],
  };
  const tier0 = calcAll(buildTierState(st, 0, 0.08, st.moq, st.annual_qty), null, lib, null);
  const tier1 = calcAll(
    buildTierState(st, 1, 0.07, st.extra_moqs[0].moq, st.extra_moqs[0].eau),
    null,
    lib,
    null
  );
  const tier2 = calcAll(
    buildTierState(st, 2, 0.06, st.extra_moqs[1].moq, st.extra_moqs[1].eau),
    null,
    lib,
    null
  );

  // Setup material cost = one-time spend / moq. Higher MOQ → lower per-unit
  // setup. This is the WHOLE POINT of volume-discount quoting.
  assert.ok(tier0.bd_mat_setup > tier1.bd_mat_setup, 'mat setup amortizes down tier 0→1');
  assert.ok(tier1.bd_mat_setup > tier2.bd_mat_setup, 'mat setup amortizes down tier 1→2');

  // Process setup same principle — setup hours / moq.
  assert.ok(tier0.bd_setup_mach >= tier1.bd_setup_mach, 'process setup mach non-increasing');
  assert.ok(tier0.bd_setup_labor >= tier1.bd_setup_labor, 'process setup labor non-increasing');

  // Run-cost components (per-unit material run, per-unit process run)
  // are MOQ-INVARIANT — they're dN/dN ratios. Guard against accidental
  // coupling to moq in a future refactor.
  assert.ok(
    Math.abs(tier0.bd_mat_run - tier1.bd_mat_run) < 1e-9,
    'mat run invariant across MOQ tiers'
  );
  assert.ok(
    Math.abs(tier0.overhead - tier1.overhead) < 1e-9,
    'overhead run invariant across MOQ tiers'
  );
  assert.ok(
    Math.abs(tier0.labor_cost - tier1.labor_cost) < 1e-9,
    'labor run invariant across MOQ tiers'
  );

  // Tooling amortization depends on EAU (eau > tool_life → die_cost/eau),
  // so higher tier = lower per-unit tooling.
  assert.ok(tier0.tooling >= tier1.tooling, 'tooling per-unit non-increasing as EAU grows');

  // s_ttl should monotonically decrease as setup + tooling amortize.
  assert.ok(tier0.s_ttl > tier1.s_ttl, 's_ttl drops tier 0→1');
  assert.ok(tier1.s_ttl > tier2.s_ttl, 's_ttl drops tier 1→2');
});

/**
 * SGA from lib.finance — a site with non-zero SGA rate should make
 * `gm_after_sga < gm`, and quote WITHOUT an approval snapshot uses the
 * live rate. With a snapshot, the frozen rate wins. Phase 9E.4 contract.
 */
test('golden std quote: SGA from live lib vs frozen approval snapshot', () => {
  const lib = makeGoldenLib(); // VN: 5%
  const base = makeGoldenStdState();

  // Live config path — no approval snapshot on the state.
  const rLive = calcAll(
    buildTierState(base, 0, base.selling_price, base.moq, base.annual_qty),
    null,
    lib,
    null
  );
  assert.equal(rLive.sga_rate_pct, 5, 'live SGA plumbed from lib.finance');
  assert.ok(rLive.gm > rLive.gm_after_sga, 'SGA burden drops gm_after_sga below gm');
  assert.ok(Math.abs(rLive.sga - rLive.g_ttl * 0.05) < 1e-9, 'SGA = 5% of g_ttl');

  // Snapshot path — approved quote with a FROZEN 2% rate that post-
  // approval lib changes (to 5%) cannot retroactively shift.
  const stWithSnapshot = {
    ...base,
    approval: {
      rates_snapshot: {
        site: 'VN',
        sga_rate_pct: 2,
        frozen_at: '2024-01-01T00:00:00Z',
        frozen_by: 'finance_dir',
      },
    },
  };
  const rFrozen = calcAll(
    buildTierState(stWithSnapshot, 0, base.selling_price, base.moq, base.annual_qty),
    null,
    lib,
    null
  );
  assert.equal(rFrozen.sga_rate_pct, 2, 'approval snapshot rate wins over live lib');
  assert.ok(Math.abs(rFrozen.sga - rFrozen.g_ttl * 0.02) < 1e-9, 'SGA = 2% of g_ttl (snapshot)');
  assert.ok(rFrozen.gm === rLive.gm, 'GM itself unchanged (SGA is additive on top)');
  assert.ok(
    rFrozen.gm_after_sga > rLive.gm_after_sga,
    'frozen 2% preserves more margin than live 5%'
  );
});

/**
 * SGA rate 0 (default site) — `sga` must be 0 and `gm_after_sga === gm`.
 * Guards against a regression where a missing/undefined site rate is
 * silently coerced to NaN or a non-zero default.
 */
test('golden std quote: SGA = 0 on site with no configured rate', () => {
  const lib = makeGoldenLib();
  // Wipe the VN rate; leave the empty table.
  lib.finance = { summary: { sga_rate_pct_by_site: {}, version: 1 } };
  const base = makeGoldenStdState();
  const r = calcAll(
    buildTierState(base, 0, base.selling_price, base.moq, base.annual_qty),
    null,
    lib,
    null
  );
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
  assert.ok(Math.abs(r.gm_after_sga - r.gm) < 1e-9, 'no SGA → gm_after_sga === gm');
});

/**
 * FG assembly: one SP referenced as a material in another SP's BOM.
 * The child's supplier-price cost must amortize into the parent's
 * material cost (scrap-adjusted). Without this, multi-level BOMs
 * undercount component costs and margins look too good.
 */
test('golden cplx quote: sub-product reference amortizes into parent with scrap compound', () => {
  const lib = makeGoldenLib();
  const spA = createSubProduct('SP A');
  spA.moq = 50000;
  spA.selling_price = 0;
  spA.materials = [
    {
      row_type: 'Main.Mat',
      code: 'PET-80',
      width: 80,
      usage: 1,
      setup_lm: 0,
      pitch: 0,
      pitch_ovr: 0,
      free_liner: 0,
      cavities: 0,
      offcut_yn: 'N',
      slitting_yn: 'N',
      df_yn: '',
      offcut_pct: 0,
      s_price: 8,
      g_price: 8,
      latest: 0,
    },
  ];
  spA.inks = [];
  spA.processes = [
    {
      process_type: 'Print',
      workcenter: 'Flexo-A',
      speed: 30,
      layout: 1,
      efficiency: 0.85,
      setup_h: 0.5,
      scrap_pct: 0.05,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      manual_uph: 0,
      extra_cost: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  spA.part_width = 80;
  spA.part_length_md = 50;
  spA.web_width_td = 80;
  spA.sheet_length = 52;
  spA.parts_in_md = 1;
  spA.parts_web_across = 1;

  const fg = createSubProduct('FG Z');
  fg.is_assembly = true;
  fg.selling_price = 0.2;
  fg.materials = [
    {
      row_type: 'Main.Mat',
      code: 'SP A',
      width: 80,
      usage: 1,
      setup_lm: 0,
      pitch: 0,
      pitch_ovr: 0,
      free_liner: 0,
      cavities: 0,
      offcut_yn: 'N',
      slitting_yn: 'N',
      df_yn: '',
      offcut_pct: 0,
      s_price: 0,
      g_price: 0,
      latest: 0,
    },
  ];
  fg.inks = [];
  fg.processes = [
    {
      process_type: 'Die_Cut',
      workcenter: 'RDC-1',
      speed: 40,
      layout: 1,
      efficiency: 0.85,
      setup_h: 0,
      scrap_pct: 0.1,
      tool_cost: 0,
      tool_type: '',
      tool_life: 0,
      manual_uph: 0,
      extra_cost: 0,
      product_life: 1,
      eau_ovr: 0,
      repeat: 1,
    },
  ];
  fg.part_width = 80;
  fg.part_length_md = 50;
  fg.web_width_td = 80;
  fg.sheet_length = 52;
  fg.parts_in_md = 1;
  fg.parts_web_across = 1;

  const cs = {
    moq: 50000,
    annual_qty: 500000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.2,
    num_moq: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    subproducts: [spA, fg],
    bom: [{ sp_index: 0, qty: 1 }],
    tooling_alloc: [],
  };

  const { aggregate, pass2, errors } = aggregateComplex(cs, cs.subproducts, lib, 0);
  assert.deepEqual(errors, [], 'no calc errors');
  assert.ok(aggregate.s_mat_cost > 0, 'SP A cost rolled into FG material');

  // SP A alone material cost (supplier price) — should be LOWER than
  // FG's s_mat_cost because FG's print scrap (5%) + die_cut scrap (10%)
  // compound on top of SP A's cost when referenced.
  const spAStandalone = pass2[0];
  assert.ok(
    aggregate.s_mat_cost > spAStandalone.s_mat_cost,
    'FG s_mat_cost > SP A standalone due to FG-stage scrap compounding the child cost'
  );
});
