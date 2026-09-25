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
