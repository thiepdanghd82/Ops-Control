/**
 * CalcLayout — Design Layout Parameters + File Uploads
 * Matches COST V1.0 M05 layout section with layout_file + customer_drw_file.
 *
 * File storage contract (matches COST V1.0):
 *   layout_file / customer_drw_file = { name, type, dataUrl }
 *     - name    : filename stored on server (e.g. "ABC-123.pdf")
 *     - type    : MIME ("application/pdf", "image/png", …)
 *     - dataUrl : base64 data URL for inline preview (may be absent after a
 *                 fresh page load — fetched on demand from /api/layout/{name})
 *
 * After attach:
 *   1. File is read → state updated → preview shows instantly (no Load click).
 *   2. POST to /api/save-layout to persist it under data/Products layout/.
 *   3. Server names the file using the current CCL PN (so it's recoverable).
 */
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { sharedApi } from '../../../../services/api';
import { calcPitch, calcLayoutPerSheet } from '../../../../services/calcEngine';
import FileUploadZone from '../../../../components/Shared/FileUploadZone';
import DecimalInput from '../../../../utils/DecimalInput';
import DesignSyncPicker from './DesignSyncPicker';
import { validateLayout } from '../../../../services/layoutValidation';

export default function CalcLayout() {
  const { stdState, setStdField } = useCalc();
  const st = stdState;
  // Lifted from PrintCutLayout so peer cards (Summary, Suggestion)
  // can show Print/Cut-specific content based on the active sub-tab.
  const [activeSub, setActiveSub] = useState('cut');
  // Sprint 14e — Design Tools handoff (pull direction). `null` means
  // the picker is closed; 'print' / 'cut' selects which field-subset
  // gets pushed when the operator picks a saved record.
  const [designSyncSide, setDesignSyncSide] = useState(null);

  // Machine profiles — loaded once per tab mount. The Layout Suggestion
  // card below receives the selected profile so the optimizer can
  // constrain its search to the machine's tooth_max, web_width bounds,
  // and inventoried dies (for the reuse vs new-die flag).
  const [profiles, setProfiles] = useState([]);
  // Profiles still loaded so legacy quotes that already have
  // `machine_profile_id` set can resolve their activeProfile, which
  // validateLayout reads for press-aware checks (color_count vs
  // num_print_stations, slit-lane-min, web-width bounds). New quotes
  // start with empty machine_profile_id → unconstrained.
  // Sprint 14n: Manage modal removed; profiles is read-only here.
  // Sprint 14n-3: LayoutSuggestionCard removed; only validator reads it.
  const loadProfiles = useCallback(() => {
    sharedApi.getMachineProfiles().then(arr =>
      setProfiles(Array.isArray(arr) ? arr : []),
    ).catch(() => {});
  }, []);
  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  const activeProfile = useMemo(
    () => profiles.find(p => p.id === st.machine_profile_id) || null,
    [profiles, st.machine_profile_id],
  );
  // (Sprint 14n-3) `mainMaterial` + `applyCandidate` lived here only to
  // feed LayoutSuggestionCard; both removed alongside the card. The
  // validator still cross-checks multi-web overflow via st.materials
  // directly, so no behaviour is lost.

  // Layout-derived summary values. Sprint 13c removed `pcsPerRoll` from
  // this list — the Cut summary now reads `state.pcs_per_roll` (the
  // operator-entered field) directly so the displayed value matches what
  // the engineer typed in the Shared header next to Edge Right, instead
  // of a per-shot derivation that confused readers.
  const pitch = useMemo(() => { try { return calcPitch(st); } catch { return 0; } }, [st]);
  const layoutPerSheet = useMemo(() => { try { return calcLayoutPerSheet(st); } catch { return 0; } }, [st]);

  // Validation — 3-tier (error / warning / info). The card header shows
  // an aggregate pill; per-field badges (later pass) pull from byField.
  const validation = useMemo(() => {
    try { return validateLayout(st, st.materials, {}, activeProfile); }
    catch { return { errors: [], warnings: [], infos: [], byField: {}, hasBlockers: false }; }
  }, [st, activeProfile]);

  return (
    <div className="sc-section sc-section-layout">
      {/* Parameters + Summary */}
      <div className="sc-card">
        <div className="sc-card-header sc-header-teal">
          <span className="sc-card-icon">&#9638;</span>
          <span className="sc-card-title">Design Layout</span>
          {/* Sprint 14n-2 — sync buttons promoted from body to header so the
              Design Layout title bar carries the workflow's two primary
              actions inline with its label. Operators reported the body
              position competed visually with the params grid below. */}
          <div className="cl-header-sync-actions">
            <button
              type="button"
              className="cl-design-sync-btn cl-design-sync-btn--header"
              onClick={() => setDesignSyncSide('print')}
              title="Đồng bộ thiết kế in · Pull a saved Design Tools record and apply Print-side fields (L, Pw, W, plate tooth, gaps, edges, color count)"
            >
              🔍 Print Design sync
            </button>
            <button
              type="button"
              className="cl-design-sync-btn cl-design-sync-btn--header"
              onClick={() => setDesignSyncSide('cut')}
              title="Đồng bộ thiết kế cắt · Pull a saved Design Tools record and apply Cut-side fields (magnetic tooth, cutter cavity, gaps, geometry)"
            >
              🔍 Cut Design sync
            </button>
          </div>
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <span className="cl-validation-pill">
              {validation.errors.length > 0 && (
                <span className="cl-vp-err">✕ {validation.errors.length} error{validation.errors.length > 1 ? 's' : ''}</span>
              )}
              {validation.warnings.length > 0 && (
                <span className="cl-vp-warn">⚠ {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''}</span>
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
          {/* Sprint 14n-2 — sync buttons moved to the header bar above.
              Body retains only the optional press-metadata pill, surfaced
              for legacy quotes that already have a machine_profile_id. */}
          {activeProfile && (
            <div className="cl-press-picker">
              <span className="cl-press-meta">
                Web {activeProfile.web_width_min_mm}–{activeProfile.web_width_max_mm}mm
                {activeProfile.common_dies?.length
                  ? ` · ${activeProfile.common_dies.length} dies`
                  : ''}
                {activeProfile.speed_max_m_min
                  ? ` · ${activeProfile.speed_max_m_min} m/min`
                  : ''}
              </span>
            </div>
          )}

          <div className="cl-top-grid">
            {/* Left: Parameters (sub-tab split — Print / Cut) */}
            <div className="cl-params">
              <PrintCutLayout
                state={st}
                onField={setStdField}
                activeSub={activeSub}
                onActiveSubChange={setActiveSub}
              />

              <AdvancedLayoutBlock state={st} onField={setStdField} />
            </div>

            {/* Right: Summary (+ optimizer Suggestion only on Cut sub-tab —
                Print Suggestion was removed per operator feedback: the
                plate-tooth-vs-image-length card duplicated information
                operators already read off the inputs grid). */}
            {activeSub === 'print' ? (
              <>
                <PrintLayoutSummary state={st} pitch={pitch} />
              </>
            ) : (
              <>
                {/* Sprint 14n-3 — Cut LayoutSuggestionCard removed at
                    operator request. Cylinder/cavity engineering lives
                    in Design Tools (Gallus calculator) and arrives via
                    the headbar's Cut Design sync button; running a
                    second optimizer here only added noise. */}
                <CutLayoutSummary
                  state={st}
                  pitch={pitch}
                  layoutPerSheet={layoutPerSheet}
                />
              </>
            )}
            {/* Full-width MD/TD reference — sits below Summary + Suggestion */}
            <MdTdLegendCard />
          </div>
        </div>
      </div>

      {/* MachineProfileModal mount removed Sprint 14n — see press bar
          comment. CRUD moved to the Machine Technical sidebar tab. */}

      {/* Sprint 14e — Design Tools sync picker. `designSyncSide` toggles
          between 'print' and 'cut', controlling which field-subset
          gets pushed when the operator picks a record. */}
      <DesignSyncPicker
        open={!!designSyncSide}
        side={designSyncSide || 'print'}
        onClose={() => setDesignSyncSide(null)}
        onApply={(fields) => {
          // Apply each mapped field via setStdField. Values are RAW
          // (no rounding) — operators specifically requested precision
          // preserved through the sync round-trip.
          for (const [k, v] of Object.entries(fields)) {
            setStdField(k, v);
          }
        }}
      />


      {/* File Uploads — auto-named {Customer}_{EndCuPN}_{stamp}[suffix] */}
      <div className="cl-upload-grid">
        <FileUploadZone
          label="Design Layout Drawing"
          file={st.layout_file}
          endCu={st.end_cu}
          directCu={st.direct_cu}
          endCuPn={st.end_cu_pn}
          cclPn={st.ccl_pn}
          onFileChange={v => setStdField('layout_file', v)}
          onClear={() => setStdField('layout_file', null)}
        />
        <FileUploadZone
          label="Customer Drawing"
          file={st.customer_drw_file}
          endCu={st.end_cu}
          directCu={st.direct_cu}
          endCuPn={st.end_cu_pn}
          cclPn={st.ccl_pn}
          nameSuffix="_cust"
          onFileChange={v => setStdField('customer_drw_file', v)}
          onClear={() => setStdField('customer_drw_file', null)}
        />
      </div>
    </div>
  );
}

// ─── Advanced Layout Block (collapsible) ────────────────────────
//
// Houses the v3 tuning fields that most operators never touch, so the
// main params grid stays clean. Toggling also auto-expands when any of
// the fields are non-default, so loaded quotes reveal their config.
//
// Shared between Standard (stdState) and Complex (subproduct). The
// caller supplies:
//   state    — either stdState or a SP
//   onField  — field-setter: (fieldName, value) => void
export function AdvancedLayoutBlock({ state, onField }) {
  const hasNonDefault = !!(
    (state.parts_per_die && state.parts_per_die !== 1)
    || state.orient_locked
    || state.perf_offset_mm
    || state.tol_p2c_mm || state.tol_c2c_mm || state.tol_slit_mm
    || state.target_pcs_per_roll
    || state.unwind_direction || state.print_direction_md
    || state.include_reg_marks
    || state.plate_thickness_mm || state.anilox_bcm
    || state.print_to_cut_offset_mm
  );
  const [open, setOpen] = useState(hasNonDefault);

  return (
    <div className={'cl-adv' + (open ? ' cl-adv-open' : '')}>
      <button
        type="button"
        className="cl-adv-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'}</span>
        &nbsp;Advanced Layout
        {hasNonDefault && <span className="cl-adv-dot" title="Non-default values set" />}
      </button>
      {open && (
        <div className="cl-adv-body">
          <div className="cl-adv-group">
            <div className="cl-adv-group-title">Compound die / orientation</div>
            <div className="sc-grid4">
              <div className="sc-field" title="Compound die multiplier — e.g. 2 for a 2-up die (one cavity cuts 2 labels). Default = 1.">
                <label>Parts per die</label>
                <DecimalInput value={state.parts_per_die} onChange={v => onField('parts_per_die', v)} className="sc-input" />
              </div>
              <div className="sc-field" title="If enabled, optimizer will NOT try 90° rotated placement (e.g. when text direction must match roll unwind).">
                <label><input type="checkbox" checked={!!state.orient_locked}
                  onChange={e => onField('orient_locked', e.target.checked)} />
                  &nbsp;Orientation locked
                </label>
              </div>
              <div className="sc-field" title="Added to effective MD gap when a perforation cut is present between repeat labels.">
                <label>Perf offset (mm)</label>
                <DecimalInput value={state.perf_offset_mm} onChange={v => onField('perf_offset_mm', v)} className="sc-input" />
              </div>
              <div className="sc-field" title="Customer-specified target pcs/roll. Optimizer grants a small score bonus when pcs_per_shot divides this evenly.">
                <label>Target pcs/roll</label>
                <DecimalInput value={state.target_pcs_per_roll} onChange={v => onField('target_pcs_per_roll', v)} className="sc-input" />
              </div>
            </div>
          </div>
          <div className="cl-adv-group">
            <div className="cl-adv-group-title">Customer tolerances (±mm)</div>
            <div className="sc-grid4">
              <div className="sc-field" title="Print-to-Cut tolerance. Validator warns if min_gap_md < 2 × this.">
                <label>Tol P2C (mm)</label>
                <DecimalInput value={state.tol_p2c_mm} onChange={v => onField('tol_p2c_mm', v)} className="sc-input" />
              </div>
              <div className="sc-field" title="Cut-to-Cut tolerance. Validator warns if min_gap_td < 2 × this.">
                <label>Tol C2C (mm)</label>
                <DecimalInput value={state.tol_c2c_mm} onChange={v => onField('tol_c2c_mm', v)} className="sc-input" />
              </div>
              <div className="sc-field" title="Slitting tolerance. Validator warns if edge_margin_td < 3 × this.">
                <label>Tol Slit (mm)</label>
                <DecimalInput value={state.tol_slit_mm} onChange={v => onField('tol_slit_mm', v)} className="sc-input" />
              </div>
            </div>
          </div>

          {/* P4-11 + P4-12 — orientation + registration marks */}
          <div className="cl-adv-group">
            <div className="cl-adv-group-title">Orientation + registration · Hướng cuộn + mark đăng ký</div>
            <div className="sc-grid4">
              <div className="sc-field" title="Unwind direction: face-in (label facing inward on roll) or face-out (label facing outward). Affects labeler feed + packaging.">
                <label>Unwind Direction</label>
                <select value={state.unwind_direction || ''}
                  onChange={e => onField('unwind_direction', e.target.value)}
                  className="sc-input">
                  <option value="">(unspecified)</option>
                  <option value="face-in">Face-in (label inward)</option>
                  <option value="face-out">Face-out (label outward)</option>
                </select>
              </div>
              <div className="sc-field" title="Print direction in MD — head-first or tail-first. Determines text orientation relative to unwind.">
                <label>Print Direction MD</label>
                <select value={state.print_direction_md || ''}
                  onChange={e => onField('print_direction_md', e.target.value)}
                  className="sc-input">
                  <option value="">(unspecified)</option>
                  <option value="head-first">Head-first</option>
                  <option value="tail-first">Tail-first</option>
                </select>
              </div>
              <div className="sc-field" title="Check if a registration mark / color bar strip must sit at the web edge (typical 5mm). Edge margin will need to accommodate.">
                <label>
                  <input type="checkbox" checked={!!state.include_reg_marks}
                    onChange={e => onField('include_reg_marks', e.target.checked)} />
                  &nbsp;Include reg marks
                </label>
              </div>
              <div className="sc-field" title="Width of reg-mark / color-bar strip when enabled. Default = 5 mm.">
                <label>Reg Mark Width (mm)</label>
                <DecimalInput value={state.reg_mark_width_mm}
                  onChange={v => onField('reg_mark_width_mm', v)}
                  disabled={!state.include_reg_marks}
                  className="sc-input"
                  placeholder="default 5" />
              </div>
            </div>
          </div>

          {/* P4-13 — plate + anilox spec (flexo) */}
          <div className="cl-adv-group">
            <div className="cl-adv-group-title">Plate + Anilox (flexo) · Bản in + lưới Anilox</div>
            <div className="sc-grid4">
              <div className="sc-field" title="Flexo plate thickness in mm. Common: 1.14 (DFM / HD plate), 1.70 (narrow-web rotary). Informational.">
                <label>Plate Thickness (mm)</label>
                <select value={state.plate_thickness_mm || 0}
                  onChange={e => onField('plate_thickness_mm', Number(e.target.value))}
                  className="sc-input">
                  <option value="0">(unspecified)</option>
                  <option value="1.14">1.14 (HD/DFM)</option>
                  <option value="1.70">1.70 (narrow-web)</option>
                  <option value="2.54">2.54 (wide-web)</option>
                </select>
              </div>
              <div className="sc-field" title="Anilox BCM (billion cubic microns). Determines ink lay-down: 2-3 for white/line work, 4-6 for CMYK process, 6-10 for opaque spot.">
                <label>Anilox BCM</label>
                <DecimalInput value={state.anilox_bcm}
                  onChange={v => onField('anilox_bcm', v)}
                  className="sc-input"
                  placeholder="e.g. 4.5" />
              </div>
              <div className="sc-field" title="Print-to-cut MD offset (distance in mm between print cylinder center and cutting cylinder center on the press). Used in layout drawings, not pricing. Typical 50-200mm.">
                <label>Print→Cut MD offset</label>
                <DecimalInput value={state.print_to_cut_offset_mm}
                  onChange={v => onField('print_to_cut_offset_mm', v)}
                  className="sc-input"
                  placeholder="e.g. 100" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PrintCutLayout — Sprint S-SPLIT (2026-04-24) ────────────────
//
// Splits the old flat 12-field params grid into:
//   1. Shared header  (machine + material geometry: web, sheet, webs,
//      rotary, edge L/R, pcs/roll) — always visible, applies to both
//   2. Two sub-tabs:
//        🖨 Print Design Layout  — image-area + bleed + plate cylinder
//        ✂ Cutting Design Layout — die grid + cut type + magnetic cyl
//
// Exported so ComplexCalc.SubProductRow reuses the exact same UI; it
// takes a neutral `state` + `onField` shape so both stdState and a
// sub-product row drive identical behaviour.

const CUT_TYPE_OPTIONS = [
  { v: '',              label: '(select)' },
  { v: 'kiss-cut',      label: 'Kiss-cut (face only)' },
  { v: 'through-cut',   label: 'Through-cut (face + liner)' },
  { v: 'both',          label: 'Both (compound die)' },
  { v: 'perf-only',     label: 'Perforation only' },
  { v: 'emboss',        label: 'Emboss / Deboss' },
];

// `activeSub` + `onActiveSubChange` let the parent lift the sub-tab
// state so peer cards (Layout Summary, Layout Suggestion) can react
// to the same selection. Defaults to 'cut' when uncontrolled.
export function PrintCutLayout({ state, onField, activeSub: controlledSub, onActiveSubChange }) {
  const [localSub, setLocalSub] = useState('cut');
  const activeSub = controlledSub !== undefined ? controlledSub : localSub;
  const setActiveSub = onActiveSubChange || setLocalSub;

  // P4-14: Suggest-web-width — computes the minimum web width that fits
  // the current grid (parts_web_across × part_width + gaps + edges) and
  // proposes the nearest common stock size above it (common rotary web
  // widths: 100, 135, 165, 200, 250, 300, 330, 370, 420 mm).
  const COMMON_WEB_WIDTHS = [100, 135, 165, 200, 250, 300, 330, 370, 420];
  const suggestWebWidth = () => {
    const across  = Math.max(1, Number(state.parts_web_across) || 1);
    const partW   = Number(state.part_width) || 0;
    const gapTd   = Number(state.min_gap_td) || 3;
    const edgeL   = Number(state.edge_margin_td_left) || 0;
    const edgeR   = Number(state.edge_margin_td_right) || 0;
    const edgeSym = Number(state.edge_margin_td) || 3;
    const edges   = (edgeL > 0 || edgeR > 0) ? (edgeL + edgeR) : (2 * edgeSym);
    if (!partW) {
      return null;
    }
    const needed = across * partW + (across - 1) * gapTd + edges;
    const stock  = COMMON_WEB_WIDTHS.find(w => w >= needed);
    return { needed, stock: stock || Math.ceil(needed / 10) * 10 };
  };
  const applySuggestedWebWidth = () => {
    const s = suggestWebWidth();
    if (s) {
      onField('web_width_td', s.stock);
    }
  };

  return (
    <div className="cl-pc">
      {/* Shared header fields — web / sheet / webs / rotary / edge / pcs_per_roll.
          These apply equally to Print + Cut because they describe
          the MATERIAL and the MACHINE web path, not the design. */}
      <div className="cl-pc-shared">
        <div className="cl-pc-shared-title">
          Shared · Material / Machine
          {state.part_width > 0 && (
            <button type="button"
              onClick={applySuggestedWebWidth}
              className="cl-pc-suggest-btn"
              title="Auto-set Web Width TD to the smallest common stock size that fits current parts × gap × edges. Common sizes: 100/135/165/200/250/300/330/370/420 mm.">
              ✨ Suggest Web Width
            </button>
          )}
          {/* Sprint 14n-2 — the in-body "⤓ Sync from Design Tools"
              button was removed because the Design Layout headbar now
              carries dedicated 🔍 Print/Cut Design sync buttons that
              open the same picker (and target the correct side). */}
        </div>
        <div className="sc-grid4">
          <div className="sc-field"><label>Web Width TD (mm)</label><DecimalInput value={state.web_width_td} onChange={v => onField('web_width_td', v)} className="sc-input" placeholder="—" /></div>
          <div className="sc-field"><label>Sheet Length MD (mm)</label><DecimalInput value={state.sheet_length} onChange={v => onField('sheet_length', v)} className="sc-input" placeholder="—" /></div>
          <div className="sc-field"><label># Webs</label><DecimalInput value={state.num_webs} onChange={v => onField('num_webs', v)} className="sc-input" placeholder="1" /></div>
          <div className="sc-field"><label>Rotary Cols</label><DecimalInput value={state.rotary_cols} onChange={v => onField('rotary_cols', v)} className="sc-input" placeholder="0 sheet" /></div>
          <div className="sc-field" title="Distance from LEFT liner edge to first product (0 = symmetric default)">
            <label>Edge Left (mm)</label>
            <DecimalInput value={state.edge_margin_td_left} onChange={v => onField('edge_margin_td_left', v)} className="sc-input" placeholder="0 sym" />
          </div>
          <div className="sc-field" title="Distance from RIGHT liner edge to first product (0 = symmetric default)">
            <label>Edge Right (mm)</label>
            <DecimalInput value={state.edge_margin_td_right} onChange={v => onField('edge_margin_td_right', v)} className="sc-input" placeholder="0 sym" />
          </div>
          <div className="sc-field"><label>Pcs/Roll</label><DecimalInput value={state.pcs_per_roll} onChange={v => onField('pcs_per_roll', v)} className="sc-input" placeholder="auto" /></div>
        </div>
      </div>

      {/* Sub-tab bar (matches the Ink Calculator pattern: text buttons
          with active-underline, sitting above the body below). */}
      <div className="cl-pc-tabs" role="tablist" aria-label="Print / Cut layout sub-tabs">
        <button role="tab" aria-selected={activeSub === 'print'}
          className={`cl-pc-tab ${activeSub === 'print' ? 'active' : ''}`}
          onClick={() => setActiveSub('print')}>🖨 Print Design Layout</button>
        <button role="tab" aria-selected={activeSub === 'cut'}
          className={`cl-pc-tab ${activeSub === 'cut' ? 'active' : ''}`}
          onClick={() => setActiveSub('cut')}>✂ Cutting Design Layout</button>
      </div>

      {activeSub === 'print' && <PrintSubTab state={state} onField={onField} />}
      {activeSub === 'cut'   && <CutSubTab   state={state} onField={onField} />}
    </div>
  );
}

// ── Print sub-tab: image net + bleed + plate cylinder ──────────

function PrintSubTab({ state, onField }) {
  const platePitch = state.plate_tooth
    ? ((state.plate_tooth * (state.tooth_pitch_mm || 3.175)).toFixed(2))
    : '—';
  const slit = !!state.slit_after_print;
  const slitCount = Math.max(1, Number(state.slit_lane_count) || 1);
  const partsAcross = Math.max(1, Number(state.parts_web_across) || 1);
  const partsInMd  = Math.max(1, Number(state.parts_in_md) || 1);
  const numWebs    = Math.max(1, Number(state.num_webs) || 1);
  // Print cavities across per shot:
  //   • Slit ON  → 1 wide print web carries slit_lane_count × parts_web_across
  //   • Slit OFF → num_webs parallel webs, each with parts_web_across
  const printCavAcross = slit ? slitCount * partsAcross : numWebs * partsAcross;
  // Print-side total (per print repeat) — used in the slit/no-slit hint
  // text below. The mismatch-vs-cut banner lives in PrintLayoutSummary,
  // so this component does not need to surface cutTotal itself.
  const printTotal = printCavAcross * partsInMd;

  return (
    <div className="cl-pc-body">
      <div className="cl-pc-hint">
        <b>🖨 Print Design Layout</b> — Three distinct sizes, NOT the same:
        <br />
        <b>① Product Size</b> = final label after die-cut (synced from Cutting tab) ·
        <b> ② Image Area</b> = safe design boundary (what holds text/logo) ·
        <b> ③ Bleed</b> = ink overshoot past the cut line (typically 1 mm).
        <br />
        <span className="cl-pc-hint-eg">
          Ví dụ: Product 82×52 (thành phẩm) = Image Area 80×50 (vùng thiết kế) + Bleed 1 mm mỗi bên.
        </span>
      </div>
      <PrintCutSizeMismatch state={state} onField={onField} />
      <div className="sc-grid4">
        <div className="sc-field" title="① Finished product width TD (mm) the print designer is targeting. Should equal the Cut tab's Die Width TD; the validator above flags any divergence.">
          <label>① Product Size Width TD (mm)</label>
          <DecimalInput
            value={state.print_part_width}
            onChange={v => onField('print_part_width', v)}
            className="sc-input"
            placeholder={state.part_width ? `Cut: ${state.part_width}` : ''}
          />
        </div>
        <div className="sc-field" title="① Finished product length MD (mm) the print designer is targeting. Should equal the Cut tab's Die Length MD.">
          <label>① Product Size Length MD (mm)</label>
          <DecimalInput
            value={state.print_part_length_md}
            onChange={v => onField('print_part_length_md', v)}
            className="sc-input"
            placeholder={state.part_length_md ? `Cut: ${state.part_length_md}` : ''}
          />
        </div>
        <div className="sc-field" title="② Image Area Width TD — the SAFE DESIGN BOUNDARY where text, logo, barcode must sit. Smaller than Product Size by 2×bleed.">
          <label>② Image Area Width TD (mm)</label>
          <DecimalInput value={state.part_net_width} onChange={v => onField('part_net_width', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="② Image Area Length MD — safe design boundary in MD.">
          <label>② Image Area Length MD (mm)</label>
          <DecimalInput value={state.part_net_length} onChange={v => onField('part_net_length', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="③ Bleed each side TD (mm) — ink overshoot past the cut line. Protects against die registration drift. Product = Image Area + 2×Bleed.">
          <label>③ Bleed TD (mm)</label>
          <DecimalInput value={state.bleed_td_mm} onChange={v => onField('bleed_td_mm', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="③ Bleed each side MD (mm).">
          <label>③ Bleed MD (mm)</label>
          <DecimalInput value={state.bleed_md_mm} onChange={v => onField('bleed_md_mm', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Part rows in the MD (running) direction. Shared with Cutting tab.">
          <label>Parts in MD</label>
          <DecimalInput value={state.parts_in_md} onChange={v => onField('parts_in_md', v)} className="sc-input" />
        </div>
        <div className="sc-field" title={`Cavities per cut lane (TD). ${slit ? `Slit ON → print web has ${slitCount} × ${partsAcross} = ${printCavAcross} cav across; each slit lane gets ${partsAcross}.` : 'Single-web: print cavities = cut cavities.'} Shared with Cutting tab.`}>
          <label>Cut Parts/Web Across</label>
          <DecimalInput value={state.parts_web_across} onChange={v => onField('parts_web_across', v)} className="sc-input" />
        </div>
        <div className="sc-field" title={
          `Total cavities per PRINT repeat. ` +
          (slit
            ? `Slit ON: 1 wide print web × ${printCavAcross} cav × ${partsInMd} MD = ${printTotal}. After slit, each lane is cut separately — see Cutter Cavity in Cut tab.`
            : `No slit: ${numWebs} web${numWebs > 1 ? 's' : ''} × ${partsAcross} cav × ${partsInMd} MD = ${printTotal}. Same as Cut Total when in-line (no slit).`)
        }>
          <label>Print Total / Shot</label>
          <input type="text"
            value={printTotal}
            disabled
            className="sc-input sc-derived"
            style={slit ? { color: '#6d28d9', fontWeight: 700, background: '#f5f3ff' } : undefined} />
        </div>
        <div className="sc-field" title="Minimum gap between parts along MD (mm). Shared with Cutting tab. Display padded to 3 decimals so synced engineering values (e.g. 7.225) keep their precision visible.">
          <label>Min Gap MD (mm)</label>
          <DecimalInput value={state.min_gap_md} onChange={v => onField('min_gap_md', v)} className="sc-input" decimals={3} />
        </div>
        <div className="sc-field" title="Minimum gap between parts along TD (across web). Only (cavities − 1) gaps exist, not × cavities. Default = 3 mm if blank. Shared with Cutting tab.">
          <label>Min Gap TD (mm)</label>
          <DecimalInput value={state.min_gap_td} onChange={v => onField('min_gap_td', v)} className="sc-input" placeholder="default 3" />
        </div>
        <div className="sc-field" title="Plate mounting cylinder tooth count. Leave 0 to let the optimizer/magnetic tooth drive pitch.">
          <label>Plate Tooth (T)</label>
          <DecimalInput value={state.plate_tooth} onChange={v => onField('plate_tooth', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Derived: plate_tooth × 3.175 mm.">
          <label>Plate Pitch (mm)</label>
          <input type="text" value={platePitch} disabled className="sc-input sc-derived" />
        </div>
        <div className="sc-field" title="Tổng số màu in (CMYK, spot, white, UV...). Validator warn nếu vượt số trạm in của Cut Press đã chọn.">
          <label>Color Count</label>
          <DecimalInput value={state.color_count} onChange={v => onField('color_count', v)} className="sc-input" placeholder="e.g. 4" />
        </div>
        <div className="sc-field" title="Print-to-print (color registration) tolerance. Chuẩn: flexo ≤ 0.1mm, HP Indigo ≤ 0.05mm. Validator check bleed ≥ 2× tol khi color_count ≥ 2.">
          <label>Tol P2P · Color Reg (mm)</label>
          <DecimalInput value={state.tol_p2p_mm} onChange={v => onField('tol_p2p_mm', v)} className="sc-input" placeholder="0.1 flexo / 0.05 Indigo" />
        </div>
      </div>
      {slit && (
        <div className="cl-pc-banner cl-pc-banner--info">
          ℹ Slit workflow ON — Print web in <b>{printCavAcross}</b> cav × {partsInMd} MD = <b>{printTotal}</b> pcs/print-repeat · slit {slitCount} lanes · mỗi lane cắt riêng (xem Cutter Cavity ở tab Cut).
        </div>
      )}
      <PrintCutRatioHint state={state} />
    </div>
  );
}

// ── Cut sub-tab: die grid + cut type + magnetic cylinder ──────

function CutSubTab({ state, onField }) {
  const magPitch = state.magnetic_tooth
    ? ((state.magnetic_tooth * (state.tooth_pitch_mm || 3.175)).toFixed(2))
    : '—';
  const slit = !!state.slit_after_print;
  const slitCount = Math.max(1, Number(state.slit_lane_count) || 1);
  const partsAcross = Math.max(1, Number(state.parts_web_across) || 1);
  const partsInMd  = Math.max(1, Number(state.parts_in_md) || 1);
  const numWebs    = Math.max(1, Number(state.num_webs) || 1);
  const printCavAcross = slit ? slitCount * partsAcross : numWebs * partsAcross;
  // Derived Web Width TD requirement — live preview of the formula
  // used by the validator. Helps operators see what web width is
  // needed before the red error lands.
  const partW      = Number(state.part_width) || 0;
  const gapTdVal   = Number(state.min_gap_td) || 3;
  const edgeLeft   = Number(state.edge_margin_td_left) || 0;
  const edgeRight  = Number(state.edge_margin_td_right) || 0;
  const edgeSym    = Number(state.edge_margin_td) || 3;
  const edgesTotal = (edgeLeft > 0 || edgeRight > 0)
    ? (edgeLeft + edgeRight) : (2 * edgeSym);
  const webNeededTd = partW > 0
    ? partsAcross * partW + Math.max(0, partsAcross - 1) * gapTdVal + edgesTotal
    : 0;
  const webHaveTd   = Number(state.web_width_td) || 0;
  const webDeltaTd  = webHaveTd - webNeededTd;
  // Cutter Cavity = parts per cutter stamp (per die). 0 in state = auto.
  // Default auto = parts_web_across × parts_in_md (one lane's worth).
  const cutterCavityAuto = partsAcross * partsInMd;
  const cutterCavity = Number(state.cutter_cavity) > 0
    ? Number(state.cutter_cavity)
    : cutterCavityAuto;
  // Cut Total / Shot depends on workflow:
  //   • Slit ON  → each cutter processes ONE slit lane; Total = cutter_cavity
  //                (one die stamp per machine produces this many parts).
  //   • Slit OFF → in-line multi-web press; Total = num_webs × cutter_cavity
  //                (all webs cut simultaneously on same stroke).
  const cutTotalPerShot = slit ? cutterCavity : numWebs * cutterCavity;

  return (
    <div className="cl-pc-body">
      <div className="cl-pc-hint">
        <b>✂ Cutting Design Layout</b> — die outer size, grid, cut type,
        and magnetic cylinder. Die size is AUTHORITATIVE for the layout
        optimizer's geometry.
      </div>
      <div className="sc-grid4">
        <div className="sc-field" title="Die outer width TD (mm) — total cut area.">
          <label>Die Width TD (mm)</label>
          <DecimalInput value={state.part_width} onChange={v => onField('part_width', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Die outer length MD (mm).">
          <label>Die Length MD (mm)</label>
          <DecimalInput value={state.part_length_md} onChange={v => onField('part_length_md', v)} className="sc-input" />
        </div>
        <div className="sc-field"><label>Parts in MD</label><DecimalInput value={state.parts_in_md} onChange={v => onField('parts_in_md', v)} className="sc-input" /></div>
        <div className="sc-field"><label>Parts/Web Across</label><DecimalInput value={state.parts_web_across} onChange={v => onField('parts_web_across', v)} className="sc-input" /></div>
        <div className="sc-field" title="Khoảng cách tối thiểu giữa 2 part theo MD (chiều chạy). Dùng trong công thức pitch: pitch = part_length_md + min_gap_md. Hiển thị 3 chữ số sau dấu phẩy để giữ nguyên độ chính xác từ Design Tools sync (vd 7.225).">
          <label>Min Gap MD (mm)</label>
          <DecimalInput value={state.min_gap_md} onChange={v => onField('min_gap_md', v)} className="sc-input" decimals={3} />
        </div>
        <div className="sc-field" title="Khoảng cách tối thiểu giữa 2 part theo TD (ngang web). Chỉ cộng vào (cavities − 1) khoảng, không cộng vào edge. Default = 3 mm nếu để trống.">
          <label>Min Gap TD (mm)</label>
          <DecimalInput value={state.min_gap_td} onChange={v => onField('min_gap_td', v)} className="sc-input" placeholder="default 3" />
        </div>
        <div className="sc-field" title="Perforation offset added to effective MD gap if a perf line runs between labels.">
          <label>Perf Offset (mm)</label>
          <DecimalInput value={state.perf_offset_mm} onChange={v => onField('perf_offset_mm', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Kiss = face only, Through = cut liner too, Both = compound die, Perf-only = perforation, Emboss = raised/recessed (no through-cut).">
          <label>Cut Type</label>
          <select value={state.cut_type || ''} onChange={e => onField('cut_type', e.target.value)} className="sc-input">
            {CUT_TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        <div className="sc-field" title="Die corner radius in mm. 0 = square. Min 0.5mm (magnetic die physical limit). Max typically part_width / 4.">
          <label>Corner Radius (mm)</label>
          <DecimalInput value={state.corner_radius_mm} onChange={v => onField('corner_radius_mm', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Clearance around the die for registration marks, bearer bars, vision fiducials. Typical: 5-8mm on rotary. 0 = no quiet zone.">
          <label>Die Quiet Zone (mm)</label>
          <DecimalInput value={state.die_quiet_zone_mm} onChange={v => onField('die_quiet_zone_mm', v)} className="sc-input" placeholder="5-8 typ." />
        </div>
        <div className="sc-field" title="Magnetic die-cut cylinder tooth count. Leave 0 for optimizer to pick.">
          <label>Magnetic Tooth (T)</label>
          <DecimalInput value={state.magnetic_tooth} onChange={v => onField('magnetic_tooth', v)} className="sc-input" />
        </div>
        <div className="sc-field" title="Derived: magnetic_tooth × 3.175 mm.">
          <label>Magnetic Pitch (mm)</label>
          <input type="text" value={magPitch} disabled className="sc-input sc-derived" />
        </div>
      </div>

      {/* ── Web Width TD required — live formula preview ─────── */}
      {partW > 0 && (
        <div className={`cl-pc-banner ${webDeltaTd < 0 ? 'cl-pc-banner--err' : webDeltaTd < 5 ? 'cl-pc-banner--warn' : 'cl-pc-banner--ok'}`}>
          <span>
            <b>{webDeltaTd < 0 ? '✕' : webDeltaTd < 5 ? '⚠' : '✓'} Web Width TD required:</b>{' '}
            <code>{partsAcross} × {partW} + ({partsAcross} − 1) × {gapTdVal} + ({edgeLeft || edgeSym} + {edgeRight || edgeSym}) = <b>{webNeededTd.toFixed(2)} mm</b></code>
            <span className="cl-pc-banner--md">
              Web hiện tại: <b>{webHaveTd} mm</b> {webDeltaTd < 0
                ? `→ thiếu ${(-webDeltaTd).toFixed(2)} mm. Tăng Web Width TD lên ≥ ${webNeededTd.toFixed(2)} mm hoặc giảm cavities/edge/gap.`
                : `→ dư ${webDeltaTd.toFixed(2)} mm.`}
            </span>
          </span>
        </div>
      )}

      {/* ── Slit-after-print workflow + Cutter Cavity ─────────────
          Slit: print a WIDE web with N×M cavities, slit into N lanes,
          then die-cut each lane separately.
          Cutter Cavity: parts per die stamp (per machine). When slit
          is ON, each cutter processes ONE lane so Cut Total/Shot =
          cutter_cavity. When slit is OFF (in-line press), all webs
          are cut simultaneously so Cut Total = num_webs × cutter. */}
      <div className="cl-pc-shared cl-pc-shared--spaced">
        <div className="cl-pc-shared-title">Slit workflow + Cutter cavity · Slit & số cavity mỗi dập</div>
        <div className="sc-grid4">
          <div className="sc-field" title="Check if the press prints a WIDE web that is then slit into multiple narrower webs before die-cutting.">
            <label>
              <input type="checkbox" checked={slit}
                onChange={e => onField('slit_after_print', e.target.checked)}
                className="cl-pc-checkbox" />
              Slit after print?
            </label>
          </div>
          <div className="sc-field" title="Number of narrower lanes produced by the slitter. Each lane typically gets its own cutter.">
            <label>Slit Lanes</label>
            <DecimalInput value={state.slit_lane_count} onChange={v => onField('slit_lane_count', v)} disabled={!slit} className="sc-input" />
          </div>
          <div className="sc-field" title="Derived: total cavities across the WIDE print web = slit_lanes × parts_web_across (when slit) or num_webs × parts_web_across (no slit).">
            <label>Print Cavities Across (derived)</label>
            <input type="text" value={printCavAcross} disabled className="sc-input sc-derived" />
          </div>
          <div className="sc-field" title={
            `Parts per cutter stamp — how many labels one cutter die produces in one stamp. ` +
            `Default = parts_web_across × parts_in_md = ${cutterCavityAuto} (one-lane's worth). ` +
            `Override with 0 to reset to auto.`
          }>
            <label>Cutter Cavity{Number(state.cutter_cavity) === 0 ? ` (auto = ${cutterCavityAuto})` : ''}</label>
            <DecimalInput value={state.cutter_cavity}
              onChange={v => onField('cutter_cavity', v)}
              className="sc-input"
              style={Number(state.cutter_cavity) > 0 ? { color: '#b45309', fontWeight: 700 } : undefined} />
          </div>
          <div className="sc-field" title={
            slit
              ? `Slit ON — each cutter processes ONE lane per stamp: Cut Total = cutter_cavity = ${cutterCavity}.`
              : `Slit OFF (in-line) — all webs cut on same stroke: Cut Total = num_webs × cutter_cavity = ${numWebs} × ${cutterCavity} = ${cutTotalPerShot}.`
          }>
            <label>Cut Total / Shot</label>
            <input type="text" value={cutTotalPerShot} disabled
              className="sc-input sc-derived"
              style={slit ? { color: '#6d28d9', fontWeight: 700, background: '#f5f3ff' } : undefined} />
          </div>
          <div className="sc-field" title="Override min slit-lane width in mm. Defaults: 25mm (general RDC), 30mm (Brotech). Validator errors when lane < this value. 0 = use industry default 25mm.">
            <label>Min Slit Lane (mm)</label>
            <DecimalInput value={state.min_slit_lane_width_mm}
              onChange={v => onField('min_slit_lane_width_mm', v)}
              disabled={!slit}
              className="sc-input"
              placeholder="default 25" />
          </div>
        </div>
        {slit && (
          <div className="cl-pc-banner cl-pc-banner--info">
            <span>
              ℹ Slit ON — sau slit mỗi lane chạy riêng 1 cutter:
              <span className="cl-pc-banner--md">• <b>Print</b> 1 web × {printCavAcross} cav × {partsInMd} MD = <b>{printCavAcross * partsInMd}</b> parts/print-repeat</span>
              <span className="cl-pc-banner--md">• <b>Slit</b> thành {slitCount} lane ({partsAcross} cav/lane × {partsInMd} MD = {cutterCavityAuto}/lane)</span>
              <span className="cl-pc-banner--md">• <b>Cut</b> mỗi cutter dập ra <b>{cutterCavity}</b> parts/shot{Number(state.cutter_cavity) > 0 ? ' (đã override)' : ' (= auto)'}</span>
              <span className="cl-pc-banner--md">• Chạy {slitCount} cutter song song → tổng throughput = {slitCount} × {cutterCavity} = {slitCount * cutterCavity} parts/stamp-cycle</span>
            </span>
          </div>
        )}
        {!slit && numWebs > 1 && (
          <div className="cl-pc-banner cl-pc-banner--ok">
            ℹ In-line ({numWebs} webs) — cùng 1 máy cut đồng thời tất cả web: Cut Total = {numWebs} × {cutterCavity} = {cutTotalPerShot} parts/shot.
          </div>
        )}
      </div>
      <PrintCutRatioHint state={state} />
    </div>
  );
}

// Print vs Cut product-size mismatch banner (Sprint 13b). Sits at the
// top of the Print sub-tab. Three states:
//   - Both unset       → no banner (nothing to compare yet)
//   - Only Cut set     → reminder to sync Print from Cut (fills both
//                        fields in one click)
//   - Both set, differ → red warning with both values + "Sync from Cut"
//                        and "Sync to Cut" one-click fixes
//   - Both set, equal  → quiet green tick (confirmation, not noise)
//
// The goal is to catch the documentation mistake where a print artwork
// was sized for one spec but the die was made for another — a class of
// bug that previously only surfaced on the physical proof.
function PrintCutSizeMismatch({ state, onField }) {
  const cutW    = Number(state.part_width)        || 0;
  const cutL    = Number(state.part_length_md)    || 0;
  const prW     = Number(state.print_part_width)  || 0;
  const prL     = Number(state.print_part_length_md) || 0;

  const cutSet   = cutW > 0 && cutL > 0;
  const printSet = prW  > 0 && prL  > 0;

  if (!cutSet && !printSet) return null;

  const syncFromCut = () => {
    if (cutW) onField('print_part_width', cutW);
    if (cutL) onField('print_part_length_md', cutL);
  };
  const syncToCut = () => {
    if (prW) onField('part_width', prW);
    if (prL) onField('part_length_md', prL);
  };

  if (!printSet && cutSet) {
    return (
      <div className="cl-pc-banner cl-pc-banner--warn">
        <span>⚠ Print product size not set. Cut tab has <b>{cutW}×{cutL}</b> mm.</span>
        <span className="cl-pc-banner-actions">
          <button type="button" onClick={syncFromCut} className="sc-inline-btn">Sync from Cut</button>
        </span>
      </div>
    );
  }

  if (printSet && !cutSet) {
    return (
      <div className="cl-pc-banner cl-pc-banner--warn">
        <span>⚠ Cut tab's Die Size not set. Print has <b>{prW}×{prL}</b> mm.</span>
        <span className="cl-pc-banner-actions">
          <button type="button" onClick={syncToCut} className="sc-inline-btn">Sync to Cut</button>
        </span>
      </div>
    );
  }

  // Both are set — compare. Allow sub-0.01 mm float slack so scientific-
  // notation drift doesn't false-flag.
  const EPSILON = 0.01;
  const same = Math.abs(prW - cutW) < EPSILON && Math.abs(prL - cutL) < EPSILON;
  if (same) {
    return (
      <div className="cl-pc-banner cl-pc-banner--ok">
        ✓ Print product size matches Cut die size (<b>{cutW}×{cutL}</b> mm).
      </div>
    );
  }

  return (
    <div className="cl-pc-banner cl-pc-banner--err">
      <span>
        ⚠ <b>Print vs Cut product-size mismatch.</b>{' '}
        Print: <b>{prW}×{prL}</b> mm · Cut die: <b>{cutW}×{cutL}</b> mm. Likely a
        documentation mistake — the die-cut output should match the print designer's target.
      </span>
      <span className="cl-pc-banner-actions">
        <button type="button" onClick={syncFromCut} className="sc-inline-btn">Sync Print ← Cut</button>
        <button type="button" onClick={syncToCut} className="sc-inline-btn">Sync Cut ← Print
        </button>
      </span>
    </div>
  );
}

// Shared footer inside both tabs — when plate + magnetic differ it shows
// the pitch ratio + a warning if the ratio isn't an integer (1:1, 2:1, 3:1
// are OK; 1.8:1 means the cylinders drift out of registration).
function PrintCutRatioHint({ state }) {
  const pt = Number(state.plate_tooth) || 0;
  const mt = Number(state.magnetic_tooth) || 0;
  if (!pt || !mt) return null;
  if (pt === mt) {
    return (
      <div className="cl-pc-ratio cl-pc-ratio-ok">
        ✓ Plate + Magnetic share tooth count {pt}T — single-ratio 1:1 setup.
      </div>
    );
  }
  const ratio = pt / mt;
  const inv = mt / pt;
  const isInteger = Math.abs(ratio - Math.round(ratio)) < 0.02
    || Math.abs(inv - Math.round(inv)) < 0.02;
  const ratioText = ratio > 1
    ? `${Math.round(ratio)}:1 (${pt}T plate : ${mt}T magnetic)`
    : `1:${Math.round(inv)} (${pt}T plate : ${mt}T magnetic)`;
  if (isInteger) {
    return (
      <div className="cl-pc-ratio cl-pc-ratio-ok">
        ✓ Integer ratio {ratioText} — cylinders stay in registration.
      </div>
    );
  }
  return (
    <div className="cl-pc-ratio cl-pc-ratio-warn">
      ⚠ Non-integer ratio {ratio.toFixed(3)} ({pt}T / {mt}T) — cylinders will
      drift out of registration. Pick a tooth pair that is an integer
      multiple (1:1, 2:1, 3:1, …).
    </div>
  );
}

// ─── Layout Summary cards (Print-focused / Cut-focused) ─────────
//
// Two variants swapped by the PrintCutLayout sub-tab so each tab
// shows only the derived metrics relevant to its side.
//   Print side: net dimensions, bleed, gross print size, plate cyl.
//   Cut   side: die outer, pitch, layout/sheet, pcs/roll.
// Both use `.cl-summary` / `.cl-sum-*` styling for a consistent look.

export function PrintLayoutSummary({ state, pitch }) {
  const toothPitch = state.tooth_pitch_mm || 3.175;
  const plateTooth = Number(state.plate_tooth) || 0;
  const netW = Number(state.part_net_width) || 0;
  const netL = Number(state.part_net_length) || 0;
  const bTd  = Number(state.bleed_td_mm) || 0;
  const bMd  = Number(state.bleed_md_mm) || 0;
  // Product size — prefer the Print-tab's own field when set, fall back
  // to the Cut-side `part_width/length_md` (which is authoritative for
  // geometry). Sprint 13b surfaces a mismatch banner at the top of the
  // Print sub-tab if they diverge.
  const prodW = Number(state.print_part_width)      || Number(state.part_width) || 0;
  const prodL = Number(state.print_part_length_md)  || Number(state.part_length_md) || 0;
  const imageSize = (netW && netL) ? `${netW} × ${netL} mm` : '—';
  const productSize = (prodW && prodL) ? `${prodW} × ${prodL} mm` : '—';
  const bleedStr = (bTd || bMd) ? `±${bTd.toFixed(1)} TD / ±${bMd.toFixed(1)} MD` : '—';
  const slit = !!state.slit_after_print;
  const slitCount = Math.max(1, Number(state.slit_lane_count) || 1);
  const partsAcross = Math.max(1, Number(state.parts_web_across) || 1);
  const partsInMd  = Math.max(1, Number(state.parts_in_md) || 1);
  const numWebs    = Math.max(1, Number(state.num_webs) || 1);
  const printCavAcross = slit ? slitCount * partsAcross : numWebs * partsAcross;
  const printTotal = printCavAcross * partsInMd;

  // ── Bidirectional inference (Sprint 13d) ──────────────────────
  // Physical relationship:  plate_circ = pitch × parts_in_md
  // Equivalently:           plate_tooth × 3.175 = (part_length_md + min_gap_md) × parts_in_md
  //
  // The card now reasons over both ends so the operator only has to
  // type one of {part geometry, plate tooth} and the other side surfaces
  // as a SUGGESTED value. Three states:
  //
  //   1. Both set      — show both, cross-check coherence (✓ or ⚠).
  //   2. Pitch only    — derive suggested plate_tooth (ceil to integer).
  //   3. Plate only    — derive effective Pitch from plate_circ / parts_in_md.
  //
  // The suggested values are read-only hints; nothing auto-mutates state.
  // If the operator wants to lock in a suggestion they type it into the
  // Plate Tooth / Min Gap inputs themselves — keeps a single source of
  // truth for the saved quote.
  const directPitch = Number.isFinite(pitch) && pitch > 0
    ? pitch
    : ((Number(state.part_length_md) || 0) + (Number(state.min_gap_md) || 0));
  const haveGeometry = directPitch > 0;
  const havePlate    = plateTooth > 0;
  const plateCirc    = havePlate ? plateTooth * toothPitch : 0;

  // Display values for the two rows + their annotation strings.
  let pitchDisplay = '—';
  let pitchHint    = '';
  let plateDisplay = '—';
  // Mismatch state surfaced as a SEPARATE row in the card so the
  // expected-cylinder badge isn't crammed inline (Sprint 14n-5).
  let plateOk      = false;       // true → "= N× Pitch ✓" annotation
  let plateMismatch = null;       // { expectedT, expectedMm } when present
  let plateSuggested = false;     // true → "· suggested" annotation
  let plateFromPitch = false;     // true → "· from plate" annotation on Pitch row

  if (haveGeometry && havePlate) {
    // Both set — cross-check.
    pitchDisplay = directPitch.toFixed(2);
    plateDisplay = `${plateTooth}T → ${plateCirc.toFixed(2)} mm`;
    const expectedCirc = directPitch * partsInMd;
    const drift = Math.abs(plateCirc - expectedCirc);
    if (drift < 0.05) {
      // Coherent — only annotate if parts_in_md > 1 (otherwise the
      // equality is trivial and the hint adds noise).
      if (partsInMd > 1) plateOk = true;
    } else {
      // Drift — surface the NEAREST integer-tooth cylinder so the
      // operator can compare. Round (not ceil) because for plate cyl
      // a hair-under target pitch is ALWAYS preferable to a several-mm
      // over: under = gap shrinks 0.001-0.05 mm (still within die-cut
      // tolerance), over = gap fattens by full tooth-pitch increments
      // (3.175 mm jumps that often blow past G_max). Sprint 14c fix —
      // bug was: pitch 269.88 → ceil(85.0016) = 86T (off +3.17 mm)
      // when 85T would only be off −0.005 mm.
      const suggT = Math.round(expectedCirc / toothPitch);
      plateMismatch = {
        expectedT: suggT,
        expectedMm: (suggT * toothPitch).toFixed(2),
      };
    }
  } else if (haveGeometry && !havePlate) {
    // Geometry known, plate not set — suggest plate_tooth via nearest
    // integer rounding (see Sprint 14c rationale above).
    pitchDisplay = directPitch.toFixed(2);
    const suggT = Math.round(directPitch * partsInMd / toothPitch);
    const suggCirc = suggT * toothPitch;
    plateDisplay = `${suggT}T → ${suggCirc.toFixed(2)} mm`;
    plateSuggested = true;
  } else if (!haveGeometry && havePlate) {
    // Plate known, geometry unknown — derive effective Pitch.
    const derivedPitch = plateCirc / partsInMd;
    pitchDisplay = derivedPitch.toFixed(2);
    pitchHint = ' · from plate';
    plateFromPitch = true;
    plateDisplay = `${plateTooth}T → ${plateCirc.toFixed(2)} mm`;
  }
  // Both unset → both rows show '—' (no inference possible).
  void plateFromPitch; // pitchHint already carries the cue

  return (
    <div className="cl-summary">
      <div className="cl-sum-title">Layout Summary · Print</div>
      <div className="cl-sum-row"><span>① Product Size</span><b>{productSize}</b></div>
      <div className="cl-sum-row"><span>② Image Area</span><b>{imageSize}</b></div>
      <div className="cl-sum-row"><span>③ Bleed</span><b>{bleedStr}</b></div>
      <div className="cl-sum-row">
        <span>Pitch (mm)</span>
        <b>{pitchDisplay}{pitchHint && <span className="cl-sum-ok">{pitchHint.replace(/^ · /, '')}</span>}</b>
      </div>
      <div className="cl-sum-row"><span>Print Cav Across</span><b>{printCavAcross}{slit ? ` (${slitCount}×${partsAcross})` : (numWebs > 1 ? ` (${numWebs}×${partsAcross})` : '')}</b></div>
      <div className="cl-sum-row"><span>Print Total/Shot</span><b>{printTotal}</b></div>
      {(haveGeometry || havePlate) && (
        <>
          <div className="cl-sum-row">
            <span>Plate Cyl</span>
            <b>
              {plateDisplay}
              {plateOk && <span className="cl-sum-ok">= {partsInMd}× Pitch ✓</span>}
              {plateSuggested && <span className="cl-sum-ok">suggested</span>}
            </b>
          </div>
          {plateMismatch && (
            <div className="cl-sum-mismatch">
              <span className="cl-sum-mismatch-label">≠ {partsInMd}× Pitch · expected</span>
              <b>{plateMismatch.expectedT}T → {plateMismatch.expectedMm} mm</b>
            </div>
          )}
        </>
      )}
      <div className="cl-sum-row"><span>Webs</span><b>{state.num_webs || '—'}</b></div>
    </div>
  );
}

export function CutLayoutSummary({ state, pitch, layoutPerSheet }) {
  const sizeStr = (state.part_width && state.part_length_md)
    ? `${state.part_width} × ${state.part_length_md} mm` : '—';
  const magPitch = state.magnetic_tooth
    ? (state.magnetic_tooth * (state.tooth_pitch_mm || 3.175)).toFixed(2) : '—';
  const slit = !!state.slit_after_print;
  const slitCount = Math.max(1, Number(state.slit_lane_count) || 1);
  const partsAcross = Math.max(1, Number(state.parts_web_across) || 1);
  const partsInMd  = Math.max(1, Number(state.parts_in_md) || 1);
  const printCavAcross = slit ? slitCount * partsAcross : Math.max(1, Number(state.num_webs) || 1) * partsAcross;
  const cutterCavityAuto = partsAcross * partsInMd;
  const cutterCavity = Number(state.cutter_cavity) > 0
    ? Number(state.cutter_cavity) : cutterCavityAuto;
  // Sprint 13c — Pcs/Roll now reflects the operator-entered field
  // `state.pcs_per_roll` (Cut tab Shared header, next to Edge Right)
  // rather than the misnamed `parts_per_shot × num_webs` derivation.
  // The previous behaviour confused operators because "Pcs/Roll" really
  // means pieces per ROLL of finished material (in the tens of thousands),
  // not pieces per die-press shot. If the field is left blank, show "—"
  // so the data-entry expectation stays explicit.
  const pcsRollEntered = Number(state.pcs_per_roll) || 0;
  return (
    <div className="cl-summary">
      <div className="cl-sum-title">Layout Summary · Cut</div>
      <div className="cl-sum-row"><span>Die Size</span><b>{sizeStr}</b></div>
      <div className="cl-sum-row"><span>Pitch (mm)</span><b>{pitch > 0 ? pitch.toFixed(2) : '—'}</b></div>
      <div className="cl-sum-row"><span>Magnetic Pitch</span><b>{magPitch}</b></div>
      {slit && (
        <>
          <div className="cl-sum-row"><span>Print Cav Across</span><b>{printCavAcross}</b></div>
          <div className="cl-sum-row"><span>Slit Lanes</span><b>{slitCount}</b></div>
        </>
      )}
      <div className="cl-sum-row"><span>Cutter Cavity</span><b>{cutterCavity}{Number(state.cutter_cavity) > 0 ? ' *' : ''}</b></div>
      <div className="cl-sum-row"><span>Layout/Sheet</span><b>{layoutPerSheet > 0 ? layoutPerSheet : '—'}</b></div>
      <div className="cl-sum-row"><span>Webs</span><b>{state.num_webs || '—'}</b></div>
      <div className="cl-sum-row"><span>Pcs/Roll</span><b>{pcsRollEntered > 0 ? pcsRollEntered.toLocaleString() : '—'}</b></div>
    </div>
  );
}

// MD / TD quick reference — bilingual EN-VN card. Renders below the
// Summary + Suggestion row so operators can always see what the
// direction suffixes on every Layout field mean without opening the
// Legend tab.
//
// Sprint 13b: collapsed by default. Operators who already know MD/TD
// see only the header row (~24 px tall) instead of a full-height glossary
// every time they open the Layout tab. Click the compass icon or the
// title to expand. State lives in localStorage so a user's preference
// survives tab switches + page reloads.
export function MdTdLegendCard() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('ops_mdtd_open') === '1';
    } catch { return false; }
  });
  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('ops_mdtd_open', next ? '1' : '0'); }
      catch { /* quota / private-mode — session-only is fine */ }
      return next;
    });
  };
  return (
    <div className={`cl-mdtd-card ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="cl-mdtd-head cl-mdtd-head-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="cl-mdtd-body"
        title={open ? 'Collapse' : 'Expand · Click to show MD/TD glossary'}
      >
        <span className="cl-mdtd-icon" aria-hidden="true">🧭</span>
        <b>MD · TD — what do the suffixes mean?</b>
        <span className="cl-bi-vi cl-bi-vi--inline">MD · TD — ý nghĩa của các hậu tố</span>
        <span className="cl-mdtd-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {!open ? null : (
      <div id="cl-mdtd-body">
      <div className="cl-mdtd-grid">
        <div className="cl-mdtd-col">
          <div className="cl-mdtd-axis">MD</div>
          <div className="cl-mdtd-en">
            <b>Machine Direction</b> — the direction the web travels
            through the press as the roll unwinds. Runs along the
            length of the roll, parallel to the print / die cylinder's
            rotation.
          </div>
          <div className="cl-bi-vi">
            <b>Chiều máy (chiều chạy)</b> — hướng vật liệu chạy qua máy
            khi cuộn tháo ra. Chạy dọc theo chiều dài cuộn, song song
            với trục quay của trục in / trục bế.
          </div>
          <div className="cl-mdtd-fields">
            <span className="cl-mdtd-label">Fields · Các trường:</span>
            <code>sheet_length</code>, <code>min_gap_md</code>,
            <code>part_length_md</code>, <code>bleed_md_mm</code>,
            <code>perf_offset_mm</code>, <code>parts_in_md</code>
          </div>
        </div>
        <div className="cl-mdtd-col">
          <div className="cl-mdtd-axis">TD</div>
          <div className="cl-mdtd-en">
            <b>Transverse Direction</b> (also CD — Cross Direction) —
            perpendicular to MD, running across the web width. Measures
            part width, web width, and edge margins.
          </div>
          <div className="cl-bi-vi">
            <b>Chiều ngang web</b> (còn gọi CD — Cross Direction) —
            vuông góc với MD, theo bề rộng web. Đo chiều rộng part,
            bề rộng web và edge trái/phải.
          </div>
          <div className="cl-mdtd-fields">
            <span className="cl-mdtd-label">Fields · Các trường:</span>
            <code>web_width_td</code>, <code>part_width</code>,
            <code>bleed_td_mm</code>, <code>edge_margin_td_left</code>,
            <code>edge_margin_td_right</code>, <code>parts_web_across</code>
          </div>
        </div>
      </div>
      <div className="cl-mdtd-viz-grid">
        <div className="cl-mdtd-viz-col">
          <div className="cl-mdtd-viz-cap">
            General axes · Trục tổng quát
          </div>
          <pre className="cl-mdtd-viz">{`   ← TD (web width · bề ngang cuộn) →
 ┌──────────────────────────────┐  ↑
 │  [part] [part] [part] [part] │  │
 │  [part] [part] [part] [part] │  │  MD
 │  [part] [part] [part] [part] │  │  (chiều chạy /
 │  [part] [part] [part] [part] │  │   unwind direction)
 └──────────────────────────────┘  ↓
            → web exits the press`}</pre>
        </div>
        <div className="cl-mdtd-viz-col">
          <div className="cl-mdtd-viz-cap">
            Example · Ví dụ: parts_in_md = 3, parts_web_across = 5
          </div>
          <pre className="cl-mdtd-viz">{`   ← TD: 5 parts/web across →
 ┌──────────────────────────────┐  ↑
 │  [p]  [p]  [p]  [p]  [p]     │  │
 │  [p]  [p]  [p]  [p]  [p]     │  │  MD: 3 rows
 │  [p]  [p]  [p]  [p]  [p]     │  │
 └──────────────────────────────┘  ↓
  Layout/Sheet = 3 × 5 = 15 pcs
        (parts_in_md × parts_web_across)`}</pre>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}

// Print-side Layout Suggestion was removed Sprint 14n-3 per operator
// feedback ("không meaningful"). The card showed plate-tooth required
// vs current, derived purely from image_length + 2×bleed_md, which the
// operator can read off the inputs grid directly. Full cylinder
// engineering lives in Design Tools (Gallus calculator) instead.
