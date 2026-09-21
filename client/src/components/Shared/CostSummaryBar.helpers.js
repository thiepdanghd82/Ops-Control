/**
 * CostSummaryBar.helpers — pure tier-list derivation for the summary-bar
 * TIER cell.
 *
 * Extracted rather than inlined because logic inside JSX cannot be
 * asserted in this repo (node:test, no React testing infra), and because
 * Standard and Complex must offer the SAME tiers. They are twins: the
 * moment one derives the list differently from the other they drift, and
 * nothing goes red (Lesson 48).
 *
 * `extra_moqs` is the authoritative tier set, NOT `num_moq`. The tier
 * radios on the RFQ card iterate `(state.extra_moqs || []).map(...)`
 * (CalcHeader.jsx:417 for Standard, ComplexCalc.jsx:1673 for Complex),
 * so the dropdown must iterate the same array or it would offer a tier
 * the radio does not — two derivations of one set, which is exactly how
 * a control ends up listing options that select nothing (Lesson 41).
 * Measured 2026-09-21: across all 147 live quotes `num_moq` and
 * `extra_moqs.length + 1` agree, so this costs nothing today; it is the
 * drift that is being prevented.
 */
import { fmtInt } from '../../utils/format.js';

/** Coerce a MOQ cell to a positive number, or 0 when blank/garbage. */
function toQty(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Tier options for a Std or Cpx state, base tier first.
 *
 * @param {object} state stdState or cplxState
 * @returns {Array<{idx: number, moq: number}>} always length >= 1
 */
export function buildTierOptions(state) {
  const base = { idx: 0, moq: toQty(state?.moq) };
  const extra = Array.isArray(state?.extra_moqs) ? state.extra_moqs : [];
  return [base, ...extra.map((em, i) => ({ idx: i + 1, moq: toQty(em?.moq) }))];
}

/**
 * Label for one option — `MOQ 2 · 5,000`, or bare `MOQ 2` when that tier
 * has no quantity yet. A freshly added tier is blank until somebody types
 * in it, and `fmtInt(0)` renders an em-dash, so `MOQ 2 · —` would read as
 * though the tier were broken rather than simply empty.
 */
export function tierOptionLabel(opt) {
  const n = (opt?.idx ?? 0) + 1;
  const qty = toQty(opt?.moq);
  return qty > 0 ? `MOQ ${n} · ${fmtInt(qty)}` : `MOQ ${n}`;
}
