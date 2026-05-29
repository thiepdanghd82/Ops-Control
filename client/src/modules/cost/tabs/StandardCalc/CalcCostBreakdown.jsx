/**
 * CalcCostBreakdown — Cost breakdown + tier comparison for Standard Calculator
 * Matches COST V1.0 M05 cost breakdown section
 */
import { useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useI18n } from '../../../../utils/useI18n';
import {
  calcAll,
  buildTierState,
  enumerateTiers,
  inkCostTotal,
  matCostExcludingInk,
} from '../../../../services/calcEngine';
import { fmtN, pct, gmClr } from '../../../../utils/format';

// Re-derive VA / Contribution / GM at a different price without
// re-running calcAll. Costs (s_mat_cost, tooling, packing_ship, s_ttl,
// labor_cost, bd_setup_labor) are price-independent — we just swap the
// denominator. Canonical formulas match calcEngine.calcAll (line 556-560)
// so Selling-table and Target-table values reconcile exactly.
function kpiAtPrice(r, price) {
  if (!r || !price || price <= 0) return { va: null, contribution: null, gm: null };
  const mats = r.s_mat_cost || 0;
  const tool = r.tooling || 0;
  const ps = r.packing_ship || 0;
  const runLaborOnly = (r.labor_cost || 0) - (r.bd_setup_labor || 0);
  return {
    va: 1 - (mats + tool + ps) / price,
    contribution: 1 - (mats + tool + ps + runLaborOnly) / price,
    gm: 1 - (r.s_ttl || 0) / price,
  };
}

