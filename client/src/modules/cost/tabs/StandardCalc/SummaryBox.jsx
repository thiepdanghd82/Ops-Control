/**
 * SummaryBox — Floating KPI strip showing active MOQ metrics
 * Matches COST V1.0 M05 summary box pattern
 */
import { useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useI18n } from '../../../../utils/useI18n';
import {
  calcAll,
  getActiveTierState,
  inkCostTotal,
  matCostExcludingInk,
} from '../../../../services/calcEngine';
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';

function fmtN(v, d = 2) {
  if (v == null || isNaN(v)) return '\u2014';
  return Number(v).toFixed(d);
}

function pct(v) {
  if (v == null || isNaN(v)) return '\u2014';
  return (v * 100).toFixed(1) + '%';
}

function gmColor(gm) {
  if (gm == null) return '#94a3b8';
  if (gm >= 0.2) return '#16a34a';
  if (gm >= 0.1) return '#d97706';
  return '#dc2626';
}

export default function SummaryBox() {
  const { stdState } = useCalc();
  const { lib } = useCostLib();
  const { t } = useI18n();

  const result = useMemo(() => {
    if (!lib) return null;
    const tierSt = getActiveTierState(stdState);
    // Phase 3 — resolve pricing snapshot before calc so the displayed
    // numbers honour what was frozen at save time. Persisted snapshot
    // wins; legacy (no snapshot) synthesizes from current lib (=
    // pre-Phase-3 behavior).
    const { snapshot } = snapshotPricingParams(stdState, lib);
    try {
      return calcAll(tierSt, null, lib, null, { snapshot });
    } catch {
      return null;
    }
  }, [stdState, lib]);

  const st = stdState;
  const moqIdx = st.active_moq_idx || 0;
  const moqQty = moqIdx === 0 ? st.moq || 0 : st.extra_moqs?.[moqIdx - 1]?.moq || 0;
  const sp = moqIdx === 0 ? st.selling_price || 0 : st.extra_moqs?.[moqIdx - 1]?.price || 0;

  if (!result) {
    return (
      <div className="sc-summary-box">
        <div className="sc-summary-moq">
          MOQ {moqIdx + 1}: {moqQty.toLocaleString()} EA
        </div>
        <div className="sc-summary-row">
          <span className="sc-summary-label">G.Total</span>
          <span className="sc-summary-val">\u2014</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-summary-box">
      <div className="sc-summary-moq">
        MOQ {moqIdx + 1}: {moqQty.toLocaleString()} EA
      </div>
      <div className="sc-summary-row">
        <span className="sc-summary-label">{t('pricing.sell_price')}</span>
        <span className="sc-summary-val" style={{ color: '#1e40af' }}>
          ${fmtN(sp, 4)}
        </span>
      </div>
      <div className="sc-summary-row">
        <span className="sc-summary-label">G.Total</span>
        <span className="sc-summary-val" style={{ color: '#0f2341', fontWeight: 800 }}>
          ${fmtN(result.s_ttl, 5)}
        </span>
      </div>
      <div className="sc-summary-row">
        <span className="sc-summary-label">{t('pricing.gm_pct')}</span>
        <span className="sc-summary-val" style={{ color: gmColor(result.gm), fontWeight: 800 }}>
          {pct(result.gm)}
        </span>
      </div>
      <div className="sc-summary-row">
        <span className="sc-summary-label">{t('pricing.va_pct')}</span>
        <span className="sc-summary-val" style={{ color: '#0891b2' }}>
          {pct(result.va)}
        </span>
      </div>
      <div className="sc-summary-breakdown">
        <div className="sc-summary-mini">
          <span>{t('pricing.material_short')}</span>
          <span>${fmtN(matCostExcludingInk(result), 5)}</span>
        </div>
        <div className="sc-summary-mini">
          <span>{t('pricing.ink_short')}</span>
          <span>${fmtN(inkCostTotal(result), 5)}</span>
        </div>
        <div className="sc-summary-mini">
          <span>{t('pricing.process_short')}</span>
          <span>${fmtN(result.overhead + result.labor_cost + result.tooling, 5)}</span>
        </div>
        <div className="sc-summary-mini">
          <span>{t('pricing.packing_ship')}</span>
          <span>${fmtN(result.packing_ship, 5)}</span>
        </div>
      </div>
    </div>
  );
}
