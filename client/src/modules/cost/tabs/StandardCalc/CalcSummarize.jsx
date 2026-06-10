/**
 * CalcSummarize — Summary sub-tab for Standard Calculator
 * Shows condensed summary of all cost components
 */
import { useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { calcAll, getActiveTierState } from '../../../../services/calcEngine';
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';
import { fmtN, pct, gmClr } from '../../../../utils/format';
import { KPI_TOOLTIPS } from '../../../../utils/kpiDefinitions';
import ProcessFlowChart from '../ComplexCalc/ProcessFlowChart';

export default function CalcSummarize() {
  const { stdState } = useCalc();
  const { lib } = useCostLib();
  const st = stdState;

  const tierSt = useMemo(() => getActiveTierState(st), [st]);
  const result = useMemo(() => {
    if (!lib) return null;
    const { snapshot } = snapshotPricingParams(st, lib);
    try {
      return calcAll(tierSt, null, lib, null, { snapshot });
    } catch {
      return null;
    }
  }, [tierSt, lib, st]);

  const moqIdx = st.active_moq_idx || 0;
  const moqQty = moqIdx === 0 ? st.moq || 0 : st.extra_moqs?.[moqIdx - 1]?.moq || 0;
  const sp = moqIdx === 0 ? st.selling_price || 0 : st.extra_moqs?.[moqIdx - 1]?.price || 0;

  // KPI cards need a completed calc pass; the flow chart does not —
  // it derives purely from stdState.materials[] + stdState.processes[].
  // Render the chart even when `result` is null (same pattern used by
  // ComplexCalc.jsx:464 — chart is outside the aggregate gate).
  if (!result) {
    return (
      <div className="sc-section">
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          No data to summarize. Enter materials, inks, and processes first.
        </div>
        <ProcessFlowChart kind="std" />
      </div>
    );
  }

  const totalCost = result.s_ttl || 0;

  return (
    <div className="sc-section">
      {/* KPI Cards */}
      <div className="sc-sum-kpis">
        <div className="sc-sum-kpi" style={{ borderColor: '#0f2341' }}>
          <div className="sc-sum-kpi-label">MOQ {moqIdx + 1}</div>
          <div className="sc-sum-kpi-val">{moqQty.toLocaleString()}</div>
          <div className="sc-sum-kpi-sub">EA</div>
        </div>
        <div className="sc-sum-kpi" style={{ borderColor: '#dc2626' }}>
          <div className="sc-sum-kpi-label">Total Cost</div>
          <div className="sc-sum-kpi-val" style={{ color: '#dc2626' }}>
            ${fmtN(totalCost, 5)}
          </div>
          <div className="sc-sum-kpi-sub">USD/unit</div>
        </div>
        <div className="sc-sum-kpi" style={{ borderColor: '#1e40af' }}>
          <div className="sc-sum-kpi-label">Selling Price</div>
          <div className="sc-sum-kpi-val">${fmtN(sp, 4)}</div>
          <div className="sc-sum-kpi-sub">USD/unit</div>
        </div>
        <div className="sc-sum-kpi" style={{ borderColor: '#0891b2' }} title={KPI_TOOLTIPS.va}>
          <div className="sc-sum-kpi-label">VA%</div>
          <div className="sc-sum-kpi-val" style={{ color: '#0891b2' }}>
            {pct(result.va)}
          </div>
          <div className="sc-sum-kpi-sub">Value Add</div>
        </div>
        <div
          className="sc-sum-kpi"
          style={{ borderColor: '#7c3aed' }}
          title={KPI_TOOLTIPS.contribution}
        >
          <div className="sc-sum-kpi-label">Contr%</div>
          <div className="sc-sum-kpi-val" style={{ color: '#7c3aed' }}>
            {pct(result.contribution)}
          </div>
          <div className="sc-sum-kpi-sub">Contribution</div>
        </div>
        <div
          className="sc-sum-kpi"
          style={{ borderColor: gmClr(result.gm) }}
          title={KPI_TOOLTIPS.gm}
        >
          <div className="sc-sum-kpi-label">GM%</div>
          <div className="sc-sum-kpi-val" style={{ color: gmClr(result.gm) }}>
            {pct(result.gm)}
          </div>
          <div className="sc-sum-kpi-sub">Gross Margin</div>
        </div>
      </div>

      <ProcessFlowChart kind="std" />
    </div>
  );
}
