/**
 * CalcCostBreakdown — Cost breakdown + tier comparison for Standard Calculator
 * Matches COST V1.0 M05 cost breakdown section
 */
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';
import SnapshotPanel from '../../components/SnapshotPanel';
import { fmtN, pct } from '../../../../utils/format';
import { recomputeKpi, isBucketActive, readMask, writeMask } from './costStructureWhatIf';
import {
  defaultPrice,
  solvePriceForMetric,
  planTierPriceWrite,
  isEmptyPrice,
} from '../../../../services/priceSolver';
import { MarginCell, ApplyDefault } from '../../components/MarginPriceCells';
import { metricWarn } from '../../components/MarginPriceCells.helpers';

// VA / Contribution / GM re-derivation at a different price now lives in
// costStructureWhatIf.recomputeKpi (anchored to r's canonical numerators so
// all-active === the stored r.va/contribution/gm + kpiAtPrice exactly, while
// the active-mask subtracts toggled-off buckets per metric).

export default function CalcCostBreakdown() {
  const { stdState, activeQuoteId, dispatch } = useCalc();
  const { lib } = useCostLib();
  const { t } = useI18n();
  const st = stdState;
  const rate = st.usd_rate || 0;

  // Display-only what-if: toggle cost buckets off to see VA/Contr/GM recompute.
  // Mask lives in sessionStorage keyed by quote id — NEVER the quote state /
  // reducer / server (Lesson 18: survives sub-tab unmount, never persisted).
  const [mask, setMask] = useState(() => readMask(activeQuoteId));
  // Reload the mask when the open quote changes (its own mask, or all-active).
  useEffect(() => {
    setMask(readMask(activeQuoteId));
  }, [activeQuoteId]);
  const toggleBucket = useCallback(
    (key) => {
      setMask((prev) => {
        const next = { ...prev, [key]: prev[key] === false ? true : false };
        writeMask(activeQuoteId, next);
        return next;
      });
    },
    [activeQuoteId]
  );
  const resetMask = useCallback(() => {
    writeMask(activeQuoteId, {});
    setMask({});
  }, [activeQuoteId]);

  // Phase 4 — lift snapshot resolution out of the tiers memo so the
  // <SnapshotPanel> can render it without recomputing. `source` +
  // `snapshot` come from snapshotPricingParams; persisted wins, legacy
  // synthesizes from current lib.
  const { source: snapshotSource, snapshot } = useMemo(
    () => (lib ? snapshotPricingParams(st, lib) : { source: 'empty', snapshot: null }),
    [st, lib]
  );

  const tiers = useMemo(() => {
    if (!lib) return [];
    return enumerateTiers(st).map(({ idx, moq, sp, eau }) => {
      try {
        const tierSt = buildTierState(st, idx, sp, moq, eau);
        return { idx, moq, sp, eau, result: calcAll(tierSt, null, lib, null, { snapshot }) };
      } catch {
        return { idx, moq, sp, eau, result: null };
      }
    });
  }, [st, lib, snapshot]);

  // Active-tier warnings (site_mismatch etc.) for the SnapshotPanel.
  const activeIdx = st.active_moq_idx || 0;
  const activeWarnings = tiers.find((t) => t.idx === activeIdx)?.result?._warnings || [];

  // ── Price ↔ margin inversion (Cost Breakdown only) ──
  // The solver reads the SAME snapshot + calc path the tables use.
  const solverOpts = useMemo(() => ({ kind: 'std', snapshot }), [snapshot]);
  // GM-25% default price per tier (raised if a secondary floor binds higher).
  const defaults = useMemo(
    () => tiers.map((tr) => (tr.result ? defaultPrice(st, lib, tr.idx, solverOpts) : null)),
    [tiers, st, lib, solverOpts]
  );

  // Back-solve the price for one metric+target and write it (Selling → price,
  // Target → target). Returns false when unsolvable so the cell can flash.
  const commitMetric = useCallback(
    (table, tierIdx, metric, targetFrac) => {
      const price = solvePriceForMetric(st, lib, tierIdx, metric, targetFrac, solverOpts);
      if (price == null || !(price > 0) || !Number.isFinite(price)) return false;
      for (const a of planTierPriceWrite({ kind: 'std', table, tierIdx, usd: price, rate }))
        dispatch(a);
      return true;
    },
    [st, lib, solverOpts, rate, dispatch]
  );

  // Apply the GM-25% default to a tier's selling or target price.
  const applyDefault = useCallback(
    (table, tierIdx) => {
      const d = defaultPrice(st, lib, tierIdx, solverOpts);
      if (!d || !(d.price > 0)) return;
      for (const a of planTierPriceWrite({ kind: 'std', table, tierIdx, usd: d.price, rate }))
        dispatch(a);
    },
    [st, lib, solverOpts, rate, dispatch]
  );

  // Auto-seed the GM-25% default into a FRESH tier only — one whose selling
  // AND target are both empty (a brand-new tier, not a loaded quote that
  // intentionally left one blank). Seeds both prices once per tier per quote;
  // a manual value always wins and a deliberately-cleared field is not
  // re-seeded (use ↻ to re-apply). Marked seen only on a successful seed so
  // a tier with no costs yet gets seeded once costs are entered.
  const seededRef = useRef({});
  useEffect(() => {
    if (!lib) return;
    const qid = String(activeQuoteId ?? 'draft');
    const seen = seededRef.current[qid] || (seededRef.current[qid] = new Set());
    for (const { idx, result } of tiers) {
      if (!result || seen.has(idx)) continue;
      const curSell = idx === 0 ? st.selling_price : st.extra_moqs?.[idx - 1]?.price;
      const curTgt = idx === 0 ? st.target : st.extra_moqs?.[idx - 1]?.target;
      if (!(isEmptyPrice(curSell) && isEmptyPrice(curTgt))) continue; // fresh tier only
      const d = defaultPrice(st, lib, idx, solverOpts);
      if (!d || !(d.price > 0)) continue; // no costs yet → try again later
      seen.add(idx);
      for (const table of ['selling', 'target'])
        for (const a of planTierPriceWrite({
          kind: 'std',
          table,
          tierIdx: idx,
          usd: d.price,
          rate,
        }))
          dispatch(a);
    }
  }, [tiers, st, lib, solverOpts, rate, activeQuoteId, dispatch]);

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
              {tiers.map(({ idx, moq, sp, eau, result: r }, i) => {
                const isActive = idx === (st.active_moq_idx || 0);
                const target = idx === 0 ? st.target : st.extra_moqs?.[idx - 1]?.target;
                // What-if KPIs at the selling price; all-active === r.va/contr/gm.
                const sk = r ? recomputeKpi(r, mask, sp) : null;
                const def = defaults[i];
                const sellWarn =
                  sk &&
                  (metricWarn('gm', sk.gm) ||
                    metricWarn('contribution', sk.contribution) ||
                    metricWarn('va', sk.va));
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
                      <ApplyDefault
                        def={def}
                        warn={sellWarn}
                        onApply={() => applyDefault('selling', idx)}
                      />
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
                        <td className="right bd-va">
                          <MarginCell
                            metric="va"
                            value={sk.va}
                            warn={metricWarn('va', sk.va)}
                            onCommit={(f) => commitMetric('selling', idx, 'va', f)}
                          />
                        </td>
                        <td className="right bd-contr">
                          <MarginCell
                            metric="contribution"
                            value={sk.contribution}
                            warn={metricWarn('contribution', sk.contribution)}
                            onCommit={(f) => commitMetric('selling', idx, 'contribution', f)}
                          />
                        </td>
                        <td className="right bd-gm">
                          <MarginCell
                            metric="gm"
                            value={sk.gm}
                            warn={metricWarn('gm', sk.gm)}
                            onCommit={(f) => commitMetric('selling', idx, 'gm', f)}
                          />
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
              {tiers.map(({ idx, moq, sp, eau, result: r }, i) => {
                const isActive = idx === (st.active_moq_idx || 0);
                const target = idx === 0 ? st.target : st.extra_moqs?.[idx - 1]?.target;
                // What-if KPIs at the target price; all-active === kpiAtPrice(r, target).
                const tgtKpi = recomputeKpi(r, mask, target);
                const def = defaults[i];
                const tgtWarn =
                  target &&
                  tgtKpi &&
                  (metricWarn('gm', tgtKpi.gm) ||
                    metricWarn('contribution', tgtKpi.contribution) ||
                    metricWarn('va', tgtKpi.va));
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
                      <ApplyDefault
                        def={def}
                        warn={tgtWarn}
                        onApply={() => applyDefault('target', idx)}
                      />
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
                        <td className="right bd-va">
                          <MarginCell
                            metric="va"
                            value={target ? tgtKpi.va : null}
                            warn={metricWarn('va', target ? tgtKpi.va : null)}
                            onCommit={(f) => commitMetric('target', idx, 'va', f)}
                          />
                        </td>
                        <td className="right bd-contr">
                          <MarginCell
                            metric="contribution"
                            value={target ? tgtKpi.contribution : null}
                            warn={metricWarn('contribution', target ? tgtKpi.contribution : null)}
                            onCommit={(f) => commitMetric('target', idx, 'contribution', f)}
                          />
                        </td>
                        <td className="right bd-gm">
                          <MarginCell
                            metric="gm"
                            value={target ? tgtKpi.gm : null}
                            warn={metricWarn('gm', target ? tgtKpi.gm : null)}
                            onCommit={(f) => commitMetric('target', idx, 'gm', f)}
                          />
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
          const activeTier = tiers[st.active_moq_idx || 0];
          const sellPrice = activeTier?.sp || 0;
          const targetPrice =
            (st.active_moq_idx || 0) === 0
              ? st.target
              : st.extra_moqs?.[(st.active_moq_idx || 0) - 1]?.target;
          const rows = [
            {
              key: 'material',
              label: 'Material Cost',
              value: matCostExcludingInk(r),
              color: '#2563eb',
              icon: '◈',
            },
            { key: 'ink', label: 'Ink Cost', value: inkCostTotal(r), color: '#0891b2', icon: '⊕' },
            // r.overhead/r.labor_cost are RUN-only (calcEngine 635-636 strips
            // setup). Add bd_setup_mach / bd_setup_labor so the waterfall bars
            // sum to s_ttl and match the Detailed Breakdown's setup+run rows.
            {
              key: 'overhead',
              label: 'Overhead (Machine)',
              value: (r.overhead || 0) + (r.bd_setup_mach || 0),
              color: '#059669',
              icon: '⚙',
            },
            {
              key: 'labor',
              label: 'Labor Cost',
              value: (r.labor_cost || 0) + (r.bd_setup_labor || 0),
              color: '#16a34a',
              icon: '⊙',
            },
            { key: 'tooling', label: 'Tooling', value: r.tooling, color: '#374151', icon: '⚒' },
            {
              key: 'packing',
              label: 'Packing & Shipping',
              value: r.packing_ship,
              color: '#0ea5e9',
              icon: '▣',
            },
            { key: 'vat', label: 'VAT Loss', value: r.vat_loss, color: '#f59e0b', icon: '⊘' },
            // SGA is NOT toggleable (only affects gm_after_sga, out of scope).
            // Hidden when rate=0 via the value>0 filter so legacy quotes look
            // unchanged.
            {
              key: 'sga',
              label: r.sga_rate_pct > 0 ? `SGA (${r.sga_rate_pct}%)` : 'SGA',
              value: r.sga || 0,
              color: '#7c3aed',
              icon: '⌂',
            },
          ];
          const totalCost = (r.s_ttl || 0) + (r.sga || 0); // composition-% denominator (unchanged)
          const maxVal = Math.max(...rows.map((x) => Math.abs(x.value || 0)), 0.001);
          const visible = rows.filter((x) => x.value > 0);
          const isOff = (x) => x.key !== 'sga' && !isBucketActive(mask, x.key);
          const activeSum = visible.reduce((s, x) => s + (isOff(x) ? 0 : x.value), 0);
          const excluded = visible.reduce((s, x) => s + (isOff(x) ? x.value : 0), 0);
          const pctOf = (v, p) => (p > 0 ? pct(v / p) : '—');
          return (
            <div className="sc-card" style={{ marginTop: 12 }}>
              <div className="sc-card-header sc-header-dark">
                <span className="sc-card-title">{t('cb.cost_structure')}</span>
              </div>
              <div className="sc-card-body">
                <div className="sc-sum-bar-row sc-cb-head">
                  <div className="sc-sum-bar-label">{t('cb.bucket')}</div>
                  <div className="sc-sum-bar-track" />
                  <div className="sc-sum-bar-val sc-cb-h">{t('cb.value')}</div>
                  <div className="sc-cb-pct sc-cb-h">{t('cb.pct_sell')}</div>
                  <div className="sc-cb-pct sc-cb-h">{t('cb.pct_target')}</div>
                  <div className="sc-cb-active sc-cb-h">
                    {t('cb.active')}
                    <button
                      type="button"
                      className="sc-cb-reset"
                      onClick={resetMask}
                      title={t('cb.reset')}
                    >
                      &#8635;
                    </button>
                  </div>
                </div>
                {visible.map((x) => {
                  const barW = Math.round((Math.abs(x.value) / maxVal) * 100);
                  const share = totalCost > 0 ? ((x.value / totalCost) * 100).toFixed(1) : 0;
                  const off = isOff(x);
                  const toggleable = x.key !== 'sga';
                  return (
                    <div key={x.key} className={`sc-sum-bar-row${off ? ' sc-cb-off' : ''}`}>
                      <div className="sc-sum-bar-label">
                        <span>
                          {x.icon} {x.label}
                        </span>
                        <span className="sc-cb-comp">{share}%</span>
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
                      <div className="sc-cb-pct">{pctOf(x.value, sellPrice)}</div>
                      <div className="sc-cb-pct">{pctOf(x.value, targetPrice)}</div>
                      <div className="sc-cb-active">
                        {toggleable ? (
                          <input
                            type="checkbox"
                            className="sc-cb-chk"
                            checked={!off}
                            onChange={() => toggleBucket(x.key)}
                            aria-label={`${t('cb.active')} — ${x.label}`}
                          />
                        ) : (
                          <span className="sc-cb-na">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="sc-sum-bar-row sc-sum-bar-total">
                  <div className="sc-sum-bar-label">
                    <b>{t('cb.grand_total')}</b>
                  </div>
                  <div className="sc-sum-bar-track" />
                  <div className="sc-sum-bar-val sc-cb-grand">${fmtN(activeSum)}</div>
                  <div className="sc-cb-pct sc-cb-grand">{pctOf(activeSum, sellPrice)}</div>
                  <div className="sc-cb-pct sc-cb-grand">{pctOf(activeSum, targetPrice)}</div>
                  <div className="sc-cb-active" />
                </div>
                {excluded > 0 && (
                  <div className="sc-cb-excluded">
                    {t('cb.excluded')}: &minus;${fmtN(excluded)}
                  </div>
                )}
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
      {/* Phase 4 — pricing snapshot audit panel. Collapsed by default;
          operator opens to see when the quote was frozen, by whom,
          under which site, plus any site-mismatch warnings. */}
      <SnapshotPanel source={snapshotSource} snapshot={snapshot} warnings={activeWarnings} />
    </div>
  );
}
