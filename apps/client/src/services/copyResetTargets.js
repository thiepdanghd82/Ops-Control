/**
 * Clear the customer Target price when a quote is COPIED.
 *
 * Target is a number the CUSTOMER gives for one RFQ — "we need to land at
 * $0.1557". Selling price is ours; Target is theirs. So it belongs to the RFQ,
 * not to the product, and a copy is by definition a different RFQ (or a
 * different option of one).
 *
 * Found in live data: quote 199 (RFQ-2026-S0057, option OP1) was copied from
 * quote 198 (RFQ-2026-S0059, OP2) — 93 of 99 scalar fields identical. The
 * operator retyped the sell price (0.1549 -> 0.1129) and saved, and the OLD
 * quote's Target rode along untouched: 0.1557 / 4062đ on both rows, now
 * attached to an RFQ that never carried that number. Nothing computed it; it
 * simply was never cleared, which is why it reads as the box filling itself.
 *
 * Selling price is deliberately NOT cleared. It carries over too, but the
 * operator sets it on every quote and blanking it would empty the KPI strip
 * and the whole Cost Breakdown on every copy — a change nobody asked for.
 * Target is the opposite: it is often left alone, so a stale one survives.
 *
 * `null` (not 0 or '') is what the state factories use for an unset target, so
 * that is what "cleared" means here.
 */

/** Clear target + its VND mirror on one tier-like object. */
function clearTier(tier) {
  if (!tier || typeof tier !== 'object') return tier;
  if (tier.target == null && tier.target_vnd == null) return tier; // already clear
  return { ...tier, target: null, target_vnd: null };
}

/**
 * Clear the base target and every extra MOQ tier's target on a quote state.
 * Returns the same object when there was nothing to clear.
 */
export function clearTargets(state) {
  if (!state || typeof state !== 'object') return state;
  const extra = Array.isArray(state.extra_moqs) ? state.extra_moqs : null;
  const nextExtra = extra ? extra.map(clearTier) : extra;
  const extraChanged = extra ? nextExtra.some((em, i) => em !== extra[i]) : false;
  const baseChanged = state.target != null || state.target_vnd != null;
  if (!baseChanged && !extraChanged) return state;
  return {
    ...state,
    target: null,
    target_vnd: null,
    ...(extraChanged ? { extra_moqs: nextExtra } : {}),
  };
}
