// Pure helpers for MarginPriceCells (split out so the .jsx exports only
// components — react-refresh/only-export-components).
// Explicit .js — this file carries unit tests, and `node --test` resolves
// ESM strictly. Same reason CalcLeadTimeNotice.helpers.js spells it out.
import { MARGIN_POLICY } from '../../../services/priceSolver.js';

export const FLOORS = {
  va: MARGIN_POLICY.va,
  contribution: MARGIN_POLICY.contr,
  gm: MARGIN_POLICY.gm,
};

/** True when this metric's value is below its policy floor. */
export function metricWarn(metric, value) {
  const floor = FLOORS[metric];
  return typeof value === 'number' && Number.isFinite(value) && value < floor - 1e-9;
}

/** Human hint for the suggested default price (GM 25%, noting any raise). */
export function formatDefaultHint(def) {
  if (!def || !(def.price > 0)) return null;
  const p = '$' + def.price.toFixed(4);
  if (def.boundBy === 'va') return `GM 25% → ${p} · raised to keep VA ≥ 30%`;
  if (def.boundBy === 'contribution') return `GM 25% → ${p} · raised to keep Contr ≥ 25%`;
  return `GM 25% → ${p}`;
}

// ── Drift against the operator's pinned target ───────────────────────────
//
// Distinct from metricWarn(), which fires on the COMPANY floor. A quote can
// sit comfortably above the floor and still have drifted off the number the
// operator pinned — 30% sliding to 27.3% is above the 25% floor, so the floor
// warning stays silent. That silence is the whole complaint this addresses.

/**
 * Half of the cells' display granularity. Percentages render via
 * `(value * 100).toFixed(1)`, so 0.1pp is the smallest visible step and
 * anything under half of that would round to the SAME string the operator
 * pinned — flagging it would be crying wolf about a difference nobody can see.
 */
export const PIN_TOLERANCE = 0.0005;

/**
 * Has this metric drifted off its pin? Returns null when nothing is pinned,
 * when the pin belongs to a different metric, when the live value is not
 * computable, or when the gap is too small to be visible.
 *
 * @param {{metric:string,pct:number}|null} pin
 * @param {string} metric   the metric this cell renders
 * @param {number|null} actual  live value as a fraction
 * @returns {{pinned:number, actual:number, delta:number}|null}
 */
export function pinDrift(pin, metric, actual) {
  if (!pin || pin.metric !== metric) return null;
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return null;
  const delta = actual - pin.pct;
  if (Math.abs(delta) <= PIN_TOLERANCE) return null;
  return { pinned: pin.pct, actual, delta };
}

/** One-line hint for the drifted cell's tooltip. */
export function formatPinHint(drift, suggestedPrice) {
  if (!drift) return '';
  const p = (x) => `${(x * 100).toFixed(1)}%`;
  const dir = drift.delta < 0 ? 'below' : 'above';
  const head = `Now ${p(drift.actual)} — ${p(Math.abs(drift.delta))} ${dir} the ${p(drift.pinned)} you pinned.`;
  return suggestedPrice > 0 && Number.isFinite(suggestedPrice)
    ? `${head} Click to re-apply at $${Number(suggestedPrice).toFixed(4)}.`
    : `${head} Click to re-apply.`;
}
