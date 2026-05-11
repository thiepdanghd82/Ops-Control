/**
 * SubProductRow — Expandable detail content for a sub-product
 * Rendered INSIDE a <td colSpan> in the SP table
 * Contains: Layout + Materials + Inks + Processes (stacked vertically)
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useFeatureFlag } from '../../../../context/useAppConfig';
import { useI18n } from '../../../../utils/useI18n';
import { useLibraryPicker } from '../../../../components/LibraryPicker/LibraryPicker';
import AltMaterialsToggle from '../StandardCalc/AltMaterialsToggle';
import { sharedApi } from '../../../../services/api';
import {
  getProcessOptions,
  getWCOptionsByType,
  getToolLife,
  getRateByWC,
  calcPitch,
  calcLayoutPerSheet,
  calcPcsPerRoll,
} from '../../../../services/calcEngine';
import {
  setSpField,
  setSpMaterialField,
  setSpInkField,
  setSpProcessField,
  addSpMaterialRow,
  removeSpMaterialRow,
  addSpInkRow,
  removeSpInkRow,
  addSpProcessRow,
  removeSpProcessRow,
} from '../../../../context/calcReducer';
import { fmtN, parseLocaleNumber } from '../../../../utils/format';
import FileUploadZone from '../../../../components/Shared/FileUploadZone';
import DecimalInput from '../../../../utils/DecimalInput';
import DesignSyncPicker from '../StandardCalc/DesignSyncPicker';
import {
  AdvancedLayoutBlock,
  PrintCutLayout,
  PrintLayoutSummary,
  CutLayoutSummary,
  MdTdLegendCard,
} from '../StandardCalc/CalcLayout';
import { validateLayout } from '../../../../services/layoutValidation';
import '../StandardCalc/StandardCalc.css';

export default function SubProductRow({ sp, spi, result, allSps }) {
  const { dispatch, cplxState } = useCalc();
  const { t } = useI18n();
  // Alt-materials feature flag (Sprint S-ALT-MAT, PR #B). When OFF, the
  // per-SP toggle is not rendered; sp.materials reads (the active-set
  // mirror) work exactly as before. Calc engine respects materials_active
  // regardless of the flag — flag only gates the UI affordance.
  const altMaterialsEnabled = useFeatureFlag('alt_materials');
  // Parent-level customer info used by FileUploadZone to auto-name
  // drawings {Customer}_{EndCuPN}_{stamp}[suffix]. These live on the
  // top-level cplxState, not per-sub-product.
  const parentEndCu = cplxState?.end_cu;
  const parentDirectCu = cplxState?.direct_cu;
  const parentEndCuPn = cplxState?.end_cu_pn;
  const { lib, getMatByCode } = useCostLib();
  const { openMenu } = useLibraryPicker();

  // Alt-materials per-SP UI state (PR #B). Active flag + row counts feed
  // the AltMaterialsToggle component; toggle/copy dispatch carries spIdx
  // so the reducer targets the correct subproduct.
  const spMaterialsActive = altMaterialsEnabled
    ? sp.materials_active === 'alt'
      ? 'alt'
      : 'main'
    : 'main';
  const spMainCount = Array.isArray(sp.materials_main)
    ? sp.materials_main.length
    : (sp.materials || []).length;
  const spAltCount = Array.isArray(sp.materials_alt) ? sp.materials_alt.length : 0;
  const handleSpSwitchActive = useCallback(
    (next) => {
      dispatch({ type: 'SET_SP_MATERIALS_ACTIVE', payload: { spIdx: spi, value: next } });
    },
    [dispatch, spi]
  );
  const handleSpCopyMaterials = useCallback(
    (direction) => {
      dispatch({ type: 'COPY_SP_MATERIALS', payload: { spIdx: spi, direction } });
    },
    [dispatch, spi]
  );
  const handleSpCopyAltFromMain = useCallback(() => {
    dispatch({ type: 'COPY_SP_MATERIALS', payload: { spIdx: spi, direction: 'main_to_alt' } });
  }, [dispatch, spi]);
  const showSpAltEmptyState =
    altMaterialsEnabled && spMaterialsActive === 'alt' && spAltCount === 0;

  // Per-row calc results piggybacking on the pass2 result object built in
  // ComplexCalc.jsx. These were already computed for the SP totals; we
  // reuse them here to populate the derived / result columns in the
  // Materials / Inks / Processes tables. Wrapped in useMemo so the
  // downstream total memos don't see a fresh reference on every render.
  const matResults = useMemo(() => result?.matResults || [], [result]);
  const inkResults = useMemo(() => result?.inkResults || [], [result]);
  const procResults = useMemo(() => result?.procResults || [], [result]);

  // Sprint 20: typed action creators replace raw dispatch({type,payload}).
  // With `@ts-check` on calcReducer, the legacy {spi, mi} shape that
  // shipped in Sprint 2 now fails at the call site instead of crashing
  // at runtime. Creators are thin wrappers — same perf as raw dispatch.
  const setF = useCallback(
    (f, v) => dispatch(setSpField({ spIdx: spi, field: f, value: v })),
    [dispatch, spi]
  );
  const setMat = useCallback(
    (mi, f, v) => dispatch(setSpMaterialField({ spIdx: spi, idx: mi, field: f, value: v })),
    [dispatch, spi]
  );
  const setInk = useCallback(
    (ii, f, v) => dispatch(setSpInkField({ spIdx: spi, idx: ii, field: f, value: v })),
    [dispatch, spi]
  );
  const setProc = useCallback(
    (pi, f, v) => dispatch(setSpProcessField({ spIdx: spi, idx: pi, field: f, value: v })),
    [dispatch, spi]
  );

  // Sprint 1.6 — Complex per-MOQ Setup LM / Setup H, mirroring the Standard
  // calculator fix. Override slots live at:
  //   cplxState.extra_moqs[ti-1].sp_mat_setup_lm[spi][mi]
  //   cplxState.extra_moqs[ti-1].sp_proc_setup_h[spi][pi]
  // — i.e. per-tier × per-subproduct × per-row. Editing while MOQ 2/3 is
  // active routes the write to the override; on MOQ 1 we still write to
  // the base material/process. Reverted by clearing the input.
  const activeMoqIdxCpx = cplxState?.active_moq_idx || 0;

  const setSpSetupLmActive = useCallback(
    (mi, value) => {
      if (activeMoqIdxCpx === 0) {
        setMat(mi, 'setup_lm', value === '' || value == null ? 0 : Number(value));
        return;
      }
      const ei = activeMoqIdxCpx - 1;
      const extra = [...((cplxState && cplxState.extra_moqs) || [])];
      const em = { ...(extra[ei] || {}) };
      const map = { ...(em.sp_mat_setup_lm || {}) };
      const arr = Array.isArray(map[spi]) ? [...map[spi]] : [];
      arr[mi] =
        value === '' || value == null
          ? null
          : Number.isFinite(Number(value))
            ? Number(value)
            : null;
      map[spi] = arr;
      em.sp_mat_setup_lm = map;
      extra[ei] = em;
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'extra_moqs', value: extra } });
    },
    [activeMoqIdxCpx, cplxState, setMat, dispatch, spi]
  );

  const setSpSetupHActive = useCallback(
    (pi, value) => {
      if (activeMoqIdxCpx === 0) {
        setProc(pi, 'setup_h', value === '' || value == null ? 0 : Number(value));
        return;
      }
      const ei = activeMoqIdxCpx - 1;
      const extra = [...((cplxState && cplxState.extra_moqs) || [])];
      const em = { ...(extra[ei] || {}) };
      const map = { ...(em.sp_proc_setup_h || {}) };
      const arr = Array.isArray(map[spi]) ? [...map[spi]] : [];
      arr[pi] =
        value === '' || value == null
          ? null
          : Number.isFinite(Number(value))
            ? Number(value)
            : null;
      map[spi] = arr;
      em.sp_proc_setup_h = map;
      extra[ei] = em;
      dispatch({ type: 'SET_CPLX_FIELD', payload: { field: 'extra_moqs', value: extra } });
    },
    [activeMoqIdxCpx, cplxState, setProc, dispatch, spi]
  );

  const getSpSetupLmActive = useCallback(
    (m, mi) => {
      if (activeMoqIdxCpx === 0) return m.setup_lm;
      const em = ((cplxState && cplxState.extra_moqs) || [])[activeMoqIdxCpx - 1];
      const ovr = em?.sp_mat_setup_lm?.[spi]?.[mi];
      return ovr != null ? ovr : m.setup_lm;
    },
    [activeMoqIdxCpx, cplxState, spi]
  );

  const getSpSetupHActive = useCallback(
    (p, pi) => {
      if (activeMoqIdxCpx === 0) return p.setup_h;
      const em = ((cplxState && cplxState.extra_moqs) || [])[activeMoqIdxCpx - 1];
      const ovr = em?.sp_proc_setup_h?.[spi]?.[pi];
      return ovr != null ? ovr : p.setup_h;
    },
    [activeMoqIdxCpx, cplxState, spi]
  );

  const isSpSetupLmOverride = useCallback(
    (mi) => {
      if (activeMoqIdxCpx === 0) return false;
      const em = ((cplxState && cplxState.extra_moqs) || [])[activeMoqIdxCpx - 1];
      return em?.sp_mat_setup_lm?.[spi]?.[mi] != null;
    },
    [activeMoqIdxCpx, cplxState, spi]
  );

  const isSpSetupHOverride = useCallback(
    (pi) => {
      if (activeMoqIdxCpx === 0) return false;
      const em = ((cplxState && cplxState.extra_moqs) || [])[activeMoqIdxCpx - 1];
      return em?.sp_proc_setup_h?.[spi]?.[pi] != null;
    },
    [activeMoqIdxCpx, cplxState, spi]
  );
  const addMat = useCallback(() => dispatch(addSpMaterialRow({ spIdx: spi })), [dispatch, spi]);
  const removeMat = useCallback(
    (idx) => dispatch(removeSpMaterialRow({ spIdx: spi, idx })),
    [dispatch, spi]
  );
  const addInk = useCallback(() => dispatch(addSpInkRow({ spIdx: spi })), [dispatch, spi]);
  const removeInk = useCallback(
    (idx) => dispatch(removeSpInkRow({ spIdx: spi, idx })),
    [dispatch, spi]
  );

  // Phase 10M — right-click library picker for Cplx Materials + Inks.
  const openMatMenu = useCallback(
    (mi, event) => {
      openMenu({
        event,
        onPick: (hit) => {
          setMat(mi, 'code', hit.code || '');
          setMat(mi, 'ifs_code', hit.ifs_code || '');
          setMat(mi, 'desc', hit.desc || '');
          if (hit.g_price) setMat(mi, 'g_price', Number(hit.g_price) || 0);
        },
      });
    },
    [openMenu, setMat]
  );
  // Ref Price column is bound to s_price and calcInk reads s_price as
  // the source ink price — so we mirror the picker price into BOTH
  // s_price and g_price to keep the Ref Price cell in sync with the
  // library pick (same fix as Standard Calc CalcInks).
  const openInkMenu = useCallback(
    (ii, event) => {
      openMenu({
        event,
        onPick: (hit) => {
          setInk(ii, 'ifs_code', hit.ifs_code || '');
          setInk(ii, 'color', hit.desc || hit.code || '');
          if (hit.g_price) {
            const price = Number(hit.g_price) || 0;
            setInk(ii, 's_price', price);
            setInk(ii, 'g_price', price);
          }
        },
      });
    },
    [openMenu, setInk]
  );
  const addProc = useCallback(() => dispatch(addSpProcessRow({ spIdx: spi })), [dispatch, spi]);
  const removeProc = useCallback(
    (idx) => dispatch(removeSpProcessRow({ spIdx: spi, idx })),
    [dispatch, spi]
  );

  const processOpts = useMemo(() => getProcessOptions(), []);
  const printTypeOpts = useMemo(() => (lib?.ddl?.print_type_list || []).filter(Boolean), [lib]);
  const meshOpts = useMemo(
    () => (lib?.inkCalc?.silkscreen?.meshSpec || []).map((m) => m.mesh_code).filter(Boolean),
    [lib]
  );
  const toolTypeOpts = useMemo(
    () => (lib?.ddl?.tool_life ? Object.keys(lib.ddl.tool_life) : []),
    [lib]
  );

  // Backfill tool_life from DDL when loading a legacy quote where
  // tool_type was saved but tool_life was never populated (= 0).
  // The engine falls back at compute time but the UI input reads
  // proc.tool_life directly — without this heal the column looks
  // empty. Respect tool_life_ovr so manual overrides survive.
  useEffect(() => {
    if (!lib?.ddl?.tool_life) return;
    const list = sp.processes || [];
    list.forEach((proc, i) => {
      if (!proc || proc.hidden || proc.tool_life_ovr) return;
      const hasType = !!proc.tool_type;
      const missing = !proc.tool_life || Number(proc.tool_life) === 0;
      if (hasType && missing) {
        const life = getToolLife(lib, proc.tool_type);
        if (life > 0) setProc(i, 'tool_life', life);
      }
    });
  }, [sp.processes, lib, setProc]);

  const mats = (sp.materials || []).filter((m) => !m.hidden);
  const inks = (sp.inks || []).filter((i) => !i.hidden);
  const procs = (sp.processes || []).filter((p) => !p.hidden);

  // Scrap% display = Σ(process scrap_pct) — mirrors Standard CalcMaterials /
  // CalcInks. Display-only metric; underlying cost math still uses
  // calcMatScrapFactor via calcAll.
  const scrapDisplay = useMemo(() => {
    return (sp.processes || []).reduce((acc, p) => {
      if (!p.workcenter || p.hidden) return acc;
      return acc + (p.scrap_pct || 0);
    }, 0);
  }, [sp.processes]);

  // Live totals for the Materials / Inks / Processes card headers — match
  // the Setup/Run/Total and Mach/Labor/Tool/Total breakdowns in Standard.
  const matTotals = useMemo(() => {
    let setup = 0,
      run = 0,
      total = 0;
    matResults.forEach((r) => {
      if (r) {
        setup += r.setup_s || 0;
        run += r.run_s || 0;
        total += (r.setup_s || 0) + (r.run_s || 0);
      }
    });
    return { setup, run, total };
  }, [matResults]);

  const inkTotals = useMemo(() => {
    let setup = 0,
      run = 0,
      total = 0;
    inkResults.forEach((r) => {
      if (r) {
        setup += r.setup_s || 0;
        run += r.run_s || 0;
        total += r.total || 0;
      }
    });
    return { setup, run, total };
  }, [inkResults]);

  const procTotals = useMemo(() => {
    let setupMach = 0,
      setupLabor = 0,
      runMach = 0,
      runLabor = 0,
      tooling = 0;
    procResults.forEach((r) => {
      if (r) {
        setupMach += r.setup_mach || 0;
        setupLabor += r.setup_labor || 0;
        runMach += r.run_mach || 0;
        runLabor += r.run_labor || 0;
        tooling += r.tooling || 0;
      }
    });
    return {
      setupMach,
      setupLabor,
      runMach,
      runLabor,
      tooling,
      total: setupMach + setupLabor + runMach + runLabor + tooling,
    };
  }, [procResults]);

  // Sprint 28: locale-safe parse — "8,5" (VN user) now → 8.5 not 8.
  const numF = (v) => parseLocaleNumber(v) || 0;

  // Layout-derived summary
  const pitch = useMemo(() => {
    try {
      return calcPitch(sp);
    } catch {
      return 0;
    }
  }, [sp]);
  const layoutSheet = useMemo(() => {
    try {
      return calcLayoutPerSheet(sp);
    } catch {
      return 0;
    }
  }, [sp]);
  const pcsRoll = useMemo(() => {
    try {
      return calcPcsPerRoll(sp);
    } catch {
      return 0;
    }
  }, [sp]);

  // File upload — delegated to shared FileUploadZone component
  const spBase = sp.code ? sp.code.replace(/\s+/g, '_') : null;

  // Machine profiles — read-only after Sprint 14n (Manage modal
  // removed from Pricing). Still loaded so legacy quotes carrying
  // a machine_profile_id can resolve activeProfile for the optimizer
  // + validation. New quotes default to unconstrained.
  const [profiles, setProfiles] = useState([]);
  // Lifted from PrintCutLayout so peer cards (Summary, Suggestion)
  // can show Print/Cut-specific content based on the active sub-tab.
  // S-LAYOUT-DEFAULT (2026-05-05) — match StandardCalc default.
  const [activeSub, setActiveSub] = useState('print');
  // Sprint 14e — Design Tools sync picker open state (parity with
  // StandardCalc CalcLayout). 'print' / 'cut' / null.
  const [designSyncSide, setDesignSyncSide] = useState(null);
  useEffect(() => {
    sharedApi
      .getMachineProfiles()
      .then((arr) => setProfiles(Array.isArray(arr) ? arr : []))
      .catch(() => {});
  }, []);
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === sp.machine_profile_id) || null,
    [profiles, sp.machine_profile_id]
  );

  // DFM validation — mirrors Standard's validateLayout() call so sub-
  // products get the same red-flag protection (compound die, color
  // count vs stations, corner radius physical limits, slit lane width,
  // web out-of-press range, etc.). Complex previously had no validation
  // pill/list, allowing operators to quote layouts that won't run.
  const validation = useMemo(() => {
    try {
      return validateLayout(sp, sp.materials || [], {}, activeProfile);
    } catch {
      return { errors: [], warnings: [], infos: [], byField: {}, hasBlockers: false };
    }
  }, [sp, activeProfile]);

  return (
    <div className="cc-detail">
      {/* ─── Design Layout — reuses Standard's .sc-card + .cl-* classes so
          a Complex sub-product renders identically to Standard's Layout
          tab. The previous `.cc-det-layout-*` styles were a pre-9A fork;
          consolidated to the shared design-system classes (Phase 9E-UI).
          Sub-product `code` shown next to the title replaces the old
          bottom-right tag. */}
      <div className="cc-det-section">
        <div className="sc-card">
          <div className="sc-card-header sc-header-teal">
            <span className="sc-card-icon">&#9638;</span>
            <span className="sc-card-title">Design Layout</span>
            {sp.code && <span className="cl-sp-code">{sp.code}</span>}
            {/* Sprint 14n-2 — sync buttons promoted from body to header
                (parity with StandardCalc). */}
            <div className="cl-header-sync-actions">
              <button
                type="button"
                className="cl-design-sync-btn cl-design-sync-btn--header"
                onClick={() => setDesignSyncSide('print')}
                title="Đồng bộ thiết kế in · Pull a saved Design Tools record and apply Print-side fields onto this sub-product"
              >
                🔍 Print Design sync
              </button>
              <button
                type="button"
                className="cl-design-sync-btn cl-design-sync-btn--header"
                onClick={() => setDesignSyncSide('cut')}
                title="Đồng bộ thiết kế cắt · Pull a saved Design Tools record and apply Cut-side fields onto this sub-product"
              >
                🔍 Cut Design sync
              </button>
            </div>
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <span className="cl-validation-pill">
                {validation.errors.length > 0 && (
                  <span className="cl-vp-err">
                    ✕ {validation.errors.length} error{validation.errors.length > 1 ? 's' : ''}
                  </span>
                )}
                {validation.warnings.length > 0 && (
                  <span className="cl-vp-warn">
                    ⚠ {validation.warnings.length} warning
                    {validation.warnings.length > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            )}
          </div>
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <ul className="cl-validation-list">
              {validation.errors.map((e, i) => (
                <li key={`e${i}`} className="cl-vl-err">
                  <b>✕</b> <span className="cl-vl-field">{e.field}</span>: {e.message}
                </li>
              ))}
              {validation.warnings.map((w, i) => (
                <li key={`w${i}`} className="cl-vl-warn">
                  <b>⚠</b> <span className="cl-vl-field">{w.field}</span>: {w.message}
                </li>
              ))}
            </ul>
          )}
          <div className="sc-card-body">
            {/* Sprint 14n-2 — sync buttons moved to header (parity with
                StandardCalc). Body retains only the optional press-meta
                pill for legacy quotes that already have machine_profile_id. */}
            {activeProfile && (
              <div className="cl-press-picker">
                <span className="cl-press-meta">
                  Web {activeProfile.web_width_min_mm}–{activeProfile.web_width_max_mm}mm
                  {activeProfile.common_dies?.length
                    ? ` · ${activeProfile.common_dies.length} dies`
                    : ''}
                </span>
              </div>
            )}

            <div className="cl-top-grid">
              {/* Left: Parameters (sub-tab split — Print / Cut) */}
              <div className="cl-params">
                <PrintCutLayout
                  state={sp}
                  onField={setF}
                  activeSub={activeSub}
                  onActiveSubChange={setActiveSub}
                />
                <div className="sc-grid4" style={{ marginTop: 8 }}>
                  <div className="sc-field">
                    <label>Ship Qty</label>
                    <DecimalInput
                      value={sp.ship_qty}
                      onChange={(v) => setF('ship_qty', v)}
                      className="sc-input"
                    />
                  </div>
                </div>
                <AdvancedLayoutBlock state={sp} onField={setF} />
              </div>

              {/* Right: Summary (Print sub-tab) / Summary + Suggestion
                  (Cut sub-tab). Print Suggestion removed Sprint 14n-3
                  per operator feedback — see CalcLayout for context. */}
              {activeSub === 'print' ? (
                <>
                  <PrintLayoutSummary state={sp} />
                </>
              ) : (
                <>
                  {/* Sprint 14n-3 — Cut LayoutSuggestionCard removed
                      (parity with Standard). Cylinder/cavity engineering
                      lives in Design Tools and arrives via the headbar's
                      Cut Design sync button. */}
                  <CutLayoutSummary
                    state={sp}
                    pitch={pitch}
                    layoutPerSheet={layoutSheet}
                    pcsPerRoll={pcsRoll}
                  />
                </>
              )}
              {/* Full-width MD/TD reference — sits below Summary + Suggestion */}
              <MdTdLegendCard />
            </div>
          </div>
        </div>

        {/* MachineProfileModal mount removed Sprint 14n — see press
            bar comment. CRUD moved to Machine Technical sidebar tab. */}

        {/* Sprint 14e — Design Tools sync picker for Complex sub-products.
            Pushes the picker's mapped fields onto THIS sub-product (not
            the parent cplxState) via setF. */}
        <DesignSyncPicker
          open={!!designSyncSide}
          side={designSyncSide || 'print'}
          onClose={() => setDesignSyncSide(null)}
          onApply={(fields) => {
            for (const [k, v] of Object.entries(fields)) setF(k, v);
          }}
        />

        {/* File Uploads — auto-named {Customer}_{EndCuPN}_{stamp}[suffix].
            Customer info comes from the top-level cplxState; sub-product
            `code` (spBase) stays as fallback for very old quotes with no
            parent-level customer fields filled in. */}
        <div className="cl-upload-grid">
          <FileUploadZone
            label="Design Layout Drawing"
            file={sp.layout_file}
            endCu={parentEndCu}
            directCu={parentDirectCu}
            endCuPn={parentEndCuPn}
            cclPn={spBase}
            onFileChange={(v) => setF('layout_file', v)}
            onClear={() => setF('layout_file', null)}
          />
          <FileUploadZone
            label="Customer Drawing"
            file={sp.customer_drw_file}
            endCu={parentEndCu}
            directCu={parentDirectCu}
            endCuPn={parentEndCuPn}
            cclPn={spBase}
            nameSuffix="_cust"
            onFileChange={(v) => setF('customer_drw_file', v)}
            onClear={() => setF('customer_drw_file', null)}
          />
        </div>
      </div>

      {/* Materials — full column set matching Standard Calc / COST V1.0 M06
          Input columns: Row Type, IFS Code, Desc, Usage, Setup LM, Pitch Ovr,
          Width, Cav, Offcut, Slit, Ref Price, Mat Price.
          Derived (purple bg): QPA m², QPA lm, L/Sheet, Webs, Scrap%.
          Result (blue bg): Setup Cost, Run Cost, Total. */}
      <div className="cc-det-section">
        <div className="sc-card">
          <div className="sc-card-header sc-header-blue">
            <span className="sc-card-icon">&#9672;</span>
            <span className="sc-card-title">Materials ({mats.length} rows)</span>
            <div className="sc-header-totals">
              <span className="sc-header-total-item">
                Setup: <b>${fmtN(matTotals.setup)}</b>
              </span>
              <span className="sc-header-total-item">
                Run: <b>${fmtN(matTotals.run)}</b>
              </span>
              <span className="sc-header-total-item sc-header-total-main">
                Total: <b>${fmtN(matTotals.total)}</b>
              </span>
            </div>
          </div>
          <div className="sc-card-body cc-det-tw">
            {altMaterialsEnabled && (
              <AltMaterialsToggle
                active={spMaterialsActive}
                mainCount={spMainCount}
                altCount={spAltCount}
                onSwitch={handleSpSwitchActive}
                onCopy={handleSpCopyMaterials}
              />
            )}
            {showSpAltEmptyState && (
              <div className="alt-mat-empty">
                <span>{t('pricing.materials.alt.empty')}</span>
                <button
                  type="button"
                  className="op-btn op-btn-secondary"
                  onClick={handleSpCopyAltFromMain}
                  disabled={spMainCount === 0}
                >
                  {t('pricing.materials.alt.copy_from_main')}
                </button>
              </div>
            )}
            {!showSpAltEmptyState && (
              <table className="cc-det-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>Row</th>
                    <th style={{ width: 80 }}>IFS Code</th>
                    <th style={{ width: 120 }}>Desc.</th>
                    <th style={{ width: 50 }}>Usage</th>
                    <th style={{ width: 55 }}>Setup LM</th>
                    <th style={{ width: 60 }} title="Override pitch from layout">
                      Pitch
                    </th>
                    <th style={{ width: 50 }}>Width</th>
                    <th style={{ width: 45 }}>Cav</th>
                    <th style={{ width: 50 }}>Offcut</th>
                    <th
                      style={{ width: 55 }}
                      title="Offcut % — matches COST V1.0 Sheet 1 formula MOD(Cavities, Width) / Cavities. Type to override."
                    >
                      Offcut %
                    </th>
                    <th style={{ width: 45 }}>Slit</th>
                    <th style={{ width: 60 }}>Ref Price</th>
                    <th style={{ width: 60 }}>Mat Price</th>
                    <th className="sc-col-derived" style={{ width: 60 }}>
                      QPA (m²)
                    </th>
                    <th className="sc-col-derived" style={{ width: 60 }}>
                      QPA (lm)
                    </th>
                    <th className="sc-col-derived" style={{ width: 50 }}>
                      L/Sheet
                    </th>
                    <th className="sc-col-derived" style={{ width: 45 }}>
                      Webs
                    </th>
                    <th className="sc-col-derived" style={{ width: 55 }}>
                      Scrap%
                    </th>
                    <th className="sc-col-result" style={{ width: 65 }}>
                      Setup Cost
                    </th>
                    <th className="sc-col-result" style={{ width: 65 }}>
                      Run Cost
                    </th>
                    <th className="sc-col-result" style={{ width: 65 }}>
                      Total
                    </th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let mc = 0,
                      pc = 0;
                    return mats.map((m, mi) => {
                      const isRef = allSps.some((s, si) => si !== spi && s.code === m.code);
                      // Look up the matching calc result by original (unfiltered)
                      // position in sp.materials — the calc engine runs on the
                      // full materials array including hidden rows.
                      const origIdx = (sp.materials || []).indexOf(m);
                      const r = matResults[origIdx] || null;
                      const isMain = m.row_type === 'Main.Mat';
                      if (isMain) mc++;
                      else pc++;
                      // Warn row when user has entered an IFS code but is still
                      // missing one of the required geometry fields — same rule
                      // as Standard CalcMaterials.
                      const hasCode = !!m.code;
                      const hasErr =
                        hasCode &&
                        (!m.usage ||
                          !(m.width > 0 || sp.web_width_td > 0) ||
                          !(m.cavities > 0 || layoutSheet > 0));
                      const selClass = !hasCode
                        ? 'sc-row-type-dim'
                        : isMain
                          ? 'sc-row-type-main'
                          : 'sc-row-type-proc';
                      const numClass = !hasCode
                        ? 'sc-row-num-dim'
                        : isMain
                          ? 'sc-row-num-main'
                          : 'sc-row-num-proc';
                      const rowBg = isRef ? { background: 'var(--color-violet-50)' } : {};
                      return (
                        <tr
                          key={m._mid || mi}
                          className={hasErr ? 'sc-row-warn' : ''}
                          style={rowBg}
                          onContextMenu={(e) => openMatMenu(mi, e)}
                        >
                          <td>
                            <span
                              className={`sc-row-label-cell${hasCode ? '' : ' sc-row-label-empty'}`}
                            >
                              <select
                                value={m.row_type || 'Main.Mat'}
                                onChange={(e) => setMat(mi, 'row_type', e.target.value)}
                                className={`sc-row-type-sel ${selClass}`}
                              >
                                <option value="Main.Mat">Main.Mat</option>
                                <option value="Process Mat">Process Mat</option>
                              </select>
                              <span className={`sc-row-num ${numClass}`}>{isMain ? mc : pc}</span>
                            </span>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={m.code || ''}
                              onChange={(e) => setMat(mi, 'code', e.target.value)}
                              onBlur={(e) => {
                                const f = getMatByCode(e.target.value);
                                if (f) setMat(mi, 'desc', f.description || f.desc || '');
                              }}
                              className="cc-det-inp"
                              style={
                                isRef ? { color: 'var(--color-violet-500)', fontWeight: 700 } : {}
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={m.desc || ''}
                              onChange={(e) => setMat(mi, 'desc', e.target.value)}
                              className="cc-det-inp cc-det-desc"
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={m.usage}
                              onChange={(v) => setMat(mi, 'usage', v)}
                              className={`cc-det-inp cc-det-num ${!m.usage && hasCode ? 'sc-input-err' : ''}`}
                            />
                          </td>
                          {/* Sprint 1.6 — per-MOQ Setup LM (mirrors Standard fix). */}
                          <td>
                            <DecimalInput
                              value={getSpSetupLmActive(m, mi)}
                              onChange={(v) => setSpSetupLmActive(mi, v)}
                              title={
                                isSpSetupLmOverride(mi)
                                  ? `MOQ ${activeMoqIdxCpx + 1} override (base = ${m.setup_lm ?? 0})`
                                  : activeMoqIdxCpx === 0
                                    ? 'Base value (MOQ 1)'
                                    : `Inherits MOQ 1 base (${m.setup_lm ?? 0}) — type to override`
                              }
                              className={`cc-det-inp cc-det-num ${isSpSetupLmOverride(mi) ? 'sc-smt-inp-ovr' : ''}`}
                            />
                          </td>
                          {/* Pitch OVR / Width / Cav auto-sync from Layout tab.
                        Display the layout-derived value in BLACK when the
                        row hasn't been overridden; switch to PURPLE (bold)
                        as soon as the user types a non-zero value. Clearing
                        the field (deleting all digits) sets state back to 0
                        which the display logic treats as "use the layout
                        default" — so users can revert to auto by emptying
                        the cell. */}
                          {/* Sprint AF — switched to DecimalInput so partial decimals
                        like "0.1" aren't clobbered mid-typing. DecimalInput
                        treats value === 0 as "display empty", which works
                        perfectly with the override semantics: we pass the
                        auto-default when the override is 0, so the cell
                        always shows SOMETHING (layout pitch, computed
                        width, or layout sheet), and the user can override
                        by typing or revert to auto by clearing. */}
                          <td>
                            <DecimalInput
                              value={
                                m.pitch_ovr > 0
                                  ? m.pitch_ovr
                                  : pitch > 0
                                    ? Number(pitch.toFixed(1))
                                    : 0
                              }
                              onChange={(v) => setMat(mi, 'pitch_ovr', v)}
                              className="cc-det-inp cc-det-num"
                              style={
                                m.pitch_ovr > 0
                                  ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                                  : { color: 'var(--color-slate-900)' }
                              }
                              title={
                                m.pitch_ovr > 0
                                  ? 'Override — clear to revert to layout pitch'
                                  : 'Auto-synced from Layout'
                              }
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={
                                m.width > 0 ? m.width : sp.web_width_td > 0 ? sp.web_width_td : 0
                              }
                              onChange={(v) => setMat(mi, 'width', v)}
                              className={`cc-det-inp cc-det-num ${!(m.width > 0) && !(sp.web_width_td > 0) && hasCode ? 'sc-input-err' : ''}`}
                              style={
                                m.width > 0
                                  ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                                  : { color: 'var(--color-slate-900)' }
                              }
                              title={
                                m.width > 0
                                  ? 'Override — clear to revert to layout Web Width TD'
                                  : 'Auto-synced from Layout Web Width TD'
                              }
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={
                                m.cavities > 0 ? m.cavities : layoutSheet > 0 ? layoutSheet : 0
                              }
                              onChange={(v) => setMat(mi, 'cavities', v)}
                              className={`cc-det-inp cc-det-num ${!(m.cavities > 0) && !(layoutSheet > 0) && hasCode ? 'sc-input-err' : ''}`}
                              style={
                                m.cavities > 0
                                  ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                                  : { color: 'var(--color-slate-900)' }
                              }
                              title={
                                m.cavities > 0
                                  ? 'Override — clear to revert to Layout/Sheet'
                                  : 'Auto-synced from Layout/Sheet'
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={m.offcut_yn || ''}
                              onChange={(e) => setMat(mi, 'offcut_yn', e.target.value)}
                              className="cc-det-sel cc-select-bare"
                            >
                              <option value="Y">Y</option>
                              <option value="N">N</option>
                              <option value=""></option>
                            </select>
                          </td>
                          {/* Offcut % display — mirror Offcut Y/N selection:
                        - Y      → auto-compute via MOD(cavities, width) / cavities
                                   (or user override when m.offcut_pct > 0)
                        - N      → always 0% (force, calc branch returns 0)
                        - empty  → Default = 5% (calc branch returns 0.05)
                        Black = auto/computed, purple bold = user override. */}
                          {(() => {
                            const yn = m.offcut_yn || '';
                            const effW = m.width > 0 ? m.width : sp.web_width_td || 0;
                            const effCav = m.cavities > 0 ? m.cavities : layoutSheet || 0;
                            const overridden = yn === 'Y' && m.offcut_pct > 0;
                            // Computed auto-default when user hasn't overridden.
                            // Only the yn='Y' (editable) branch routes through the
                            // editable input; other branches render a read-only
                            // value because they represent forced/default states.
                            let autoDefault = 0;
                            if (yn === 'Y' && !overridden && effW > 0 && effCav > 0) {
                              autoDefault = Number((((effCav % effW) / effCav) * 100).toFixed(1));
                            }
                            let shown;
                            if (yn === 'N') shown = '0';
                            else if (yn === '') shown = '5';
                            else if (overridden) shown = m.offcut_pct;
                            else if (effW > 0 && effCav > 0)
                              shown = (((effCav % effW) / effCav) * 100).toFixed(1);
                            else shown = '';
                            return (
                              <td>
                                {yn === 'Y' ? (
                                  <DecimalInput
                                    value={overridden ? m.offcut_pct : autoDefault}
                                    onChange={(v) => setMat(mi, 'offcut_pct', v)}
                                    className="cc-det-inp cc-det-num"
                                    style={
                                      overridden
                                        ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                                        : { color: 'var(--color-slate-900)' }
                                    }
                                    title={
                                      overridden
                                        ? 'Override — clear to revert to auto'
                                        : 'Auto = MOD(Cavities, Width) / Cavities'
                                    }
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={shown}
                                    readOnly
                                    className="cc-det-inp cc-det-num"
                                    style={{ color: 'var(--color-slate-900)' }}
                                    title={yn === 'N' ? 'Offcut=N → 0%' : 'Default → 5%'}
                                  />
                                )}
                              </td>
                            );
                          })()}
                          <td>
                            <select
                              value={m.slitting_yn || ''}
                              onChange={(e) => setMat(mi, 'slitting_yn', e.target.value)}
                              className="cc-det-sel cc-select-bare"
                            >
                              <option value="Y">Y</option>
                              <option value="N">N</option>
                              <option value=""></option>
                            </select>
                          </td>
                          <td>
                            <DecimalInput
                              value={m.g_price}
                              onChange={(v) => setMat(mi, 'g_price', v)}
                              className="cc-det-inp cc-det-num"
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={m.latest}
                              onChange={(v) => setMat(mi, 'latest', v)}
                              className="cc-det-inp cc-det-num"
                              style={
                                m.latest
                                  ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                                  : {}
                              }
                            />
                          </td>
                          <td className="sc-td-derived">{fmtN(r?.qpa_m2)}</td>
                          <td className="sc-td-derived">{fmtN(r?.qpa_lm)}</td>
                          <td className="sc-td-derived">{r?.layout_sheet || '\u2014'}</td>
                          <td className="sc-td-derived">{r?.webs || '\u2014'}</td>
                          <td className="sc-td-derived" style={{ color: '#059669' }}>
                            {r ? (scrapDisplay * 100).toFixed(1) + '%' : '\u2014'}
                          </td>
                          <td className="sc-td-result">{fmtN(r?.setup_s)}</td>
                          <td className="sc-td-result">{fmtN(r?.run_s)}</td>
                          <td className="sc-td-result sc-td-total">{fmtN(r?.total_s)}</td>
                          <td>
                            <button
                              className="sc-btn-del-circle sc-btn-del-sm"
                              onClick={() => removeMat(mi)}
                              title="Remove"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}
            {!showSpAltEmptyState && (
              <div className="sc-add-row">
                <button className="sc-btn-ghost" onClick={addMat}>
                  + Add Material Row
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inks — full column set matching Standard Calc.
          Input: Color, Print Type, Mesh Spec, Pitch mm, Base Mat, Setup kg,
                 Area%, Cov Ovr (disabled for Indigo), Clicks (enabled for
                 Indigo only), Ref Price, Ink Price.
          Derived (purple bg): Scrap%.
          Result (blue bg): Setup, Run, Total. */}
      <div className="cc-det-section">
        <div className="sc-card">
          <div className="sc-card-header sc-header-cyan">
            <span className="sc-card-icon">&#8853;</span>
            <span className="sc-card-title">Inks ({inks.length} rows)</span>
            <div className="sc-header-totals">
              <span className="sc-header-total-item">
                Setup: <b>${fmtN(inkTotals.setup)}</b>
              </span>
              <span className="sc-header-total-item">
                Run: <b>${fmtN(inkTotals.run)}</b>
              </span>
              <span className="sc-header-total-item sc-header-total-main">
                Total: <b>${fmtN(inkTotals.total)}</b>
              </span>
            </div>
          </div>
          <div className="sc-card-body cc-det-tw">
            <table className="cc-det-tbl">
              <thead>
                <tr>
                  <th style={{ width: 55 }}>Label</th>
                  <th style={{ width: 70 }}>Color</th>
                  <th style={{ width: 80 }}>Print Type</th>
                  <th style={{ width: 70 }}>Mesh</th>
                  <th style={{ width: 55 }}>Pitch mm</th>
                  <th style={{ width: 70 }}>Base Mat</th>
                  <th style={{ width: 55 }}>Setup kg</th>
                  <th style={{ width: 50 }}>Area%</th>
                  <th style={{ width: 55 }} title="Coverage override — disabled for Indigo">
                    Cov Ovr
                  </th>
                  <th style={{ width: 50 }} title="Enabled for Indigo only">
                    Clicks
                  </th>
                  <th
                    className="sc-col-derived"
                    style={{ width: 50 }}
                    title="Scrap factor from processes"
                  >
                    Scrap%
                  </th>
                  <th style={{ width: 60 }}>Ref Price</th>
                  <th style={{ width: 60 }}>Ink Price</th>
                  <th className="sc-col-result" style={{ width: 60 }}>
                    Setup
                  </th>
                  <th className="sc-col-result" style={{ width: 60 }}>
                    Run
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }}>
                    Total
                  </th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {inks.map((ik, ii) => {
                  const origIdx = (sp.inks || []).indexOf(ik);
                  const r = inkResults[origIdx] || null;
                  const isIndigo = (ik.print_type || '') === 'Indigo';
                  return (
                    <tr key={ii} onContextMenu={(e) => openInkMenu(ii, e)}>
                      <td className="sc-td-idx">Ink {ii + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={ik.color || ''}
                          onChange={(e) => setInk(ii, 'color', e.target.value)}
                          className="cc-det-inp"
                          placeholder="Color name"
                        />
                      </td>
                      <td>
                        <select
                          value={ik.print_type || ''}
                          onChange={(e) => setInk(ii, 'print_type', e.target.value)}
                          className="cc-det-sel"
                        >
                          <option value="">--</option>
                          {printTypeOpts.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={ik.mesh_spec || ''}
                          onChange={(e) => setInk(ii, 'mesh_spec', e.target.value)}
                          className="cc-det-sel"
                        >
                          <option value="">--</option>
                          {meshOpts.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <DecimalInput
                          value={ik.pitch_mm}
                          onChange={(v) => setInk(ii, 'pitch_mm', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={ik.base_mat || ''}
                          onChange={(e) => setInk(ii, 'base_mat', e.target.value)}
                          className="cc-det-inp"
                        />
                      </td>
                      <td>
                        <DecimalInput
                          value={ik.setup_kg}
                          onChange={(v) => setInk(ii, 'setup_kg', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={ik.area_pct != null ? Math.round(ik.area_pct * 100) : ''}
                          onChange={(e) => setInk(ii, 'area_pct', numF(e.target.value) / 100)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <DecimalInput
                          value={ik.coverage_override}
                          onChange={(v) => setInk(ii, 'coverage_override', v)}
                          className="cc-det-inp cc-det-num"
                          disabled={isIndigo}
                          title={isIndigo ? 'Not used for Indigo' : 'Coverage override'}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={ik.clicks || ''}
                          onChange={(e) => setInk(ii, 'clicks', numF(e.target.value))}
                          className="cc-det-inp cc-det-num"
                          disabled={!isIndigo}
                          title={isIndigo ? 'Indigo clicks' : 'Indigo only'}
                        />
                      </td>
                      <td className="sc-td-derived" style={{ color: '#059669' }}>
                        {(scrapDisplay * 100).toFixed(1) + '%'}
                      </td>
                      <td>
                        <DecimalInput
                          value={ik.s_price}
                          onChange={(v) => setInk(ii, 's_price', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <DecimalInput
                          value={ik.latest}
                          onChange={(v) => setInk(ii, 'latest', v)}
                          className="cc-det-inp cc-det-num"
                          style={
                            ik.latest ? { color: 'var(--color-violet-500)', fontWeight: 700 } : {}
                          }
                        />
                      </td>
                      <td className="sc-td-result">{fmtN(r?.setup_s)}</td>
                      <td className="sc-td-result">{fmtN(r?.run_s)}</td>
                      <td className="sc-td-result sc-td-total">{fmtN(r?.total)}</td>
                      <td>
                        <button
                          className="sc-btn-del-circle sc-btn-del-sm"
                          onClick={() => removeInk(ii)}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="sc-add-row">
              <button className="sc-btn-ghost" onClick={addInk}>
                + Add Ink Row
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Processes — full column set matching Standard Calc / COST V1.0 M06
          Input: Type, Workcenter, Rpt, Speed, Layout, Eff%, Setup H, Scrap%,
                 Manual UPH, Tool Cost, Tool Type, Tool Life, EAU Override.
          Derived (purple bg): Crew (from rate), UOM (from rate), MC UPH,
                               Mach Rate, Labor Rate, Prod Time (hours).
          Result (blue bg): Setup Mach, Setup Labor, Run Mach, Run Labor,
                            Tooling. */}
      <div className="cc-det-section">
        <div className="sc-card">
          <div className="sc-card-header sc-header-green">
            <span className="sc-card-icon">&#9881;</span>
            <span className="sc-card-title">Processes ({procs.length} rows)</span>
            <div className="sc-header-totals">
              <span className="sc-header-total-item">
                Mach: <b>${fmtN(procTotals.setupMach + procTotals.runMach)}</b>
              </span>
              <span className="sc-header-total-item">
                Labor: <b>${fmtN(procTotals.setupLabor + procTotals.runLabor)}</b>
              </span>
              <span className="sc-header-total-item">
                Tool: <b>${fmtN(procTotals.tooling)}</b>
              </span>
              <span className="sc-header-total-item sc-header-total-main">
                Total: <b>${fmtN(procTotals.total)}</b>
              </span>
            </div>
          </div>
          <div className="sc-card-body cc-det-tw">
            <table className="cc-det-tbl">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th style={{ width: 95 }}>Type</th>
                  <th style={{ width: 100 }}>Workcenter</th>
                  <th style={{ width: 40 }} title="Repeat">
                    Rpt
                  </th>
                  <th className="sc-col-derived" style={{ width: 40 }}>
                    Crew
                  </th>
                  <th style={{ width: 55 }}>Speed</th>
                  <th className="sc-col-derived" style={{ width: 65 }}>
                    UOM
                  </th>
                  <th style={{ width: 50 }}>Layout</th>
                  <th style={{ width: 50 }}>Eff%</th>
                  <th className="sc-col-derived" style={{ width: 60 }}>
                    MC UPH
                  </th>
                  <th style={{ width: 60 }} title="Manual UPH">
                    Man UPH
                  </th>
                  <th style={{ width: 55 }}>Setup H</th>
                  <th style={{ width: 50 }}>Scrap%</th>
                  <th style={{ width: 65 }}>Tool Cost</th>
                  <th style={{ width: 85 }}>Tool Type</th>
                  <th style={{ width: 80 }}>Tool Life</th>
                  <th
                    style={{ width: 80 }}
                    title="Override EAU (total qty). Empty = annual × lifetime"
                  >
                    EAU Ovr
                  </th>
                  <th
                    className="sc-col-derived"
                    style={{ width: 60 }}
                    title="Production time (hours)"
                  >
                    Prod Time
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }} title="Setup machine">
                    S.Mach
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }} title="Setup labor">
                    S.Labor
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }} title="Run machine">
                    R.Mach
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }} title="Run labor">
                    R.Labor
                  </th>
                  <th className="sc-col-result" style={{ width: 65 }}>
                    Tooling
                  </th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {procs.map((p, pi) => {
                  const wcOpts = lib ? getWCOptionsByType(lib, p.process_type) : [];
                  const rate = lib ? getRateByWC(lib, p.workcenter) : null;
                  const crew = rate?.crew || '';
                  const uom = rate?.speed_uom || '';
                  const origIdx = (sp.processes || []).indexOf(p);
                  const r = procResults[origIdx] || null;
                  return (
                    <tr key={pi}>
                      <td className="sc-td-idx">Process {pi + 1}</td>
                      <td>
                        <select
                          value={p.process_type || ''}
                          onChange={(e) => {
                            setProc(pi, 'process_type', e.target.value);
                            setProc(pi, 'workcenter', '');
                          }}
                          className="cc-det-sel sc-select-bare"
                        >
                          <option value="">--</option>
                          {processOpts.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={p.workcenter || ''}
                          onChange={(e) => setProc(pi, 'workcenter', e.target.value)}
                          className="cc-det-sel sc-select-bare"
                        >
                          <option value="">--</option>
                          {wcOpts.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={p.repeat ?? 1}
                          onChange={(e) => setProc(pi, 'repeat', numF(e.target.value))}
                          className="cc-det-inp cc-det-num"
                          style={{ background: 'var(--color-warning-100)' }}
                        />
                      </td>
                      <td className="sc-td-derived">{crew || '\u2014'}</td>
                      <td>
                        <DecimalInput
                          value={p.speed}
                          onChange={(v) => setProc(pi, 'speed', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td className="sc-td-derived" style={{ fontSize: 10 }}>
                        {uom || '\u2014'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={p.layout || ''}
                          onChange={(e) => setProc(pi, 'layout', numF(e.target.value))}
                          placeholder="—"
                          className="cc-det-inp cc-det-num"
                          title="Layout/batch count — required for machine workcenters (see Rate Table Machine USD/H)"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={p.efficiency != null ? Math.round(p.efficiency * 100) : 85}
                          onChange={(e) => setProc(pi, 'efficiency', numF(e.target.value) / 100)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td className="sc-td-derived">{r?.uph ? Math.round(r.uph) : '\u2014'}</td>
                      <td>
                        <DecimalInput
                          value={p.manual_uph}
                          onChange={(v) => setProc(pi, 'manual_uph', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      {/* Sprint 1.6 — per-MOQ Setup H (mirrors Standard fix). */}
                      <td>
                        <DecimalInput
                          value={getSpSetupHActive(p, pi)}
                          onChange={(v) => setSpSetupHActive(pi, v)}
                          title={
                            isSpSetupHOverride(pi)
                              ? `MOQ ${activeMoqIdxCpx + 1} override (base = ${p.setup_h ?? 0})`
                              : activeMoqIdxCpx === 0
                                ? 'Base value (MOQ 1)'
                                : `Inherits MOQ 1 base (${p.setup_h ?? 0}) — type to override`
                          }
                          className={`cc-det-inp cc-det-num ${isSpSetupHOverride(pi) ? 'sc-smt-inp-ovr' : ''}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={p.scrap_pct != null ? Math.round(p.scrap_pct * 100) : 3}
                          onChange={(e) => setProc(pi, 'scrap_pct', numF(e.target.value) / 100)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <DecimalInput
                          value={p.tool_cost}
                          onChange={(v) => setProc(pi, 'tool_cost', v)}
                          className="cc-det-inp cc-det-num"
                        />
                      </td>
                      <td>
                        <select
                          value={p.tool_type || ''}
                          onChange={(e) => {
                            setProc(pi, 'tool_type', e.target.value);
                            if (lib && e.target.value) {
                              const l = getToolLife(lib, e.target.value);
                              if (l > 0) setProc(pi, 'tool_life', l);
                            }
                          }}
                          className="cc-det-sel sc-select-bare"
                        >
                          <option value="">--</option>
                          {toolTypeOpts.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <DecimalInput
                          value={p.tool_life}
                          onChange={(v) => setProc(pi, 'tool_life', v)}
                          className="cc-det-inp cc-det-num"
                          style={
                            p.tool_life_ovr
                              ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                              : {}
                          }
                          title="Tool life shots — auto-filled from DDL or override"
                        />
                      </td>
                      <td>
                        <DecimalInput
                          value={p.eau_ovr}
                          onChange={(v) => setProc(pi, 'eau_ovr', v)}
                          className="cc-det-inp cc-det-num"
                          placeholder={r?.eau ? String(Math.round(r.eau)) : ''}
                        />
                      </td>
                      <td className="sc-td-derived">
                        {r?.total_time ? (r.total_time / 60).toFixed(2) : '\u2014'}
                      </td>
                      <td className="sc-td-result">{fmtN(r?.setup_mach)}</td>
                      <td className="sc-td-result">{fmtN(r?.setup_labor)}</td>
                      <td className="sc-td-result">{fmtN(r?.run_mach)}</td>
                      <td className="sc-td-result">{fmtN(r?.run_labor)}</td>
                      <td className="sc-td-result sc-td-total">{fmtN(r?.tooling)}</td>
                      <td>
                        <button
                          className="sc-btn-del-circle sc-btn-del-sm"
                          onClick={() => removeProc(pi)}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="sc-add-row">
              <button className="sc-btn-ghost" onClick={addProc}>
                + Add Process Row
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
