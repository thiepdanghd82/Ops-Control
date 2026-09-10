// Tier-aware Complex aggregation + margin math.
//
// Extracted from CplxCostBreakdown.jsx (unchanged math) so BOTH the Cost
// Breakdown tab AND the price↔margin solver (priceSolver.js) read the exact
// same forward calc. The solver clones the Complex state with a candidate
// price set for a tier, then calls this — so the inverted price is always
// consistent with what the table displays (Lesson 3 — never re-derive the
// formula in two places).
//
// Delegates the heavy two-pass calc to aggregateComplex() in calcEngine, then
// layers the tier-specific margin math (gm / va / contribution) on top,
// reading the tier's selling price from `cs` (tier 0 = cs.selling_price;
// tier>0 = cs.extra_moqs[tierIdx-1].price).
import { aggregateComplex } from './calcEngine.js';

/**
 * @param {object} cs      complex state (cplxState)
 * @param {Array}  sps     subproducts
 * @param {object} lib     cost library
 * @param {number} tierIdx 0-based tier index
 * @param {object} opts    { bomQtyEnabled, spMoqScalingEnabled, snapshot }
 * @returns {object|null}  aggregate result with gm/va/contribution, or null
 */
export function aggregateForTier(cs, sps, lib, tierIdx, opts) {
  const { aggregate: agg } = aggregateComplex(cs, sps, lib, tierIdx, opts);
  if (!agg) return null;
  const tierSp =
    tierIdx === 0
      ? cs.selling_price || 0
      : ((cs.extra_moqs || [])[tierIdx - 1] || {}).price || cs.selling_price || 0;
  agg.gm = tierSp > 0 ? (tierSp - (agg.s_ttl || 0)) / tierSp : null;
  // VA% = 1 - (material + tooling + packing_ship) / sp  (labor excluded)
  agg.va =
    tierSp > 0
      ? (tierSp - (agg.s_mat_cost || 0) - (agg.tooling || 0) - (agg.packing_ship || 0)) / tierSp
      : null;
  // Contribution% = 1 - (material + tooling + packing_ship + labor) / sp
  agg.contribution =
    tierSp > 0
      ? (tierSp -
          (agg.s_mat_cost || 0) -
          (agg.tooling || 0) -
          (agg.packing_ship || 0) -
          (agg.labor_cost || 0)) /
        tierSp
      : null;
  return agg;
}
