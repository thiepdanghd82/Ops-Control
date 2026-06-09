/**
 * ComplexCalc — Complex Calculator matching COST V1.0 M06
 * 5 sub-tabs: Project | MOQ | Breakdown | Packing | Summary
 * Project tab: collapsible header + SP table with expandable detail rows
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import {
  calcPacking,
  calcShipping,
  aggregateComplex,
  serializeResultForPersist,
  buildCpxRowsPayload,
} from '../../../../services/calcEngine';
import {
  addSubProduct,
  removeSubProduct,
  setSpField,
  setSpMaterialField,
  setSpProcessField,
} from '../../../../context/calcReducer';
import { useBomQtyFlag } from '../../../../utils/useBomQtyFlag';
import { useSpMoqScalingFlag } from '../../../../utils/useSpMoqScalingFlag';
import { costApi, sharedApi } from '../../../../services/api';
import { chatApi, openChatRoom } from '../../../../services/chatApi';
import { useI18n } from '../../../../utils/useI18n';
import CplxHeader from './CplxHeader';
import CplxSummaryBar from './CplxSummaryBar';
import CplxCostBreakdown from './CplxCostBreakdown';
import ProcessFlowChart from './ProcessFlowChart';
import SubProductRow from './SubProductRow';
import BomTreeView from './BomTreeView';
import CalcLeadTimeNotice from '../StandardCalc/CalcLeadTimeNotice';
import { sumToolingCostCpx } from '../StandardCalc/CalcLeadTimeNotice.helpers.js';
import { showToast } from '../../../../utils/toast';
import { fmtN, pct, gmClr } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';
import { KPI_TOOLTIPS } from '../../../../utils/kpiDefinitions';
import SaveChoiceModal from '../../../../utils/SaveChoiceModal';
import ConflictModal from '../../../../components/Shared/ConflictModal';
import TabBarOverflow from '../../../../components/Shared/TabBarOverflow';
import '../StandardCalc/StandardCalc.css';
import './ComplexCalc.css';

const SUB_TABS = [
  { id: 'project', label: 'RFQ & MOQ info', icon: '▤' },
  { id: 'calculators', label: 'Calculators', icon: '⊞' },
  { id: 'bomtree', label: 'BOM Tree', icon: '⊟' },
  { id: 'breakdown', label: 'Cost Breakdown', icon: '≡' },
  { id: 'packing', label: 'Pack & Ship', icon: '▣' },
  { id: 'summary', label: 'Summarize', icon: '☰' },
  { id: 'lead-time', label: 'Lead time & Notice', icon: '⏱' },
];

const PACK_LABELS = {
  Sheet: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost' },
  Roll: { pcsLabel: 'Pcs/Roll', bagLabel: 'Rolls/Box', containerLabel: 'Core Cost' },
  Tray: { pcsLabel: 'Pcs/Tray', bagLabel: 'Trays/Box', containerLabel: 'Tray Cost' },
  'PE Bag': { pcsLabel: 'Pcs/PE Bag', bagLabel: 'Bags/Box', containerLabel: 'PE Bag Cost' },
};

export default function ComplexCalc() {
  const [activeSubTab, setActiveSubTab] = useState('project');
  const [expandedSps, setExpandedSps] = useState({});
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  // v1.3 Đợt 2 — see StandardCalc.jsx for the pattern; replaces blunt
  // window.confirm() with a 3-button modal that preserves edits.
  const [conflict, setConflict] = useState(null);
  const { t } = useI18n();
  const {
    cplxState,
    isDirty,
    markClean,
    dispatch,
    loadQuote,
    pendingQuote,
    clearPendingQuote,
    activeQuoteId,
    activeQuoteVersion,
  } = useCalc();
  const { lib } = useCostLib();
  const [bomQtyEnabled] = useBomQtyFlag();
  const [spMoqScalingEnabled] = useSpMoqScalingFlag();
  const cs = cplxState;
  const sps = useMemo(() => cs.subproducts || [], [cs.subproducts]);

  // Consume pending quote handoff from QuoteHistory via Context.
  // Clear pendingQuote AFTER the fetch resolves — clearing it first
  // causes React to run the effect cleanup (cancelled=true) before the
  // in-flight getQuotes() lands, so loadQuote never fires and the tab
  // shows empty default state instead of the requested quote.
  useEffect(() => {
    if (!pendingQuote || pendingQuote.type !== 'complex') return;
    const { id } = pendingQuote;
    let cancelled = false;
    sharedApi
      .getQuotes()
      .then((quotes) => {
        if (cancelled) return;
        const q = (quotes || []).find((x) => String(x.id) === String(id));
        if (q?.state) {
          // Pass `_version` through for optimistic locking on subsequent saves.
          loadQuote('cplx', q.state, q.id, q._version || 0);
        } else {
          showToast(`Quote #${id} not found`, 'err');
        }
        clearPendingQuote();
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load pending quote:', err);
        showToast('Failed to load quote: ' + (err.message || 'network error'), 'err');
        clearPendingQuote();
      });
    return () => {
      cancelled = true;
    };
  }, [pendingQuote, loadQuote, clearPendingQuote]);

  // Sprint 14e — handle 'rfq-sync' prefill push from Design Tools
  // (Apply to Pricing (Cpx) button) and from RFQ Tracker. Merges the
  // prefill data into cplxState top-level fields. For Complex,
  // sub-product geometry (L/Pw/W) doesn't apply at the top level, so
  // we only carry the identifier + cross-sub-product fields. Operator
  // pushes per-SP geometry explicitly via the Cut/Print Design sync
  // buttons inside each SubProductRow.
  useEffect(() => {
    if (!pendingQuote || pendingQuote.type !== 'rfq-sync') return;
    const prefill = pendingQuote.data || {};
    const nextState = { ...cplxState, ...prefill };
    loadQuote('cplx', nextState, null);
    showToast(
      'Prefilled from Design Tools / RFQ — geometry for each SP must still be set per sub-product'
    );
    clearPendingQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuote, loadQuote, clearPendingQuote]);

  // Two-pass calculation (shared helper — also used by CplxCostBreakdown)
  const { spResults, aggregate, calcErrors } = useMemo(() => {
    if (!lib || !sps.length) return { spResults: [], aggregate: null, calcErrors: [] };
    const tierIdx = cs.active_moq_idx || 0;
    const {
      aggregate: agg,
      pass2,
      errors,
    } = aggregateComplex(cs, sps, lib, tierIdx, { bomQtyEnabled, spMoqScalingEnabled });
    if (!agg) return { spResults: [], aggregate: null, calcErrors: errors };
    // Log pass errors so callers/console see them (helper is pure, doesn't log).
    for (const e of errors) {
      console.error(
        `[ComplexCalc] pass${e.pass} calcAll failed for SP "${e.code}" (idx=${e.spi}): ${e.message}`
      );
    }
    // Compute GM / VA / Contribution at the parent MOQ price.
    // VA % and Contribution % must match CplxCostBreakdown + kpiDefinitions
    // canonical formulas so SummaryBar and Breakdown table always agree.
    const sp = cs.selling_price || 0;
    if (sp > 0) {
      agg.gm = (sp - (agg.s_ttl || 0)) / sp;
      agg.va = (sp - (agg.s_mat_cost || 0) - (agg.tooling || 0) - (agg.packing_ship || 0)) / sp;
      agg.contribution =
        1 -
        ((agg.s_mat_cost || 0) +
          (agg.tooling || 0) +
          (agg.packing_ship || 0) +
          (agg.labor_cost || 0)) /
          sp;
    } else {
      agg.gm = agg.va = agg.contribution = null;
    }
    return { spResults: pass2, aggregate: agg, calcErrors: errors };
  }, [cs, sps, lib, bomQtyEnabled, spMoqScalingEnabled]);

  // Surface calc errors to user once per change (dedup by message)
  useEffect(() => {
    if (calcErrors && calcErrors.length) {
      const first = calcErrors[0];
      showToast(`Calc warning: SP "${first.code}" — ${first.message}`, 'err');
    }
  }, [calcErrors]);

  const handleAddSp = useCallback(() => {
    const usedCodes = sps.map((s) => s.code);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = 'SP A';
    for (const l of letters) {
      const c = `SP ${l}`;
      if (!usedCodes.includes(c)) {
        code = c;
        break;
      }
    }
    // Creator only reads `.code`; no need to build a full SP object here —
    // reducer calls createSubProduct(code) itself.
    dispatch(addSubProduct({ code }));
  }, [sps, dispatch]);
  const removeSp = useCallback(
    (idx) => {
      dispatch(removeSubProduct({ idx }));
    },
    [dispatch]
  );
  const toggleSp = useCallback((spi) => {
    setExpandedSps((prev) => ({ ...prev, [spi]: !prev[spi] }));
  }, []);

  const [saving, setSaving] = useState(false);

  const buildQuoteData = useCallback(() => {
    // MES-3-FIX-41: per-row Setup/Run/Total per SP per tier — exports
    // now show real numbers everywhere instead of em-dash. Cost ~150ms
    // for 3 SPs × 5 tiers; runs sync so save errors surface cleanly.
    const cpxRows = lib ? buildCpxRowsPayload(cs, sps, lib) : { subproducts: [] };
    const persisted = serializeResultForPersist(
      aggregate ? { ...aggregate, subproducts: cpxRows.subproducts } : null
    );
    return {
      type: 'complex',
      state: cs,
      result: persisted,
      saved_at: new Date().toISOString(),
      label: cs.ccl_pn || 'Complex',
    };
  }, [cs, sps, lib, aggregate]);

  const persistAsNew = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await costApi.saveQuote(buildQuoteData());
      markClean();
      if (saved?.id != null) {
        dispatch({
          type: 'SET_ACTIVE_QUOTE_ID',
          payload: { id: saved.id, version: saved._version || 1 },
        });
      }
      showToast('Quote saved as new version');
    } catch (err) {
      console.error('Failed to save:', err);
      showToast('Save failed: ' + (err.message || 'Unknown error'), 'err');
    } finally {
      setSaving(false);
    }
  }, [buildQuoteData, markClean, dispatch]);

  const persistUpdate = useCallback(async () => {
    setSaving(true);
    try {
      // Sprint 11 P0-2: include _version for optimistic-locking check.
      const payload = { ...buildQuoteData(), _version: activeQuoteVersion };
      const saved = await costApi.updateQuote(activeQuoteId, payload);
      markClean();
      if (saved?._version != null) {
        dispatch({
          type: 'SET_ACTIVE_QUOTE_ID',
          payload: { id: activeQuoteId, version: saved._version },
        });
      }
      showToast(`Quote #${activeQuoteId} updated`);
    } catch (err) {
      if (err?.status === 409 && err?.body?.current) {
        setConflict({
          current: err.body.current,
          attempted: { id: activeQuoteId, _version: activeQuoteVersion, ...buildQuoteData() },
          savedBy: err.body.current?.saved_by || null,
          savedAt: err.body.current?.saved_at || null,
          actual_version: err.body.actual_version,
        });
        return;
      }
      console.error('Failed to update:', err);
      showToast('Update failed: ' + (err.message || 'Unknown error'), 'err');
    } finally {
      setSaving(false);
    }
  }, [buildQuoteData, markClean, activeQuoteId, activeQuoteVersion, dispatch]);

  const handleConflictReload = useCallback(() => {
    if (!conflict?.current) return;
    const c = conflict.current;
    loadQuote('cplx', c.state || {}, c.id, c._version || 0);
    setConflict(null);
    showToast('Reloaded server version — your unsaved edits were discarded');
  }, [conflict, loadQuote]);

  const handleConflictOverwrite = useCallback(async () => {
    if (!conflict) return;
    setSaving(true);
    try {
      const payload = { ...buildQuoteData(), _version: conflict.actual_version };
      const saved = await costApi.updateQuote(activeQuoteId, payload);
      markClean();
      if (saved?._version != null) {
        dispatch({
          type: 'SET_ACTIVE_QUOTE_ID',
          payload: { id: activeQuoteId, version: saved._version },
        });
      }
      showToast(`Quote #${activeQuoteId} overwritten`);
    } catch (forceErr) {
      showToast('Force-save failed: ' + (forceErr.message || 'Unknown error'), 'err');
    } finally {
      setSaving(false);
      setConflict(null);
    }
  }, [conflict, buildQuoteData, activeQuoteId, markClean, dispatch]);

  const handleConflictCancel = useCallback(() => setConflict(null), []);

  const handleSave = useCallback(() => {
    if (activeQuoteId != null) setSaveChoiceOpen(true);
    else persistAsNew();
  }, [activeQuoteId, persistAsNew]);

  // Ctrl/Cmd+S → Save. Same binding as StandardCalc so users build muscle
  // memory across both calculators.
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, isDirty, saving]);

  // `saving` is wired into the Save button below so the user can't double-fire.
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_CPLX' });
  }, [dispatch]);
  const setCplxField = useCallback(
    (f, v) => dispatch({ type: 'SET_CPLX_FIELD', payload: { field: f, value: v } }),
    [dispatch]
  );

  // Lead time & Notice — Tooling cost cell shows Σ tool_cost across
  // every process in every subproduct (cross-SP sum). Helper extracted
  // to enable node:test coverage; reuses sumToolingCostStd internally
  // so Std and Cpx skip the same `hidden:true` rows by the same rule.
  const toolingCostTotal = useMemo(
    () => sumToolingCostCpx(cplxState.subproducts),
    [cplxState.subproducts]
  );

  const packTotal = useMemo(() => {
    try {
      return calcPacking(cs);
    } catch {
      return 0;
    }
  }, [cs]);
  const shipTotal = useMemo(() => {
    try {
      return calcShipping(cs);
    } catch {
      return 0;
    }
  }, [cs]);
  const labels = PACK_LABELS[cs.packing_method] || PACK_LABELS.Sheet;

  return (
    <div className="cc">
      {/* Sub-tab bar — wrapped in TabBarOverflow for narrow-screen fit */}
      <div className="cc-tab-bar">
        <TabBarOverflow
          ariaLabel="Pricing Worksheet (Complex) sub-tabs"
          rightSlot={
            <>
              {isDirty && <span className="cc-dirty">Unsaved</span>}
              {activeQuoteId != null && (
                <button
                  className="cc-btn cc-btn-outline"
                  onClick={async () => {
                    try {
                      const r = await chatApi.openQuote(activeQuoteId);
                      openChatRoom(r.room.id);
                    } catch (e) {
                      showToast(t('chat.unavailable', { msg: e.message || 'error' }), 'warning');
                    }
                  }}
                  title={t('chat.discuss_title')}
                >
                  {t('chat.discuss')}
                </button>
              )}
              <button className="cc-btn cc-btn-outline" onClick={handleReset}>
                New
              </button>
              <button
                className="cc-btn cc-btn-primary"
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSubTab === tab.id}
              aria-label={tab.label}
              className={`cc-tab ${activeSubTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
              title={tab.label}
            >
              <span className="cc-tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="cc-tab-label"> {tab.label}</span>
            </button>
          ))}
        </TabBarOverflow>
      </div>

      {/* Persistent cost summary bar — always visible below tabs */}
      <CplxSummaryBar cs={cs} aggregate={aggregate} />

      <div className="cc-content">
        {/* ═══ PROJECT TAB ═══ */}
        {activeSubTab === 'project' && (
          <div className="sc-section sc-rfq-moq-split">
            {/* LEFT — RFQ Information */}
            <div className="sc-rfq-col">
              <CplxHeader />
            </div>

            {/* RIGHT — MOQ & Pricing */}
            <div className="sc-moq-col">
              <ComplexMoqTab cs={cs} sps={sps} dispatch={dispatch} setCplxField={setCplxField} />
            </div>
          </div>
        )}

        {/* ═══ CALCULATORS TAB ═══ */}
        {activeSubTab === 'calculators' && (
          <>
            {/* SP Data Table */}
            <div className="cc-sp-table-card">
              <div className="cc-sp-table-header">
                <span>Sub-Products ({sps.length})</span>
                <button className="cc-btn cc-btn-add-sp" onClick={handleAddSp}>
                  + Add Sub-Product
                </button>
              </div>
              <div className="cc-sp-table-wrap">
                <table className="cc-spt">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th style={{ width: 90 }}>SP Code</th>
                      <th style={{ minWidth: 140 }}>Description</th>
                      <th style={{ width: 110 }}>Main Process</th>
                      <th style={{ width: 80 }}>Size (mm)</th>
                      <th className="right" style={{ width: 85 }}>
                        Mat. Cost
                      </th>
                      <th className="right" style={{ width: 85 }}>
                        Mach. Cost
                      </th>
                      <th className="right" style={{ width: 85 }}>
                        Labor Cost
                      </th>
                      <th className="right" style={{ width: 75 }}>
                        Tooling
                      </th>
                      <th className="right" style={{ width: 90 }}>
                        G.Total
                      </th>
                      <th style={{ width: 60 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sps.map((sp, spi) => {
                      const r = spResults[spi];
                      const isFG = (sp.code || '').toUpperCase().startsWith('FG');
                      const isExpanded = !!expandedSps[spi];
                      const size =
                        sp.part_width && sp.part_length_md
                          ? `${sp.part_width}×${sp.part_length_md}`
                          : '\u2014';
                      return (
                        <React.Fragment key={spi}>
                          {/* Summary row */}
                          <tr
                            className={`cc-spt-row ${isFG ? 'cc-spt-fg' : ''} ${isExpanded ? 'cc-spt-expanded' : ''}`}
                          >
                            <td>
                              <button
                                className={`cc-spt-toggle ${isExpanded ? 'open' : ''}`}
                                onClick={() => toggleSp(spi)}
                              >
                                {isExpanded ? '\u25BC' : '\u25B6'}
                              </button>
                            </td>
                            <td>
                              <input
                                type="text"
                                value={sp.code || ''}
                                className="cc-spt-code"
                                style={
                                  isFG
                                    ? { background: '#f5f3ff', color: '#7c3aed', fontWeight: 800 }
                                    : {}
                                }
                                onChange={(e) =>
                                  dispatch(
                                    setSpField({ spIdx: spi, field: 'code', value: e.target.value })
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={sp.description || ''}
                                placeholder="Description"
                                className="cc-spt-input"
                                onChange={(e) =>
                                  dispatch(
                                    setSpField({
                                      spIdx: spi,
                                      field: 'description',
                                      value: e.target.value,
                                    })
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={sp.main_process || ''}
                                placeholder="Process"
                                className="cc-spt-input"
                                onChange={(e) =>
                                  dispatch(
                                    setSpField({
                                      spIdx: spi,
                                      field: 'main_process',
                                      value: e.target.value,
                                    })
                                  )
                                }
                              />
                            </td>
                            <td className="cc-spt-size">{size}</td>
                            <td className="right cc-spt-cost" style={{ color: '#2563eb' }}>
                              {r ? fmtN(r.s_mat_cost) : '\u2014'}
                            </td>
                            <td className="right cc-spt-cost" style={{ color: '#d97706' }}>
                              {r ? fmtN(r.overhead) : '\u2014'}
                            </td>
                            <td className="right cc-spt-cost" style={{ color: '#16a34a' }}>
                              {r ? fmtN(r.labor_cost) : '\u2014'}
                            </td>
                            <td className="right cc-spt-cost" style={{ color: '#7c3aed' }}>
                              {r ? fmtN(r.tooling) : '\u2014'}
                            </td>
                            <td className="right cc-spt-gtotal">{r ? fmtN(r.s_ttl) : '\u2014'}</td>
                            <td className="cc-spt-actions">
                              <button
                                className="cc-spt-act-btn"
                                onClick={() => toggleSp(spi)}
                                title="Toggle detail"
                              >
                                {isExpanded ? '\u25B2' : '\u25BC'}
                              </button>
                              <button
                                className="cc-spt-act-btn cc-spt-act-del"
                                onClick={() => removeSp(spi)}
                                title="Remove"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                          {/* Expandable detail row */}
                          {isExpanded && (
                            <tr className="cc-spt-detail-row">
                              <td colSpan={11}>
                                <SubProductRow sp={sp} spi={spi} result={r} allSps={sps} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {sps.length > 0 && (
                    <tfoot>
                      <tr className="cc-spt-footer">
                        <td colSpan={5}>
                          <b>
                            {sps.some((s) => (s.code || '').toUpperCase().startsWith('FG'))
                              ? 'FG Total'
                              : 'TOTAL'}
                          </b>
                        </td>
                        <td className="right">
                          {aggregate ? fmtN(aggregate.s_mat_cost) : '\u2014'}
                        </td>
                        <td className="right">{aggregate ? fmtN(aggregate.overhead) : '\u2014'}</td>
                        <td className="right">
                          {aggregate ? fmtN(aggregate.labor_cost) : '\u2014'}
                        </td>
                        <td className="right">{aggregate ? fmtN(aggregate.tooling) : '\u2014'}</td>
                        <td className="right" style={{ fontWeight: 900, fontSize: 13 }}>
                          {aggregate ? fmtN(aggregate.s_ttl) : '\u2014'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {sps.length === 0 && (
                <div className="cc-empty">
                  No sub-products yet. Click <b>+ Add Sub-Product</b> to begin.
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ BOM TREE TAB ═══
            Read-only tree visualization of the v2 shape: assembly SP
            at the root, children connected by a vertical rail. Consumes
            `cplxState.bom` (or falls back to qty=1 per non-assembly SP)
            so it works for legacy quotes too. Editing lands in Sprint 4.2. */}
        {activeSubTab === 'bomtree' && <BomTreeView />}

        {/* ═══ COST BREAKDOWN TAB ═══
            Ported from Standard CalcCostBreakdown — runs the two-pass
            complex calc per tier to produce a tier-comparison row, then
            renders the cost structure waterfall + detailed breakdown
            grid for the active tier. Uses the `sc-*` classes shared with
            StandardCalc.css so the styling matches 1-to-1. */}
        {activeSubTab === 'breakdown' && <CplxCostBreakdown />}

        {/* ═══ PACKING TAB ═══
            Uses the sc-* classes shared with StandardCalc.css so the
            styling matches 1-to-1 with the Standard calculator. */}
        {activeSubTab === 'packing' && (
          <div className="sc-section">
            {/* Sprint 41 — assembly-level Pack&Ship hint. Before this sprint
                these fields were UI-only (orphaned from the cost roll-up).
                Making the behavior explicit prevents "why did my total
                jump?" tickets from users reviewing older quotes. */}
            <div className="cc-pack-hint" role="note">
              ▣ These Pack &amp; Ship values apply to the <b>whole assembly</b> (per shipped unit).
              They add on top of any per-sub-product packing entered in the Calculators tab,
              matching how Standard quotes roll up packing and shipping into the final price.
            </div>
            <div className="sc-pack-grid">
              <div className="sc-card">
                <div className="sc-card-header sc-header-emerald">
                  <span className="sc-card-icon">&#9635;</span>
                  <span className="sc-card-title">Packing</span>
                </div>
                <div className="sc-card-body">
                  <div className="sc-field">
                    <label>Packing Method</label>
                    <select
                      value={cs.packing_method || 'Sheet'}
                      onChange={(e) => setCplxField('packing_method', e.target.value)}
                      className="sc-input"
                    >
                      <option value="Sheet">Sheet</option>
                      <option value="Roll">Roll</option>
                      <option value="Tray">Tray</option>
                      <option value="PE Bag">PE Bag</option>
                    </select>
                  </div>
                  <div className="sc-field">
                    <label>{labels.pcsLabel}</label>
                    <DecimalInput
                      value={cs.pcs_per_bag}
                      placeholder="—"
                      onChange={(v) => setCplxField('pcs_per_bag', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-field">
                    <label>{labels.bagLabel}</label>
                    <DecimalInput
                      value={cs.bags_per_box}
                      placeholder="—"
                      onChange={(v) => setCplxField('bags_per_box', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-field">
                    <label>{labels.containerLabel}</label>
                    <DecimalInput
                      value={cs.container_cost}
                      placeholder="—"
                      onChange={(v) => setCplxField('container_cost', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-field">
                    <label>Box Cost (USD)</label>
                    <DecimalInput
                      value={cs.box_cost}
                      placeholder="—"
                      onChange={(v) => setCplxField('box_cost', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-field">
                    <label>Other Packing/pcs</label>
                    <DecimalInput
                      value={cs.other_packing}
                      placeholder="—"
                      onChange={(v) => setCplxField('other_packing', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-pack-total">
                    Total Packing/pcs: <b>{fmtN(packTotal, 6)} USD</b>
                  </div>
                </div>
              </div>
              <div className="sc-card">
                <div className="sc-card-header sc-header-sky">
                  <span className="sc-card-icon">&#8680;</span>
                  <span className="sc-card-title">Shipping</span>
                </div>
                <div className="sc-card-body">
                  <div className="sc-field">
                    <label>Delivery Term</label>
                    <input
                      type="text"
                      value={cs.delivery_term || ''}
                      onChange={(e) => setCplxField('delivery_term', e.target.value)}
                      className="sc-input"
                      placeholder="FOB, CIF, etc."
                    />
                  </div>
                  <div className="sc-field">
                    <label>Deliver Quantity</label>
                    {/* Auto-sync with MOQ: when ship_qty is 0 we display
                        MOQ. Clearing reverts to MOQ on next render (engine
                        also falls back to MOQ in calcShipping L409 so cost
                        is correct either way). Purple-bold = override. */}
                    <DecimalInput
                      value={cs.ship_qty > 0 ? cs.ship_qty : cs.moq || 0}
                      onChange={(v) => setCplxField('ship_qty', v)}
                      className="sc-input"
                      placeholder="—"
                      style={
                        cs.ship_qty > 0 ? { color: 'var(--color-violet-500)', fontWeight: 700 } : {}
                      }
                      title={
                        cs.ship_qty > 0
                          ? 'Override — clear to revert to MOQ'
                          : 'Auto-synced from MOQ'
                      }
                    />
                  </div>
                  <div className="sc-field">
                    <label>Shipping Cost (USD total)</label>
                    <DecimalInput
                      value={cs.shipping_cost}
                      placeholder="—"
                      onChange={(v) => setCplxField('shipping_cost', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-field">
                    <label>Other Cost/shipment</label>
                    <DecimalInput
                      value={cs.other_ship}
                      placeholder="—"
                      onChange={(v) => setCplxField('other_ship', v)}
                      className="sc-input"
                    />
                  </div>
                  <div className="sc-ship-total">
                    Total Shipping/pcs: <b>{fmtN(shipTotal, 6)} USD</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SUMMARY TAB ═══ */}
        {activeSubTab === 'summary' && aggregate && (
          <div className="cc-summary">
            <div className="cc-sum-kpis">
              <div className="cc-sum-kpi" style={{ borderColor: '#0f2341' }}>
                <div className="cc-sum-kpi-label">MOQ</div>
                <div className="cc-sum-kpi-val">{(cs.moq || 0).toLocaleString()}</div>
                <div className="cc-sum-kpi-sub">EA</div>
              </div>
              <div className="cc-sum-kpi" style={{ borderColor: '#dc2626' }}>
                <div className="cc-sum-kpi-label">Total Cost</div>
                <div className="cc-sum-kpi-val" style={{ color: '#dc2626' }}>
                  ${fmtN(aggregate.s_ttl)}
                </div>
                <div className="cc-sum-kpi-sub">USD</div>
              </div>
              <div className="cc-sum-kpi" style={{ borderColor: '#1e40af' }}>
                <div className="cc-sum-kpi-label">Selling Price</div>
                <div className="cc-sum-kpi-val">${fmtN(cs.selling_price || 0, 4)}</div>
                <div className="cc-sum-kpi-sub">USD</div>
              </div>
              <div className="cc-sum-kpi" style={{ borderColor: '#0891b2' }}>
                <div className="cc-sum-kpi-label">VA%</div>
                <div className="cc-sum-kpi-val" style={{ color: '#0891b2' }}>
                  {pct(aggregate.va)}
                </div>
                <div className="cc-sum-kpi-sub">Value Add</div>
              </div>
              <div
                className="cc-sum-kpi"
                style={{ borderColor: '#7c3aed' }}
                title={KPI_TOOLTIPS.contribution}
              >
                <div className="cc-sum-kpi-label">Contr%</div>
                <div className="cc-sum-kpi-val" style={{ color: '#7c3aed' }}>
                  {pct(aggregate.contribution)}
                </div>
                <div className="cc-sum-kpi-sub">Contribution</div>
              </div>
              <div className="cc-sum-kpi" style={{ borderColor: gmClr(aggregate.gm) }}>
                <div className="cc-sum-kpi-label">GM%</div>
                <div className="cc-sum-kpi-val" style={{ color: gmClr(aggregate.gm) }}>
                  {pct(aggregate.gm)}
                </div>
                <div className="cc-sum-kpi-sub">Gross Margin</div>
              </div>
            </div>
            <div className="cc-card" style={{ marginTop: 14 }}>
              <div className="cc-card-hdr">Cost Structure — {sps.length} Sub-Products</div>
              <div className="cc-card-body">
                {[
                  { label: 'Material', val: aggregate.s_mat_cost, clr: '#2563eb', icon: '◈' },
                  { label: 'Overhead', val: aggregate.overhead, clr: '#059669', icon: '⚙' },
                  { label: 'Labor', val: aggregate.labor_cost, clr: '#16a34a', icon: '⊙' },
                  { label: 'Tooling', val: aggregate.tooling, clr: '#374151', icon: '⚒' },
                  { label: 'Pack & Ship', val: aggregate.packing_ship, clr: '#0ea5e9', icon: '▣' },
                ]
                  .filter((r) => r.val > 0)
                  .map((r, i) => {
                    const share =
                      aggregate.s_ttl > 0 ? ((r.val / aggregate.s_ttl) * 100).toFixed(1) : 0;
                    const maxV = Math.max(
                      aggregate.s_mat_cost || 0,
                      aggregate.overhead || 0,
                      aggregate.labor_cost || 0,
                      aggregate.tooling || 0,
                      aggregate.packing_ship || 0,
                      0.001
                    );
                    return (
                      <div key={i} className="cc-sum-bar-row">
                        <div className="cc-sum-bar-label">
                          <span>
                            {r.icon} {r.label}
                          </span>
                          <span style={{ color: '#94a3b8' }}>{share}%</span>
                        </div>
                        <div className="cc-sum-bar-track">
                          <div
                            className="cc-sum-bar-fill"
                            style={{ width: (r.val / maxV) * 100 + '%', background: r.clr }}
                          />
                        </div>
                        <div className="cc-sum-bar-val" style={{ color: r.clr }}>
                          ${fmtN(r.val)}
                        </div>
                      </div>
                    );
                  })}
                <div className="cc-sum-bar-row cc-sum-bar-total">
                  <div className="cc-sum-bar-label">
                    <b>GRAND TOTAL</b>
                  </div>
                  <div className="cc-sum-bar-track" />
                  <div
                    className="cc-sum-bar-val"
                    style={{ fontWeight: 900, fontSize: 14, color: '#0f2341' }}
                  >
                    ${fmtN(aggregate.s_ttl)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Sprint S-PFC — BOM + routing flow chart.
            Moved OUTSIDE the `aggregate &&` gate: chart derives purely
            from cplxState.subproducts[] + their materials/processes, so
            it must render even before the first calc pass completes
            (e.g. new quote, no price lib loaded yet). */}
        {activeSubTab === 'summary' && <ProcessFlowChart />}
        {activeSubTab === 'lead-time' && (
          <CalcLeadTimeNotice
            leadTime={cplxState.lead_time}
            onChange={(next) => setCplxField('lead_time', next)}
            toolingCostTotal={toolingCostTotal}
          />
        )}
      </div>

      <SaveChoiceModal
        open={saveChoiceOpen}
        quoteId={activeQuoteId}
        quoteLabel={cs.ccl_pn}
        onCancel={() => setSaveChoiceOpen(false)}
        onUpdate={() => {
          setSaveChoiceOpen(false);
          persistUpdate();
        }}
        onSaveAsNew={() => {
          setSaveChoiceOpen(false);
          persistAsNew();
        }}
      />
      <ConflictModal
        conflict={conflict}
        onReload={handleConflictReload}
        onOverwrite={handleConflictOverwrite}
        onCancel={handleConflictCancel}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * ComplexMoqTab — MOQ tier management + Setup Data per MOQ table
 * ───────────────────────────────────────────────────────────── */
function ComplexMoqTab({ cs, sps, dispatch, setCplxField }) {
  const numMoq = cs.num_moq || 1;
  const extraMoqs = useMemo(() => cs.extra_moqs || [], [cs.extra_moqs]);
  const activeMoqIdx = cs.active_moq_idx || 0;

  const setActiveMoq = useCallback(
    (idx) => {
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'active_moq_idx', value: idx } });
    },
    [dispatch]
  );

  const addMoqTier = useCallback(() => {
    const next = [
      ...extraMoqs,
      { moq: 0, eau: null, price: null, target: null, price_vnd: null, target_vnd: null },
    ];
    dispatch({ type: 'SET_CPLX_STATE', payload: { num_moq: numMoq + 1, extra_moqs: next } });
  }, [dispatch, extraMoqs, numMoq]);

  const removeMoqTier = useCallback(
    (idx) => {
      const next = extraMoqs.filter((_, i) => i !== idx);
      dispatch({
        type: 'SET_CPLX_STATE',
        payload: { num_moq: Math.max(1, numMoq - 1), extra_moqs: next, active_moq_idx: 0 },
      });
    },
    [dispatch, extraMoqs, numMoq]
  );

  // NOTE: updateExtraMoq was previously used for all extra-MOQ row
  // updates. After adding USD↔VND bi-directional sync, that logic
  // moved into `updateExtraMoqWithRate` (declared below with access
  // to cs.usd_rate). This plain helper is kept as a fallback in case
  // other callers need a no-mirror write.
  // eslint-disable-next-line no-unused-vars
  const updateExtraMoq = useCallback(
    (idx, field, value) => {
      const next = extraMoqs.map((em, i) => (i === idx ? { ...em, [field]: value } : em));
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'extra_moqs', value: next } });
    },
    [dispatch, extraMoqs]
  );

  // ── Setup overrides ──
  // PR #C (Sprint S-ALT-MAT) — per-SP material-row tier override field
  // routes through THIS subproduct's materials_active (amendment A).
  // Different SPs at the same tier branch independently.
  const setSpMatSetupForTier = useCallback(
    (tierIdx, spi, mi, valueStr) => {
      if (tierIdx === 0) {
        const v = valueStr === '' ? 0 : parseFloat(valueStr) || 0;
        dispatch(setSpMaterialField({ spIdx: spi, idx: mi, field: 'setup_lm', value: v }));
        return;
      }
      const sp = cs.subproducts?.[spi];
      const spAlt = sp && sp.materials_active === 'alt';
      const tierSpLmField = spAlt ? 'sp_mat_setup_lm_alt' : 'sp_mat_setup_lm';
      const ei = tierIdx - 1;
      const next = [...extraMoqs];
      const em = { ...(next[ei] || {}) };
      const map = { ...(em[tierSpLmField] || {}) };
      const arr = Array.isArray(map[spi]) ? [...map[spi]] : [];
      arr[mi] = valueStr === '' ? null : parseFloat(valueStr) || 0;
      map[spi] = arr;
      em[tierSpLmField] = map;
      next[ei] = em;
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'extra_moqs', value: next } });
    },
    [dispatch, extraMoqs, cs.subproducts]
  );

  const setSpProcSetupForTier = useCallback(
    (tierIdx, spi, pi, valueStr) => {
      if (tierIdx === 0) {
        const v = valueStr === '' ? 0 : parseFloat(valueStr) || 0;
        dispatch(setSpProcessField({ spIdx: spi, idx: pi, field: 'setup_h', value: v }));
        return;
      }
      const ei = tierIdx - 1;
      const next = [...extraMoqs];
      const em = { ...(next[ei] || {}) };
      const map = { ...(em.sp_proc_setup_h || {}) };
      const arr = Array.isArray(map[spi]) ? [...map[spi]] : [];
      arr[pi] = valueStr === '' ? null : parseFloat(valueStr) || 0;
      map[spi] = arr;
      em.sp_proc_setup_h = map;
      next[ei] = em;
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'extra_moqs', value: next } });
    },
    [dispatch, extraMoqs]
  );

  // Flatten all SP materials/processes that have data
  const flatMats = useMemo(() => {
    const out = [];
    sps.forEach((sp, spi) => {
      (sp.materials || []).forEach((m, mi) => {
        if (m.code && !m.hidden) out.push({ sp, spi, m, mi });
      });
    });
    return out;
  }, [sps]);

  const flatProcs = useMemo(() => {
    const out = [];
    sps.forEach((sp, spi) => {
      (sp.processes || []).forEach((p, pi) => {
        if (p.workcenter && !p.hidden) out.push({ sp, spi, p, pi });
      });
    });
    return out;
  }, [sps]);

  const showSetupMoqTable = numMoq > 1 && (flatMats.length > 0 || flatProcs.length > 0);
  const fmtIntLocal = (v) =>
    v == null || v === '' || isNaN(+v) ? '\u2014' : Number(v).toLocaleString('en-US');

  // ── USD ↔ VND currency sync ──
  //
  // Model: USD is the source of truth. When rate > 0, VND = USD × rate
  // for each pricing field. User can still type into a VND field —
  // that push converts back to USD immediately via the setSellingVnd /
  // setTargetVnd handlers.
  //
  // The useEffect below handles THREE scenarios that the per-field
  // onChange can't cover on its own:
  //   1. User loads an old quote that has USD but no VND (legacy data).
  //   2. User sets USD first, then enters the rate later — original
  //      onChange saw rate=0, skipped sync; the effect catches up.
  //   3. User edits the rate — all VND mirrors refresh to match USD.
  //
  // Deliberately NOT listing selling_price_vnd / target_vnd as deps so
  // user-initiated VND edits don't get clobbered on the next tick.
  const rate = cs.usd_rate || 0;
  useEffect(() => {
    if (rate <= 0) return;
    const patch = {};
    const epsSyncVnd = (usd, vnd) => {
      if (usd == null || usd === 0) return null;
      const expected = +(usd * rate).toFixed(0);
      // Tolerate tiny rounding drift so we don't thrash.
      return Math.abs((vnd || 0) - expected) > 1 ? expected : null;
    };
    const sNext = epsSyncVnd(cs.selling_price, cs.selling_price_vnd);
    if (sNext != null) patch.selling_price_vnd = sNext;
    const tNext = epsSyncVnd(cs.target, cs.target_vnd);
    if (tNext != null) patch.target_vnd = tNext;
    // Also sync extra MOQ tiers (price/target).
    const nextExtraMoqs = (cs.extra_moqs || []).map((em) => {
      const pNext = epsSyncVnd(em.price, em.price_vnd);
      const ptNext = epsSyncVnd(em.target, em.target_vnd);
      if (pNext == null && ptNext == null) return em;
      return {
        ...em,
        ...(pNext != null ? { price_vnd: pNext } : {}),
        ...(ptNext != null ? { target_vnd: ptNext } : {}),
      };
    });
    const extraChanged = nextExtraMoqs.some((em, i) => em !== (cs.extra_moqs || [])[i]);
    if (extraChanged) patch.extra_moqs = nextExtraMoqs;
    if (Object.keys(patch).length) dispatch({ type: 'SET_CPLX_STATE', payload: patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, cs.selling_price, cs.target, cs.extra_moqs]);

  const setSellingUsd = useCallback(
    (v) => {
      const patch = { selling_price: v };
      if (rate > 0 && v != null) patch.selling_price_vnd = +(v * rate).toFixed(0);
      dispatch({ type: 'SET_CPLX_STATE', payload: patch });
    },
    [dispatch, rate]
  );
  const setSellingVnd = useCallback(
    (v) => {
      const patch = { selling_price_vnd: v };
      if (rate > 0 && v != null) patch.selling_price = +(v / rate).toFixed(4);
      dispatch({ type: 'SET_CPLX_STATE', payload: patch });
    },
    [dispatch, rate]
  );
  const setTargetUsd = useCallback(
    (v) => {
      const patch = { target: v };
      if (rate > 0 && v != null) patch.target_vnd = +(v * rate).toFixed(0);
      dispatch({ type: 'SET_CPLX_STATE', payload: patch });
    },
    [dispatch, rate]
  );
  const setTargetVnd = useCallback(
    (v) => {
      const patch = { target_vnd: v };
      if (rate > 0 && v != null) patch.target = +(v / rate).toFixed(4);
      dispatch({ type: 'SET_CPLX_STATE', payload: patch });
    },
    [dispatch, rate]
  );

  const updateExtraMoqWithRate = useCallback(
    (idx, field, value) => {
      const patch = { [field]: value };
      if (rate > 0 && value != null) {
        if (field === 'price') patch.price_vnd = +(value * rate).toFixed(0);
        else if (field === 'price_vnd') patch.price = +(value / rate).toFixed(4);
        else if (field === 'target') patch.target_vnd = +(value * rate).toFixed(0);
        else if (field === 'target_vnd') patch.target = +(value / rate).toFixed(4);
      }
      // Apply each field via SET_EXTRA_MOQ (one mutation per key).
      for (const [f, v] of Object.entries(patch)) {
        dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx, field: f, value: v } });
      }
    },
    [dispatch, rate]
  );

  return (
    <div className="sc-card sc-moq-card">
      <div className="sc-card-header sc-moq-card-header">
        <span className="sc-card-icon">&#164;</span>
        <span className="sc-card-title">MOQ &amp; Pricing info</span>
        <span className="sc-moq-tier-count">{numMoq} tier</span>
        <div className="sc-hdr-rate">
          <label>USD Rate</label>
          <DecimalInput
            value={cs.usd_rate}
            onChange={(v) => setCplxField('usd_rate', v)}
            className="sc-hdr-rate-inp"
            placeholder="25,000"
            title="VND per 1 USD. Bi-directionally syncs Selling/Target USD ↔ VND. Saved per RFQ."
            thousandSep
          />
        </div>
      </div>
      <div className="sc-card-body sc-moq-body">
        <div className="sc-moq-table-wrap">
          <table className="sc-moq-table">
            <thead>
              <tr>
                <th className="sc-moq-th-tier">
                  MOQ <span className="sc-moq-count-pill">{numMoq}</span>
                </th>
                <th className="sc-moq-th-num">MOQ (EA)</th>
                <th className="sc-moq-th-num">
                  EAU <span className="sc-moq-req">&#9733;</span>
                </th>
                <th className="sc-moq-th-num sc-moq-th-gold">
                  PRICE $ <span className="sc-moq-req">&#9733;</span>
                </th>
                <th className="sc-moq-th-num sc-moq-th-gold">PRICE VND</th>
                <th className="sc-moq-th-num">TARGET $</th>
                <th className="sc-moq-th-num">TARGET VND</th>
                <th className="sc-moq-th-act"></th>
              </tr>
            </thead>
            <tbody>
              {/* Primary MOQ */}
              <tr className={`sc-moq-tr ${activeMoqIdx === 0 ? 'active' : ''}`}>
                <td className="sc-moq-td-tier">
                  <label className="sc-moq-radio">
                    <input
                      type="radio"
                      name="cplx-active-moq"
                      checked={activeMoqIdx === 0}
                      onChange={() => setActiveMoq(0)}
                    />
                    <span className="sc-moq-tier-label">MOQ 1</span>
                    <span className="sc-moq-primary-badge">Primary</span>
                  </label>
                </td>
                <td>
                  <DecimalInput
                    value={cs.moq}
                    onChange={(v) => setCplxField('moq', v)}
                    className="sc-moq-inp"
                    thousandSep
                  />
                </td>
                <td>
                  <DecimalInput
                    value={cs.annual_qty}
                    onChange={(v) => setCplxField('annual_qty', v)}
                    className="sc-moq-inp"
                    thousandSep
                  />
                </td>
                <td>
                  <DecimalInput
                    value={cs.selling_price}
                    onChange={setSellingUsd}
                    className="sc-moq-inp sc-moq-inp-gold"
                  />
                </td>
                <td>
                  <DecimalInput
                    value={cs.selling_price_vnd}
                    onChange={setSellingVnd}
                    className="sc-moq-inp sc-moq-inp-gold"
                    thousandSep
                  />
                </td>
                <td>
                  <DecimalInput value={cs.target} onChange={setTargetUsd} className="sc-moq-inp" />
                </td>
                <td>
                  <DecimalInput
                    value={cs.target_vnd}
                    onChange={setTargetVnd}
                    className="sc-moq-inp"
                    thousandSep
                  />
                </td>
                <td></td>
              </tr>

              {/* Extra MOQ Tiers */}
              {extraMoqs.map((em, idx) => (
                <tr key={idx} className={`sc-moq-tr ${activeMoqIdx === idx + 1 ? 'active' : ''}`}>
                  <td className="sc-moq-td-tier">
                    <label className="sc-moq-radio">
                      <input
                        type="radio"
                        name="cplx-active-moq"
                        checked={activeMoqIdx === idx + 1}
                        onChange={() => setActiveMoq(idx + 1)}
                      />
                      <span className="sc-moq-tier-label">MOQ {idx + 2}</span>
                    </label>
                  </td>
                  <td>
                    <DecimalInput
                      value={em.moq}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'moq', v)}
                      className="sc-moq-inp"
                      thousandSep
                    />
                  </td>
                  <td>
                    <DecimalInput
                      value={em.eau}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'eau', v)}
                      className="sc-moq-inp"
                      thousandSep
                    />
                  </td>
                  <td>
                    <DecimalInput
                      value={em.price}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'price', v)}
                      className="sc-moq-inp sc-moq-inp-gold"
                    />
                  </td>
                  <td>
                    <DecimalInput
                      value={em.price_vnd}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'price_vnd', v)}
                      className="sc-moq-inp sc-moq-inp-gold"
                      thousandSep
                    />
                  </td>
                  <td>
                    <DecimalInput
                      value={em.target}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'target', v)}
                      className="sc-moq-inp"
                    />
                  </td>
                  <td>
                    <DecimalInput
                      value={em.target_vnd}
                      onChange={(v) => updateExtraMoqWithRate(idx, 'target_vnd', v)}
                      className="sc-moq-inp"
                      thousandSep
                    />
                  </td>
                  <td className="sc-moq-td-act">
                    <button
                      className="sc-btn-del-circle"
                      onClick={() => removeMoqTier(idx)}
                      title="Remove MOQ tier"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="sc-moq-add-btn" onClick={addMoqTier}>
          <span className="sc-moq-add-icon">+</span> Add MOQ Tier
        </button>

        {/* ── Setup Data per MOQ ── */}
        {showSetupMoqTable && (
          <div className="cc-setup-moq-card">
            <div className="cc-setup-moq-hdr">
              <span className="cc-setup-moq-icon">&#8801;</span>
              <span className="cc-setup-moq-title">Setup Data per MOQ</span>
              <span className="cc-setup-moq-legend">
                <span className="cc-legend-amber"></span> amber = MOQ override &nbsp;&nbsp;
                <span className="cc-legend-white"></span> white = base (MOQ 1)
              </span>
            </div>
            <div className="cc-setup-moq-wrap">
              <table className="cc-setup-moq-table">
                <thead>
                  <tr>
                    <th className="cc-smt-th-l">Field</th>
                    <th className="cc-smt-th-l">SP / DB</th>
                    {Array.from({ length: numMoq }, (_, ti) => {
                      const qty = ti === 0 ? cs.moq || 0 : (extraMoqs[ti - 1] || {}).moq || 0;
                      return (
                        <th key={ti} className="cc-smt-th-r">
                          MOQ {ti + 1}
                          <div className="cc-smt-th-sub">{fmtIntLocal(qty)}</div>
                        </th>
                      );
                    })}
                    <th className="cc-smt-th-l">UOM</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="cc-smt-row-moq">
                    <td className="cc-smt-td-field">
                      <b>MOQ</b>
                    </td>
                    <td className="cc-smt-td-db">MOQ &amp; Pricing info</td>
                    {Array.from({ length: numMoq }, (_, ti) => {
                      const qty = ti === 0 ? cs.moq || 0 : (extraMoqs[ti - 1] || {}).moq || 0;
                      return (
                        <td key={ti} className="cc-smt-td-num cc-smt-td-moq">
                          {fmtIntLocal(qty)}
                        </td>
                      );
                    })}
                    <td className="cc-smt-td-uom">Qty</td>
                  </tr>
                  {flatMats.map(({ sp, spi, m, mi }) => {
                    const lbl = m.desc
                      ? m.desc.length > 22
                        ? m.desc.substring(0, 22) + '\u2026'
                        : m.desc
                      : m.code || `Mat ${mi + 1}`;
                    return (
                      <tr key={`m-${spi}-${mi}`}>
                        <td className="cc-smt-td-field" title={`${m.code || ''} - ${m.desc || ''}`}>
                          {lbl}
                        </td>
                        <td className="cc-smt-td-db">
                          <span className="cc-smt-sp-tag">{sp.code}</span> Materials
                        </td>
                        {Array.from({ length: numMoq }, (_, ti) => {
                          const isBase = ti === 0;
                          const em = isBase ? null : extraMoqs[ti - 1] || {};
                          const baseVal = m.setup_lm != null ? m.setup_lm : 0;
                          // PR #C: read from sp_mat_setup_lm_alt when THIS SP's
                          // active='alt'; sp_mat_setup_lm otherwise.
                          const spAlt = sp && sp.materials_active === 'alt';
                          const spLmField = spAlt ? 'sp_mat_setup_lm_alt' : 'sp_mat_setup_lm';
                          const ovrVal =
                            !isBase &&
                            em[spLmField] &&
                            em[spLmField][spi] &&
                            em[spLmField][spi][mi] != null
                              ? em[spLmField][spi][mi]
                              : null;
                          const isOvr = ovrVal != null;
                          const val = isBase ? baseVal : (ovrVal ?? '');
                          return (
                            <td key={ti} className="cc-smt-td-input">
                              <input
                                type="number"
                                step="any"
                                value={val}
                                className={`cc-smt-inp ${isOvr ? 'cc-smt-inp-ovr' : ''}`}
                                title={isOvr ? `MOQ ${ti + 1} override` : 'Base (MOQ 1) value'}
                                onChange={(e) => setSpMatSetupForTier(ti, spi, mi, e.target.value)}
                              />
                            </td>
                          );
                        })}
                        <td className="cc-smt-td-uom cc-smt-td-uom-mat">LM</td>
                      </tr>
                    );
                  })}
                  {flatProcs.map(({ sp, spi, p, pi }) => {
                    const lbl = p.label
                      ? p.label.length > 22
                        ? p.label.substring(0, 22) + '\u2026'
                        : p.label
                      : `Process ${pi + 1}`;
                    return (
                      <tr key={`p-${spi}-${pi}`}>
                        <td className="cc-smt-td-field">{lbl}</td>
                        <td className="cc-smt-td-db">
                          <span className="cc-smt-sp-tag">{sp.code}</span> Processes
                        </td>
                        {Array.from({ length: numMoq }, (_, ti) => {
                          const isBase = ti === 0;
                          const em = isBase ? null : extraMoqs[ti - 1] || {};
                          const baseVal = p.setup_h != null ? p.setup_h : 0;
                          const ovrVal =
                            !isBase &&
                            em.sp_proc_setup_h &&
                            em.sp_proc_setup_h[spi] &&
                            em.sp_proc_setup_h[spi][pi] != null
                              ? em.sp_proc_setup_h[spi][pi]
                              : null;
                          const isOvr = ovrVal != null;
                          const val = isBase ? baseVal : (ovrVal ?? '');
                          return (
                            <td key={ti} className="cc-smt-td-input">
                              <input
                                type="number"
                                step="any"
                                value={val}
                                className={`cc-smt-inp ${isOvr ? 'cc-smt-inp-ovr' : ''}`}
                                title={isOvr ? `MOQ ${ti + 1} override` : 'Base (MOQ 1) value'}
                                onChange={(e) => setSpProcSetupForTier(ti, spi, pi, e.target.value)}
                              />
                            </td>
                          );
                        })}
                        <td className="cc-smt-td-uom cc-smt-td-uom-proc">Hrs</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
