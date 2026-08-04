/**
 * CplxCostBreakdown — Cost breakdown + tier comparison for Complex Calculator.
 *
 * Mirrors the Standard CalcCostBreakdown UI (tier comparison table → cost
 * structure waterfall → detailed breakdown) but runs the full Complex
 * two-pass calcAll across all sub-products for each MOQ tier, so the
 * tier row aggregates match the FG sub-product (or fall back to a sum).
 */
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useI18n } from '../../../../utils/useI18n';
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';
import SnapshotPanel from '../../components/SnapshotPanel';
import { enumerateTiers, inkCostTotal, matCostExcludingInk } from '../../../../services/calcEngine';
import { aggregateForTier } from '../../../../services/cplxTierAggregate';
import { fmtN, pct } from '../../../../utils/format';
import { useBomQtyFlag } from '../../../../utils/useBomQtyFlag';
import { useSpMoqScalingFlag } from '../../../../utils/useSpMoqScalingFlag';
import { KPI_TOOLTIPS } from '../../../../utils/kpiDefinitions';
import {
  recomputeKpi,
  isBucketActive,
  readMask,
  writeMask,
} from '../StandardCalc/costStructureWhatIf';
import {
  defaultPrice,
  solvePriceForMetric,
  planTierPriceWrite,
  isEmptyPrice,
} from '../../../../services/priceSolver';
import { MarginCell, ApplyDefault } from '../../components/MarginPriceCells';
import { metricWarn } from '../../components/MarginPriceCells.helpers';

// VA / Contribution / GM re-derivation at a different price now lives in
// costStructureWhatIf.recomputeKpi (shared with Standard); all-active equals
// the canonical agg.va/contribution/gm exactly, the active-mask subtracts
// toggled-off buckets per metric.

// aggregateForTier (tier-aware Complex aggregation + margin math) now lives in
// services/cplxTierAggregate.js so the price↔margin solver reads the exact
// same forward calc as this table.

