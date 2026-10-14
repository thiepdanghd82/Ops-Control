/**
 * CplxSummaryBar — Complex wrapper around the shared CostSummaryBar.
 * Sprint 5.2 extracted the table JSX so both calculators render the
 * same markup from a single source of truth.
 *
 * This wrapper pulls tier data straight from `cplxState` — the parent
 * ComplexCalc has already computed `aggregate` via `aggregateComplex`
 * and filled in gm/va/contribution.
 */
import { useMemo } from 'react';
import CostSummaryBar from '../../../../components/Shared/CostSummaryBar';
import { buildTierOptions } from '../../../../components/Shared/CostSummaryBar.helpers.js';

export default function CplxSummaryBar({ cs, aggregate, onTierChange = null }) {
  const moqIdx = cs.active_moq_idx || 0;
  const moqQty = moqIdx === 0 ? cs.moq || 0 : cs.extra_moqs?.[moqIdx - 1]?.moq || 0;
  const eau = moqIdx === 0 ? cs.annual_qty || 0 : cs.extra_moqs?.[moqIdx - 1]?.eau || 0;
  const sp = moqIdx === 0 ? cs.selling_price || 0 : cs.extra_moqs?.[moqIdx - 1]?.price || 0;
  const target = moqIdx === 0 ? cs.target || 0 : cs.extra_moqs?.[moqIdx - 1]?.target || 0;

  // Same option list as Standard, from the same helper, so the two
  // calculators cannot drift about which tiers exist (Lesson 48).
  // The setter arrives as a prop: ComplexCalc owns it and routes the
  // write through SET_CPLX_FIELD, never Standard's SET_ACTIVE_MOQ.
  const tiers = useMemo(() => buildTierOptions(cs), [cs]);

  return (
    <CostSummaryBar
      result={aggregate}
      endCuPn={cs.end_cu_pn}
      moqIdx={moqIdx}
      moqQty={moqQty}
      eau={eau}
      sp={sp}
      target={target}
      tiers={tiers}
      onTierChange={onTierChange}
    />
  );
}
