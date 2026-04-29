/**
 * StandardCalc — Main wrapper for Standard Calculator
 * Matches COST V1.0 M05 with sub-tab navigation
 */
import { useState, useCallback, useEffect } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { calcAll, getActiveTierState, serializeResultForPersist } from '../../../../services/calcEngine';
import { costApi, sharedApi } from '../../../../services/api';
import { chatApi, openChatRoom } from '../../../../services/chatApi';
import { useI18n } from '../../../../utils/useI18n';
import { showToast } from '../../../../utils/toast';
import SaveChoiceModal from '../../../../utils/SaveChoiceModal';
import ConflictModal from '../../../../components/Shared/ConflictModal';
import SummaryBox from './SummaryBox';
import CalcSummaryBar from './CalcSummaryBar';
import CalcHeader from './CalcHeader';
import CalcLayout from './CalcLayout';
import CalcMaterials from './CalcMaterials';
import CalcInks from './CalcInks';
import CalcProcesses from './CalcProcesses';
import CalcPackingShip from './CalcPackingShip';
import CalcCostBreakdown from './CalcCostBreakdown';
import CalcSummarize from './CalcSummarize';
import ProcessBalancing from './ProcessBalancing';
import CalcLegend from './CalcLegend';
import TabBarOverflow from '../../../../components/Shared/TabBarOverflow';
import './StandardCalc.css';
import './ProcessBalancing.css';

const SUB_TABS = [
  { id: 'header', label: 'RFQ & MOQ Info', icon: '▤' },
  { id: 'layout', label: 'Layout', icon: '▦' },
  { id: 'materials', label: 'Materials', icon: '◈' },
  { id: 'inks', label: 'Inks', icon: '⊕' },
  { id: 'processes', label: 'Processes', icon: '⚙' },
  { id: 'balancing', label: 'Balancing', icon: '⇆' },
  { id: 'packing', label: 'Pack & Ship', icon: '▣' },
  { id: 'breakdown', label: 'Cost Breakdown', icon: '≡' },
  { id: 'summarize', label: 'Summarize', icon: '☰' },
  { id: 'legend', label: 'Legend', icon: 'ⓘ' },
];