export default function CplxCostBreakdown() {
  const { cplxState, activeQuoteId, dispatch } = useCalc();
  const { lib } = useCostLib();
  const { t } = useI18n();
  const [bomQtyEnabled] = useBomQtyFlag();
  const [spMoqScalingEnabled] = useSpMoqScalingFlag();
  const cs = cplxState;
  const rate = cs.usd_rate || 0;
  const sps = useMemo(() => cs.subproducts || [], [cs.subproducts]);

  // Display-only what-if mask (sessionStorage per quote — never quote state /
  // reducer / server). Mirrors Standard CalcCostBreakdown.
  const [mask, setMask] = useState(() => readMask(activeQuoteId));
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

  // Phase 4 — lift snapshot resolve for the SnapshotPanel + propagate
  // through aggregateForTier → aggregateComplex (Phase 3 opts.snapshot).
  const { source: snapshotSource, snapshot } = useMemo(
    () => (lib ? snapshotPricingParams(cs, lib) : { source: 'empty', snapshot: null }),
    [cs, lib]
  );

  const tiers = useMemo(() => {
    if (!lib) return [];
    return enumerateTiers(cs).map(({ idx, moq, sp, eau }) => ({
      idx,
      moq,
      sp,
      eau,
      result: aggregateForTier(cs, sps, lib, idx, {
        bomQtyEnabled,
        spMoqScalingEnabled,
        snapshot,
      }),
    }));
  }, [cs, sps, lib, bomQtyEnabled, spMoqScalingEnabled, snapshot]);

  // ── Price ↔ margin inversion (Cost Breakdown only) ──
  const solverOpts = useMemo(
    () => ({ kind: 'cpx', snapshot, sps, bomQtyEnabled, spMoqScalingEnabled }),
    [snapshot, sps, bomQtyEnabled, spMoqScalingEnabled]
  );
  const defaults = useMemo(
    () => tiers.map((tr) => (tr.result ? defaultPrice(cs, lib, tr.idx, solverOpts) : null)),
    [tiers, cs, lib, solverOpts]
  );

  const commitMetric = useCallback(
    (table, tierIdx, metric, targetFrac) => {
      const price = solvePriceForMetric(cs, lib, tierIdx, metric, targetFrac, solverOpts);
      if (price == null || !(price > 0) || !Number.isFinite(price)) return false;
      for (const a of planTierPriceWrite({ kind: 'cpx', table, tierIdx, usd: price, rate }))
        dispatch(a);
      return true;
    },
    [cs, lib, solverOpts, rate, dispatch]
  );

  const applyDefault = useCallback(
    (table, tierIdx) => {
      const d = defaultPrice(cs, lib, tierIdx, solverOpts);
      if (!d || !(d.price > 0)) return;
      for (const a of planTierPriceWrite({ kind: 'cpx', table, tierIdx, usd: d.price, rate }))
        dispatch(a);
    },
    [cs, lib, solverOpts, rate, dispatch]
  );

  // Auto-seed the GM-25% default into a FRESH tier only — one whose selling
  // AND target are both empty. Seeds both once per tier per quote; a manual
  // value always wins (use ↻ to re-apply). Marked seen only on success.
  const seededRef = useRef({});
  useEffect(() => {
    if (!lib) return;
    const qid = String(activeQuoteId ?? 'draft');
    const seen = seededRef.current[qid] || (seededRef.current[qid] = new Set());
    for (const { idx, result } of tiers) {
      if (!result || seen.has(idx)) continue;
      const curSell = idx === 0 ? cs.selling_price : cs.extra_moqs?.[idx - 1]?.price;
      const curTgt = idx === 0 ? cs.target : cs.extra_moqs?.[idx - 1]?.target;
      if (!(isEmptyPrice(curSell) && isEmptyPrice(curTgt))) continue; // fresh tier only
      const d = defaultPrice(cs, lib, idx, solverOpts);
      if (!d || !(d.price > 0)) continue;
      seen.add(idx);
      for (const table of ['selling', 'target'])
        for (const a of planTierPriceWrite({
          kind: 'cpx',
          table,
          tierIdx: idx,
          usd: d.price,
          rate,
        }))
          dispatch(a);
    }
  }, [tiers, cs, lib, solverOpts, rate, activeQuoteId, dispatch]);

  if (!lib) {
    return (
      <div className="sc-section" style={{ padding: 20, color: '#94a3b8', textAlign: 'center' }}>
        Loading library data...
      </div>
    );
  }

  const activeIdx = cs.active_moq_idx || 0;
  const activeResult = tiers[activeIdx]?.result;
  // Phase 4 — site-mismatch / future-warning surface from the
  // active-tier calcAll result (Phase 2 `_warnings` channel).
  const activeWarnings = activeResult?._warnings || [];

  return (
    <div className="sc-section">
      {/* Sprint 41 — Selling /unit (KPIs vs selling price) + Target /unit
          (same costs, KPIs re-derived against target). Finance can see
          margin at both prices side-by-side without tier switching. */}
      <div className="sc-card">
        <div className="sc-card-header sc-header-dark">
          <span className="sc-card-icon">&#8801;</span>
          <span className="sc-card-title">Selling /unit (USD)</span>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-bd-table">
            <colgroup>
              <col className="bdc-tier" />
              <col className="bdc-qty" />
              <col className="bdc-qty" />
              <col className="bdc-price" />
              <col className="bdc-price" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-metric" />
              <col className="bdc-metric" />
              <col className="bdc-metric" />
            </colgroup>
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
                <th className="right bd-va" title={KPI_TOOLTIPS.va}>
                  VA%
                </th>
                <th className="right bd-contr" title={KPI_TOOLTIPS.contribution}>
                  Contr%
                </th>
                <th className="right bd-gm" title={KPI_TOOLTIPS.gm}>
                  GM%
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(({ idx, moq, sp, eau, result: r }, i) => {
                const isActive = idx === activeIdx;
                const target = idx === 0 ? cs.target : cs.extra_moqs?.[idx - 1]?.target;
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
                      <span className="mpc-price-val">{sp ? '$' + fmtN(sp, 4) : '\u2014'}</span>
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
                          {fmtN((r.overhead || 0) + (r.labor_cost || 0) + (r.tooling || 0))}
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
                      <td className="right" colSpan={8} style={{ color: '#94a3b8' }}>
                        Enter data to calculate
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target /unit — same costs, KPIs derived at target price. */}
      <div className="sc-card" style={{ marginTop: 12 }}>
        <div className="sc-card-header sc-header-dark">
          <span className="sc-card-icon">&#9678;</span>
          <span className="sc-card-title">Target /unit (USD)</span>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-bd-table">
            <colgroup>
              <col className="bdc-tier" />
              <col className="bdc-qty" />
              <col className="bdc-qty" />
              <col className="bdc-price" />
              <col className="bdc-price" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-cost" />
              <col className="bdc-metric" />
              <col className="bdc-metric" />
              <col className="bdc-metric" />
            </colgroup>
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
                <th className="right bd-va" title={KPI_TOOLTIPS.va}>
                  VA%
                </th>
                <th className="right bd-contr" title={KPI_TOOLTIPS.contribution}>
                  Contr%
                </th>
                <th className="right bd-gm" title={KPI_TOOLTIPS.gm}>
                  GM%
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(({ idx, moq, sp, eau, result: r }, i) => {
                const isActive = idx === activeIdx;
                const target = idx === 0 ? cs.target : cs.extra_moqs?.[idx - 1]?.target;
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
                      <span className="mpc-price-val">
                        {target ? '$' + fmtN(target, 4) : '\u2014'}
                      </span>
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
                          {fmtN((r.overhead || 0) + (r.labor_cost || 0) + (r.tooling || 0))}
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
                      <td className="right" colSpan={8} style={{ color: '#94a3b8' }}>
                        Enter data to calculate
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Structure waterfall for active tier */}
      {activeResult &&
        (() => {
          const r = activeResult;
          const sellPrice = tiers[activeIdx]?.sp || 0;
          const targetPrice = activeIdx === 0 ? cs.target : cs.extra_moqs?.[activeIdx - 1]?.target;
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
          ];
          const totalCost = r.s_ttl || 0; // composition-% denominator (unchanged)
          const maxVal = Math.max(...rows.map((x) => Math.abs(x.value || 0)), 0.001);
          const visible = rows.filter((x) => x.value > 0);
          const isOff = (x) => !isBucketActive(mask, x.key);
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
                        <input
                          type="checkbox"
                          className="sc-cb-chk"
                          checked={!off}
                          onChange={() => toggleBucket(x.key)}
                          aria-label={`${t('cb.active')} — ${x.label}`}
                        />
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
      {activeResult &&
        (() => {
          const r = activeResult;
          return (
            <div className="sc-card" style={{ marginTop: 12 }}>
              <div className="sc-card-header sc-header-slate">
                <span className="sc-card-title">
                  Detailed Breakdown &mdash; MOQ {activeIdx + 1}
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
                      <span>
                        {fmtN((r.overhead || 0) + (r.labor_cost || 0) + (r.tooling || 0))}
                      </span>
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
      {/* Phase 4 — pricing snapshot audit panel (Cpx symmetric with Std). */}
      <SnapshotPanel source={snapshotSource} snapshot={snapshot} warnings={activeWarnings} />
    </div>
  );
}
