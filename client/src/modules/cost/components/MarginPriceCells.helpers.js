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

/**
 * Should the held metric write a new price for this tier, and which?
 *
 * Extracted from the effect that drives it because this is the one piece
 * that can genuinely misbehave: an effect that writes state it also reads
 * will spin forever if the write never settles. The stop condition is that
 * the solved price is ALREADY the tier's price -- writing it would change
 * nothing, so there is nothing to do and the loop ends.
 *
 * Comparing against the tier's CURRENT price rather than against the last
 * price this driver wrote is what makes a manual override recoverable: if
 * the operator types a price of their own, current no longer matches what
 * the hold wants, so the hold corrects it on the next pass. A guard that
 * remembered its own last write would refuse, and the metric would sit
 * wrong with nothing explaining why.
 *
 * @param {{pinned:number,actual:number,delta:number}|null} drift
 * @param {number|null} solved   price the solver returned
 * @param {number} currentPrice  the price this tier holds right now
 * @returns {number|null} rounded price to write, or null to leave it alone
 */

export function planAutoHold(drift, solved, currentPrice) {
  if (!drift) return null;
  if (solved == null || !Number.isFinite(solved) || !(solved > 0)) return null;
  const rounded = +Number(solved).toFixed(4); // matches planTierPriceWrite
  const current = Number(currentPrice);
  if (Number.isFinite(current) && +current.toFixed(4) === rounded) return null;
  return rounded;
}

/**
 * The drift worth SHOWING: pinned, off target, and something can be done.
 *
 * `pinDrift` answers "is this off the pinned number", which is not the same
 * question the amber cue asks. The cue means "this is not what you asked for,
 * and clicking will fix it" — so when nothing can be written, it is an alarm
 * with no remedy. Clicking re-apply re-solves, rounds to the same 4 decimals,
 * writes the price that is already there, and the cue never clears.
 *
 * That is not hypothetical. Price is stored to 4dp, so on a low-value label a
 * target can be unreachable outright: at cost 0.02382 a pinned GM of 20.0%
 * wants 0.029775, which rounds to 0.0298 and reads back as 20.07% — while the
 * neighbouring price 0.0297 reads 19.80%. No 4dp price gives 20.0%, so the old
 * cue fired forever on 21 of 147 live quotes, all of them low-price.
 *
 * The condition is deliberately `planAutoHold`'s and not a second copy of it:
 * the cue and the remedy must agree by construction, or one of them is lying.
 *
 * @param {{metric:string,pct:number}|null} pin
 * @param {string} metric
 * @param {number|null} actual
 * @param {number|null} solved   price the solver returns for the pin
 * @param {number} currentPrice  the price this tier holds right now
 * @returns {{pinned:number,actual:number,delta:number}|null}
 */
export function actionablePinDrift(pin, metric, actual, solved, currentPrice) {
  const drift = pinDrift(pin, metric, actual);
  if (!drift) return null;
  return planAutoHold(drift, solved, currentPrice) == null ? null : drift;
}
