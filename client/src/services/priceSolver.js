// priceSolver — price ↔ margin inversion for the Cost Breakdown tab.
//
// The forward calc (calcEngine / cplxTierAggregate) turns a price into
// VA% / Contr% / GM%. This module inverts it: given a target metric it
// finds the price that yields it, and computes a DEFAULT price anchored to
// GM = 25% (raised if a secondary floor binds higher).
//
// It NEVER re-derives the margin algebra — it evaluates the SAME forward
// calc the tab uses at candidate prices and bisects (each metric is
// monotone increasing in price). That keeps the inversion exactly
// consistent with the displayed numbers even if a cost term itself depends
// on price (VAT loss / SGA), where hand-inverting the algebra would drift
// (Lesson 3).
import { calcAll, buildTierState, enumerateTiers } from './calcEngine.js';
import { aggregateForTier } from './cplxTierAggregate.js';

// Margin floors. `primary` is the labeled anchor (GM 25%); the default
// price is raised if a secondary floor needs a higher price. Tunable here.
export const MARGIN_POLICY = Object.freeze({
  primary: 'gm',
  gm: 0.25,
  contr: 0.25,
  va: 0.3,
});

// ── Numeric core (pure, injectable — unit-tested without a full lib) ──────

/**
 * Bisection: find the price where `evalMetric(price) === targetPct` within
 * tolerance. `evalMetric` must be monotone increasing in price and return a
 * finite number (or null when it can't be evaluated).
 *
 * Returns null when unsolvable: target ≥ 100%, non-finite target, cost base
 * ≤ 0 (margin is always ≥ 100% so a sub-100% target is unreachable), or the
 * evaluator can't bracket a crossing.
 *
 * @param {(price:number)=>(number|null)} evalMetric
 * @param {number} targetPct  fraction (0.25 = 25%)
 * @param {{tol?:number}} [opts]
 * @returns {number|null}
 */
export function solveMetric(evalMetric, targetPct, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  if (!Number.isFinite(targetPct) || targetPct >= 1) return null;
  const f = (p) => {
    const m = evalMetric(p);
    return typeof m === 'number' && Number.isFinite(m) ? m : null;
  };

  // metric(1) = 1 − cost(1)/1 → cost(1) = 1 − metric(1). If cost ≤ 0 the
  // margin is ≥ 100% at every positive price, so a sub-100% target has no
  // solution.
  const mRef = f(1);
  if (mRef == null) return null;
  const costBase = 1 - mRef;
  if (!(costBase > 0)) return null;

  // Analytic seed for the upper bracket (exact when cost is price-independent).
  let hi = costBase / (1 - targetPct);
  if (!(hi > 0) || !Number.isFinite(hi)) return null;
  let fhi = f(hi);
  if (fhi != null && Math.abs(fhi - targetPct) <= tol) return hi;
  // Grow hi until the metric reaches the target (covers price-dependent cost).
  let guard = 0;
  while ((fhi == null || fhi < targetPct) && guard++ < 200) {
    hi *= 2;
    fhi = f(hi);
  }
  if (fhi == null || fhi < targetPct) return null;

  // Shrink lo until the metric is below the target.
  let lo = hi / 2;
  let flo = f(lo);
  guard = 0;
  while ((flo == null || flo >= targetPct) && guard++ < 200) {
    lo /= 2;
    flo = f(lo);
  }
  if (flo == null || flo >= targetPct) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm == null) return null;
    if (Math.abs(fm - targetPct) <= tol) return mid;
    if (fm < targetPct) lo = mid;
    else hi = mid;
    if (hi - lo <= 1e-12 * Math.max(1, hi)) break;
  }
  const price = (lo + hi) / 2;
  return price > 0 && Number.isFinite(price) ? price : null;
}

/**
 * DEFAULT price from an injected evaluator: anchored to GM = 25% but raised
 * to keep the secondary floors (Contr ≥ 25%, VA ≥ 30%). Returns the price +
 * `boundBy` (which floor set it: 'gm' | 'contribution' | 'va') and the three
 * per-metric floor prices. Null when none is solvable.
 *
 * @param {(price:number)=>({gm:number|null, va:number|null, contribution:number|null})} evalAll
 * @param {typeof MARGIN_POLICY} [policy]
 * @param {{tol?:number}} [opts]
 */
export function defaultPriceFromEval(evalAll, policy = MARGIN_POLICY, opts = {}) {
  const pGm = solveMetric((p) => evalAll(p).gm, policy.gm, opts);
  const pContr = solveMetric((p) => evalAll(p).contribution, policy.contr, opts);
  const pVa = solveMetric((p) => evalAll(p).va, policy.va, opts);
  // Order matters: primary 'gm' first so it wins an exact tie.
  const cands = [
    ['gm', pGm],
    ['contribution', pContr],
    ['va', pVa],
  ].filter(([, p]) => p != null && p > 0 && Number.isFinite(p));
  if (!cands.length) return null;
  let boundBy = cands[0][0];
  let price = cands[0][1];
  for (const [m, p] of cands) {
    if (p > price + 1e-12) {
      price = p;
      boundBy = m;
    }
  }
  return { price, boundBy, gm: pGm, contr: pContr, va: pVa };
}

// ── Forward-calc evaluators (Std via calcAll, Cpx via aggregateForTier) ────

