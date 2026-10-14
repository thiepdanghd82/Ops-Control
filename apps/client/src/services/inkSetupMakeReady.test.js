// @ts-check
/**
 * Setup ink is consumed over the MAKE-READY LENGTH of web, not over one metre.
 *
 * `calcInk`'s setup term is `area_pct × width_m × <length> / coverage`, which is
 * only kg if `<length>` is in metres. It read `baseMat.usage` — a per-piece
 * multiplier, not a length — resolved through `ink.base_mat`. That was wrong
 * twice over:
 *
 *   1. The lookup can never succeed. `base_mat` holds a WIDTH ever since
 *      MES-3-FIX-40 renamed that column to "Width" — measured on live data
 *      2026-09-25: 258 ink rows carry a `base_mat`, and ZERO match any
 *      material code (the values are '340', '270', '255', …).
 *   2. Even when it succeeds it reads the wrong field. `usage` is the
 *      per-piece multiplier; the make-ready length is `setup_lm`, which is
 *      what `calcMat` already uses for MATERIAL setup.
 *
 * So material setup charged `setup_lm` metres while ink setup charged 1 metre
 * of the SAME make-ready. Proven on RFQ-2026-S0069: changing setup_lm 40 → 20
 * halved material setup (0.000719585 → 0.000359793) and left ink setup
 * untouched at 0.000251653.
 *
 * Runner: node --test src/services/inkSetupMakeReady.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcInk, createStdState } from './calcEngine.js';

const LIB = { ddl: { coverage: [{ pt: 'Flexo', cov: 300 }], click_charges: {} } };

/** RFQ-2026-S0069 as Henry saved it 2026-09-25. */
function s0069(setupLm = 20, usage = 1) {
  const st = createStdState();
  st.web_width_td = 170;
  st.sheet_length = 208;
  st.min_gap_md = 3; // → pitch 211
  st.parts_web_across = 1;
  st.parts_in_md = 8;
  st.num_webs = 1;
  st.materials = [
    { code: 'MZ-0104', row_type: 'Main.Mat', setup_lm: setupLm, usage, width: 0, latest: 1.9106 },
  ];
  st.processes = [{ workcenter: 'Flexo', scrap_pct: 0.1 }];
  return st;
}
const INK = {
  color: 'Black',
  print_type: 'Flexo',
  setup_kg: 0.1,
  area_pct: 0.7,
  coverage_override: 180,
  latest: 50,
};
const MOQ = 20000;

test('setup ink uses the primary material setup_lm — matches the Excel sheet', () => {
  // 50 × (0.1 + 0.7 × 0.170 × 20 / 180) / 20000
  const r = calcInk({ ...INK }, s0069(20), MOQ, LIB);
  assert.ok(
    Math.abs(r.setup_s - 0.0002830555555555556) < 1e-12,
    `expected Excel's 0.000283056, got ${r.setup_s}`
  );
});

test('the make-ready length is proportional — doubling setup_lm doubles the coverage term', () => {
  const flat = (0.1 * 50) / MOQ; // the setup_kg part, independent of length
  const a = calcInk({ ...INK }, s0069(20), MOQ, LIB).setup_s - flat;
  const b = calcInk({ ...INK }, s0069(40), MOQ, LIB).setup_s - flat;
  assert.ok(Math.abs(b - 2 * a) < 1e-12, `coverage term must scale with length: ${a} vs ${b}`);
});

test('material `usage` no longer moves setup ink — it was the wrong field', () => {
  const u1 = calcInk({ ...INK }, s0069(20, 1), MOQ, LIB).setup_s;
  const u5 = calcInk({ ...INK }, s0069(20, 5), MOQ, LIB).setup_s;
  assert.equal(u5, u1, 'usage is a per-piece multiplier, not a make-ready length');
});

test('a legacy base_mat holding a WIDTH resolves nothing and must not be treated as a code', () => {
  // '340' is the single most common live value — it is a width, not a code.
  const r = calcInk({ ...INK, base_mat: '340' }, s0069(20), MOQ, LIB);
  assert.ok(
    Math.abs(r.setup_s - 0.0002830555555555556) < 1e-12,
    `must still fall back to the primary material's setup_lm, got ${r.setup_s}`
  );
});

test('no material row → charge only the flat setup_kg, never a phantom 1 metre', () => {
  const st = s0069(20);
  st.materials = [];
  const r = calcInk({ ...INK }, st, MOQ, LIB);
  assert.ok(
    Math.abs(r.setup_s - (0.1 * 50) / MOQ) < 1e-12,
    `unknown make-ready length must contribute 0, got ${r.setup_s}`
  );
});