export default function CalcCostBreakdown() {
  const { stdState } = useCalc();
  const { lib } = useCostLib();
  const { t } = useI18n();
  const st = stdState;

  const tiers = useMemo(() => {
    if (!lib) return [];
    return enumerateTiers(st).map(({ idx, moq, sp, eau }) => {
      try {
        const tierSt = buildTierState(st, idx, sp, moq, eau);
        return { idx, moq, sp, eau, result: calcAll(tierSt, null, lib, null) };
      } catch {
        return { idx, moq, sp, eau, result: null };
      }
    });
  }, [st, lib]);

  if (!lib) {
    return (
      <div className="sc-section" style={{ padding: 20, color: '#94a3b8', textAlign: 'center' }}>
        Loading library data...
      </div>
    );
  }

  return (
    <div className="sc-section">
      {/* Sprint 41 — split the combined breakdown into two tables:
          (1) Selling /unit — KPIs (VA/Contr/GM) against selling price
          (2) Target /unit  — same costs but KPIs against target price
          so users can see margin health at both price points at a glance
          without switching tiers or running what-if scenarios. */}
      <div className="sc-card">
        <div className="sc-card-header sc-header-dark">
          <span className="sc-card-icon">&#8801;</span>
          <span className="sc-card-title">{t('pricing.selling_unit')}</span>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-bd-table">
            <thead>
              <tr>
                <th>{t('pricing.tier')}</th>
                <th className="right">{t('pricing.moq')}</th>
                <th className="right">{t('pricing.eau')}</th>
                <th className="right">{t('pricing.sell_price')}</th>
                <th className="right">{t('pricing.target')}</th>
                <th className="right bd-mat">{t('pricing.material')}</th>
                <th className="right bd-ink">{t('pricing.ink')}</th>
                <th className="right bd-proc">{t('pricing.process')}</th>
                <th className="right bd-pack">{t('pricing.pack_ship')}</th>
                <th className="right bd-sub">{t('pricing.subtotal')}</th>
                <th className="right bd-va">{t('pricing.va_pct')}</th>
                <th className="right bd-contr">{t('pricing.contr_pct')}</th>
                <th className="right bd-gm">{t('pricing.gm_pct')}</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(({ idx, moq, sp, eau, result: r }) => {
                const isActive = idx === (st.active_moq_idx || 0);
                const target = idx === 0 ? st.target : st.extra_moqs?.[idx - 1]?.target;
                return (
                  <tr key={idx} className={isActive ? 'sc-bd-active' : ''}>
                    <td>
                      <span className={`sc-bd-tier-badge ${isActive ? 'active' : ''}`}>
                        MOQ {idx + 1}
                      </span>
                    </td>
                    <td className="right">{moq ? moq.toLocaleString() : '\u2014'}</td>
                    <td className="right">{eau ? eau.toLocaleString() : '\u2014'}</td>
                    <td className="right" style={{ fontWeight: 700, color: '#1e40af' }}>
                      {sp ? '$' + fmtN(sp, 4) : '\u2014'}
                    </td>
                    <td className="right" style={{ color: '#64748b' }}>
                      {target ? '$' + fmtN(target, 4) : '\u2014'}
                    </td>
                    {r ? (
                      <>
                        <td className="right bd-mat">{fmtN(matCostExcludingInk(r))}</td>
                        <td className="right bd-ink">{fmtN(inkCostTotal(r))}</td>
                        <td className="right bd-proc">
                          {fmtN(r.overhead + r.labor_cost + r.tooling)}
                        </td>
                        <td className="right bd-pack">{fmtN(r.packing_ship)}</td>
                        <td className="right bd-sub" style={{ fontWeight: 800 }}>
                          {fmtN(r.s_ttl)}
                        </td>
                        <td className="right bd-va" style={{ color: '#0891b2', fontWeight: 700 }}>
                          {pct(r.va)}
                        </td>
                        <td
                          className="right bd-contr"
                          style={{ color: '#7c3aed', fontWeight: 700 }}
                        >
                          {pct(r.contribution)}
                        </td>
                        <td
                          className="right bd-gm"
                          style={{ color: gmClr(r.gm), fontWeight: 800, fontSize: 13 }}
                        >
                          {pct(r.gm)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="right" colSpan={8} style={{ color: '#94a3b8' }}>
                          Enter data to calculate
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target /unit — identical shape, KPIs re-derived against the
          TARGET price column. Costs are price-independent so we re-use
          the same `r` without re-running calcAll (kpiAtPrice helper). */}
      <div className="sc-card" style={{ marginTop: 12 }}>
        <div className="sc-card-header sc-header-dark">
          <span className="sc-card-icon">&#9678;</span>
          <span className="sc-card-title">Target /unit (USD)</span>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-bd-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th className="right">MOQ</th>
                <th className="right">EAU</th>
                <th className="right">Sell Price</th>
                <th className="right">Target</th>
                <th className="right bd-mat">Material</th>
                <th className="right bd-ink">Ink</th>
                <th className="right bd-proc">Process</th>
                <th className="right bd-pack">Pack &amp; Ship</th>
                <th className="right bd-sub">Subtotal</th>
                <th className="right bd-va">VA%</th>
                <th className="right bd-contr">Contr%</th>
                <th className="right bd-gm">GM%</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(({ idx, moq, sp, eau, result: r }) => {
                const isActive = idx === (st.active_moq_idx || 0);
                const target = idx === 0 ? st.target : st.extra_moqs?.[idx - 1]?.target;
                const tgtKpi = kpiAtPrice(r, target);
                return (
                  <tr key={idx} className={isActive ? 'sc-bd-active' : ''}>
                    <td>
                      <span className={`sc-bd-tier-badge ${isActive ? 'active' : ''}`}>
                        MOQ {idx + 1}
                      </span>
                    </td>
                    <td className="right">{moq ? moq.toLocaleString() : '\u2014'}</td>
                    <td className="right">{eau ? eau.toLocaleString() : '\u2014'}</td>
                    <td className="right" style={{ color: '#64748b' }}>
                      {sp ? '$' + fmtN(sp, 4) : '\u2014'}
                    </td>
                    <td className="right" style={{ fontWeight: 700, color: '#b45309' }}>
                      {target ? '$' + fmtN(target, 4) : '\u2014'}
                    </td>
                    {r ? (
                      <>
                        <td className="right bd-mat">{fmtN(matCostExcludingInk(r))}</td>
                        <td className="right bd-ink">{fmtN(inkCostTotal(r))}</td>
                        <td className="right bd-proc">
                          {fmtN(r.overhead + r.labor_cost + r.tooling)}
                        </td>
                        <td className="right bd-pack">{fmtN(r.packing_ship)}</td>
                        <td className="right bd-sub" style={{ fontWeight: 800 }}>
                          {fmtN(r.s_ttl)}
                        </td>
                        <td className="right bd-va" style={{ color: '#0891b2', fontWeight: 700 }}>
                          {target ? pct(tgtKpi.va) : '\u2014'}
                        </td>
                        <td
                          className="right bd-contr"
                          style={{ color: '#7c3aed', fontWeight: 700 }}
                        >
                          {target ? pct(tgtKpi.contribution) : '\u2014'}
                        </td>
                        <td
                          className="right bd-gm"
                          style={{
                            color: target ? gmClr(tgtKpi.gm) : '#94a3b8',
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {target ? pct(tgtKpi.gm) : '\u2014'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="right" colSpan={8} style={{ color: '#94a3b8' }}>
                          Enter data to calculate
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Structure (waterfall) for active tier */}
      {tiers.length > 0 &&
        tiers[st.active_moq_idx || 0]?.result &&
        (() => {
          const r = tiers[st.active_moq_idx || 0].result;
          const rows = [
            { label: 'Material Cost', value: matCostExcludingInk(r), color: '#2563eb', icon: '◈' },
            { label: 'Ink Cost', value: inkCostTotal(r), color: '#0891b2', icon: '⊕' },
            // r.overhead/r.labor_cost are RUN-only (calcEngine 635-636 strips
            // setup). Add bd_setup_mach / bd_setup_labor so the waterfall bars
            // sum to s_ttl and match the Detailed Breakdown's setup+run rows.
            {
              label: 'Overhead (Machine)',
              value: (r.overhead || 0) + (r.bd_setup_mach || 0),
              color: '#059669',
              icon: '⚙',
            },
            {
              label: 'Labor Cost',
              value: (r.labor_cost || 0) + (r.bd_setup_labor || 0),
              color: '#16a34a',
              icon: '⊙',
            },
            { label: 'Tooling', value: r.tooling, color: '#374151', icon: '⚒' },
            { label: 'Packing & Shipping', value: r.packing_ship, color: '#0ea5e9', icon: '▣' },
            { label: 'VAT Loss', value: r.vat_loss, color: '#f59e0b', icon: '⊘' },
            // Phase 9D.3 — SGA row hidden when rate=0 via the value>0 filter
            // below, so existing quotes without a site SGA rate look unchanged.
            // Label shows the configured rate so the source of the burden is
            // visible at a glance in the breakdown.
            {
              label: r.sga_rate_pct > 0 ? `SGA (${r.sga_rate_pct}%)` : 'SGA',
              value: r.sga || 0,
              color: '#7c3aed',
              icon: '⌂',
            },
          ];
          const totalCost = (r.s_ttl || 0) + (r.sga || 0);
          const maxVal = Math.max(...rows.map((x) => Math.abs(x.value || 0)), 0.001);
          return (
            <div className="sc-card" style={{ marginTop: 12 }}>
              <div className="sc-card-header sc-header-dark">
                <span className="sc-card-title">Cost Structure</span>
              </div>
              <div className="sc-card-body">
                {rows
                  .filter((x) => x.value > 0)
                  .map((x, i) => {
                    const barW = Math.round((Math.abs(x.value) / maxVal) * 100);
                    const share = totalCost > 0 ? ((x.value / totalCost) * 100).toFixed(1) : 0;
                    return (
                      <div key={i} className="sc-sum-bar-row">
                        <div className="sc-sum-bar-label">
                          <span>
                            {x.icon} {x.label}
                          </span>
                          <span style={{ color: '#64748b', fontSize: 11 }}>{share}%</span>
                        </div>
                        <div className="sc-sum-bar-track">
                          <div
                            className="sc-sum-bar-fill"
                            style={{ width: barW + '%', background: x.color }}
                          />
                        </div>
                        <div className="sc-sum-bar-val" style={{ color: x.color }}>
                          ${fmtN(x.value)}
                        </div>
                      </div>
                    );
                  })}
                <div className="sc-sum-bar-row sc-sum-bar-total">
                  <div className="sc-sum-bar-label">
                    <b>GRAND TOTAL</b>
                  </div>
                  <div className="sc-sum-bar-track" />
                  <div
                    className="sc-sum-bar-val"
                    style={{ fontWeight: 900, fontSize: 14, color: '#0f2341' }}
                  >
                    ${fmtN(totalCost)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Detailed breakdown for active tier */}
      {tiers.length > 0 &&
        tiers[st.active_moq_idx || 0]?.result &&
        (() => {
          const r = tiers[st.active_moq_idx || 0].result;
          return (
            <div className="sc-card" style={{ marginTop: 12 }}>
              <div className="sc-card-header sc-header-slate">
                <span className="sc-card-title">
                  Detailed Breakdown &mdash; MOQ {(st.active_moq_idx || 0) + 1}
                </span>
              </div>
              <div className="sc-card-body">
                <div className="sc-bd-detail-grid">
                  <div className="sc-bd-detail-group">
                    <div className="sc-bd-detail-title" style={{ color: '#2563eb' }}>
                      Materials
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Setup Mat</span>
                      <span>{fmtN(r.bd_mat_setup)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Run Mat</span>
                      <span>{fmtN(r.bd_mat_run)}</span>
                    </div>
                    <div className="sc-bd-detail-row sc-bd-detail-total">
                      <span>Total Mat</span>
                      <span>{fmtN(matCostExcludingInk(r))}</span>
                    </div>
                  </div>
                  <div className="sc-bd-detail-group">
                    <div className="sc-bd-detail-title" style={{ color: '#0891b2' }}>
                      Inks
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Setup Ink</span>
                      <span>{fmtN(r.bd_ink_setup)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Run Ink</span>
                      <span>{fmtN(r.bd_ink_run)}</span>
                    </div>
                    <div className="sc-bd-detail-row sc-bd-detail-total">
                      <span>Total Ink</span>
                      <span>{fmtN(inkCostTotal(r))}</span>
                    </div>
                  </div>
                  <div className="sc-bd-detail-group">
                    <div className="sc-bd-detail-title" style={{ color: '#059669' }}>
                      Processes
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Setup Mach</span>
                      <span>{fmtN(r.bd_setup_mach)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Setup Labor</span>
                      <span>{fmtN(r.bd_setup_labor)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Overhead</span>
                      <span>{fmtN(r.overhead)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Labor</span>
                      <span>{fmtN(r.labor_cost)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Tooling</span>
                      <span>{fmtN(r.tooling)}</span>
                    </div>
                    <div className="sc-bd-detail-row sc-bd-detail-total">
                      <span>Total Proc</span>
                      <span>{fmtN(r.overhead + r.labor_cost + r.tooling)}</span>
                    </div>
                  </div>
                  <div className="sc-bd-detail-group">
                    <div className="sc-bd-detail-title" style={{ color: '#0ea5e9' }}>
                      Other
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Packing &amp; Ship</span>
                      <span>{fmtN(r.packing_ship)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>VAT Loss</span>
                      <span>{fmtN(r.vat_loss)}</span>
                    </div>
                    <div className="sc-bd-detail-row">
                      <span>Extra</span>
                      <span>{fmtN(r.bd_extra)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