function clonePriceInto(state, tierIdx, price) {
  if (tierIdx === 0) return { ...state, selling_price: price };
  const extra = [...(state.extra_moqs || [])];
  extra[tierIdx - 1] = { ...(extra[tierIdx - 1] || {}), price };
  return { ...state, extra_moqs: extra };
}

function tierMoqEau(state, tierIdx) {
  const tier = enumerateTiers(state).find((x) => x.idx === tierIdx);
  return tier
    ? { moq: tier.moq, eau: tier.eau }
    : { moq: state.moq || 0, eau: state.annual_qty || 0 };
}

/**
 * VA/Contr/GM at a candidate price for one tier, via the SAME forward calc
 * the Cost Breakdown table runs.
 *
 * @param {object} state  stdState or cplxState
 * @param {object} lib
 * @param {number} tierIdx
 * @param {number} price
 * @param {{kind?:'std'|'cpx', snapshot?:object, sps?:Array,
 *          bomQtyEnabled?:boolean, spMoqScalingEnabled?:boolean}} [opts]
 * @returns {{gm:number|null, va:number|null, contribution:number|null}}
 */
export function metricAtPrice(state, lib, tierIdx, price, opts = {}) {
  const empty = { gm: null, va: null, contribution: null };
  try {
    if (opts.kind === 'cpx') {
      const cs = clonePriceInto(state, tierIdx, price);
      const agg = aggregateForTier(cs, opts.sps || cs.subproducts || [], lib, tierIdx, {
        bomQtyEnabled: opts.bomQtyEnabled,
        spMoqScalingEnabled: opts.spMoqScalingEnabled,
        snapshot: opts.snapshot,
      });
      return agg ? { gm: agg.gm, va: agg.va, contribution: agg.contribution } : empty;
    }
    const { moq, eau } = tierMoqEau(state, tierIdx);
    const tierSt = buildTierState(state, tierIdx, price, moq, eau);
    const r = calcAll(tierSt, null, lib, null, { snapshot: opts.snapshot });
    return r ? { gm: r.gm, va: r.va, contribution: r.contribution } : empty;
  } catch {
    return empty;
  }
}

/**
 * Solve the price that makes one metric equal targetPct for a tier.
 * @param {'gm'|'va'|'contribution'} metric
 */
export function solvePriceForMetric(state, lib, tierIdx, metric, targetPct, opts = {}) {
  return solveMetric((p) => metricAtPrice(state, lib, tierIdx, p, opts)[metric], targetPct, opts);
}

/** DEFAULT price for a tier (GM 25%, raised for the secondary floors). */
export function defaultPrice(state, lib, tierIdx, opts = {}) {
  return defaultPriceFromEval(
    (p) => metricAtPrice(state, lib, tierIdx, p, opts),
    MARGIN_POLICY,
    opts
  );
}

// ── Write planning + guards (pure; reused by the tab + unit-tested) ────────

/**
 * The USD + VND field names to write for a table/tier.
 * Selling → selling_price/selling_price_vnd (tier 0) or price/price_vnd (tier>0).
 * Target  → target/target_vnd (both tier 0 and tier>0).
 */
export function priceFields(table, tierIdx) {
  if (table === 'selling') {
    return tierIdx === 0
      ? { usd: 'selling_price', vnd: 'selling_price_vnd' }
      : { usd: 'price', vnd: 'price_vnd' };
  }
  return { usd: 'target', vnd: 'target_vnd' };
}

/**
 * Plan the reducer actions to write a solved USD price + its VND mirror for a
 * tier, honoring the Std/Cpx slice split (MES-3-FIX-53). Mirrors the existing
 * updateExtraMoqWithRate math (USD→VND ×rate, 0 dp).
 *
 * @param {{kind:'std'|'cpx', table:'selling'|'target', tierIdx:number,
 *          usd:number, rate:number}} p
 * @returns {Array<{type:string, payload:object}>}
 */
export function planTierPriceWrite({ kind, table, tierIdx, usd, rate }) {
  const { usd: usdField, vnd: vndField } = priceFields(table, tierIdx);
  const roundedUsd = +Number(usd).toFixed(4);
  if (!Number.isFinite(roundedUsd)) return [];
  const vnd = rate > 0 ? +(roundedUsd * rate).toFixed(0) : null;
  const actions = [];
  if (tierIdx === 0) {
    const type = kind === 'cpx' ? 'SET_CPLX_FIELD' : 'SET_STD_FIELD';
    actions.push({ type, payload: { field: usdField, value: roundedUsd } });
    if (vnd != null) actions.push({ type, payload: { field: vndField, value: vnd } });
  } else {
    const type = kind === 'cpx' ? 'SET_CPLX_EXTRA_MOQ' : 'SET_EXTRA_MOQ';
    const idx = tierIdx - 1;
    actions.push({ type, payload: { idx, field: usdField, value: roundedUsd } });
    if (vnd != null) actions.push({ type, payload: { idx, field: vndField, value: vnd } });
  }
  return actions;
}

/** A tier price is "empty" (eligible for auto-seed) when it isn't a positive number. */
export function isEmptyPrice(v) {
  return v == null || v === '' || !(Number(v) > 0);
}

/** True when any metric is below its policy floor (drives the red/amber cue). */
export function belowFloor(metrics, policy = MARGIN_POLICY) {
  if (!metrics) return false;
  const lt = (x, floor) => typeof x === 'number' && Number.isFinite(x) && x < floor - 1e-9;
  return (
    lt(metrics.gm, policy.gm) || lt(metrics.contribution, policy.contr) || lt(metrics.va, policy.va)
  );
}