test('run cost is untouched by setup_lm', () => {
  const a = calcInk({ ...INK }, s0069(20), MOQ, LIB).run_s;
  const b = calcInk({ ...INK }, s0069(1230), MOQ, LIB).run_s;
  assert.equal(a, b, 'setup_lm is a setup-only input');
  assert.ok(Math.abs(a - 0.0009687109) < 1e-9, `run should stay at Excel's 0.000969, got ${a}`);
});

// ── Indigo: the SAME make-ready length, counted in 980 mm frames ─────────────
//
// The source workbook (CCL vina (Samsung).xlsm, cell T33) reads ONE column for
// both branches: `VLOOKUP(D33, B11:G20, 6,)` — the 6th column of B:G is G,
// headed "Setup lm". The Indigo branch divides it by 0.98, i.e. counts metres
// of make-ready in 0.98 m (980 mm) Indigo frames, the same frame the run
// formula divides the pitch into. The port mapped column 6 to `usage` (column
// F, the 5th) in BOTH branches; #427 fixed the coverage branch, this is the
// other half. Henry's own Excel for RFQ-2026-S0073 gives 0.0084 × 8 × 41 / 1000.

/** RFQ-2026-S0073 as saved 2026-09-25 06:13. */
function s0073(setupLm = 40) {
  const st = createStdState();
  st.web_width_td = 270;
  st.sheet_length = 957;
  st.min_gap_md = 3; // pitch 960 → ⌊980/960⌋ = 1 repeat per frame
  st.parts_web_across = 4;
  st.parts_in_md = 11;
  st.num_webs = 1;
  st.materials = [
    {
      code: 'SW-7325F',
      row_type: 'Main.Mat',
      setup_lm: setupLm,
      usage: 1,
      width: 0,
      latest: 0.4483,
    },
  ];
  st.processes = [{ workcenter: 'FQC', scrap_pct: 0.1 }];
  return st;
}
const INDIGO = { color: 'CMYK', print_type: 'Indigo', clicks: 8, setup_kg: 0.05, area_pct: 1 };
const LIB_I = {
  ddl: {
    coverage: [],
    click_charges: {
      1: 0.030036,
      2: 0.0074,
      4: 0.0074,
      6: 0.0084,
      8: 0.0084,
      10: 0.0084,
      12: 0.0084,
      14: 0.0084,
    },
  },
};
const MOQ_I = 1000;

test('Indigo setup counts setup_lm in 980 mm frames — matches the Excel sheet', () => {
  // ⌈40 / 0.98⌉ = 41 frames × 0.0084 × 8 clicks / 1000
  const r = calcInk({ ...INDIGO }, s0073(40), MOQ_I, LIB_I);
  assert.ok(
    Math.abs(r.setup_s - 0.0027552) < 1e-12,
    `expected Excel's 0.0027552, got ${r.setup_s}`
  );
});

test('Indigo run is untouched by the make-ready length', () => {
  const a = calcInk({ ...INDIGO }, s0073(40), MOQ_I, LIB_I).run_s;
  const b = calcInk({ ...INDIGO }, s0073(1230), MOQ_I, LIB_I).run_s;
  assert.equal(a, b, 'setup_lm is a setup-only input');
  // 0.0084 × 8 / 44 / 0.9
  assert.ok(Math.abs(a - 0.0016969696969697) < 1e-12, `run should stay at 0.001697, got ${a}`);
});

test('Indigo frames are whole — an exact multiple of 0.98 m must not gain a frame', () => {
  // 19.6 / 0.98 is 20.000000000000004 in IEEE 754, so a bare ceil() charges 21.
  // Measured: 73 setup_lm values between 0.05 m and 2000 m hit this.
  const r = calcInk({ ...INDIGO }, s0073(19.6), MOQ_I, LIB_I);
  const frames = (r.setup_s * MOQ_I) / (0.0084 * 8);
  assert.ok(Math.abs(frames - 20) < 1e-9, `19.6 m is exactly 20 frames, got ${frames}`);
});

test('Indigo reads the same length as the coverage branch — `usage` moves neither', () => {
  const st = s0073(40);
  st.materials[0].usage = 5;
  const r = calcInk({ ...INDIGO }, st, MOQ_I, LIB_I);
  assert.ok(
    Math.abs(r.setup_s - 0.0027552) < 1e-12,
    `usage must not move Indigo setup, got ${r.setup_s}`
  );
});

test('Indigo with no material row charges no make-ready frames, never a phantom two', () => {
  const st = s0073(40);
  st.materials = [];
  assert.equal(calcInk({ ...INDIGO }, st, MOQ_I, LIB_I).setup_s, 0);
});
