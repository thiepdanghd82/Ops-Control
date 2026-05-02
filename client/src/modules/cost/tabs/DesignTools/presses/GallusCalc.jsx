/**
 * GallusCalc — Print + Cutting Design calculator for the Gallus rotary
 * press. Replicates `Gallus_Design_Calculator_RL.xlsx` 1:1 in a
 * SAP-Fiori-styled React UI. Sprint 14.
 *
 * UI layout (top → bottom):
 *   1. Sub-tab bar:  [ 📐 Print Design | ✂ Cutting Design (Die-cut) ]
 *   2. Inputs panel — shared by both sub-tabs (since L, G, W, Pw, etc.
 *      drive both sides). Two columns of bilingual labelled fields.
 *   3. Print Design tab content:
 *        — Top 5 print cylinders ranked
 *        — Cross-direction analysis card
 *        — Master cylinder availability table (filterable)
 *        — Job summary card (uses top-1 cylinder)
 *   4. Cutting Design tab content:
 *        — Top 3 magnetic cylinders matching the print step
 *        — Manual override panel (engineer picks Z_die explicitly)
 *        — Master 22-cylinder magnetic inventory table
 *
 * State strategy: a single `inputs` object held in this component (no
 * Context/store; the calc is pure + local). Saving the design back to
 * a quote is out of scope for Sprint 14 — Sprint+ adds "Apply to
 * StandardCalc" if engineers ask.
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  createGallusInputs,
  rankPrintCylinders,
  crossDirection,
  rankMagneticCylinders,
  jobSummary,
  validateInputs,
  suggestGap,
  pickWinners,
  suggestWebWidth,
  solveLayout,
  inkConsumption,
  recommendAnilox,
  dieRisk,
  validateColorSequence,
} from './gallusEngine';
import { setRuntimePrintCylinders } from './gallusInventory';
import DecimalInput from '../../../../../utils/DecimalInput';
import usePersistentInputs from '../usePersistentInputs';
import { useCalc } from '../../../../../context/CalcContext';
import { useAuth } from '../../../../../context/AuthContext';
import { sharedApi, costApi } from '../../../../../services/api';
import { showToast } from '../../../../../utils/toast';
import ShotLayoutViz from './ShotLayoutViz';
import { loadArtwork } from './artworkLoader';
import Modal from '../../../../../components/Shared/Modal';
import './GallusCalc.css';

const fmt = {
  n: (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : '—'),
  i: (v) => (Number.isFinite(v) ? v.toLocaleString() : '—'),
  pct: (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—'),
};

const STATUS_TONE = {
  OK: 'good',
  '✓ MATCH': 'good',
  '⚠ NEAR': 'warn',
  'GAP < MIN': 'warn',
  'GAP > MAX': 'warn',
  '✗ MISMATCH': 'bad',
  'TOO SMALL': 'bad',
};

export default function GallusCalc() {
  // Sprint 14e — sessionStorage persistence keeps the in-progress
  // design alive across sidebar tab switches. Key is press-scoped so
  // each press has its own draft (an operator switching from Gallus
  // to Brotech doesn't lose Gallus work).
  const [inputs, setInputs] = usePersistentInputs(
    'ops_design_tools_gallus_inputs',
    createGallusInputs
  );
  const [activeSub, setActiveSub] = useState('print');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [savingHistory, setSavingHistory] = useState(false);
  // Sprint 14k — versioning. `activeDesignId` is set when the operator
  // Loads a record from history. Save then becomes ambiguous (overwrite
  // vs branch?), so we open a SaveChoiceDialog to ask. `activeVersion`
  // displays alongside identifier so operators see lineage at a glance.
  const [activeDesignId, setActiveDesignId] = useState(null);
  const [activeVersion, setActiveVersion] = useState(0);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const { setPendingQuote } = useCalc();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  // Sprint 1.7j — fetch admin-edited Master Cylinder catalog on mount.
  // Falls back silently to the factory default list when the endpoint
  // is unreachable (older server, network blip). `cylVersion` bumps on
  // each successful load so memoised derivations (rankPrintCylinders)
  // re-run with the fresh list without needing a hard refresh.
  const [cylVersion, setCylVersion] = useState(0);
  const reloadCylinders = useCallback(async () => {
    try {
      const r = await costApi.getMasterCylinders();
      if (Array.isArray(r?.cylinders)) {
        setRuntimePrintCylinders(r.cylinders);
        setCylVersion((v) => v + 1);
      }
    } catch {
      /* silent — engine falls back to factory defaults */
    }
  }, []);
  useEffect(() => {
    reloadCylinders();
  }, [reloadCylinders]);

  const set = (k, v) => setInputs((prev) => ({ ...prev, [k]: v }));
  // setNum returns the onChange handler shape DecimalInput expects:
  // it gets the parsed Number directly, not the synthetic event.
  // DecimalInput handles locale-aware parsing + the partial-decimal
  // bug native <input type=number> has, so we don't need our own
  // string handling here. See utils/DecimalInput.jsx header for the
  // 3 native-input bugs this avoids.
  const setNum = (k) => (v) => set(k, Number.isFinite(Number(v)) ? Number(v) : 0);

  // Sprint 1.7j — `cylVersion` bumps when admin saves edits → re-rank
  // immediately so the Top-5 + Master table reflect the new availability.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankPrintCylinders(inputs), [inputs, cylVersion]);
  const top5 = useMemo(() => ranked.filter((r) => r.status === 'OK').slice(0, 5), [ranked]);

  // Sprint S-FLEXO-1 — feed the elected print Z into validateInputs so
  // the Z_die mismatch check has a reference. Recomputes when the
  // top-1 cylinder changes (different inputs → different winner).
  const issues = useMemo(() => {
    const print_z = top5[0]?.z || 0;
    return validateInputs({ ...inputs, print_z });
  }, [inputs, top5]);
  const errorFields = useMemo(
    () => new Set(issues.filter((i) => i.severity === 'error').map((i) => i.field)),
    [issues]
  );
  const warnFields = useMemo(
    () => new Set(issues.filter((i) => i.severity === 'warn').map((i) => i.field)),
    [issues]
  );
  const hasErrors = errorFields.size > 0;
  const cross = useMemo(() => crossDirection(inputs), [inputs]);
  const summary = useMemo(() => jobSummary(top5[0], cross, inputs), [top5, cross, inputs]);
  const gapSuggestion = useMemo(() => suggestGap(inputs, ranked), [inputs, ranked]);
  const winners = useMemo(() => pickWinners(ranked), [ranked]);
  const webSuggestion = useMemo(() => suggestWebWidth(inputs, cross), [inputs, cross]);
  // Sprint S-DESIGNER (2026-04-30) — surfaces designer-mode required
  // pitch / W up-front. Banner above the rank table tells the operator
  // "you asked for N=2, n=3 → cylinder Z=27 + W=207 mm needed".
  const layout = useMemo(() => solveLayout(inputs), [inputs]);

  // Artwork upload handler (Sprint 14h + 14i):
  //   - Image (PNG/JPG/SVG/WebP/GIF): direct readAsDataURL.
  //   - PDF: lazy-import pdfjs, render page 1 to canvas, capture as PNG.
  // Both paths land in `inputs.artwork_data_url` so ShotLayoutViz
  // doesn't need to know about the source format. Size cap ~1.5 MB
  // for sessionStorage persistence; bigger files still display but
  // operator gets a heads-up they won't survive tab switch.
  const [artworkLoading, setArtworkLoading] = useState(false);
  const handleArtworkUpload = useCallback(async (file) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const isImage = /^image\//.test(file.type || '');
    if (!isPdf && !isImage) {
      showToast('Artwork must be an image (PNG / JPG / SVG / WebP) or a PDF', 'err');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      showToast(
        `Large file (${(file.size / 1024 / 1024).toFixed(1)} MB) — preview works but may not persist on tab switch`,
        'warning'
      );
    }
    setArtworkLoading(true);
    try {
      const { dataUrl, kind } = await loadArtwork(file);
      set('artwork_data_url', dataUrl);
      set('artwork_filename', file.name || (kind === 'pdf-page' ? 'document.pdf' : 'image'));
      showToast(
        kind === 'pdf-page'
          ? `PDF page 1 rendered · ${file.name || 'document.pdf'}`
          : `Artwork loaded · ${file.name || 'image'}`
      );
    } catch (err) {
      showToast('Artwork load failed: ' + (err.message || 'unknown'), 'err');
    } finally {
      setArtworkLoading(false);
    }
  }, []);
  const clearArtwork = () => {
    set('artwork_data_url', '');
    set('artwork_filename', '');
  };

  // Print step from top-1 cylinder feeds die-cut matching.
  const printStep = top5[0]?.step_lay || 0;
  const magRanked = useMemo(() => rankMagneticCylinders(inputs, printStep), [inputs, printStep]);

  // ── History save / load (Sprint 14e) ────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const list = await sharedApi.listDesigns?.({ press: 'gallus' });
      setHistoryList(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn('Failed to load design history:', e);
    }
  }, []);

  useEffect(() => {
    if (historyOpen) refreshHistory();
  }, [historyOpen, refreshHistory]);

  // Build the save payload — shared between "new" + "update" paths.
  const buildSavePayload = useCallback(() => {
    const top1 = top5[0];
    return {
      press: 'gallus',
      end_cu_pn: inputs.end_cu_pn.trim(),
      project: inputs.project?.trim() || '',
      designer_note: inputs.designer_note?.trim() || '',
      inputs,
      result: top1
        ? {
            cylinder_z: top1.z,
            n_down: top1.n_down,
            n_across: cross.n_across,
            actual_gap: top1.actual_gap,
            step_lay: top1.step_lay,
            pitch: top1.pitch,
            product_film_pct: top1.product_film_pct,
            gallus_film_pct: top1.gallus_film_pct,
          }
        : null,
    };
  }, [inputs, top5, cross]);

  // Save fresh record (POST). Used directly when no record is loaded
  // (initial save — no notice required) OR via the Save Choice
  // dialog's "Save as new version" path (operator branched from
  // existing — notice REQUIRED, parent_id sent for traceability).
  const saveAsNew = useCallback(
    async ({ notice = '', parentId = null } = {}) => {
      if (!inputs.end_cu_pn?.trim()) {
        showToast('End CU PN is required to save · Cần nhập End CU PN trước khi lưu', 'err');
        return;
      }
      if (hasErrors) {
        showToast('Fix validation errors before saving', 'err');
        return;
      }
      setSavingHistory(true);
      try {
        const payload = {
          ...buildSavePayload(),
          ...(parentId ? { parent_id: parentId } : {}),
          ...(notice ? { design_change_notice: notice } : {}),
        };
        const r = await sharedApi.saveDesign(payload);
        const saved = r?.design;
        if (saved?.id) {
          setActiveDesignId(saved.id);
          setActiveVersion(saved.version || 1);
        }
        showToast(
          parentId
            ? `Branched · Tạo bản mới #${saved?.id} từ #${parentId}`
            : `Saved as new · Đã lưu mới ${inputs.end_cu_pn}`
        );
        refreshHistory();
      } catch (e) {
        // Server-side notice rejection surfaces here as a 400 with
        // body.error === 'change_notice_required'. Show the message
        // the server localised so operators don't see raw error codes.
        showToast('Save failed: ' + (e?.body?.msg || e.message || 'unknown'), 'err');
      } finally {
        setSavingHistory(false);
      }
    },
    [inputs, buildSavePayload, hasErrors, refreshHistory]
  );

  // Update active record in place (PUT). Server bumps version + stamps
  // a fresh saved_at; preserves the original id + saved_at_first.
  // Notice is REQUIRED — server returns 400 if missing/short.
  const saveUpdate = useCallback(
    async ({ notice = '' } = {}) => {
      if (activeDesignId == null) return saveAsNew();
      if (!inputs.end_cu_pn?.trim()) {
        showToast('End CU PN is required to save', 'err');
        return;
      }
      if (hasErrors) {
        showToast('Fix validation errors before saving', 'err');
        return;
      }
      setSavingHistory(true);
      try {
        const payload = {
          ...buildSavePayload(),
          design_change_notice: notice,
        };
        const r = await sharedApi.updateDesign(activeDesignId, payload);
        const saved = r?.design;
        if (saved?.version) setActiveVersion(saved.version);
        showToast(`Updated · Cập nhật v${saved?.version || '?'} của ${inputs.end_cu_pn}`);
        refreshHistory();
      } catch (e) {
        showToast('Update failed: ' + (e?.body?.msg || e.message || 'unknown'), 'err');
      } finally {
        setSavingHistory(false);
      }
    },
    [activeDesignId, inputs, buildSavePayload, hasErrors, refreshHistory, saveAsNew]
  );

  // Save button handler — opens choice dialog when an existing record
  // is loaded (operator must pick: overwrite or branch). Otherwise
  // saves directly as a new record (no ambiguity).
  const handleSave = useCallback(() => {
    if (activeDesignId != null) setSaveChoiceOpen(true);
    else saveAsNew();
  }, [activeDesignId, saveAsNew]);

  const loadFromHistory = (rec) => {
    if (rec?.inputs) {
      setInputs({ ...createGallusInputs(), ...rec.inputs });
      setActiveDesignId(rec.id || null);
      setActiveVersion(Number(rec.version) || 1);
      setHistoryOpen(false);
      showToast(`Loaded · Đã tải ${rec.end_cu_pn} (v${rec.version || 1})`);
    }
  };

  // "New" button — clears the loaded-record link so next Save creates
  // a fresh row regardless of what's in the form.
  const startNewDesign = () => {
    if (
      !window.confirm(
        "Start a new design? · Bắt đầu thiết kế mới?\nCurrent draft is unsaved if you haven't hit Save."
      )
    )
      return;
    setInputs(createGallusInputs());
    setActiveDesignId(null);
    setActiveVersion(0);
  };

  const deleteFromHistory = useCallback(
    async (rec) => {
      if (!rec?.id) return;
      if (
        !window.confirm(
          `Delete saved design "${rec.end_cu_pn}" (#${rec.id})? This cannot be undone.\n` +
            `Xoá thiết kế "${rec.end_cu_pn}" (#${rec.id})? Không thể hoàn tác.`
        )
      )
        return;
      try {
        await sharedApi.deleteDesign(rec.id);
        showToast(`Deleted #${rec.id} · Đã xoá`);
        refreshHistory();
      } catch (e) {
        showToast('Delete failed: ' + (e.message || 'unknown'), 'err');
      }
    },
    [refreshHistory]
  );

  // ── Apply to Pricing (Std) handoff (Sprint 14e) ─────────────────
  const applyToPricing = useCallback(
    (targetType) => {
      if (hasErrors || !top5[0]) {
        showToast('Cannot apply — fix inputs to get a valid Top 1 cylinder first', 'err');
        return;
      }
      const top1 = top5[0];
      // Map Gallus calc state into Standard/Complex stdState fields.
      // Field names match createStdState in calcEngine.js.
      const prefill = {
        end_cu_pn: inputs.end_cu_pn || '',
        project: inputs.project || '',
        part_length_md: inputs.L, // product length down-web → die length MD
        part_width: inputs.Pw, // cross-direction product width → die width TD
        web_width_td: inputs.W,
        sheet_length: inputs.L + (top1.actual_gap || inputs.G), // best-fit MD stride
        min_gap_md: top1.actual_gap || inputs.G,
        min_gap_td: inputs.Lg,
        edge_margin_td: inputs.E,
        parts_in_md: top1.n_down || 1,
        parts_web_across: cross.n_across || 1,
        num_webs: 1,
        plate_tooth: top1.z,
        plate_pitch_mm: top1.pitch,
        magnetic_tooth: inputs.Z_die || top1.z,
        color_count: inputs.n_colors || 0,
        pcs_per_roll: inputs.web_length_m
          ? Math.round((inputs.web_length_m * 1000) / (top1.step_lay || 1)) * (cross.n_across || 1)
          : 0,
      };
      setPendingQuote(null, 'rfq-sync', 'prefill', prefill);
      window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: targetType }));
      showToast(
        `Sent to Pricing (${targetType === 'standard' ? 'Std' : 'Cpx'}) — switch tabs to see prefilled fields`
      );
    },
    [inputs, top5, cross, hasErrors, setPendingQuote]
  );

  return (
    <div className="gc-root">
      {/* Bilingual page subtitle */}
      <div className="gc-subtitle">
        <b>Gallus ECS340</b> · cylinder + layout designer
        <span className="gc-bi-vi">
          {' '}
          · Công cụ thiết kế cylinder &amp; layout cho máy Gallus ECS340
        </span>
      </div>

      {/* Identifier bar — End CU PN, project, action buttons. Sticky at
          the top of the form so the operator always knows which design
          they're editing + can save / push to Pricing in one click. */}
      <div className="gc-identbar">
        <div className="gc-identbar-fields">
          <div className="gc-identbar-field">
            <label>
              End CU PN <span className="gc-bi-vi">/ Mã sản phẩm khách</span>
            </label>
            <input
              type="text"
              value={inputs.end_cu_pn || ''}
              onChange={(e) => set('end_cu_pn', e.target.value)}
              placeholder="e.g. AWW9917CHVC0-0C1"
              className="gc-input gc-identbar-input"
            />
          </div>
          <div className="gc-identbar-field">
            <label>
              Project <span className="gc-bi-vi">/ Dự án</span>
            </label>
            <input
              type="text"
              value={inputs.project || ''}
              onChange={(e) => set('project', e.target.value)}
              placeholder="e.g. BOSE earbuds Q2"
              className="gc-input gc-identbar-input"
            />
          </div>
          <div className="gc-identbar-field gc-identbar-grow">
            <label>
              Designer note <span className="gc-bi-vi">/ Ghi chú thiết kế</span>
            </label>
            <input
              type="text"
              value={inputs.designer_note || ''}
              onChange={(e) => set('designer_note', e.target.value)}
              placeholder="Free text"
              className="gc-input gc-identbar-input"
            />
          </div>
        </div>
        <div className="gc-identbar-actions">
          {activeDesignId != null && (
            <span
              className="gc-version-badge"
              title={`Loaded record #${activeDesignId} · Save will prompt: Update v${activeVersion} or branch as new`}
            >
              📌 #{activeDesignId} v{activeVersion}
            </span>
          )}
          <button
            type="button"
            className="gc-action gc-action-secondary"
            onClick={startNewDesign}
            title="Clear loaded record · Tạo thiết kế mới (next Save = new row)"
          >
            ＋ New
          </button>
          <button
            type="button"
            className="gc-action gc-action-secondary"
            onClick={() => setHistoryOpen((o) => !o)}
            title="Browse saved designs · Mở lịch sử thiết kế"
          >
            🕒 History {historyOpen ? '▾' : '▸'}
          </button>
          <button
            type="button"
            className="gc-action gc-action-secondary"
            onClick={handleSave}
            disabled={savingHistory || hasErrors}
            title={
              activeDesignId != null
                ? 'Save: choose Update or Save as new version'
                : 'Save as new record'
            }
          >
            {savingHistory ? '⏳ Saving…' : '💾 Save'}
          </button>
          <button
            type="button"
            className="gc-action gc-action-primary"
            onClick={() => applyToPricing('standard')}
            disabled={hasErrors || !top5[0]}
            title="Push values to Pricing (Std) and switch to that tab"
          >
            ↗ Apply to Pricing (Std)
          </button>
          <button
            type="button"
            className="gc-action gc-action-secondary"
            onClick={() => applyToPricing('complex')}
            disabled={hasErrors || !top5[0]}
            title="Push values to Pricing (Cpx) and switch to that tab"
          >
            ↗ Pricing (Cpx)
          </button>
        </div>
      </div>

      {historyOpen && (
        <HistoryPanel
          list={historyList}
          onLoad={loadFromHistory}
          onDelete={deleteFromHistory}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <SaveChoiceDialog
        open={saveChoiceOpen}
        onClose={() => setSaveChoiceOpen(false)}
        activeId={activeDesignId}
        activeVersion={activeVersion}
        endCuPn={inputs.end_cu_pn}
        onUpdate={(notice) => {
          setSaveChoiceOpen(false);
          saveUpdate({ notice });
        }}
        onSaveAsNew={(notice) => {
          setSaveChoiceOpen(false);
          saveAsNew({ notice, parentId: activeDesignId });
        }}
      />

      {/* Sub-tab bar */}
      <div className="gc-subtabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeSub === 'print'}
          className={`gc-subtab ${activeSub === 'print' ? 'active' : ''}`}
          onClick={() => setActiveSub('print')}
        >
          <span className="gc-subtab-icon">📐</span>
          <span>
            <div>Print Design</div>
            <div className="gc-subtab-vi">Thiết kế in</div>
          </span>
        </button>
        <button
          role="tab"
          aria-selected={activeSub === 'cut'}
          className={`gc-subtab ${activeSub === 'cut' ? 'active' : ''}`}
          onClick={() => setActiveSub('cut')}
        >
          <span className="gc-subtab-icon">✂</span>
          <span>
            <div>Cutting Design (Die-cut)</div>
            <div className="gc-subtab-vi">Thiết kế cắt khuôn</div>
          </span>
        </button>
      </div>

      {/* INPUTS panel — drives both sub-tabs */}
      <InputsPanel
        inputs={inputs}
        setNum={setNum}
        set={set}
        issues={issues}
        errorFields={errorFields}
        warnFields={warnFields}
        gapSuggestion={gapSuggestion}
        applyGapSuggestion={() => gapSuggestion && set('G', gapSuggestion.gap)}
      />

      {/* Sub-tab content — gated when required fields are missing.
          Showing stale/garbage results while inputs are invalid trains
          operators to ignore the calculator output, so we hide it. */}
      {hasErrors ? (
        <Empty
          en="Fix the required fields above to run the calculation."
          vi="Sửa các trường bắt buộc ở trên để chạy tính toán."
        />
      ) : activeSub === 'print' ? (
        <PrintDesignTab
          ranked={ranked}
          top5={top5}
          cross={cross}
          summary={summary}
          inputs={inputs}
          winners={winners}
          webSuggestion={webSuggestion}
          layout={layout}
          set={set}
          onUploadArtwork={handleArtworkUpload}
          onClearArtwork={clearArtwork}
          artworkLoading={artworkLoading}
          isAdmin={isAdmin}
          onReloadCylinders={reloadCylinders}
        />
      ) : (
        <CuttingDesignTab
          inputs={inputs}
          setNum={setNum}
          top5={top5}
          magRanked={magRanked}
          printStep={printStep}
          cross={cross}
          onUploadArtwork={handleArtworkUpload}
          onClearArtwork={clearArtwork}
          artworkLoading={artworkLoading}
        />
      )}
    </div>
  );
}

// ─── Inputs panel (shared between Print + Cut) ──────────────────────
function InputsPanel({
  inputs,
  setNum,
  set,
  issues,
  errorFields,
  warnFields,
  gapSuggestion,
  applyGapSuggestion,
}) {
  return (
    <div className="gc-card gc-inputs-card">
      <div className="gc-card-hdr">
        <span className="gc-card-icon">⚙</span>
        <div style={{ flex: 1 }}>
          <b>Inputs</b>
          <span className="gc-bi-vi"> · Thông số đầu vào</span>
        </div>
        {issues.length === 0 && (
          <span className="gc-pill gc-pill-good" title="All required fields filled">
            ✓ Ready · Sẵn sàng
          </span>
        )}
      </div>

      {issues.length > 0 && <ValidationBanner issues={issues} />}

      <div className="gc-card-body">
        <Section title="1A. Down-web (chiều chạy)">
          <Field
            en="L — Product length down-web"
            vi="Chiều dài sản phẩm theo chiều chạy"
            unit="mm"
            required
            invalid={errorFields.has('L')}
            warn={warnFields.has('L')}
            value={inputs.L}
            onChange={setNum('L')}
          />
          <Field
            en="G — Target gap between products"
            vi="Gap mục tiêu giữa các sản phẩm"
            unit="mm"
            required
            invalid={errorFields.has('G')}
            warn={warnFields.has('G')}
            value={inputs.G}
            onChange={setNum('G')}
            footer={
              gapSuggestion && (
                <GapSuggestion
                  suggestion={gapSuggestion}
                  currentG={inputs.G}
                  onApply={applyGapSuggestion}
                />
              )
            }
          />
          <Field
            en="G_min — Min acceptable gap"
            vi="Gap tối thiểu chấp nhận"
            unit="mm"
            hint="Default 2.0 — die-cut min"
            value={inputs.G_min}
            onChange={setNum('G_min')}
          />
          <Field
            en="G_max — Max acceptable gap"
            vi="Gap tối đa chấp nhận"
            unit="mm"
            hint="Default 8.0 — over này phí web"
            value={inputs.G_max}
            onChange={setNum('G_max')}
          />
          <Field
            en="K — Print zone overhead"
            vi="Vùng cylinder không in (clamp + reg marks)"
            unit="mm"
            hint="Default 9.9 — Gallus ECS340"
            warn={warnFields.has('K')}
            value={inputs.K}
            onChange={setNum('K')}
          />
          {/* Sprint S-PARTS — optional layout target (parts down per
              cylinder rev). When > 0, ranking surfaces cylinders whose
              n_down matches ahead of pure-yield winners. */}
          <Field
            en="Part in MD — target parts down (optional)"
            vi="Số sản phẩm chiều chạy mong muốn (tùy chọn)"
            unit="pcs"
            hint="0 = no preference · auto-optimise"
            value={inputs.parts_md}
            onChange={setNum('parts_md')}
          />
          <CheckField
            en="Filter — only available cylinders"
            vi="Chỉ rank cylinder có sẵn"
            checked={inputs.only_available}
            onChange={(v) => set('only_available', v)}
          />
        </Section>

        <Section title="1B. Cross-web (chiều ngang web)">
          <Field
            en="W — Total web width"
            vi="Chiều rộng web tổng (đo từ mép đến mép)"
            unit="mm"
            required
            invalid={errorFields.has('W')}
            warn={warnFields.has('W')}
            value={inputs.W}
            onChange={setNum('W')}
          />
          <Field
            en="Pw — Product width (cross-direction)"
            vi="Chiều rộng 1 sản phẩm theo chiều ngang"
            unit="mm"
            required
            invalid={errorFields.has('Pw')}
            value={inputs.Pw}
            onChange={setNum('Pw')}
          />
          {/* Sprint S-FLEXO-1 — bleed inflates print footprint for
              cylinder selection. CCL Vietnam standard 2 mm/side for
              self-adhesive labels; set 0 for guillotine-trim sheet. */}
          <Field
            en="Bleed — print bleed per side"
            vi="Bleed tràn mép mỗi cạnh"
            unit="mm"
            hint="2 mm = standard label · 0 = sheet/guillotine"
            value={inputs.bleed_mm}
            onChange={setNum('bleed_mm')}
          />
          <Field
            en="E — Edge margin per side"
            vi="Vùng mép web không in"
            unit="mm"
            hint="Default 5 mm/side"
            value={inputs.E}
            onChange={setNum('E')}
          />
          <Field
            en="Lg — Target lane gap (cross-direction)"
            vi="Gap mục tiêu giữa các lane"
            unit="mm"
            hint="Default 2.5 mm"
            value={inputs.Lg}
            onChange={setNum('Lg')}
          />
          {/* Sprint S-PARTS — optional layout target (lanes across the
              web). When > 0, ranking flags cylinders whose n_across
              matches; a "Layout match" winner card surfaces if both
              parts_td and parts_md are hit by the same cylinder. */}
          <Field
            en="Part in TD — target lanes across (optional)"
            vi="Số lane chiều ngang mong muốn (tùy chọn)"
            unit="lanes"
            hint="0 = no preference · auto-optimise"
            value={inputs.parts_td}
            onChange={setNum('parts_td')}
          />
        </Section>

        <Section title="1C. Die-cut & cost / Khuôn cắt & chi phí">
          <Field
            en="Z_die — Die-cut cylinder teeth (override)"
            vi="Răng cylinder die-cut (0 = dùng cùng cylinder in)"
            unit="T"
            hint="0 = same as print"
            value={inputs.Z_die}
            onChange={setNum('Z_die')}
          />
          <Field
            en="Plate cost"
            vi="Đơn giá khuôn in"
            unit="USD/m²"
            hint="Flexo digital ~$80"
            value={inputs.plate_cost}
            onChange={setNum('plate_cost')}
          />
          <Field
            en="Web length / job (running m)"
            vi="Chiều dài cuộn web cho 1 job (mét chạy)"
            unit="m"
            hint="Bidirectional — edits Lot Q'ty too"
            value={inputs.web_length_m}
            onChange={setNum('web_length_m')}
          />
          <Field
            en="Lot run Q'ty (pieces)"
            vi="Số lượng cần in 1 lot (cái)"
            unit="pcs"
            hint="Bidirectional — edits Web length too"
            value={inputs.lot_run_qty}
            onChange={setNum('lot_run_qty')}
          />
          <Field
            en="# Print colors"
            vi="Số màu in (số plate)"
            unit=""
            value={inputs.n_colors}
            onChange={setNum('n_colors')}
          />
          {/* Sprint S-FLEXO-3 — plate gripper + tape gutter overhead. */}
          <Field
            en="Plate overhead — gripper + tape gutter"
            vi="Phần plate tape & gripper"
            unit="mm"
            hint="Default 13 mm (CCL standard)"
            value={inputs.plate_overhead_mm}
            onChange={setNum('plate_overhead_mm')}
          />
          {/* Sprint S-FLEXO-2 — setup waste before first sellable imp */}
          <Field
            en="Setup waste — material before 1st good imp"
            vi="Material hao setup (m chạy)"
            unit="m"
            hint="100 m × n_colors typical · 0 = rerun"
            value={inputs.setup_waste_m}
            onChange={setNum('setup_waste_m')}
          />
        </Section>

        {/* Sprint S-FLEXO-2 — Ink + Anilox section */}
        <Section title="1D. Ink & Anilox / Mực & Anilox">
          <SelectField
            en="Material type"
            vi="Loại vật liệu"
            value={inputs.material_type || 'paper'}
            onChange={(v) => set('material_type', v)}
            options={[
              { value: 'paper', label: 'Paper (no stretch)' },
              { value: 'pet', label: 'PET (~0.1 % stretch)' },
              { value: 'pe', label: 'PE (~0.6 % stretch)' },
              { value: 'bopp', label: 'BOPP (~0.5 % stretch)' },
              { value: 'vinyl', label: 'Vinyl / PVC (~0.3 % stretch)' },
              { value: 'custom', label: 'Custom — set stretch %' },
            ]}
          />
          {inputs.material_type === 'custom' && (
            <Field
              en="Stretch (custom)"
              vi="Độ giãn (custom)"
              unit="%"
              hint="Override material stretch"
              value={inputs.stretch_pct}
              onChange={setNum('stretch_pct')}
            />
          )}
          <Field
            en="Coverage per color"
            vi="Tỷ lệ phủ mực mỗi màu"
            unit="%"
            hint="30 = standard process · 60+ = solid spot"
            value={inputs.coverage_pct}
            onChange={setNum('coverage_pct')}
          />
          <Field
            en="Anilox volume"
            vi="Volume anilox"
            unit="BCM"
            hint="4-12 — engine recommends below"
            value={inputs.anilox_bcm}
            onChange={setNum('anilox_bcm')}
          />
          <Field
            en="Ink density"
            vi="Tỷ trọng mực"
            unit="g/cm³"
            hint="1.0 water · 1.1 UV · 1.4 metallic"
            value={inputs.ink_density_g_cm3}
            onChange={setNum('ink_density_g_cm3')}
          />
        </Section>

        {/* Sprint S-FLEXO-3 — Weighted scoring profile */}
        <Section title="1E. Ranking weights / Trọng số xếp hạng">
          <Field
            en="Yield weight"
            vi="Trọng số material yield"
            unit=""
            hint="Higher = prefer waste-minimising cylinder"
            value={inputs.weight_yield}
            onChange={setNum('weight_yield')}
          />
          <Field
            en="Cost weight"
            vi="Trọng số cost / 1k imp"
            unit=""
            hint="Higher = prefer plate-cost-minimising cylinder"
            value={inputs.weight_cost}
            onChange={setNum('weight_cost')}
          />
          <Field
            en="Gap match weight"
            vi="Trọng số khớp gap target G"
            unit=""
            hint="Higher = prefer cylinder closest to your G"
            value={inputs.weight_gap}
            onChange={setNum('weight_gap')}
          />
          <Field
            en="Layout match weight"
            vi="Trọng số khớp Part MD/TD"
            unit=""
            hint="Higher = prefer cylinder hitting parts targets"
            value={inputs.weight_match}
            onChange={setNum('weight_match')}
          />
        </Section>
      </div>
    </div>
  );
}

// ─── Print Design tab content ───────────────────────────────────
function PrintDesignTab({
  ranked,
  top5,
  cross,
  summary,
  inputs,
  winners,
  webSuggestion,
  layout,
  set,
  onUploadArtwork,
  onClearArtwork,
  artworkLoading,
  isAdmin,
  onReloadCylinders,
}) {
  return (
    <div className="gc-tab-body">
      {/* Sprint 14h — multi-axis winner badges. Three picks for three
          job profiles: yield (high-volume), cost (small-volume), gap
          match (when operator's G is a strict spec). */}
      <WinnersBar winners={winners} inputs={inputs} />

      {/* Sprint S-FLEXO-4 — die-risk pill bound to top-1 lane gap.
          Rises to "risk" if lane_gap < die min (1.5 mm magnetic), warn
          if within 30 % headroom. */}
      {top5[0] && cross.n_across > 1 && <DieRiskPill cross={cross} />}

      {/* Sprint S-FLEXO-2 — anilox + ink consumption banner derived
          from top-1 cylinder + coverage + bcm. Surfaces "you'll burn
          X kg of ink across N colors" + the recommended BCM. */}
      {top5[0] && <InkBanner top1={top5[0]} cross={cross} inputs={inputs} />}

      {/* Sprint S-FLEXO-5 — color sequence validation issues, when
          color_sequence is non-empty (default CMYK loaded). */}
      <ColorSequencePanel sequence={inputs.color_sequence || []} />

      {webSuggestion && (
        <WebSuggestionBanner
          sug={webSuggestion}
          onApply={() => set('W', webSuggestion.suggested_mm)}
        />
      )}

      {/* Sprint S-DESIGNER (2026-04-30) — designer-mode banner. When the
          operator sets parts_md or parts_td, surface the required
          cylinder + web width up-front so they can either (a) accept the
          locked layout, (b) widen the web, or (c) clear the target. */}
      {layout.mode !== 'solver' && (
        <DesignerModeBanner
          layout={layout}
          inputs={inputs}
          onClearTargets={() => {
            set('parts_md', 0);
            set('parts_td', 0);
          }}
          onApplyW={() => set('W', Math.ceil(layout.W_required))}
        />
      )}

      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#0f62fe' }}>
            ★
          </span>
          <div>
            <b>
              {layout.mode === 'solver'
                ? '2. Top 5 recommended cylinders (sorted by yield)'
                : `2. Cylinders matching target N=${layout.target_md || '–'} × n=${layout.target_td || '–'} (Designer mode)`}
            </b>
            <span className="gc-bi-vi">
              {layout.mode === 'solver'
                ? ' · Top 5 cylinder — sort theo yield (giảm waste)'
                : ` · Designer mode — N down và n across đã LOCK theo target của bạn`}
            </span>
          </div>
        </div>
        <div className="gc-card-body gc-flush">
          {top5.length === 0 ? (
            <Empty
              en="No cylinder satisfies the inputs. Loosen G_min / G_max or untick the availability filter."
              vi="Không có cylinder nào thoả mãn. Nới G_min/G_max hoặc bỏ tick lọc sẵn có."
            />
          ) : (
            <table className="gc-table">
              <thead>
                <tr>
                  <th className="ttl">Rank</th>
                  <th className="ttl">Z (T)</th>
                  <th className="ttl">Pitch (mm)</th>
                  <th className="ttl">N down</th>
                  <th className="ttl">Actual gap</th>
                  <th className="ttl">★ Yield %</th>
                  <th className="ttl">Cost / 1k imp</th>
                  <th className="ttl">Step / Lay</th>
                  <th className="ttl">Gap diff</th>
                  <th className="ttl">Status</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((r, i) => (
                  <tr key={r.z} className={i === 0 ? 'gc-row-best' : ''}>
                    <td className="num">{i + 1}</td>
                    <td className="num">
                      <b>{r.z}</b>
                    </td>
                    <td className="num">{fmt.n(r.pitch, 2)}</td>
                    <td className="num">{r.n_down}</td>
                    <td className="num">{fmt.n(r.actual_gap, 3)}</td>
                    <td className="num">
                      <b style={{ color: '#0e6027' }}>{fmt.pct(r.material_yield_pct)}</b>
                    </td>
                    <td className="num">
                      {Number.isFinite(r.cost_per_1k) ? `$${fmt.n(r.cost_per_1k, 4)}` : '—'}
                    </td>
                    <td className="num">{fmt.n(r.step_lay, 3)}</td>
                    <td className="num">{fmt.n(r.gap_diff, 3)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sprint 14f — visual schematic of one cylinder revolution.
          Shows the operator the actual layout (cells, gaps, edges,
          K overhead) at the top-1 cylinder's geometry. Uses the same
          inputs + result that drive the Top-5 table above so any
          input change re-draws the SVG instantly.
          Sprint 14h — operator can drop an artwork PNG/SVG to overlay
          on each product cell for visual confirmation. */}
      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#0043ce' }}>
            ▦
          </span>
          <div style={{ flex: 1 }}>
            <b>Shot layout schematic</b>
            <span className="gc-bi-vi"> · Sơ đồ layout 1 shot (1 vòng cylinder)</span>
          </div>
          <ArtworkUploadButton
            current={inputs.artwork_filename}
            loading={artworkLoading}
            onUpload={onUploadArtwork}
            onClear={onClearArtwork}
          />
        </div>
        <div className="gc-card-body gc-flush">
          <ShotLayoutViz
            inputs={inputs}
            result={top5[0]}
            cross={cross}
            artworkUrl={inputs.artwork_data_url}
          />
        </div>
      </div>

      <CrossDirectionCard inputs={inputs} cross={cross} />

      <JobSummaryCard summary={summary} />

      <MasterPrintTable ranked={ranked} isAdmin={isAdmin} onReload={onReloadCylinders} />
    </div>
  );
}

function CrossDirectionCard({ inputs, cross }) {
  return (
    <div className="gc-card">
      <div className="gc-card-hdr">
        <span className="gc-card-icon" style={{ color: '#059669' }}>
          ↔
        </span>
        <div>
          <b>5. Cross-direction analysis</b>
          <span className="gc-bi-vi"> · Phân tích chiều ngang web</span>
        </div>
      </div>
      {cross.lane_gap_below_target && (
        <div className="gc-validation gc-val-warn" style={{ borderTop: '1px solid #e0e0e0' }}>
          <div className="gc-val-hdr">
            <span aria-hidden>⚠</span>
            <b>Lane gap below target · Gap lane dưới mức target</b>
          </div>
          <div className="gc-val-list" style={{ paddingLeft: 22, fontSize: 11 }}>
            Actual {fmt.n(cross.lane_gap_actual, 2)} mm &lt; target Lg {fmt.n(inputs.Lg, 2)} mm.
            Layout vẫn fit được {cross.n_across} lanes vật lý — chấp nhận hoặc tăng Lg để giảm số
            lane.
          </div>
        </div>
      )}
      <div className="gc-card-body gc-grid-kv">
        <KV en="Web width — W" vi="Chiều rộng web" v={`${fmt.n(inputs.W, 1)} mm`} />
        <KV en="Product width — Pw" vi="Chiều rộng sản phẩm" v={`${fmt.n(inputs.Pw, 1)} mm`} />
        <KV en="Edge margin per side — E" vi="Mép mỗi bên" v={`${fmt.n(inputs.E, 1)} mm`} />
        <KV
          en="Available width = W − 2E"
          vi="Chiều rộng khả dụng"
          v={`${fmt.n(cross.avail, 1)} mm`}
        />
        <KV
          en="# Across (max lanes)"
          vi="Số lane chiều ngang"
          v={cross.n_across || '—'}
          highlight
        />
        <KV
          en="Lane gap actual"
          vi="Gap thực tế giữa lanes"
          v={cross.n_across > 1 ? `${fmt.n(cross.lane_gap_actual, 2)} mm` : '—'}
        />
        <KV en="Lane gap target" vi="Gap mục tiêu" v={`${fmt.n(inputs.Lg, 2)} mm`} />
        <KV en="Cross-dir Film %" vi="% phủ chiều ngang" v={fmt.pct(cross.cross_film_pct)} />
      </div>
    </div>
  );
}

function JobSummaryCard({ summary }) {
  if (!summary) {
    return (
      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#525252' }}>
            ≡
          </span>
          <div>
            <b>4. Job summary</b>
            <span className="gc-bi-vi"> · Tóm tắt job</span>
          </div>
        </div>
        <div className="gc-card-body">
          <Empty
            en="No OK cylinder yet — fill inputs above."
            vi="Chưa có cylinder phù hợp — điền inputs ở trên."
          />
        </div>
      </div>
    );
  }
  return (
    <div className="gc-card">
      <div className="gc-card-hdr">
        <span className="gc-card-icon" style={{ color: '#525252' }}>
          ≡
        </span>
        <div>
          <b>4. Job summary</b>
          <span className="gc-bi-vi"> · Tóm tắt job (dùng Top 1 cylinder)</span>
        </div>
      </div>
      <div className="gc-card-body gc-grid-kv">
        <KV
          en="Recommended cylinder"
          vi="Cylinder đề xuất"
          v={`Z = ${summary.cylinder_z} (${fmt.n(summary.pitch, 2)} mm)`}
          highlight
        />
        <KV en="Step / Lay" vi="Step (chiều chạy)" v={`${fmt.n(summary.step, 3)} mm`} />
        <KV
          en="N down × N across"
          vi="Layout (MD × TD)"
          v={`${summary.n_down} × ${summary.n_across}`}
        />
        <KV
          en="Pieces per running meter"
          vi="Sản phẩm / mét web"
          v={`${fmt.n(summary.pieces_per_m, 2)} pcs/m`}
        />
        <KV
          en="Lot run Q'ty (resolved)"
          vi="Số lượng lot (đã quy đổi)"
          v={fmt.i(summary.lot_run_qty)}
          highlight
        />
        <KV en="Web length consumed" vi="Web tiêu thụ" v={`${fmt.n(summary.web_used_m, 1)} m`} />
        <KV
          en="Material area"
          vi="Diện tích vật liệu"
          v={`${fmt.n(summary.material_area_m2, 2)} m²`}
        />
        <KV en="Cylinder revolutions" vi="Số vòng cylinder cần" v={fmt.i(summary.revolutions)} />
        <KV en="Imp / cylinder rev" vi="Imp mỗi vòng" v={summary.total_imp_rev} />
        <KV
          en="Total impressions / job"
          vi="Tổng impressions"
          v={fmt.i(summary.total_imp)}
          highlight
        />
        <KV
          en="Plate area / color"
          vi="Diện tích plate / màu"
          v={`${fmt.n(summary.plate_area_per_color, 4)} m²`}
        />
        <KV
          en="Total plate area (× n colors)"
          vi={`Tổng plate (${summary.n_down ? fmt.i(summary.total_plate_area / summary.plate_area_per_color || 0) : '?'} màu)`}
          v={`${fmt.n(summary.total_plate_area, 4)} m²`}
        />
        <KV
          en="★ Total plate cost"
          vi="Tổng chi phí plate"
          v={`$${fmt.n(summary.total_plate_cost, 2)}`}
          highlight
        />
        <KV
          en="Cost per 1,000 imp"
          vi="Chi phí / 1,000 imp"
          v={`$${fmt.n(summary.cost_per_1k_imp, 4)}`}
        />
      </div>
    </div>
  );
}

function MasterPrintTable({ ranked, isAdmin, onReload }) {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('available'); // 'available' | 'all' | 'ok'
  // Sprint 1.7j — admin add-row + per-row toggle.
  const [addOpen, setAddOpen] = useState(false);
  const [newZ, setNewZ] = useState('');
  const [newNote, setNewNote] = useState('');
  const [busyZ, setBusyZ] = useState(null); // Z currently mid-toggle (UI lock)

  const filtered = useMemo(() => {
    let list = ranked;
    if (filter === 'available') list = list.filter((r) => r.available);
    else if (filter === 'ok') list = list.filter((r) => r.status === 'OK');
    return showAll ? list : list.slice(0, 30);
  }, [ranked, filter, showAll]);

  // Sprint 1.7j — flip Y↔N. Optimistic UI: lock the row briefly then
  // refetch so the engine re-ranks with the new availability.
  const toggleAvail = useCallback(
    async (z, currentlyAvailable) => {
      setBusyZ(z);
      try {
        await costApi.updateMasterCylinder(z, { available: !currentlyAvailable });
        await onReload?.();
        showToast(`Z=${z} → ${!currentlyAvailable ? 'Y' : 'N'}`, 'ok');
      } catch (err) {
        showToast(`Update failed: ${err?.message || 'unknown'}`, 'err');
      } finally {
        setBusyZ(null);
      }
    },
    [onReload]
  );

  const submitAdd = useCallback(async () => {
    const z = parseInt(newZ, 10);
    if (!Number.isFinite(z) || z < 1 || z > 999) {
      showToast('Z must be 1–999', 'err');
      return;
    }
    try {
      await costApi.addMasterCylinder({ z, available: true, note: newNote });
      await onReload?.();
      showToast(`Cylinder Z=${z} added`, 'ok');
      setNewZ('');
      setNewNote('');
      setAddOpen(false);
    } catch (err) {
      showToast(`Add failed: ${err?.message || 'unknown'}`, 'err');
    }
  }, [newZ, newNote, onReload]);

  return (
    <div className="gc-card">
      <div className="gc-card-hdr">
        <span className="gc-card-icon" style={{ color: '#7c3aed' }}>
          ☰
        </span>
        <div style={{ flex: 1 }}>
          <b>3. Master cylinder table</b>
          <span className="gc-bi-vi"> · Bảng tổng cylinder (Z = 60..220)</span>
        </div>
        <div className="gc-card-toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="gc-select">
            <option value="available">Available only · Chỉ cylinder có sẵn</option>
            <option value="ok">OK only · Chỉ status OK</option>
            <option value="all">All · Tất cả</option>
          </select>
          <button className="gc-mini-btn" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Top 30' : `Show all (${ranked.length})`}
          </button>
          {/* Sprint 1.7j — admin-only "+ Add row" trigger */}
          {isAdmin && (
            <button
              className="gc-mini-btn"
              onClick={() => setAddOpen((o) => !o)}
              title="Add a brand-new cylinder Z (eg. just-purchased)"
            >
              {addOpen ? 'Cancel' : '+ Add cylinder'}
            </button>
          )}
        </div>
      </div>
      {/* Sprint 1.7j — admin inline add form */}
      {isAdmin && addOpen && (
        <div className="gc-card-body gc-add-cyl-form">
          <label className="gc-add-cyl-row">
            <span>Z (tooth count)</span>
            <input
              type="number"
              min="1"
              max="999"
              value={newZ}
              onChange={(e) => setNewZ(e.target.value)}
              placeholder="221"
              className="gc-add-cyl-input"
              autoFocus
            />
          </label>
          <label className="gc-add-cyl-row">
            <span>Note (optional)</span>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="eg. New purchase 2026-04 from supplier X"
              maxLength={200}
              className="gc-add-cyl-input"
            />
          </label>
          <button className="gc-mini-btn gc-mini-btn-primary" onClick={submitAdd}>
            Save cylinder
          </button>
          <span className="gc-add-cyl-hint">
            Defaults to <b>available = Y</b>; toggle in the table after.
          </span>
        </div>
      )}
      <div className="gc-card-body gc-flush">
        <table className="gc-table gc-table-compact">
          <thead>
            <tr>
              <th className="ttl">Z</th>
              <th className="ttl">Avail</th>
              <th className="ttl">RL (in)</th>
              <th className="ttl">Pitch (mm)</th>
              <th className="ttl">N down</th>
              <th className="ttl">Actual gap</th>
              <th className="ttl">Product %</th>
              <th className="ttl">Gallus %</th>
              <th className="ttl">Step (mm)</th>
              <th className="ttl">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.z} className={r.available ? '' : 'gc-row-dim'}>
                <td className="num">
                  <b>{r.z}</b>
                </td>
                <td>
                  {/* Sprint 1.7j — admin sees a clickable pill (Y↔N
                      toggle); other roles see the static badge as before. */}
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`gc-pill gc-pill-toggle ${r.available ? 'gc-pill-good' : 'gc-pill-neutral'}`}
                      disabled={busyZ === r.z}
                      onClick={() => toggleAvail(r.z, r.available)}
                      title={`Click to set Z=${r.z} availability to ${r.available ? 'N' : 'Y'}`}
                    >
                      {busyZ === r.z ? '…' : r.available ? 'Y' : 'N'}
                    </button>
                  ) : r.available ? (
                    <span className="gc-pill gc-pill-good">Y</span>
                  ) : (
                    <span className="gc-pill gc-pill-neutral">N</span>
                  )}
                </td>
                <td className="num">{fmt.n(r.rl_inch, 3)}</td>
                <td className="num">{fmt.n(r.pitch, 2)}</td>
                <td className="num">{r.n_down || '—'}</td>
                <td className="num">{fmt.n(r.actual_gap, 3)}</td>
                <td className="num">{fmt.pct(r.product_film_pct)}</td>
                <td className="num">{fmt.pct(r.gallus_film_pct)}</td>
                <td className="num">{fmt.n(r.step_lay, 3)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cutting Design (Die-cut) tab content ───────────────────────
function CuttingDesignTab({
  inputs,
  setNum,
  top5,
  magRanked,
  printStep,
  cross,
  onUploadArtwork,
  onClearArtwork,
  artworkLoading,
}) {
  const top3 = magRanked.slice(0, 3);
  // For the Cut tab schematic, override the cylinder with the chosen
  // die when one is set — operator wants to see the die layout, not the
  // print layout. Falls back to the print Top-1 when no die is locked
  // in (so the schematic is always populated).
  const cutResult = useMemo(() => {
    const printTop = top5[0];
    if (!printTop) return null;
    const chosenDie =
      inputs.Z_die > 0 ? magRanked.find((r) => r.z === inputs.Z_die) : top3[0] || null;
    if (!chosenDie) return printTop;
    return {
      ...printTop,
      cylinder_z: chosenDie.z,
      pitch: chosenDie.pitch,
      n_down: chosenDie.n_die || printTop.n_down,
      step_lay: chosenDie.die_step,
      // Re-derive actual_gap on the die geometry so the schematic
      // shows the TRUE gap the die will produce (which may differ
      // slightly from the print step when the match is "near" not "✓").
      actual_gap: chosenDie.die_step - (Number(inputs.L) || 0),
    };
  }, [top5, top3, magRanked, inputs.Z_die, inputs.L]);

  return (
    <div className="gc-tab-body">
      {/* Sprint 14f — Cut-side shot layout schematic. Mirrors the Print
          tab's viz but uses the chosen Z_die (or the auto-suggested
          Top-1 magnetic) so the operator sees how the die outputs
          actually fall on the web after die-cut. */}
      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#0043ce' }}>
            ▦
          </span>
          <div style={{ flex: 1 }}>
            <b>Die-cut shot schematic</b>
            <span className="gc-bi-vi"> · Sơ đồ layout 1 vòng die-cut</span>
          </div>
          <ArtworkUploadButton
            current={inputs.artwork_filename}
            loading={artworkLoading}
            onUpload={onUploadArtwork}
            onClear={onClearArtwork}
          />
        </div>
        <div className="gc-card-body gc-flush">
          <ShotLayoutViz
            inputs={inputs}
            result={cutResult}
            cross={cross}
            artworkUrl={inputs.artwork_data_url}
          />
        </div>
      </div>

      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#0f62fe' }}>
            ★
          </span>
          <div>
            <b>6a. Top 3 magnetic cylinders matching print step</b>
            <span className="gc-bi-vi"> · Top 3 die-cut khớp print step</span>
          </div>
        </div>
        <div className="gc-card-body gc-flush">
          {!top5[0] ? (
            <Empty
              en="Need a Top-1 print cylinder first — go to Print Design."
              vi="Cần có cylinder in Top-1 trước — chuyển sang Print Design."
            />
          ) : top3.length === 0 ? (
            <Empty
              en="No magnetic cylinder fits the inputs."
              vi="Không có magnetic die nào phù hợp."
            />
          ) : (
            <table className="gc-table">
              <thead>
                <tr>
                  <th className="ttl">Rank</th>
                  <th className="ttl">Z_die (T)</th>
                  <th className="ttl">Qty in stock</th>
                  <th className="ttl">Pitch (mm)</th>
                  <th className="ttl">N_die</th>
                  <th className="ttl">Die step (mm)</th>
                  <th className="ttl">Step diff (mm)</th>
                  <th className="ttl">Match</th>
                  <th className="ttl">Note</th>
                </tr>
              </thead>
              <tbody>
                {top3.map((r, i) => (
                  <tr key={r.z} className={i === 0 ? 'gc-row-best' : ''}>
                    <td className="num">{i + 1}</td>
                    <td className="num">
                      <b>{r.z}</b>
                    </td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{fmt.n(r.pitch, 2)}</td>
                    <td className="num">{r.n_die}</td>
                    <td className="num">{fmt.n(r.die_step, 3)}</td>
                    <td className="num">{fmt.n(r.step_diff, 4)}</td>
                    <td>
                      <StatusBadge status={r.match} />
                    </td>
                    <td>{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ManualOverrideCard
        inputs={inputs}
        setNum={setNum}
        top5={top5}
        magRanked={magRanked}
        printStep={printStep}
      />

      <div className="gc-card">
        <div className="gc-card-hdr">
          <span className="gc-card-icon" style={{ color: '#7c3aed' }}>
            ☰
          </span>
          <div>
            <b>6b. Magnetic master inventory (22 cylinders)</b>
            <span className="gc-bi-vi"> · Bảng tổng 22 magnetic xưởng có</span>
          </div>
        </div>
        <div className="gc-card-body gc-flush">
          <table className="gc-table gc-table-compact">
            <thead>
              <tr>
                <th className="ttl">Z_die</th>
                <th className="ttl">Qty</th>
                <th className="ttl">Pitch (mm)</th>
                <th className="ttl">N_die</th>
                <th className="ttl">Die step (mm)</th>
                <th className="ttl">Step diff (mm)</th>
                <th className="ttl">Match</th>
                <th className="ttl">Note</th>
              </tr>
            </thead>
            <tbody>
              {magRanked.length === 0 && (
                <tr>
                  <td colSpan={8} className="gc-empty">
                    Set a Top-1 print cylinder to populate this table.
                  </td>
                </tr>
              )}
              {magRanked.map((r) => (
                <tr key={r.z}>
                  <td className="num">
                    <b>{r.z}</b>
                  </td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{fmt.n(r.pitch, 2)}</td>
                  <td className="num">{r.n_die}</td>
                  <td className="num">{fmt.n(r.die_step, 3)}</td>
                  <td className="num">{fmt.n(r.step_diff, 4)}</td>
                  <td>
                    <StatusBadge status={r.match} />
                  </td>
                  <td>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ManualOverrideCard({ inputs, setNum, top5, magRanked, printStep }) {
  const top1 = top5[0];
  const customZ = inputs.Z_die > 0 ? inputs.Z_die : top1?.z || 0;
  const customMag = magRanked.find((r) => r.z === customZ);
  return (
    <div className="gc-card">
      <div className="gc-card-hdr">
        <span className="gc-card-icon" style={{ color: '#b45309' }}>
          ✎
        </span>
        <div>
          <b>6c. Manual override</b>
          <span className="gc-bi-vi"> · Engineer chọn Z_die thủ công</span>
        </div>
      </div>
      <div className="gc-card-body gc-grid-kv">
        <KV en="Print cylinder Z" vi="Cylinder in" v={top1?.z ?? '—'} />
        <KV en="Print step" vi="Step in" v={`${fmt.n(printStep, 3)} mm`} />
        <div className="gc-kv">
          <span className="gc-k">
            <span>Z_die override</span>
            <span className="gc-bi-vi">Z_die thủ công (0 = same as print)</span>
          </span>
          <DecimalInput value={inputs.Z_die} onChange={setNum('Z_die')} className="gc-input" />
        </div>
        {customMag ? (
          <>
            <KV en="Die pitch" vi="Pitch die" v={`${fmt.n(customMag.pitch, 2)} mm`} />
            <KV en="N_die" vi="N_die" v={customMag.n_die} />
            <KV
              en="Die step actual"
              vi="Die step thực tế"
              v={`${fmt.n(customMag.die_step, 3)} mm`}
            />
            <KV en="Step difference" vi="Sai lệch step" v={`${fmt.n(customMag.step_diff, 4)} mm`} />
            <div className="gc-kv">
              <span className="gc-k">
                <span>Match status</span>
                <span className="gc-bi-vi">Trạng thái khớp</span>
              </span>
              <span>
                <StatusBadge status={customMag.match} />
              </span>
            </div>
          </>
        ) : (
          <Empty
            en="Pick a Z_die that exists in the magnetic inventory above."
            vi="Chọn Z_die có trong bảng magnetic inventory ở trên."
          />
        )}
      </div>
    </div>
  );
}

// ─── Reusable atoms ─────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="gc-section">
      <div className="gc-section-hdr">{title}</div>
      <div className="gc-section-grid">{children}</div>
    </div>
  );
}

function Field({
  en,
  vi,
  unit,
  hint,
  value,
  onChange,
  required = false,
  invalid = false,
  warn = false,
  footer = null,
}) {
  // CSS class composes: base + invalid (red border + bg) OR warn (amber).
  // `required` shows a small red asterisk so the operator scans the form
  // and immediately knows which fields the calc cannot proceed without.
  const cls = `gc-input${invalid ? ' gc-input-invalid' : warn ? ' gc-input-warn' : ''}`;
  return (
    <div className="gc-field">
      <label>
        <span className="gc-l-en">
          {en}
          {unit ? <span className="gc-l-unit"> ({unit})</span> : null}
          {required && (
            <span className="gc-l-req" title="Required · Bắt buộc">
              *
            </span>
          )}
        </span>
        <span className="gc-l-vi">{vi}</span>
        {hint && <span className="gc-l-hint">{hint}</span>}
      </label>
      <DecimalInput value={value} onChange={onChange} className={cls} />
      {footer}
    </div>
  );
}

function ValidationBanner({ issues }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  return (
    <div className={`gc-validation ${errors.length > 0 ? 'gc-val-err' : 'gc-val-warn'}`}>
      <div className="gc-val-hdr">
        <span aria-hidden>{errors.length > 0 ? '⛔' : '⚠'}</span>
        {errors.length > 0 ? (
          <b>
            {errors.length} required field{errors.length > 1 ? 's' : ''} missing · {errors.length}{' '}
            trường bắt buộc còn thiếu
          </b>
        ) : (
          <b>
            {warns.length} warning{warns.length > 1 ? 's' : ''} · {warns.length} cảnh báo
          </b>
        )}
      </div>
      <ul className="gc-val-list">
        {issues.map((iss, i) => (
          <li key={i} className={`gc-val-item gc-val-${iss.severity}`}>
            <span className="gc-val-tag">{iss.field}</span>
            <span className="gc-val-en">{iss.en}</span>
            <span className="gc-val-vi">{iss.vi}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GapSuggestion({ suggestion, currentG, onApply }) {
  if (!suggestion) return null;
  const { gap, cylinder_z, n_down, reason, product_film_pct } = suggestion;
  const needsApply = Math.abs(Number(currentG) - gap) > 0.005;
  // Display formatter — 3 dp keeps readability without losing the
  // engineering precision operators need (we apply the RAW value, the
  // display is just a visual aid).
  const dpy = (g) => Number(g).toFixed(3);
  if (reason === 'already_optimal') {
    return (
      <div className="gc-suggest gc-suggest-good">
        <span aria-hidden>✓</span>
        <span>
          <b>Optimal · Tối ưu</b> — your G fits Z={cylinder_z} exactly with N={n_down}, film{' '}
          {(product_film_pct * 100).toFixed(1)}%.
          <span className="gc-bi-vi"> Gap hiện tại đã khớp chính xác cylinder Z={cylinder_z}.</span>
        </span>
      </div>
    );
  }
  if (reason === 'no_ok_at_current_g') {
    return (
      <div className="gc-suggest gc-suggest-warn">
        <span aria-hidden>💡</span>
        <span>
          <b>No OK match</b> at current G — try <b>{dpy(gap)} mm</b> for an exact fit with Z=
          {cylinder_z} (N={n_down}, film {(product_film_pct * 100).toFixed(1)}%).
          <span className="gc-bi-vi">
            {' '}
            Không có cylinder OK ở G hiện tại — thử {dpy(gap)} mm để khớp Z={cylinder_z}.
          </span>
        </span>
        {needsApply && (
          <button type="button" className="gc-suggest-apply" onClick={onApply}>
            Apply {dpy(gap)}
          </button>
        )}
      </div>
    );
  }
  // better_fit_available
  return (
    <div className="gc-suggest gc-suggest-info">
      <span aria-hidden>💡</span>
      <span>
        <b>Suggested · Đề xuất:</b> <b>{dpy(gap)} mm</b> for exact fit with Z={cylinder_z} (N=
        {n_down}, film {(product_film_pct * 100).toFixed(1)}%).
        <span className="gc-bi-vi">
          {' '}
          Đề xuất G={dpy(gap)} mm để khớp chính xác cylinder Z={cylinder_z}.
        </span>
      </span>
      <button type="button" className="gc-suggest-apply" onClick={onApply}>
        Apply {dpy(gap)}
      </button>
    </div>
  );
}

function CheckField({ en, vi, checked, onChange }) {
  return (
    <label className="gc-check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <div className="gc-l-en">{en}</div>
        <div className="gc-l-vi">{vi}</div>
      </span>
    </label>
  );
}

// Sprint S-FLEXO-2 — dropdown variant of Field for enum-style inputs
// (material type, die type). Same label structure; renders a select.
function SelectField({ en, vi, value, onChange, options }) {
  return (
    <div className="gc-field">
      <div className="gc-l">
        <div className="gc-l-en">{en}</div>
        <div className="gc-l-vi">{vi}</div>
      </div>
      <select className="gc-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function KV({ en, vi, v, highlight }) {
  return (
    <div className={`gc-kv ${highlight ? 'gc-kv-hi' : ''}`}>
      <span className="gc-k">
        <span>{en}</span>
        <span className="gc-bi-vi">{vi}</span>
      </span>
      <b className="gc-v">{v}</b>
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] || 'neutral';
  return <span className={`gc-pill gc-pill-${tone}`}>{status}</span>;
}

function Empty({ en, vi }) {
  return (
    <div className="gc-empty">
      <div>{en}</div>
      <div className="gc-bi-vi">{vi}</div>
    </div>
  );
}

// Sprint 14h — three-axis winners bar. Shows the best cylinder for
// each ranking criterion so the operator can pick the right one for
// the job profile (high-volume → yield, small-volume → cost, strict
// design spec → gap match). All three may be the same Z; banner
// collapses to a single "consensus" badge in that case.
function WinnersBar({ winners, inputs }) {
  if (!winners.yield) return null; // no OK candidates yet
  const same = winners.yield.z === winners.cost?.z && winners.yield.z === winners.gap?.z;
  if (same) {
    const w = winners.yield;
    return (
      <div className="gc-winners gc-winners-consensus">
        <span aria-hidden>🎯</span>
        <b>Consensus pick · Đề xuất tối ưu:</b>
        <span className="gc-winner-z">Z = {w.z}T</span>
        <span className="gc-winner-meta">
          yield {fmt.pct(w.material_yield_pct)} · gap {fmt.n(w.actual_gap, 2)} mm ·
          {Number.isFinite(w.cost_per_1k) ? ` $${fmt.n(w.cost_per_1k, 4)}/1k` : ''}
        </span>
      </div>
    );
  }
  return (
    <div className="gc-winners">
      <WinnerCard
        title="Yield winner"
        vi="Tối ưu vật liệu"
        axis="yield"
        cyl={winners.yield}
        rationale={`${fmt.pct(winners.yield.material_yield_pct)} of web → product. Best for HIGH VOLUME.`}
      />
      <WinnerCard
        title="Cost winner"
        vi="Rẻ nhất / 1k imp"
        axis="cost"
        cyl={winners.cost}
        rationale={
          winners.cost && Number.isFinite(winners.cost.cost_per_1k)
            ? `$${fmt.n(winners.cost.cost_per_1k, 4)} / 1,000 imp. Best for SMALL VOLUME.`
            : 'Set web length + plate cost to enable.'
        }
      />
      <WinnerCard
        title="Gap target"
        vi="Khớp G nhất"
        axis="gap"
        cyl={winners.gap}
        rationale={`gap ${fmt.n(winners.gap?.actual_gap || 0, 2)} mm — closest to your target G=${inputs.G} mm.`}
      />
      {/* Sprint S-PARTS — appears only when operator entered parts_md
          and/or parts_td. Shows the cylinder hitting BOTH targets when
          one exists; otherwise the closest single-axis match. */}
      {(inputs.parts_md > 0 || inputs.parts_td > 0) && (
        <WinnerCard
          title="Layout match"
          vi="Khớp layout mong muốn"
          axis="match"
          cyl={winners.match}
          rationale={
            winners.match
              ? `${winners.match.n_down} × ${winners.match.n_across} (target ${inputs.parts_md || '–'} × ${inputs.parts_td || '–'})${
                  winners.match.match_count === 2 ? ' — exact match' : ' — partial match'
                }`
              : `No cylinder matches target ${inputs.parts_md || '–'} × ${inputs.parts_td || '–'}. Try adjusting L, W or Pw.`
          }
        />
      )}
    </div>
  );
}
function WinnerCard({ title, vi, axis, cyl, rationale }) {
  if (!cyl)
    return (
      <div className="gc-winner-card gc-winner-empty">
        <div className="gc-winner-title">
          {title}
          <span className="gc-bi-vi"> · {vi}</span>
        </div>
        <div className="gc-winner-z">—</div>
        <div className="gc-winner-rationale">{rationale}</div>
      </div>
    );
  return (
    <div className={`gc-winner-card gc-winner-${axis}`}>
      <div className="gc-winner-title">
        {title}
        <span className="gc-bi-vi"> · {vi}</span>
      </div>
      <div className="gc-winner-z">Z = {cyl.z}T</div>
      <div className="gc-winner-rationale">{rationale}</div>
    </div>
  );
}

function WebSuggestionBanner({ sug, onApply }) {
  return (
    <div className="gc-suggest gc-suggest-info" style={{ marginBottom: 4 }}>
      <span aria-hidden>💡</span>
      <span>
        <b>Web width suggestion · Đề xuất khổ web:</b> current <b>{sug.current_mm} mm</b> →
        suggested <b>{sug.suggested_mm} mm</b> ({(sug.savings_pct * 100).toFixed(1)}% savings).
        Minimum required for current layout: {sug.min_required_mm.toFixed(1)} mm.
        <span className="gc-bi-vi"> Giảm khổ web → giảm waste TD.</span>
      </span>
      <button type="button" className="gc-suggest-apply" onClick={onApply}>
        Apply {sug.suggested_mm} mm
      </button>
    </div>
  );
}

// Sprint S-DESIGNER (2026-04-30) — designer-mode banner. Shown above
// the cylinder rank table whenever parts_md or parts_td > 0. Tells the
// operator (a) what cylinder + web they need, (b) whether the current
// W is enough, (c) gives one-click escape hatches: "apply minimum W"
// and "clear targets" (back to solver mode).
function DesignerModeBanner({ layout, inputs, onClearTargets, onApplyW }) {
  const labelMode =
    {
      'designer-md': 'Designer mode — N down LOCKED',
      'designer-td': 'Designer mode — n across LOCKED',
      'designer-full': 'Designer mode — N × n LOCKED (full)',
    }[layout.mode] || 'Designer mode';
  const labelMode_vi =
    {
      'designer-md': 'Chế độ thiết kế — KHOÁ số part chiều chạy (N)',
      'designer-td': 'Chế độ thiết kế — KHOÁ số lane (n)',
      'designer-full': 'Chế độ thiết kế — KHOÁ cả N × n',
    }[layout.mode] || 'Chế độ thiết kế';

  const w_too_narrow = layout.has_target_td && !layout.w_fits;
  const z_unavailable = layout.has_target_md && layout.z_required == null;

  return (
    <div
      className="gc-suggest gc-suggest-info"
      style={{
        marginBottom: 4,
        borderLeft: '4px solid #0f62fe',
        background: '#eef4ff',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span aria-hidden style={{ fontSize: 18 }}>
          🎯
        </span>
        <b>{labelMode}</b>
        <span className="gc-bi-vi"> · {labelMode_vi}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {layout.has_target_td && !layout.w_fits && (
            <button
              type="button"
              className="gc-suggest-apply"
              onClick={onApplyW}
              title={`Set W = ${Math.ceil(layout.W_required)} mm so target_td=${layout.target_td} fits`}
            >
              Apply W = {Math.ceil(layout.W_required)} mm
            </button>
          )}
          <button
            type="button"
            className="gc-suggest-apply"
            style={{ background: '#fff', color: '#0f62fe', border: '1px solid #0f62fe' }}
            onClick={onClearTargets}
            title="Clear targets and return to solver mode (auto-optimise N × n)"
          >
            Clear targets
          </button>
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 16px',
          marginTop: 8,
          width: '100%',
        }}
      >
        {layout.has_target_md && (
          <div>
            <div style={{ fontSize: 12, color: '#525252' }}>
              <b>Pitch required</b> for N = {layout.target_md} parts down · <i>Pitch tối thiểu</i>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f62fe' }}>
              {layout.pitch_required.toFixed(2)} mm
              {layout.z_required != null && (
                <span style={{ fontSize: 13, color: '#525252', fontWeight: 400 }}>
                  {' '}
                  → smallest cyl <b>Z = {layout.z_required}T</b> (
                  {layout.pitch_required_actual.toFixed(2)} mm actual)
                </span>
              )}
              {z_unavailable && (
                <span style={{ fontSize: 13, color: '#da1e28', fontWeight: 400 }}>
                  {' '}
                  ⚠ no available cylinder large enough
                </span>
              )}
            </div>
          </div>
        )}
        {layout.has_target_td && (
          <div>
            <div style={{ fontSize: 12, color: '#525252' }}>
              <b>Web width required</b> for n = {layout.target_td} lanes · <i>Khổ web tối thiểu</i>
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: w_too_narrow ? '#da1e28' : '#0f62fe',
              }}
            >
              {layout.W_required.toFixed(1)} mm
              <span style={{ fontSize: 13, color: '#525252', fontWeight: 400 }}>
                {' '}
                (current W = {Number(inputs.W).toFixed(0)} mm
                {w_too_narrow ? ' — TOO NARROW' : ' — fits ✓'})
              </span>
              {!w_too_narrow && layout.lane_gap_locked != null && (
                <div style={{ fontSize: 12, color: '#525252', fontWeight: 400, marginTop: 2 }}>
                  Actual lane gap on current W: <b>{layout.lane_gap_locked.toFixed(2)} mm</b>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArtworkUploadButton({ current, loading, onUpload, onClear }) {
  // useRef gives a stable mutable container; the previous useMemo
  // pattern produced a new object whenever the lint tooling thought the
  // memo could re-evaluate, which would silently swap the ref out from
  // under React's `ref={…}` wiring on subsequent renders.
  const inputRef = useRef(null);
  // Sprint 14i — PDF added to accept list. Note `application/pdf` for
  // strict browsers + `.pdf` extension for cases where the OS doesn't
  // populate the MIME type (some Linux file managers).
  const ACCEPT = [
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
    'image/gif',
    'application/pdf',
    '.pdf',
  ].join(',');
  return (
    <div className="gc-artwork-bar">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
      {loading ? (
        <span className="gc-artwork-name">
          ⏳ Rendering… <span className="gc-bi-vi">đang xử lý</span>
        </span>
      ) : current ? (
        <>
          <span className="gc-artwork-name" title={current}>
            📎 {current}
          </span>
          <button type="button" className="gc-mini-btn" onClick={() => inputRef.current?.click()}>
            Replace
          </button>
          <button type="button" className="gc-mini-btn gc-mini-btn-danger" onClick={onClear}>
            Clear
          </button>
        </>
      ) : (
        <button type="button" className="gc-mini-btn" onClick={() => inputRef.current?.click()}>
          📎 Upload artwork (PNG / JPG / SVG / PDF) <span className="gc-bi-vi">/ Tải bản vẽ</span>
        </button>
      )}
    </div>
  );
}

// Sprint 14k+ — Save Choice dialog with MANDATORY Design Change Notice.
// Both save paths (Update existing / Save as new version) require the
// operator to document WHY they're saving. Server enforces 3-char min
// at the wire layer; client mirrors that here so the buttons disable
// before the round trip.
function SaveChoiceDialog({
  open,
  onClose,
  activeId,
  activeVersion,
  endCuPn,
  onUpdate,
  onSaveAsNew,
}) {
  const [notice, setNotice] = useState('');
  // Reset the notice every time the dialog opens — operators shouldn't
  // accidentally re-submit the previous justification. Could also be
  // expressed via a `key={open}` remount on the Modal but that wastes
  // the dialog's animation state; the targeted reset is cheaper.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setNotice('');
  }, [open]);
  const trimmed = notice.trim();
  const valid = trimmed.length >= 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      severity="question"
      ariaLabelledBy="gc-save-choice-title"
    >
      <Modal.Header
        id="gc-save-choice-title"
        title="Save design"
        subtitle={`Loaded #${activeId} · v${activeVersion} · ${endCuPn || ''}`}
        severity="question"
      />
      <Modal.Body>
        <p>This design was loaded from history. How would you like to save your changes?</p>
        <p className="gc-bi-vi" style={{ marginTop: 4 }}>
          Thiết kế này được tải từ lịch sử. Bạn muốn lưu thay đổi như thế nào?
        </p>
        <ul className="op-modal-choice-list">
          <li>
            <b>Update existing</b> — overwrite #{activeId} in place, bump to{' '}
            <b>v{activeVersion + 1}</b>. Anyone who reloads this record will see your changes.
          </li>
          <li>
            <b>Save as new version</b> — keep #{activeId} untouched and create a separate record
            (parent_id = #{activeId}). Use this when changes are exploratory.
          </li>
        </ul>

        {/* Mandatory change-notice. Both paths require it; server
            rejects empty/short notices with HTTP 400. */}
        <div className="gc-change-notice">
          <label htmlFor="gc-change-notice-input" className="gc-change-notice-label">
            <b>
              Design change notice <span style={{ color: '#da1e28' }}>*</span>
            </b>
            <span className="gc-bi-vi"> · Ghi chú thay đổi thiết kế (bắt buộc)</span>
            <span className="gc-l-hint">
              What changed and why? · Required for the audit trail (≥ 3 chars).
            </span>
          </label>
          <textarea
            id="gc-change-notice-input"
            className="gc-input gc-change-notice-input"
            rows={3}
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder="e.g. Customer requested 4 lanes instead of 3 to fit 270mm web; updated G to 7.225 to match Z=85"
            autoFocus
          />
          <div className="gc-change-notice-counter">
            {trimmed.length} / ≥3 chars
            {!valid && <span style={{ color: '#a2191f', marginLeft: 8 }}>· too short</span>}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="op-btn op-btn-secondary"
          disabled={!valid}
          onClick={() => onSaveAsNew(trimmed)}
          title={valid ? 'Branch as new version' : 'Fill in change notice first'}
        >
          Save as new version
        </button>
        <button
          type="button"
          className="op-btn op-btn-primary"
          disabled={!valid}
          onClick={() => onUpdate(trimmed)}
          title={valid ? 'Overwrite existing record' : 'Fill in change notice first'}
        >
          Update existing
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function HistoryPanel({ list, onLoad, onClose, onDelete }) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter) return list;
    const q = filter.toLowerCase();
    return list.filter(
      (r) =>
        (r.end_cu_pn || '').toLowerCase().includes(q) ||
        (r.project || '').toLowerCase().includes(q) ||
        (r.designer_note || '').toLowerCase().includes(q)
    );
  }, [list, filter]);

  return (
    <div className="gc-history">
      <div className="gc-history-hdr">
        <b>Saved designs · Lịch sử thiết kế</b>
        <input
          type="search"
          placeholder="Filter by End CU PN / project · Lọc theo mã hoặc dự án"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="gc-input gc-history-search"
        />
        <button className="gc-mini-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {filtered.length === 0 ? (
        <Empty
          en={list.length === 0 ? 'No saved designs yet — hit Save to create one.' : 'No matches'}
          vi={list.length === 0 ? 'Chưa có thiết kế nào — bấm Save để tạo' : 'Không tìm thấy'}
        />
      ) : (
        <table className="gc-table gc-table-compact">
          <thead>
            <tr>
              <th className="ttl">Saved at</th>
              <th className="ttl">End CU PN</th>
              <th className="ttl">Project</th>
              <th className="ttl">By</th>
              <th className="ttl">Cylinder</th>
              <th className="ttl">L × Pw</th>
              <th className="ttl">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="num">{(r.saved_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td>
                  <b>{r.end_cu_pn || '—'}</b>
                </td>
                <td>{r.project || '—'}</td>
                <td>{r.saved_by || '—'}</td>
                <td className="num">
                  {r.result?.cylinder_z
                    ? `${r.result.cylinder_z}T (${(r.result.pitch || 0).toFixed(1)}mm)`
                    : '—'}
                </td>
                <td className="num">{r.inputs ? `${r.inputs.L} × ${r.inputs.Pw}` : '—'}</td>
                <td>{r.designer_note || ''}</td>
                <td>
                  <button className="gc-mini-btn" onClick={() => onLoad(r)}>
                    Load
                  </button>
                  <button
                    className="gc-mini-btn gc-mini-btn-danger"
                    onClick={() => onDelete(r)}
                    title={`Delete saved design #${r.id}`}
                    style={{ marginLeft: 4 }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Sprint S-FLEXO-4 — Die-cut risk pill ──────────────────────
function DieRiskPill({ cross }) {
  const r = dieRisk(cross.lane_gap_actual);
  if (r.tier === 'na' || r.tier === 'safe') return null;
  const cls = r.tier === 'risk' ? 'gc-banner gc-banner-error' : 'gc-banner gc-banner-warn';
  return (
    <div className={cls} role="alert">
      <b>{r.tier === 'risk' ? '⚠ Die-cut risk' : '⚠ Die-cut tight'}</b>
      <span style={{ marginLeft: 8 }}>{r.en}</span>
      <span className="gc-bi-vi"> · {r.vi}</span>
    </div>
  );
}

// ── Sprint S-FLEXO-2 — Ink consumption banner ────────────────
function InkBanner({ top1, cross, inputs }) {
  if (!top1 || top1.status !== 'OK') return null;
  // Printed area per job ≈ total_imp × L_eff × Pw_eff (m²).
  const bleed = Math.max(0, Number(inputs.bleed_mm) || 0);
  const L_eff_m = ((Number(inputs.L) || 0) + 2 * bleed) / 1000;
  const Pw_eff_m = ((Number(inputs.Pw) || 0) + 2 * bleed) / 1000;
  const total_imp =
    top1.step_lay > 0 && inputs.web_length_m > 0
      ? Math.round((inputs.web_length_m * 1000) / top1.step_lay) * Math.max(1, cross.n_across || 1)
      : 0;
  const printed_area_m2 = total_imp * L_eff_m * Pw_eff_m;
  const n = Math.max(1, Number(inputs.n_colors) || 1);
  const ink = inkConsumption({
    printed_area_m2,
    anilox_bcm: inputs.anilox_bcm,
    coverage_pct: inputs.coverage_pct,
    ink_density_g_cm3: inputs.ink_density_g_cm3,
  });
  const recommended = recommendAnilox(inputs.coverage_pct);
  const usingRecommended = Number(inputs.anilox_bcm) === recommended.bcm;
  const totalKg = ink.mass_kg * n;
  return (
    <div className="gc-banner gc-banner-info" role="status">
      <b>Ink estimate · Ước tính mực:</b>
      <span style={{ marginLeft: 8 }}>
        {totalKg.toFixed(2)} kg total ({n} colors × {ink.mass_kg.toFixed(3)} kg/color) · printed
        area {printed_area_m2.toFixed(1)} m²
      </span>
      <div style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>
        Recommended anilox for {inputs.coverage_pct}% coverage: <b>{recommended.bcm} BCM</b> (
        {recommended.range})
        {!usingRecommended && (
          <span style={{ color: '#b45309', marginLeft: 6 }}>
            · current setting {inputs.anilox_bcm} BCM
          </span>
        )}
      </div>
    </div>
  );
}

// ── Sprint S-FLEXO-5 — Color sequence panel ─────────────────
function ColorSequencePanel({ sequence }) {
  const issues = validateColorSequence(sequence);
  if (sequence.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const tone = errors.length ? 'error' : warns.length ? 'warn' : 'good';
  const banner =
    tone === 'good' ? (
      <span style={{ color: '#0e6027' }}>✓ Color sequence OK ({sequence.length} stations)</span>
    ) : null;
  return (
    <div className={`gc-banner gc-banner-${tone}`}>
      <b>Color sequence · Trình tự in màu:</b>
      <span style={{ marginLeft: 8 }}>{sequence.map((c) => c.name).join(' → ')}</span>
      {banner}
      {issues.length > 0 && (
        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
          {issues.map((i, k) => (
            <li
              key={k}
              style={{
                fontSize: 12,
                color: i.severity === 'error' ? '#a2191f' : '#8a6d00',
              }}
            >
              {i.severity === 'error' ? '⛔ ' : '⚠ '}
              {i.en}
              <span className="gc-bi-vi"> · {i.vi}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
