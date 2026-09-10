#!/usr/bin/env node
/**
 * Regenerate ALL frozen-quote fixtures from TODAY's calcEngine output.
 * Replaces the single-fixture `scripts/regen-frozen-quote.mjs` (kept
 * for back-compat) with a multi-fixture generator covering:
 *
 *   frozen-quote-2026.json          — baseline Std flexo+RDC (Phase 2.1)
 *   frozen-quote-diecut-2026.json   — Magnetic die + lifetime cap + mixed
 *   frozen-quote-indigo-2026.json   — Indigo press with click_charges
 *   frozen-quote-draft-sga-2026.json — draft (no approval), SGA pin
 *
 * PR-B (Phase 2 follow-up, 2026-06-20). The latter 3 fixtures hit the
 * P1 retention gaps PR-A + PR-A2 closed:
 *   - die-cut quote freezes tool_life (PR-A)
 *   - Indigo quote freezes click_charges (PR-A)
 *   - draft quote freezes sga_rate_pct (PR-A2)
 *
 * Each fixture is also a GOLDEN test for that quote class (Phase 1
 * M-4 die-cut + Indigo equivalent + draft-quote behavior) — mũi tên 2 đích.
 *
 * Use ONLY when intentionally bumping the 20-year reproducibility
 * baseline after a deliberate engine change. Do NOT run to "fix" a
 * failing test — that signals real drift; investigate engine first.
 *
 *   node scripts/regen-frozen-quotes.mjs
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(ROOT, 'client/src/services/__fixtures__');

const { calcAll, getActiveTierState, serializeResultForPersist } = await import(
  resolve(ROOT, 'client/src/services/calcEngine.js')
);
const { freezeLib } = await import(resolve(ROOT, 'client/src/services/pricingSnapshot.js'));

// ─── Shared library used by all 3 new fixtures ────────────────────

const BASE_LIB = {
  rate: [
    { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
    { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
    { workcenter: 'RDC-1', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
    { workcenter: 'Indigo6800', machine_rate: 60, labor_rate: 12, crew: 1, speed_uom: 'm/min' },
    { workcenter: 'Mag-Die', machine_rate: 25, labor_rate: 6, crew: 1, speed_uom: 'm/min' },
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
    click_charges: { 100: 0.5, 1000: 3.0, 10000: 12.0 },
    tool_life: { 'RDC Die': 100000, 'Pinacle die': 60000, woodie: 30000, Jig: 500000 },
    print_type_list: ['Flexo', 'Indigo', 'Indigo6800'],
  },
  finance: { summary: { sga_rate_pct_by_site: { VN: 5, 'Hai Duong': 7 } } },
  inkCalc: {},
};

const BASE_MATERIAL = (code, s, g) => ({
  code,
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
  s_price: s,
  g_price: g,
  latest: 0,
});

const BASE_PROCESS = (overrides) => ({
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
  ...overrides,
});

function buildStdState(overrides) {
  return {
    rfq_number: 'RFQ-PR-B-001',
    ccl_pn: 'PR-B-001',
    moq: 50000,
    annual_qty: 500000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.08,
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
    materials: [BASE_MATERIAL('PET-80', 8, 9), BASE_MATERIAL('LIN-75', 2.5, 3)],
    inks: [],
    processes: [],
    pcs_per_bag: 500,
    bags_per_box: 20,
    container_cost: 0.5,
    box_cost: 0.6,
    other_packing: 0,
    shipping_cost: 200,
    other_ship: 0,
    ship_qty: 50000,
    ...overrides,
  };
}

function freeze(state, lib, capturedAt) {
  const snapshot = freezeLib(lib, state, { userId: 'henry' });
  snapshot._captured_at = capturedAt;
  const withSnap = { ...state, pricing_snapshot: snapshot };
  const tierSt = getActiveTierState(withSnap);
  const result = calcAll(tierSt, null, lib, null, { snapshot });
  return { stateWithSnapshot: withSnap, expected_result: serializeResultForPersist(result) };
}

function writeFixture(filename, comment, lib, state, capturedAt) {
  const { stateWithSnapshot, expected_result } = freeze(state, lib, capturedAt);
  const path = resolve(FIXTURES_DIR, filename);
  writeFileSync(
    path,
    JSON.stringify(
      {
        _comment: comment,
        _captured_at: capturedAt,
        lib,
        state: stateWithSnapshot,
        expected_result,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[regen-frozen-quotes] wrote ${filename} — s_ttl = ${expected_result.s_ttl}`);
}

const CAPTURED = '2026-06-20T00:00:00.000Z';

// ─── Fixture 1: Die-cut Std quote (Magnetic die + Pinacle mixed) ──

writeFixture(
  'frozen-quote-diecut-2026.json',
  'Phase 2 PR-B + Phase 1 M-4 mũi tên 2 đích — die-cut quote pinning tool_life ' +
    'via pricing_snapshot. Mag-Die + Pinacle die mixed; lifetime cap triggers ' +
    '(annual_qty × lifetime × 0.8 < tool_life). Regenerate via scripts/regen-frozen-quotes.mjs.',
  BASE_LIB,
  buildStdState({
    rfq_number: 'RFQ-DIECUT-2026-001',
    ccl_pn: 'DIECUT-2026',
    annual_qty: 100000, // small annual_qty → eauCap (80,000) < tool_life × layout → cap fires
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
    ],
    processes: [
      BASE_PROCESS({ workcenter: 'Flexo-A', setup_h: 1, scrap_pct: 0.03 }),
      BASE_PROCESS({
        process_type: 'Die_Cut',
        workcenter: 'Mag-Die',
        speed: 40,
        setup_h: 0.5,
        scrap_pct: 0.02,
        tool_cost: 1200,
        tool_type: 'Pinacle die', // DDL: 60,000 — cap fires at eau 100k → eauCap 80k
        layout: 1,
      }),
    ],
  }),
  CAPTURED
);

// ─── Fixture 2: Indigo quote (click_charges pinned) ───────────────

writeFixture(
  'frozen-quote-indigo-2026.json',
  'Phase 2 PR-B + Phase 1 M-4 — Indigo press quote pinning click_charges via ' +
    'pricing_snapshot. Indigo6800 with click-charge sorted-key lookup. Regen via ' +
    'scripts/regen-frozen-quotes.mjs.',
  BASE_LIB,
  buildStdState({
    rfq_number: 'RFQ-INDIGO-2026-001',
    ccl_pn: 'INDIGO-2026',
    annual_qty: 200000,
    inks: [
      {
        color: 'Blue',
        print_type: 'Indigo6800',
        base_mat: 'PET-80',
        area_pct: 0.3,
        setup_kg: 0.2,
        clicks: 5000, // matches click_charges 1000 bracket
        s_price: 30,
        g_price: 30,
        latest: 0,
      },
    ],
    processes: [
      BASE_PROCESS({ workcenter: 'Indigo6800', speed: 25, setup_h: 0.8, scrap_pct: 0.04 }),
    ],
  }),
  CAPTURED
);

// ─── Fixture 3: Draft quote with SGA pin (closes STEP 0) ──────────

writeFixture(
  'frozen-quote-draft-sga-2026.json',
  'Phase 2 PR-B — draft quote (no approval.rates_snapshot) pinning SGA via ' +
    'pricing_snapshot.sga. Closes STEP 0 export-path bypass: any customer xlsx ' +
    'exported pre-approval freezes SGA save-time rate, immune to finance.summary ' +
    'drift. Regen via scripts/regen-frozen-quotes.mjs.',
  BASE_LIB,
  buildStdState({
    rfq_number: 'RFQ-DRAFT-SGA-2026-001',
    ccl_pn: 'DRAFT-SGA-2026',
    site: 'VN', // VN finance rate = 5%
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
    ],
    processes: [BASE_PROCESS({ workcenter: 'Flexo-A', setup_h: 1, scrap_pct: 0.03 })],
    // EXPLICITLY no state.approval — draft quote that bypassed export
    // gate (per STEP 0 finding) MUST still freeze SGA via snapshot.
  }),
  CAPTURED
);
