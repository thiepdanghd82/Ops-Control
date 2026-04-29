/**
 * Ink Calculator golden scenarios. Sprint 23 extracted runInkCalc,
 * meshRecalc, aniloxRecalc from InkCalculator.jsx so end-to-end
 * scenarios can live here. Pattern mirrors calcEngine.golden.test.js —
 * realistic input, check invariants + specific money outputs.
 *
 * Runner: node --test src/services/inkCalcCore.golden.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { meshRecalc, aniloxRecalc, runInkCalc } from './inkCalcCore.js';

// ── Pure recipe helpers ─────────────────────────────────────────────

test('meshRecalc: canonical open-area formula w²×100 / (w+d)²', () => {
  // Industry mesh: w=50µm opening, d=35µm thread → open area ≈ 34.84%
  const row = { mesh_opening: 50, thread_dia: 35, mesh_thickness: 60 };
  const out = meshRecalc(row);
  // 50² × 100 / (50+35)² = 250000 / 7225 = 34.602
  assert.ok(Math.abs(out.open_area_recipe - 34.602) < 0.01,
    `open_area_recipe: expected ~34.60, got ${out.open_area_recipe}`);
  // volume = open_area × thickness / 100 = 34.602 × 60 / 100 = 20.761
  assert.ok(Math.abs(out.volume_recipe - 20.761) < 0.01,
    `volume_recipe: expected ~20.76, got ${out.volume_recipe}`);
});

test('meshRecalc: zero inputs produce no NaN / Infinity', () => {
  const empty = meshRecalc({});
  assert.ok(empty.open_area_recipe == null || Number.isFinite(empty.open_area_recipe));
  assert.ok(empty.volume_recipe == null || Number.isFinite(empty.volume_recipe));
});

test('aniloxRecalc: BCM × 1.55 → calc_vol; × eff/100 → vol_recipe', () => {
  // Standard 4.5 BCM anilox, 30% transfer eff → calc_vol=6.975, vol_recipe=2.0925
  const row = { bcm: 4.5, transfer_eff: 30 };
  const out = aniloxRecalc(row);
  assert.ok(Math.abs(out.calc_vol - 6.975) < 1e-4, `calc_vol: ${out.calc_vol}`);
  assert.ok(Math.abs(out.vol_recipe - 2.0925) < 1e-4, `vol_recipe: ${out.vol_recipe}`);
});

test('aniloxRecalc: missing transfer_eff leaves vol_recipe=0 (not NaN)', () => {
  const out = aniloxRecalc({ bcm: 4.5 });
  assert.equal(out.vol_recipe, 0);
  assert.ok(Number.isFinite(out.calc_vol));
});

// ── Silkscreen end-to-end ───────────────────────────────────────────

/** Minimal std state with layout + one silkscreen-printed ink. */
function makeStdForInk() {
  return {
    moq: 50000, annual_qty: 500000, product_lifetime: 1,
    trade_mode: 'USD(Normal)', site: 'VN',
    part_width: 80, part_length_md: 50, web_width_td: 82, sheet_length: 52,
    num_webs: 1, parts_in_md: 1, parts_web_across: 1, min_gap_md: 2,
    rotary_cols: 0, pcs_per_roll: 5000,
    materials: [
      { code: 'PET-80', width: 82, s_price: 8, g_price: 8, latest: 0, usage: 1, offcut_yn: 'N', slitting_yn: 'N' },
    ],
    inks: [
      { color: 'Red', print_type: 'Silkscreen', base_mat: 'PET-80', mesh_spec: 'M180',
        area_pct: 0.25, setup_kg: 0.3, s_price: 18, g_price: 18, latest: 0 },
    ],
    processes: [
      { process_type: 'Print', workcenter: 'Flexo-A', speed: 30, layout: 1, efficiency: 0.85,
        setup_h: 0, scrap_pct: 0.03, tool_cost: 0, tool_type: '', tool_life: 0,
        manual_uph: 0, extra_cost: 0, product_life: 1, eau_ovr: 0, repeat: 1 },
    ],
  };
}

