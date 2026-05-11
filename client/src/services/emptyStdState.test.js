// @ts-check
/**
 * MES-3-FIX-32 follow-up — `createEmptyStdState` Layout-default regression
 * guard.
 *
 * Operator's RFQ-2026-S0012 hardware test: clicking "New" dispatched
 * RESET_STD → createEmptyStdState() which defaulted num_webs / parts_in_md
 * / parts_web_across to 0. `calcQPA_LM` early-returns 0 when !num_webs,
 * which made every Run Material cost display "—" (qpa_lm_raw=0 →
 * run_s=0 → fmtN(0)===EMDASH). Loaded quotes (from Quote History) didn't
 * hit this because saved states had non-zero values.
 *
 * This test pins the contract: a fresh "empty" Std state must produce
 * a non-zero Run Material cost when material rows have valid inputs —
 * i.e. the 1×1 layout invariant from createStdState's comment
 * ("prevents /0 in derived math") MUST also hold for createEmptyStdState.
 *
 * Runner: node --test src/services/emptyStdState.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdState, createEmptyStdState, calcMat, calcQPA_LM } from './calcEngine.js';

test('FIX-32 follow-up: createEmptyStdState defaults num_webs / parts_in_md / parts_web_across to 1', () => {
  const st = createEmptyStdState();
  assert.equal(st.num_webs, 1, 'num_webs MUST default to 1 (1×1 trivial layout invariant)');
  assert.equal(st.parts_in_md, 1, 'parts_in_md MUST default to 1');
  assert.equal(st.parts_web_across, 1, 'parts_web_across MUST default to 1');
});

test('FIX-32 follow-up: createEmptyStdState defaults align with createStdState for layout-critical fields', () => {
  const empty = createEmptyStdState();
  const std = createStdState();
  // Only the Layout-geometry fields that cause /0 trap need to match.
  // Other numerics (moq, annual_qty, prices) intentionally stay 0 in
  // the "empty" variant because the operator hasn't entered them yet.
  for (const field of ['num_webs', 'parts_in_md', 'parts_web_across']) {
    assert.equal(empty[field], std[field], `${field} should match createStdState`);
  }
});

test('FIX-32 follow-up: calcQPA_LM returns non-zero for an empty state with material inputs', () => {
  const st = createEmptyStdState();
  // Operator-fills the Print sub-tab equivalent of the RFQ-2026-S0012
  // scenario.
  st.part_width = 462;
  st.part_length_md = 135;
  st.web_width_td = 300;
  st.sheet_length = 480;
  st.min_gap_md = 5;
  const mat = { code: 'M001', width: 300, cavities: 4 };
  const qpa = calcQPA_LM(st, mat);
  assert.ok(
    qpa > 0,
    `calcQPA_LM should produce non-zero (got ${qpa}) — !num_webs early-return regression`
  );
});

test('FIX-32 follow-up: calcMat returns non-zero run_s for RFQ-2026-S0012 inputs on fresh empty state', () => {
  const st = createEmptyStdState();
  st.part_width = 462;
  st.part_length_md = 135;
  st.web_width_td = 300;
  st.sheet_length = 480;
  st.min_gap_md = 5;
  // Operator's Materials row: Indigo with manual MAT PRICE
  const mat = {
    code: 'M001',
    desc: 'mat',
    usage: 1,
    width: 300,
    cavities: 4,
    pitch_ovr: 0,
    s_price: 0,
    g_price: 0,
    latest: 3.35, // MAT PRICE column
    offcut_pct: 0,
    setup_lm: 0,
  };
  const r = calcMat(mat, st, 500, null, null);
  assert.ok(r.qpa_lm_raw > 0, `qpa_lm_raw should be > 0 (got ${r.qpa_lm_raw})`);
  assert.ok(r.run_s > 0, `run_s should be > 0 (got ${r.run_s}) — Bug A regression`);
});
