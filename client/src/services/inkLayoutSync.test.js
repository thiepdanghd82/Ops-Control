// @ts-check
/**
 * MES-3-FIX-40 — calcInk Width + Pitch sync from Layout.
 *
 * Operator feedback 2026-05-11: rename "Base Mat" → "Width", let Width
 * + Pitch in Inks inherit from Layout (`web_width_td` + computed
 * pitch) when blank, overridable per-row. Existing saved quotes that
 * stored a width-as-string in `ink.base_mat` must still resolve via
 * the legacy fallback chain.
 *
 * Runner: node --test src/services/inkLayoutSync.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcInk, createStdState } from './calcEngine.js';

function libNoCoverage() {
  return { ddl: { coverage: [], click_charges: { 1: 0.0064, 2: 0.0074, 4: 0.0074, 6: 0.0084 } } };
}

function baseSt() {
  const st = createStdState();
  st.part_width = 462;
  st.part_length_md = 135;
  st.web_width_td = 300;
  st.sheet_length = 480;
  st.min_gap_md = 5;
  st.parts_web_across = 2;
  st.parts_in_md = 2;
  return st;
}

test('FIX-40 width: ink.width=0 + web_width_td=300 → calc uses 300 (layout sync)', () => {
  const st = baseSt();
  const ink = {
    color: 'K',
    print_type: 'Indigo6800',
    width: 0,
    clicks: 4,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, libNoCoverage());
  assert.ok(r.run_s > 0, `Indigo run_s should compute with layout-synced width (got ${r.run_s})`);
});

test('FIX-40 width: ink.width=200 overrides web_width_td=300', () => {
  const st = baseSt();
  const lib = { ddl: { coverage: [{ pt: 'Flexo', cov: 100 }], click_charges: {} } };
  const inkBase = {
    color: 'C',
    print_type: 'Flexo',
    width: 0,
    latest: 50,
    area_pct: 1,
  };
  const r300 = calcInk(inkBase, st, 500, lib);
  const r200 = calcInk({ ...inkBase, width: 200 }, st, 500, lib);
  // Same coverage but different width → run_s scales linearly with width
  assert.ok(r300.run_s > r200.run_s, 'width=300 should yield higher run_s than width=200');
  assert.ok(
    Math.abs(r200.run_s / r300.run_s - 200 / 300) < 0.01,
    'run_s should scale with width ratio'
  );
});

test('FIX-40 width legacy: ink.base_mat="Mat-300" still parses to 300 (backward compat)', () => {
  const st = baseSt();
  st.web_width_td = 0; // force legacy fallback path
  const lib = { ddl: { coverage: [{ pt: 'Flexo', cov: 100 }], click_charges: {} } };
  const ink = {
    color: 'C',
    print_type: 'Flexo',
    width: 0,
    base_mat: 'Mat-300',
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, lib);
  assert.ok(
    r.run_s > 0,
    `legacy base_mat parse should still produce non-zero run_s (got ${r.run_s})`
  );
});

test('FIX-40 width: explicit ink.width takes precedence over web_width_td AND base_mat', () => {
  const st = baseSt();
  st.web_width_td = 500; // would default to 500 if ink.width=0
  const lib = { ddl: { coverage: [{ pt: 'Flexo', cov: 100 }], click_charges: {} } };
  const inkOverride = {
    color: 'C',
    print_type: 'Flexo',
    width: 100,
    base_mat: '999',
    latest: 50,
    area_pct: 1,
  };
  const inkDefault = { ...inkOverride, width: 0 };
  const rOv = calcInk(inkOverride, st, 500, lib);
  const rDef = calcInk(inkDefault, st, 500, lib);
  // override uses 100; default uses web_width_td=500 → 5x larger
  assert.ok(
    rDef.run_s / rOv.run_s > 4.9 && rDef.run_s / rOv.run_s < 5.1,
    `ratio should be 500/100=5 (got ${rDef.run_s / rOv.run_s})`
  );
});

test('FIX-40 pitch: ink.pitch_mm=0 → uses layout calcPitch (sheet_length+min_gap_md=485)', () => {
  const st = baseSt(); // sheet_length=480 + min_gap_md=5 → pitch=485
  const ink = {
    color: 'K',
    print_type: 'Indigo6800',
    pitch_mm: 0,
    width: 300,
    clicks: 4,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, libNoCoverage());
  // Indigo layout_indigo_disp = floor(980/pitch) × layout_per_sheet × num_webs
  // = floor(980/485) × 4 × 1 = 2 × 4 = 8
  assert.equal(
    r.layout_indigo_disp,
    8,
    `expected layout_indigo_disp=8 with layout pitch (got ${r.layout_indigo_disp})`
  );
});

test('FIX-40 pitch: ink.pitch_mm=200 overrides layout pitch=485', () => {
  const st = baseSt();
  const ink = {
    color: 'K',
    print_type: 'Indigo6800',
    pitch_mm: 200,
    width: 300,
    clicks: 4,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, libNoCoverage());
  // pitch=200 → floor(980/200) × 4 × 1 = 4 × 4 = 16
  assert.equal(
    r.layout_indigo_disp,
    16,
    `expected layout_indigo_disp=16 with override pitch=200 (got ${r.layout_indigo_disp})`
  );
});

test('FIX-40 pitch: ink.pitch_mm=NaN treated as override-not-set, falls back to layout', () => {
  const st = baseSt();
  const ink = {
    color: 'K',
    print_type: 'Indigo6800',
    pitch_mm: '',
    width: 300,
    clicks: 4,
    latest: 50,
    area_pct: 1,
  };
  const r = calcInk(ink, st, 500, libNoCoverage());
  assert.equal(r.layout_indigo_disp, 8);
});
