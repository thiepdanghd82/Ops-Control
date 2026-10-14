/**
 * calcMat.matsMoq.test — Mats./MOQ (m² + lm) gross material for the active-tier
 * MOQ, the quantity counterpart of run_s + setup_s.
 *
 * calcMat is the SHARED engine for Standard (CalcMaterials) and Complex
 * (SubProductRow) materials, so testing it here covers both surfaces. The
 * key contract: RUN share applies scrap + offcut (like run_s), SETUP share
 * applies offcut only (like setup_s), usage included exactly once — so the
 * quantity stays in lockstep with the cost columns.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMat } from './calcEngine.js';

// Deterministic fixture: cavities + pitch pinned so qpa_lm_raw = 0.01 lm,
// offcut_yn 'N' → offcut 0 (offcutDiv 1), one process scrap 13% → scrapDiv 0.87.
function makeMat(over = {}) {
  return {
    code: 'X',
    width: 80,
    cavities: 1,
    pitch_ovr: 10,
    setup_lm: 100,
    usage: 1,
    s_price: 2,
    g_price: 2,
    slitting_yn: 'N',
    offcut_yn: 'N',
    free_liner: 0,
    ...over,
  };
}
function makeSt(over = {}) {
  return {
    num_webs: 1,
    parts_in_md: 1,
    sheet_length: 50,
    min_gap_md: 2,
    web_width_td: 80,
    trade_mode: 'USD(Normal)',
    processes: [{ workcenter: 'P1', scrap_pct: 0.13 }],
    ...over,
  };
}

const EFFW = 80; // mat.width
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('mats_moq_lm = run share (scrap+offcut) + setup share (offcut only); m² = lm × width', () => {
  const moq = 200000;
  const r = calcMat(makeMat(), makeSt(), moq, null, null);
  const scrapDiv = Math.max(0.001, 1 - r.scrap_factor); // 0.87
  const offcutDiv = 1; // offcut_yn 'N'
  const runShare = (r.qpa_lm_raw / scrapDiv / offcutDiv) * 1 * moq;
  const setupShare = (100 * 1) / offcutDiv;
  assert.ok(close(r.mats_moq_lm, runShare + setupShare), 'lm = run + setup share');
  assert.ok(close(r.mats_moq_m2, r.mats_moq_lm * (EFFW / 1000)), 'm² = lm × (width/1000)');
});

test('INVARIANT: mats_moq_lm − run share === setup_lm × usage / offcutDiv (locks cost consistency)', () => {
  const moq = 200000;
  const r = calcMat(makeMat(), makeSt(), moq, null, null);
  const scrapDiv = Math.max(0.001, 1 - r.scrap_factor);
  const offcutDiv = 1;
  const runShare = (r.qpa_lm_raw / scrapDiv / offcutDiv) * 1 * moq;
  assert.ok(close(r.mats_moq_lm - runShare, (100 * 1) / offcutDiv));
});

test('usage = 2 scales linearly (usage once, not squared)', () => {
  const moq = 200000;
  const r1 = calcMat(makeMat({ usage: 1 }), makeSt(), moq, null, null);
  const r2 = calcMat(makeMat({ usage: 2 }), makeSt(), moq, null, null);
  assert.ok(close(r2.mats_moq_lm, 2 * r1.mats_moq_lm), 'lm doubles when usage doubles');
  assert.ok(close(r2.mats_moq_m2, 2 * r1.mats_moq_m2), 'm² doubles when usage doubles');
});

test('setup_lm = 0 → only the run share', () => {
  const moq = 200000;
  const r = calcMat(makeMat({ setup_lm: 0 }), makeSt(), moq, null, null);
  const scrapDiv = Math.max(0.001, 1 - r.scrap_factor);
  assert.ok(close(r.mats_moq_lm, (r.qpa_lm_raw / scrapDiv / 1) * 1 * moq));
});

test('scrap 0 & offcut 0 → reduces to net qpa_lm × moq + setup_lm', () => {
  const moq = 1000;
  // no process scrap → scrap_factor 0 → scrapDiv 1; offcut_yn 'N' → offcutDiv 1
  const r = calcMat(makeMat(), makeSt({ processes: [] }), moq, null, null);
  assert.ok(close(1 - r.scrap_factor, 1), 'scrapDiv 1');
  assert.ok(close(r.mats_moq_lm, r.qpa_lm_raw * 1 * moq + 100 * 1));
});

test('run share ∝ moq; setup share independent of moq', () => {
  const rA = calcMat(makeMat(), makeSt(), 100000, null, null);
  const rB = calcMat(makeMat(), makeSt(), 200000, null, null);
  const setupShare = 100; // setup_lm × usage / offcutDiv(1)
  const runA = rA.mats_moq_lm - setupShare;
  const runB = rB.mats_moq_lm - setupShare;
  assert.ok(close(runB, 2 * runA), 'run share doubles with moq');
  // setup share constant across the two MOQs
  assert.ok(close(rA.mats_moq_lm - runA, rB.mats_moq_lm - runB));
});

test('moq = 0 → 0', () => {
  const r = calcMat(makeMat(), makeSt(), 0, null, null);
  assert.equal(r.mats_moq_lm, 0);
  assert.equal(r.mats_moq_m2, 0);
});

test('blank row (no code) → 0 on the _blank path', () => {
  const r = calcMat(makeMat({ code: '' }), makeSt(), 200000, null, null);
  assert.equal(r.mats_moq_lm, 0);
  assert.equal(r.mats_moq_m2, 0);
});

test('offcut shrinks throughput: both run and setup share grow when offcut > 0', () => {
  const moq = 200000;
  const noOff = calcMat(makeMat({ offcut_yn: 'N' }), makeSt(), moq, null, null);
  // explicit 20% offcut → offcutDiv 0.8 inflates both shares
  const withOff = calcMat(makeMat({ offcut_yn: 'Y', offcut_pct: 20 }), makeSt(), moq, null, null);
  assert.ok(withOff.mats_moq_lm > noOff.mats_moq_lm, 'offcut raises gross material');
  const scrapDiv = Math.max(0.001, 1 - withOff.scrap_factor);
  const expected = (withOff.qpa_lm_raw / scrapDiv / 0.8) * 1 * moq + (100 * 1) / 0.8;
  assert.ok(close(withOff.mats_moq_lm, expected), 'setup share also gets offcut, not scrap');
});
