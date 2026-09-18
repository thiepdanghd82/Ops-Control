/**
 * useMarginHold — keep the ticked margin where the operator put it.
 *
 * Ticking VA% / Contr% / GM% in the Cost Breakdown header records, per tier,
 * the value that metric reads at that moment; from then on the selling price
 * is re-solved whenever costs move so the metric stays put.
 *
 * This lives in the CALCULATOR, not in the Cost Breakdown tab that shows the
 * numbers, and that placement is the whole point. Sub-tabs mount exclusively
 * (`switch (activeSubTab)` in StandardCalc / ComplexCalc), so a driver inside
 * Cost Breakdown is unmounted exactly when it is needed — the operator edits
 * costs on Materials & Process, watches the tier strip the calculator itself
 * renders, and sees the margin slide while the price sits still. The
 * calculator stays mounted across every sub-tab, so the hold runs wherever
 * the edit happens.
 *
 * Cost is nothing when no metric is held: `computeTiers` is never called, so
 * a quote without a tick pays for none of this.
 */
import { useEffect, useMemo } from 'react';
import {
  readPinMetric,
  readTierPin,
  solvePriceForMetric,
  planTierPriceWrite,
} from '../../../services/priceSolver';
import { snapshotPricingParams } from '../../../services/pricingSnapshot';
import { pinDrift, planAutoHold } from '../components/MarginPriceCells.helpers.js';
import { getStatus as approvalStatus } from '../../../utils/approvalWorkflow.js';

const NO_TIERS = [];

export function useMarginHold({ kind, state, lib, rate, dispatch, computeTiers }) {
  // Drives the price automatically only while the quote is a DRAFT. Once it
  // has left the costing desk — sent to sales, approved, cancelled or
  // rejected — somebody is reviewing a specific number, and a price that
  // moves under them is the hazard this gate closes.
  const held = readPinMetric(state);
  const live = approvalStatus(state?.approval) === 'draft' ? held : null;

  const solverOpts = useMemo(() => {
    if (!live || !lib) return null;
    const { snapshot } = snapshotPricingParams(state, lib);
    return { kind, snapshot };
  }, [live, lib, state, kind]);

  const tiers = useMemo(
    () => (solverOpts ? computeTiers(solverOpts.snapshot) : NO_TIERS),
    [solverOpts, computeTiers]
  );

  useEffect(() => {
    if (!live || !lib || !solverOpts) return;
    for (const { idx, sp, result } of tiers) {
      if (!result) continue;
      const pin = readTierPin(state, idx);
      const drift = pinDrift(pin, live, result[live]);
      if (!drift) continue;
      const solved = solvePriceForMetric(state, lib, idx, live, pin.pct, solverOpts);
      const price = planAutoHold(drift, solved, sp);
      if (price == null) continue;
      for (const a of planTierPriceWrite({
        kind,
        table: 'selling',
        tierIdx: idx,
        usd: price,
        rate,
      }))
        dispatch(a);
    }
  }, [live, tiers, state, lib, solverOpts, rate, kind, dispatch]);
}