function makeInkCalcDB() {
  return {
    silkscreen: {
      meshSpec: [
        { mesh_code: 'M180', mesh_count: 180, thread_dia: 35, mesh_thickness: 60,
          mesh_opening: 50, open_area_recipe: 34.60, volume_recipe: 20.76 },
      ],
      qpaCost: [],
    },
    flexo: {
      aniloxDB: [
        { anilox_code: 'A400', lpi: 400, bcm: 4.5, transfer_eff: 30,
          calc_vol: 6.975, vol_recipe: 2.0925 },
      ],
      qpaCost: [],
    },
  };
}

test('runInkCalc silkscreen std: returns one row per visible ink with all fields', () => {
  const st = makeStdForInk();
  const db = makeInkCalcDB();
  const rows = runInkCalc('silkscreen', 'std', st, null, db, []);
  assert.equal(rows.length, 1, 'one visible ink → one row');
  const r = rows[0];
  // Identification fields landed.
  assert.equal(r.sp_label, 'Standard');
  assert.equal(r.color, 'Red');
  assert.equal(r.mesh_spec, 'M180');
  assert.equal(r.mesh_count, 180);
  // Width picked from material row (PET-80 width=82).
  assert.equal(r.mat_width, 82);
  // Area + volume cascade.
  assert.ok(r.total_area > 0 && r.total_area === r.mat_width * r.pitch_mm);
  // ink_volume = vol_recipe × total_area × 1e-6 → should be > 0
  assert.ok(r.ink_volume > 0, 'ink_volume positive');
  // actual_ink_vol = ink_volume × 25% area
  assert.ok(Math.abs(r.actual_ink_vol - r.ink_volume * 0.25) < 1e-9);
  // Default density 1.0 when no prev override.
  assert.equal(r.density, 1.0);
  // Waste + weight invariant — waste = weight × scrapFactor
  assert.ok(r.weight_per_time > r.ink_weight, 'weight_per_time = ink_wt + waste > ink_wt');
  // Setup cost uses state MOQ.
  assert.equal(r.moq, 50000);
  assert.ok(r.setup_cost > 0, 'setup_cost positive when setup_kg + price set');
  // Total = unit + setup.
  assert.ok(Math.abs(r.total_cost - (r.unit_price + r.setup_cost)) < 1e-9);
  // Price falls back to s_price when no latest.
  assert.equal(r.ink_price, 18);
});

test('runInkCalc silkscreen: base_mat code fallback to embedded width (regex safe)', () => {
  const st = makeStdForInk();
  // Point ink at a non-existent material; width comes from trailing digits.
  st.materials = [];
  st.inks[0].base_mat = 'ABC-200';
  const rows = runInkCalc('silkscreen', 'std', st, null, makeInkCalcDB(), []);
  assert.equal(rows[0].mat_width, 200, 'positive width extracted from code');
  assert.ok(rows[0].ink_volume >= 0, 'no negative volume (Sprint 5 regression guard)');
});

test('runInkCalc silkscreen: hidden ink skipped', () => {
  const st = makeStdForInk();
  st.inks[0].hidden = true;
  const rows = runInkCalc('silkscreen', 'std', st, null, makeInkCalcDB(), []);
  assert.equal(rows.length, 0);
});

test('runInkCalc silkscreen: ink without color is skipped', () => {
  const st = makeStdForInk();
  st.inks[0].color = '';
  const rows = runInkCalc('silkscreen', 'std', st, null, makeInkCalcDB(), []);
  assert.equal(rows.length, 0);
});

