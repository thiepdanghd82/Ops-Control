// @ts-check
/**
 * MES-3-FIX-33 — calcInk Indigo-subtype regression guard.
 *
 * Operator's RFQ-2026-S0012: 4 ink rows with print_type='Indigo6800'
 * (the library's actual workcenter name). Pre-fix calcInk.isIndigo
 * was strict `=== 'Indigo'` so the Indigo branch was skipped and
 * the non-Indigo formula's `ink_cover_val > 0` guard zeroed run_s
 * (no coverage lib entry for Indigo subtypes). After the helper
 * change, any `Indigo*` subtype hits the Indigo formula path that
 * uses clicks × click_charge — exactly the spec from CalcLegend.
 *
 * Runner: node --test src/services/indigoSubtype.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcInk, createStdState } from './calcEngine.js';

function fixtureLib() {
  return {
    ddl: {
      coverage: [],
      click_charges: { 1: 0.0064, 2: 0.0074, 6: 0.0084 },
    },
  };
}

function fixtureSt() {
  const st = createStdState();
  st.part_width = 462;
  st.part_length_md = 135;
  st.web_width_td = 300;
  st.sheet_length = 480;
  st.min_gap_md = 5;
  st.parts_web_across = 2;
  st.parts_in_md = 2;
  st.materials = [{ code: 'M001', width: 300, usage: 1 }];
  return st;
}

test('FIX-33: ink with print_type=Indigo6800 now hits the Indigo branch (clicks → run_s)', () => {
  const st = fixtureSt();
  const ink = {
    color: 'K',
    print_type: 'Indigo6800',
    base_mat: 'M001',
    clicks: 4,
    latest: 50,
    s_price: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, fixtureLib());
  // Indigo branch sets layout_indigo_disp to a number (floor(980/pitch) × layout × webs).
  assert.notEqual(
    r.layout_indigo_disp,
    '',
    'expected Indigo branch (numeric layout_indigo_disp), got non-Indigo branch'
  );
  assert.ok(r.run_s > 0, `run_s should be > 0 for Indigo6800 (got ${r.run_s})`);
});

test('FIX-33: ink with print_type=Indigo also still works (canonical name kept)', () => {
  const st = fixtureSt();
  const ink = {
    color: 'C',
    print_type: 'Indigo',
    base_mat: 'M001',
    clicks: 2,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, fixtureLib());
  assert.notEqual(r.layout_indigo_disp, '');
  assert.ok(r.run_s > 0, `run_s should be > 0 for canonical Indigo (got ${r.run_s})`);
});

test('FIX-33: non-Indigo print_type stays on non-Indigo branch (Flexo regression guard)', () => {
  const st = fixtureSt();
  const lib = {
    ddl: { coverage: [{ pt: 'Flexo', cov: 100 }], click_charges: {} },
  };
  const ink = {
    color: 'C',
    print_type: 'Flexo',
    base_mat: 'M001',
    clicks: 0,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, lib);
  // Non-Indigo: layout_indigo_disp is empty string, formula uses coverage.
  assert.equal(r.layout_indigo_disp, '', 'expected non-Indigo branch (empty layout_indigo_disp)');
  assert.ok(r.run_s > 0, `Flexo run_s should be > 0 with coverage (got ${r.run_s})`);
});
