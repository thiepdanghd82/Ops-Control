/**
 * tierSelect.helpers — local "which tier am I looking at" state for the Cost
 * Breakdown tab, shared by Standard and Complex.
 *
 * The Cost Structure dropdown is VIEW-ONLY on purpose. It does not touch
 * `active_moq_idx`, which is saved with the quote and drives the summary bar,
 * every other tab, the margin hold, and which tier's aggregates count as the
 * quote's own. Looking at MOQ 2's cost structure should not silently re-point
 * the quote.
 *
 * But it does FOLLOW. If the operator changes the active tier from the summary
 * bar at the top of this same screen, a local view still showing another tier
 * would silently contradict a quote-level statement while both are on screen
 * together. Following costs nothing and removes that disagreement.
 *
 * Extracted rather than inlined because state that derives from a prop is the
 * part of this that can actually be wrong, and logic inside JSX cannot be
 * asserted in this repo. Shared so the two calculators cannot drift (Lesson 48).
 */

/**
 * Keep a tier index inside the tiers that actually exist. A quote can lose a
 * tier while this tab is open (an MOQ row deleted on another sub-tab), and
 * `tiers[stale]` is `undefined`, which renders as a blank card rather than an
 * error — the silent kind.
 *
 * @param {number} idx
 * @param {number} count number of tiers available
 * @returns {number} 0 when there is nothing valid to point at
 */
export function clampTierIdx(idx, count) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return 0;
  const i = Number.isFinite(idx) ? Math.floor(idx) : 0;
  if (i < 0) return 0;
  return i > n - 1 ? n - 1 : i;
}

/**
 * Decide whether the local view must re-sync to the quote's active tier.
 *
 * `view.seenActive` records the active index this view was last aligned with,
 * which is what distinguishes "the operator picked another tier here" from
 * "the active tier moved underneath us" — without it the two are the same
 * mismatch and following would fight every manual pick.
 *
 * @param {{idx: number, seenActive: number}} view
 * @param {number} activeIdx
 * @returns {{idx: number, seenActive: number}|null} next state, or null to keep
 */
export function planTierViewSync(view, activeIdx) {
  const active = Number.isFinite(activeIdx) ? Math.floor(activeIdx) : 0;
  if (!view || typeof view !== 'object') return { idx: active, seenActive: active };
  if (view.seenActive === active) return null;
  return { idx: active, seenActive: active };
}
