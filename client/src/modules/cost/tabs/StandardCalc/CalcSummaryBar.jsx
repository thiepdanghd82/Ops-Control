/**
 * CalcSummaryBar — Standard wrapper around the shared CostSummaryBar.
 * Sprint 5.2 pulled the table JSX into `components/Shared/CostSummaryBar`
 * so Standard and Complex render byte-identical markup.
 *
 * This wrapper owns the compute path: run `calcAll` on the
 * active-tier stdState and hand the result down.
 */
import { useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { calcAll, getActiveTierState } from '../../../../services/calcEngine';
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';
import CostSummaryBar from '../../../../components/Shared/CostSummaryBar';

export default function CalcSummaryBar() {
  const { stdState } = useCalc();
  const { lib } = useCostLib();
  const st = stdState;

  const tierSt = useMemo(() => getActiveTierState(st), [st]);
  const result = useMemo(() => {
    if (!lib) return null;
    // Phase 3 — snapshot-first calc (persisted wins, legacy synthesizes).
    const { snapshot } = snapshotPricingParams(st, lib);
    try {
      return calcAll(tierSt, null, lib, null, { snapshot });
    } catch {
      return null;
    }
  }, [tierSt, lib, st]);

  const moqIdx = st.active_moq_idx || 0;
  const moqQty = moqIdx === 0 ? st.moq || 0 : st.extra_moqs?.[moqIdx - 1]?.moq || 0;
  const eau = moqIdx === 0 ? st.annual_qty || 0 : st.extra_moqs?.[moqIdx - 1]?.eau || 0;
  const sp = moqIdx === 0 ? st.selling_price || 0 : st.extra_moqs?.[moqIdx - 1]?.price || 0;
  const target = moqIdx === 0 ? st.target || 0 : st.extra_moqs?.[moqIdx - 1]?.target || 0;

  return (
    <CostSummaryBar
      result={result}
      endCuPn={st.end_cu_pn}
      moqIdx={moqIdx}
      moqQty={moqQty}
      eau={eau}
      sp={sp}
      target={target}
    />
  );
}