test('runInkCalc: prev overrides (density, ink_price_ovr) win over auto-derived', () => {
  const st = makeStdForInk();
  const db = makeInkCalcDB();
  const prevRows = [{
    sp_label: 'Standard', color: 'Red', mesh_spec: 'M180',
    density: 1.3, ink_price_ovr: 25, repeat: 2, setup_kg_ovr: 0.5,
  }];
  const rows = runInkCalc('silkscreen', 'std', st, null, db, prevRows);
  const r = rows[0];
  assert.equal(r.density, 1.3, 'prev density overrode 1.0 default');
  assert.equal(r.ink_price, 25, 'prev price_ovr beats auto s_price=18');
  assert.equal(r.repeat, 2);
  assert.equal(r.setup_kg_val, 0.5);
  // theo_supply scales with repeat — 2× base.
  assert.ok(r.theo_supply > 0);
});

// ── Flexo end-to-end ────────────────────────────────────────────────

test('runInkCalc flexo: uses anilox DB vol_recipe + lpi + bcm fields', () => {
  const st = makeStdForInk();
  // Flip to Flexo + anilox code.
  st.inks[0].print_type = 'Flexo';
  st.inks[0].mesh_spec = 'A400';
  const rows = runInkCalc('flexo', 'std', st, null, makeInkCalcDB(), []);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.anilox_spec, 'A400');
  assert.equal(r.lpi, 400);
  // mesh_count field not present on flexo rows.
  assert.equal(r.mesh_count, undefined);
});

test('runInkCalc flexo: non-Flexo ink is filtered out (anilox-only path)', () => {
  const st = makeStdForInk();
  st.inks[0].print_type = 'Silkscreen'; // wrong for flexo path
  st.inks[0].mesh_spec = 'M180';        // not an anilox code
  const rows = runInkCalc('flexo', 'std', st, null, makeInkCalcDB(), []);
  assert.equal(rows.length, 0, 'silkscreen ink excluded from flexo run');
});

// ── Invariants: cost scales linearly with setup_kg + area_pct ──────

test('runInkCalc: doubling setup_kg doubles setup_cost', () => {
  const st1 = makeStdForInk();
  const st2 = makeStdForInk();
  st2.inks[0].setup_kg = st1.inks[0].setup_kg * 2;
  const r1 = runInkCalc('silkscreen', 'std', st1, null, makeInkCalcDB(), [])[0];
  const r2 = runInkCalc('silkscreen', 'std', st2, null, makeInkCalcDB(), [])[0];
  assert.ok(Math.abs(r2.setup_cost - 2 * r1.setup_cost) < 1e-9);
  // Unit price (running) unchanged — setup is the only knob touched.
  assert.ok(Math.abs(r2.unit_price - r1.unit_price) < 1e-9);
});

test('runInkCalc: doubling area_pct doubles actual_ink_vol + unit_price', () => {
  const st1 = makeStdForInk();
  const st2 = makeStdForInk();
  st2.inks[0].area_pct = st1.inks[0].area_pct * 2;
  const r1 = runInkCalc('silkscreen', 'std', st1, null, makeInkCalcDB(), [])[0];
  const r2 = runInkCalc('silkscreen', 'std', st2, null, makeInkCalcDB(), [])[0];
  assert.ok(Math.abs(r2.actual_ink_vol - 2 * r1.actual_ink_vol) < 1e-9);
  assert.ok(r2.unit_price > r1.unit_price, 'unit_price scales up with coverage');
});

// ── Complex state: iterates over sub-products with visible inks ─────

test('runInkCalc cplx: emits row per SP that has a visible ink', () => {
  const st = makeStdForInk();
  const sp1 = { ...st, inks: [{ ...st.inks[0], color: 'Red' }] };
  const sp2 = { ...st, inks: [{ ...st.inks[0], color: 'Blue' }] };
  const spHidden = { ...st, inks: [{ ...st.inks[0], color: 'Yellow', hidden: true }] };
  const cplxState = { moq: 50000, subproducts: [sp1, sp2, spHidden] };
  const rows = runInkCalc('silkscreen', 'cplx', null, cplxState, makeInkCalcDB(), []);
  assert.equal(rows.length, 2, 'SP3 (hidden ink) filtered out');
  assert.deepEqual(rows.map(r => r.color), ['Red', 'Blue']);
  assert.deepEqual(rows.map(r => r.sp_label), ['SP1', 'SP2']);
});