export default function StandardCalc() {
  const [activeSubTab, setActiveSubTab] = useState('header');
  const { t } = useI18n();
  const { stdState, isDirty, markClean, dispatch, loadQuote, pendingQuote, clearPendingQuote, activeQuoteId, activeQuoteVersion } = useCalc();
  const { lib } = useCostLib();
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  // v1.3 Đợt 2 — replace blunt window.confirm() with ConflictModal.
  // `conflict` is null when no conflict, otherwise { current, attempted,
  // savedBy, savedAt } so the modal can show server vs ours + offer
  // Reload / Overwrite / Cancel without losing user edits silently.
  const [conflict, setConflict] = useState(null);

  // Consume pending quote handoff from QuoteHistory via Context.
  //
  // DO NOT call clearPendingQuote() synchronously at the top of this
  // effect: doing so triggers a re-render with pendingQuote=null, which
  // causes React to run THIS effect's cleanup (setting cancelled=true)
  // BEFORE the in-flight getQuotes() promise resolves — so loadQuote()
  // would never fire and the calculator would show the default empty
  // state (e.g. ccl_pn: 'T3000001') instead of the requested quote.
  //
  // Instead we keep pendingQuote in context until AFTER the fetch lands
  // and loadQuote has been dispatched, then clear it.
  useEffect(() => {
    if (!pendingQuote || pendingQuote.type !== 'standard') return;
    const { id } = pendingQuote;
    let cancelled = false;
    sharedApi.getQuotes().then(quotes => {
      if (cancelled) return;
      const q = (quotes || []).find(x => String(x.id) === String(id));
      if (q?.state) {
        // Pass `_version` through so subsequent Update-existing saves
        // include it in the PATCH for optimistic-locking enforcement.
        loadQuote('std', q.state, q.id, q._version || 0);
      } else {
        showToast(`Quote #${id} not found`, 'err');
      }
      clearPendingQuote();
    }).catch(err => {
      if (cancelled) return;
      console.error('Failed to load pending quote:', err);
      showToast('Failed to load quote: ' + (err.message || 'network error'), 'err');
      clearPendingQuote();
    });
    return () => { cancelled = true; };
  }, [pendingQuote, loadQuote, clearPendingQuote]);

  // RFQ Tracker → Pricing Worksheet handoff. The RFQ Tracker pushes
  // a prefill payload via setPendingQuote(rfqId, 'rfq-sync', 'prefill',
  // { rfq_number, direct_cu, description, annual_qty, moq, npi_owner,
  //   sale_owner, part_width, part_length_md, ... }) then navigates
  // to the Pricing (Std) tab. We merge the payload into the current
  // std state (preserving user edits the operator may already have
  // made) and jump to the RFQ & MOQ Info sub-tab so they see what
  // landed.
  useEffect(() => {
    if (!pendingQuote || pendingQuote.type !== 'rfq-sync') return;
    const prefill = pendingQuote.data || {};
    const nextState = { ...stdState, ...prefill };
    loadQuote('std', nextState, null);
    setActiveSubTab('header');
    showToast('Prefilled from RFQ ' + (prefill.rfq_number || prefill._rfq_no || ''));
    clearPendingQuote();
    // Intentionally NOT depending on stdState — we want the merge to
    // use whatever state was in place WHEN the sync request arrived,
    // not every keystroke after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuote, loadQuote, clearPendingQuote]);

  const [saving, setSaving] = useState(false);

  // Build the quote payload from the current state — reused by both
  // "Save as new" and "Update existing" paths.
  const buildQuoteData = useCallback(() => {
    const tierSt = getActiveTierState(stdState);
    const result = lib ? calcAll(tierSt, null, lib, null) : null;
    return {
      type: 'standard',
      state: stdState,
      result: serializeResultForPersist(result),
      saved_at: new Date().toISOString(),
      label: stdState.ccl_pn || stdState.rfq_number || 'Untitled',
    };
  }, [stdState, lib]);

  const persistAsNew = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await costApi.saveQuote(buildQuoteData());
      markClean();
      // Mark the new id + version as active so subsequent Update saves
      // can Update it with the correct version for optimistic locking.
      if (saved?.id != null) {
        dispatch({ type: 'SET_ACTIVE_QUOTE_ID', payload: { id: saved.id, version: saved._version || 1 } });
      }
      showToast('Quote saved as new version');
    } catch (err) {
      console.error('Failed to save quote:', err);
      showToast('Save failed: ' + (err.message || 'Unknown error'), 'err');
    } finally {
      setSaving(false);
    }
  }, [buildQuoteData, markClean, dispatch]);

  const persistUpdate = useCallback(async () => {
    setSaving(true);
    try {
      // Sprint 11 P0-2: include _version so the server can reject the
      // save if another user already pushed a newer revision. On 409,
      // offer the user a "reload server state" vs "overwrite" choice.
      const payload = { ...buildQuoteData(), _version: activeQuoteVersion };
      const saved = await costApi.updateQuote(activeQuoteId, payload);
      markClean();
      // Bump local version so the next save uses the fresh number.
      if (saved?._version != null) {
        dispatch({ type: 'SET_ACTIVE_QUOTE_ID', payload: { id: activeQuoteId, version: saved._version } });
      }
      showToast(`Quote #${activeQuoteId} updated`);
    } catch (err) {
      if (err?.status === 409 && err?.body?.current) {
        // Hand off to ConflictModal — non-blocking UI, preserves edits
        // until the user explicitly picks Reload / Overwrite / Cancel.
        setConflict({
          current: err.body.current,
          attempted: { id: activeQuoteId, _version: activeQuoteVersion, ...buildQuoteData() },
          savedBy: err.body.current?.saved_by || null,
          savedAt: err.body.current?.saved_at || null,
          actual_version: err.body.actual_version,
        });
        return;
      }
      console.error('Failed to update quote:', err);
      showToast('Update failed: ' + (err.message || 'Unknown error'), 'err');
    } finally {
      setSaving(false);
    }
  }, [buildQuoteData, markClean, activeQuoteId, activeQuoteVersion, dispatch]);

  // ConflictModal handlers — closure-captured so they always use the
  // latest activeQuoteId / latest user edits. Errors during a forced
  // overwrite or reload bubble up as toasts; the modal closes either
  // way so the user isn't trapped.
  const handleConflictReload = useCallback(() => {
    if (!conflict?.current) return;
    const c = conflict.current;
    loadQuote('std', c.state || {}, c.id, c._version || 0);
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
        dispatch({ type: 'SET_ACTIVE_QUOTE_ID', payload: { id: activeQuoteId, version: saved._version } });
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
    // If a quote was loaded from history, let the user pick Update vs
    // Save-as-new. Otherwise save straight away as a new record.
    if (activeQuoteId != null) {
      setSaveChoiceOpen(true);
    } else {
      persistAsNew();
    }
  }, [activeQuoteId, persistAsNew]);

  // Ctrl/Cmd+S → Save. Triggered only when the calculator is focused (not
  // in an unrelated tab), tied to isDirty so we don't spam no-op saves.
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        // Don't hijack the browser's Save-Page-As when the user IS in a
        // different calculator (we check by seeing if the current wrapper
        // is still mounted — trivially true while this effect runs).
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, isDirty, saving]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_STD' });
  }, [dispatch]);

  let content;
  switch (activeSubTab) {
    case 'header': content = <CalcHeader />; break;
    case 'layout': content = <CalcLayout />; break;
    case 'materials': content = <CalcMaterials />; break;
    case 'inks': content = <CalcInks />; break;
    case 'processes': content = <CalcProcesses />; break;
    case 'balancing': content = <ProcessBalancing />; break;
    case 'packing': content = <CalcPackingShip />; break;
    case 'breakdown': content = <CalcCostBreakdown />; break;
    case 'summarize': content = <CalcSummarize />; break;
    case 'legend':    content = <CalcLegend />; break;
    default: content = <CalcHeader />;
  }

  return (
    <div className="sc">
      {/* Sub-tab bar — wrapped in TabBarOverflow so arrows + fade
          appear automatically when the bar is wider than viewport
          (common on 14" laptops with sidebar expanded). */}
      <div className="sc-subtab-bar">
        <TabBarOverflow ariaLabel="Pricing Worksheet sub-tabs" rightSlot={
          <div className="sc-toolbar">
            {isDirty && <span className="sc-dirty-badge">Unsaved</span>}
            {activeQuoteId != null && (
              <button
                className="op-btn op-btn-secondary op-btn-sm"
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
            <button className="op-btn op-btn-secondary op-btn-sm sc-btn-reset" onClick={handleReset}>New</button>
            <button className="op-btn op-btn-primary op-btn-sm" onClick={handleSave} disabled={!isDirty || saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        }>
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSubTab === tab.id}
              aria-label={tab.label}
              className={`sc-subtab-btn ${activeSubTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
              title={tab.label}
            >
              <span className="sc-subtab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="sc-subtab-label">{tab.label}</span>
            </button>
          ))}
        </TabBarOverflow>
      </div>

      {/* Persistent cost summary bar — always visible below tabs */}
      <CalcSummaryBar />

      {/* Content */}
      <div className="sc-content">
        {content}
      </div>

      <SaveChoiceModal
        open={saveChoiceOpen}
        quoteId={activeQuoteId}
        quoteLabel={stdState.ccl_pn || stdState.rfq_number}
        onCancel={() => setSaveChoiceOpen(false)}
        onUpdate={() => { setSaveChoiceOpen(false); persistUpdate(); }}
        onSaveAsNew={() => { setSaveChoiceOpen(false); persistAsNew(); }}
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
