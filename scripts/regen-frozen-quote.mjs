#!/usr/bin/env node
/**
 * Regenerate client/src/services/__fixtures__/frozen-quote-2026.json
 * from TODAY's calcEngine output. Use ONLY when intentionally bumping
 * the 20-year reproducibility baseline after a deliberate engine
 * change. Do NOT run to "fix" a failing loadFrozenQuote.test.js — that
 * test fail signals real drift; investigate the engine change first.
 *
 * When you DO run this script:
 *   1. Commit the new fixture in the SAME PR as the engine change
 *   2. Document the change in CLAUDE.md Lessons + sprint history
 *   3. Add a NEW frozen-quote-<year>.json for the new behavior;
 *      KEEP frozen-quote-2026.json + add a migration test proving
 *      the old quote can still be RENDERED (even if recompute drifts)
 *   4. Tag the PR with "BREAKING-REPRODUCIBILITY-CONTRACT" label
 *      for explicit reviewer attention
 *
 * Phase 2.1 of Debug Playbook (2026-06-20).
 *
 *   node scripts/regen-frozen-quote.mjs
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { calcAll, getActiveTierState, serializeResultForPersist } = await import(
  resolve(ROOT, 'client/src/services/calcEngine.js')
);
const { freezeLib } = await import(resolve(ROOT, 'client/src/services/pricingSnapshot.js'));

const lib = {
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
    tool_life: { 'RDC Die': 100000, 'Pinacle die': 60000, Jig: 500000 },
    print_type_list: ['Flexo', 'Indigo'],
  },
  finance: { summary: { sga_rate_pct_by_site: { VN: 5 }, version: 1 } },
  inkCalc: {},
};

const state = {
  rfq_number: 'RFQ-FROZEN-2026-001',
  ccl_pn: 'FROZEN-2026',
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

const snapshot = freezeLib(lib, state, { userId: 'henry' });
// Pin _captured_at so the fixture is deterministic across re-runs.
snapshot._captured_at = '2026-06-20T00:00:00.000Z';
const stateWithSnapshot = { ...state, pricing_snapshot: snapshot };
const tierSt = getActiveTierState(stateWithSnapshot);
const result = calcAll(tierSt, null, lib, null, { snapshot });
const expectedResult = serializeResultForPersist(result);

const fixtureOut = {
  _comment:
    'Frozen quote fixture pinned 2026-06-20. See loadFrozenQuote.test.js for the 20-year reproducibility contract. Regenerate via scripts/regen-frozen-quote.mjs only after deliberate engine change.',
  _captured_at: '2026-06-20T00:00:00.000Z',
  lib,
  state: stateWithSnapshot,
  expected_result: expectedResult,
};

const OUT = resolve(ROOT, 'client/src/services/__fixtures__/frozen-quote-2026.json');
writeFileSync(OUT, JSON.stringify(fixtureOut, null, 2) + '\n');
console.log(`[regen-frozen-quote] wrote ${OUT}`);
console.log(`[regen-frozen-quote] expected s_ttl = ${expectedResult.s_ttl}`);
