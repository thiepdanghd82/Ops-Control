// @ts-check
/**
 * calcReducer — pure reducer extracted from CalcContext.jsx so tests can
 * import the REAL reducer instead of maintaining a hand-written replica.
 *
 * Why this matters: the prior regression tests in spFieldReducer.test.js
 * duplicated the reducer logic inline. A dispatch/reducer key mismatch
 * that shipped to production (SET_SP_*_FIELD using {spi, mi} vs reducer
 * reading {spIdx, idx}) wasn't caught because the test replica used the
 * correct keys while the real code drifted. Importing the real reducer
 * closes that gap — any drift breaks the test.
 *
 * Keep this module pure: no React, no DOM, no I/O.
 */
import {
  createStdState,
  createEmptyStdState,
  createCplxState,
  createSubProduct,
} from '../services/calcEngine.js';
import { upgradeCplxState } from '../services/cplxMigration.js';
import { upgradeStdState } from '../services/stdMigration.js';
import { applyPrintToCutSync } from '../services/layoutFieldSync.js';

// ── Action Types ──
// Exported so tests + advanced callers can reference canonical strings
// instead of string-literal typos in dispatch({ type: '...' }) calls.
export const CALC_ACTIONS = {
  // Standard state
  SET_STD_FIELD: 'SET_STD_FIELD',
  SET_STD_STATE: 'SET_STD_STATE',
  SET_MATERIAL_FIELD: 'SET_MATERIAL_FIELD',
  SET_INK_FIELD: 'SET_INK_FIELD',
  SET_PROCESS_FIELD: 'SET_PROCESS_FIELD',
  ADD_MATERIAL_ROW: 'ADD_MATERIAL_ROW',
  REMOVE_MATERIAL_ROW: 'REMOVE_MATERIAL_ROW',
  // Alt-materials feature (Sprint S-ALT-MAT, PR #A)
  SET_MATERIALS_ACTIVE: 'SET_MATERIALS_ACTIVE',
  COPY_MATERIALS: 'COPY_MATERIALS',
  ADD_INK_ROW: 'ADD_INK_ROW',
  REMOVE_INK_ROW: 'REMOVE_INK_ROW',
  ADD_PROCESS_ROW: 'ADD_PROCESS_ROW',
  REMOVE_PROCESS_ROW: 'REMOVE_PROCESS_ROW',
  TOGGLE_ROW_HIDDEN: 'TOGGLE_ROW_HIDDEN',
  SET_ACTIVE_MOQ: 'SET_ACTIVE_MOQ',
  SET_EXTRA_MOQ: 'SET_EXTRA_MOQ',
  SET_NUM_MOQ: 'SET_NUM_MOQ',
  // Sprint S-PACK-SHIP-PER-TIER — per-MOQ packing/shipping override.
  // Routes by stdState.active_moq_idx: tier 0 → top-level state[field];
  // tier>0 → extra_moqs[idx-1].packing[field] (sparse). Empty / null
  // value deletes the key (revert to base); explicit 0 stores 0.
  SET_STD_TIER_PACKING_FIELD: 'SET_STD_TIER_PACKING_FIELD',
  SET_CPLX_TIER_PACKING_FIELD: 'SET_CPLX_TIER_PACKING_FIELD',

  // Complex state
  SET_CPLX_FIELD: 'SET_CPLX_FIELD',
  SET_CPLX_STATE: 'SET_CPLX_STATE',
  ADD_SUBPRODUCT: 'ADD_SUBPRODUCT',
  REMOVE_SUBPRODUCT: 'REMOVE_SUBPRODUCT',
  SET_SP_FIELD: 'SET_SP_FIELD',
  SET_SP_MATERIAL_FIELD: 'SET_SP_MATERIAL_FIELD',
  SET_SP_INK_FIELD: 'SET_SP_INK_FIELD',
  SET_SP_PROCESS_FIELD: 'SET_SP_PROCESS_FIELD',
  ADD_SP_MATERIAL_ROW: 'ADD_SP_MATERIAL_ROW',
  REMOVE_SP_MATERIAL_ROW: 'REMOVE_SP_MATERIAL_ROW',
  // Alt-materials per-subproduct (Sprint S-ALT-MAT, PR #B)
  SET_SP_MATERIALS_ACTIVE: 'SET_SP_MATERIALS_ACTIVE',
  COPY_SP_MATERIALS: 'COPY_SP_MATERIALS',
  ADD_SP_INK_ROW: 'ADD_SP_INK_ROW',
  REMOVE_SP_INK_ROW: 'REMOVE_SP_INK_ROW',
  ADD_SP_PROCESS_ROW: 'ADD_SP_PROCESS_ROW',
  REMOVE_SP_PROCESS_ROW: 'REMOVE_SP_PROCESS_ROW',

  // BOM tree (structural, cost-aggregation-neutral per Sprint 3.4 deferral)
  SET_SP_ASSEMBLY: 'SET_SP_ASSEMBLY',
  ADD_BOM_ENTRY: 'ADD_BOM_ENTRY',
  REMOVE_BOM_ENTRY: 'REMOVE_BOM_ENTRY',
  SET_BOM_ENTRY_FIELD: 'SET_BOM_ENTRY_FIELD',

  // Global
  LOAD_QUOTE: 'LOAD_QUOTE',
  RESET_STD: 'RESET_STD',
  RESET_CPLX: 'RESET_CPLX',
  MARK_CLEAN: 'MARK_CLEAN',
  SET_ACTIVE_QUOTE_ID: 'SET_ACTIVE_QUOTE_ID',
  SET_PENDING_QUOTE: 'SET_PENDING_QUOTE',
  CLEAR_PENDING_QUOTE: 'CLEAR_PENDING_QUOTE',
};

const A = CALC_ACTIONS;

// ── Typed action creators ──
// Sprint 20 — typed action creators for the SP-scope dispatches that
// previously shipped with a key-mismatch bug ({spi, mi} vs {spIdx, idx}).
// With `@ts-check` on + callers using these creators, TypeScript rejects
// the legacy shape at author-time instead of crashing at runtime. Every
// creator is a thin wrapper that returns the canonical action object;
// no logic, no side-effects, safe to inline if perf becomes a concern.
//
// Callers should use these INSTEAD OF raw
//   dispatch({ type: 'SET_SP_FIELD', payload: { ... } })
// so the payload shape is verified at the call site.

/** @typedef {{ spIdx: number, field: string, value: any }} SetSpFieldPayload */
/** @typedef {{ spIdx: number, idx: number, field: string, value: any }} SetSpRowFieldPayload */
/** @typedef {{ spIdx: number }} SpScopePayload */
/** @typedef {{ spIdx: number, idx: number }} SpRowScopePayload */

/** @param {SetSpFieldPayload} payload */
export function setSpField(payload) {
  return { type: A.SET_SP_FIELD, payload };
}
/** @param {SetSpRowFieldPayload} payload */
export function setSpMaterialField(payload) {
  return { type: A.SET_SP_MATERIAL_FIELD, payload };
}
/** @param {SetSpRowFieldPayload} payload */
export function setSpInkField(payload) {
  return { type: A.SET_SP_INK_FIELD, payload };
}
/** @param {SetSpRowFieldPayload} payload */
export function setSpProcessField(payload) {
  return { type: A.SET_SP_PROCESS_FIELD, payload };
}
/** @param {SpScopePayload} payload */
export function addSpMaterialRow(payload) {
  return { type: A.ADD_SP_MATERIAL_ROW, payload };
}
/** @param {SpRowScopePayload} payload */
export function removeSpMaterialRow(payload) {
  return { type: A.REMOVE_SP_MATERIAL_ROW, payload };
}
/** @param {SpScopePayload} payload */
export function addSpInkRow(payload) {
  return { type: A.ADD_SP_INK_ROW, payload };
}
/** @param {SpRowScopePayload} payload */
export function removeSpInkRow(payload) {
  return { type: A.REMOVE_SP_INK_ROW, payload };
}
/** @param {SpScopePayload} payload */
export function addSpProcessRow(payload) {
  return { type: A.ADD_SP_PROCESS_ROW, payload };
}
/** @param {SpRowScopePayload} payload */
export function removeSpProcessRow(payload) {
  return { type: A.REMOVE_SP_PROCESS_ROW, payload };
}
/**
 * REMOVE_SUBPRODUCT — one of the Sprint 11 bugs was callers passing a
 * bare `idx` (number) instead of `{idx}`. This creator eliminates that
 * class at compile time.
 *
 * @param {{ idx: number }} payload
 */
export function removeSubProduct(payload) {
  return { type: A.REMOVE_SUBPRODUCT, payload };
}
/**
 * ADD_SUBPRODUCT — payload is an OBJECT (not a full SP). Earlier callers
 * passed the full `createSubProduct()` result; the reducer only reads
 * `payload.code`. Typed creator makes the contract explicit.
 *
 * @param {{ code?: string }} payload
 */
export function addSubProduct(payload) {
  return { type: A.ADD_SUBPRODUCT, payload };
}

// ── Helpers ──
export function updateAt(arr, idx, updates) {
  return arr.map((item, i) => (i === idx ? { ...item, ...updates } : item));
}

export function updateSP(subproducts, spIdx, updates) {
  return subproducts.map((sp, i) => (i === spIdx ? { ...sp, ...updates } : sp));
}

/**
 * Alt-materials feature (Sprint S-ALT-MAT, PR #A).
 *
 * Std state carries three persistent fields — materials_main, materials_alt,
 * materials_active — plus a legacy `materials` MIRROR that always reflects
 * the active set. Existing readers (calcAll, getActiveTierState, validators,
 * ink base-mat lookups, UI tables) keep using `state.materials` without
 * change; the mirror invariant is enforced by every reducer action that
 * touches materials.
 *
 * stdWithMaterials(stdState, nextActive) — set the active-set array and
 * recompute the mirror so the two stay in sync. Pass an array (replacement
 * for the active set) and optionally a new active flag.
 */
function stdWithMaterials(stdState, nextActive, opts = {}) {
  const active = opts.active || stdState.materials_active || 'main';
  const next = { ...stdState, materials_active: active };
  if (active === 'alt') {
    next.materials_alt = nextActive;
    next.materials_main = stdState.materials_main || [];
  } else {
    next.materials_main = nextActive;
    next.materials_alt = stdState.materials_alt || [];
  }
  next.materials = nextActive;
  return next;
}

// Read the current active set from a Std state. Helper used by reducer
// actions that need to dispatch updates against whichever set is live.
function stdActiveMaterials(stdState) {
  if (stdState.materials_active === 'alt') return stdState.materials_alt || [];
  return stdState.materials_main || stdState.materials || [];
}

/**
 * SP-scoped mirror helpers (Sprint S-ALT-MAT, PR #B).
 *
 * Each subproduct now carries its own materials_main / materials_alt /
 * materials_active triple plus a legacy `sp.materials` MIRROR. Existing
 * calcEngine readers (aggregateComplex, applyCplxTierToSp) keep reading
 * `sp.materials`; reducer enforces the mirror invariant on every per-SP
 * material mutation.
 *
 * spWithMaterials(sp, nextActive, { active })
 *   Set the active-set array on a SP and recompute the mirror so the
 *   two stay in sync. Pass an array (replacement for the active set)
 *   and optionally a new active flag. Returns a NEW sp object.
 *
 * spActiveMaterials(sp)
 *   Read the SP's currently-live materials array — main when
 *   materials_active='main' (default), else alt.
 */
function spWithMaterials(sp, nextActive, opts = {}) {
  const active = opts.active || sp.materials_active || 'main';
  const next = { ...sp, materials_active: active };
  if (active === 'alt') {
    next.materials_alt = nextActive;
    next.materials_main = sp.materials_main || [];
  } else {
    next.materials_main = nextActive;
    next.materials_alt = sp.materials_alt || [];
  }
  next.materials = nextActive;
  return next;
}

function spActiveMaterials(sp) {
  if (sp.materials_active === 'alt') return sp.materials_alt || [];
  return sp.materials_main || sp.materials || [];
}

// ── Initial state factory ──
export function createInitialState() {
  return {
    stdState: createStdState(),
    cplxState: createCplxState(),
    isDirty: false,
    activeQuoteId: null,
    // Sprint 11 P0-2 — optimistic locking. Tracks the `_version` of
    // the server-side quote currently loaded. Sent on update so the
    // server can detect stale overwrites; reset to 0 on resets / new
    // quotes. See quotesStore.upsertQuote for server-side enforcement.
    activeQuoteVersion: 0,
    // Cross-tab "load this quote when the calculator mounts" handoff.
    // Previously stored in sessionStorage which was race-prone across
    // mount/useEffect timing and tab navigation.
    pendingQuote: null,
  };
}

// ── Reducer ──
export function calcReducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    // ── Standard ──
    case A.SET_STD_FIELD: {
      // FIX-32: writing a print_part_* field while the canonical part_*
      // is still 0 also mirrors into the canonical field. See
      // services/layoutFieldSync.js for the rationale.
      const patch = applyPrintToCutSync(state.stdState, payload.field, payload.value);
      return {
        ...state,
        isDirty: true,
        stdState: { ...state.stdState, ...patch },
      };
    }

    case A.SET_STD_STATE:
      return { ...state, isDirty: true, stdState: { ...state.stdState, ...payload } };

    case A.SET_MATERIAL_FIELD: {
      // Route to active set (main or alt) AND keep state.materials mirror
      // in sync via stdWithMaterials. Mirror keeps legacy readers green.
      const current = stdActiveMaterials(state.stdState);
      const next = updateAt(current, payload.idx, { [payload.field]: payload.value });
      return { ...state, isDirty: true, stdState: stdWithMaterials(state.stdState, next) };
    }

    case A.SET_INK_FIELD:
      return {
        ...state,
        isDirty: true,
        stdState: {
          ...state.stdState,
          inks: updateAt(state.stdState.inks, payload.idx, { [payload.field]: payload.value }),
        },
      };

    case A.SET_PROCESS_FIELD:
      return {
        ...state,
        isDirty: true,
        stdState: {
          ...state.stdState,
          processes: updateAt(state.stdState.processes, payload.idx, {
            [payload.field]: payload.value,
          }),
        },
      };

    case A.ADD_MATERIAL_ROW: {
      // Route to active set + sync mirror (alt-materials, PR #A).
      const current = stdActiveMaterials(state.stdState);
      const mats = [...current];
      if (mats.length < 20) {
        mats.push({
          _mid: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          row_type: mats.length < 10 ? 'Main.Mat' : 'Process Mat',
          code: '',
          ifs_code: '',
          desc: '',
          usage: 0,
          setup_lm: 0,
          cavities: 0,
          free_liner: 0,
          width: 0,
          log_width: 0,
          pitch_ovr: 0,
          offcut_yn: '',
          slitting_yn: '',
          df_yn: '',
          offcut_pct: 0,
          import_duty: 0,
          s_price: 0,
          g_price: 0,
          latest: 0,
        });
      }
      return { ...state, isDirty: true, stdState: stdWithMaterials(state.stdState, mats) };
    }

    case A.REMOVE_MATERIAL_ROW: {
      const current = stdActiveMaterials(state.stdState);
      const mats = current.filter((_, i) => i !== payload.idx);
      return { ...state, isDirty: true, stdState: stdWithMaterials(state.stdState, mats) };
    }

    // ── Alt-materials toggle + copy (Sprint S-ALT-MAT, PR #A) ──
    // SET_MATERIALS_ACTIVE: switch the active discriminator and remirror
    // state.materials to the new active set. Data of the inactive set is
    // preserved (just hidden from the UI). isDirty=true so the next save
    // round-trips materials_active to the server.
    case A.SET_MATERIALS_ACTIVE: {
      const want = payload?.value === 'alt' ? 'alt' : 'main';
      if ((state.stdState.materials_active || 'main') === want) return state;
      const ss = state.stdState;
      const nextActive = want === 'alt' ? ss.materials_alt || [] : ss.materials_main || [];
      return {
        ...state,
        isDirty: true,
        stdState: { ...ss, materials_active: want, materials: nextActive },
      };
    }

    // COPY_MATERIALS: deep-clone one set onto the other. Direction is
    // 'main_to_alt' | 'alt_to_main'. Source MUST be non-empty (caller
    // already disables the action otherwise). When the destination set
    // is also the active set, refresh the mirror. Carries an audit
    // signal (_alt_materials_op) the server inspects on next save.
    case A.COPY_MATERIALS: {
      const direction = payload?.direction;
      if (direction !== 'main_to_alt' && direction !== 'alt_to_main') return state;
      const ss = state.stdState;
      const src = direction === 'main_to_alt' ? ss.materials_main || [] : ss.materials_alt || [];
      const destBeforeKey = direction === 'main_to_alt' ? 'materials_alt' : 'materials_main';
      const destBefore = ss[destBeforeKey] || [];
      // structuredClone keeps rows decoupled — mutate-after-copy on one set
      // must NOT bleed into the other (spec §2.1).
      const cloned =
        typeof structuredClone === 'function'
          ? structuredClone(src)
          : JSON.parse(JSON.stringify(src));
      const next = { ...ss };
      if (direction === 'main_to_alt') next.materials_alt = cloned;
      else next.materials_main = cloned;
      // If the destination is currently active, refresh the mirror.
      const active = ss.materials_active || 'main';
      const destIsActive =
        (direction === 'main_to_alt' && active === 'alt') ||
        (direction === 'alt_to_main' && active === 'main');
      if (destIsActive) next.materials = cloned;
      // Server-side audit signal (stripped before persist). Carries the
      // detail needed for MATERIALS_COPY without round-tripping prev state.
      next._alt_materials_op = {
        type: 'copy',
        direction,
        source_count: src.length,
        dest_count_before: destBefore.length,
        ts: Date.now(),
      };
      return { ...state, isDirty: true, stdState: next };
    }

    case A.ADD_INK_ROW: {
      const inks = [...state.stdState.inks];
      if (inks.length < 10) {
        inks.push({
          // Row-identity for React key stability. Without _mid the JSX
          // keyed by index remounts the input on reorder/delete — losing
          // focus + cursor pos mid-typing, and contributing to the
          // "flash" perception during data sync. Same pattern as
          // materials (Sprint 11 _mid back-fill).
          _mid: `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: `Ink ${inks.length + 1}`,
          ifs_code: '',
          color: '',
          print_type: '',
          mesh_spec: '',
          pitch_mm: 0,
          base_mat: '',
          width: 0,
          coverage: 0,
          setup_kg: 0,
          area_pct: 0,
          clicks: 0,
          s_price: 0,
          g_price: 0,
          latest: 0,
        });
      }
      return { ...state, isDirty: true, stdState: { ...state.stdState, inks } };
    }

    case A.REMOVE_INK_ROW: {
      const inks = state.stdState.inks.filter((_, i) => i !== payload.idx);
      return { ...state, isDirty: true, stdState: { ...state.stdState, inks } };
    }

    case A.ADD_PROCESS_ROW: {
      // layout: 0 means "empty" — UI shows blank, engine falls back to 1
      // (calcEngine L345). Machine-UPH workcenters require explicit layout;
      // validation gates that per workcenter's Rate Table machine_rate.
      const procs = [
        ...state.stdState.processes,
        {
          // Row-identity for React key stability (same rationale as
          // inks/materials _mid).
          _mid: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: `Process ${state.stdState.processes.length + 1}`,
          process_type: '',
          workcenter: '',
          speed: 0,
          layout: 0,
          efficiency: 0.85,
          setup_h: 0,
          scrap_pct: 0.03,
          manual_uph: 0,
          tool_cost: 0,
          tool_type: '',
          tool_life: 0,
          extra_cost: 0,
          product_life: 1,
          eau_ovr: 0,
          repeat: 1,
        },
      ];
      return { ...state, isDirty: true, stdState: { ...state.stdState, processes: procs } };
    }

    case A.REMOVE_PROCESS_ROW: {
      const procs = state.stdState.processes.filter((_, i) => i !== payload.idx);
      return { ...state, isDirty: true, stdState: { ...state.stdState, processes: procs } };
    }

    case A.TOGGLE_ROW_HIDDEN: {
      const { section, idx } = payload;
      // section='materials' must route to the active set (alt-materials,
      // PR #A) so toggling hidden on the visible row updates the same
      // array the UI reads. inks/processes stay on the field directly.
      if (section === 'materials') {
        const current = stdActiveMaterials(state.stdState);
        const arr = [...current];
        arr[idx] = { ...arr[idx], hidden: !arr[idx].hidden };
        return { ...state, isDirty: true, stdState: stdWithMaterials(state.stdState, arr) };
      }
      const arr = [...state.stdState[section]];
      arr[idx] = { ...arr[idx], hidden: !arr[idx].hidden };
      return { ...state, isDirty: true, stdState: { ...state.stdState, [section]: arr } };
    }

    case A.SET_ACTIVE_MOQ:
      return { ...state, stdState: { ...state.stdState, active_moq_idx: payload.idx } };

    case A.SET_NUM_MOQ: {
      const num = payload.value;
      const extra = [...(state.stdState.extra_moqs || [])];
      while (extra.length < num - 1)
        extra.push({ moq: 0, price: 0, eau: '', target: null, price_vnd: 0, target_vnd: null });
      return {
        ...state,
        isDirty: true,
        stdState: { ...state.stdState, num_moq: num, extra_moqs: extra.slice(0, num - 1) },
      };
    }

    case A.SET_EXTRA_MOQ: {
      const extra = [...(state.stdState.extra_moqs || [])];
      extra[payload.idx] = { ...(extra[payload.idx] || {}), [payload.field]: payload.value };
      return { ...state, isDirty: true, stdState: { ...state.stdState, extra_moqs: extra } };
    }

    // Sprint S-PACK-SHIP-PER-TIER — Std side. Routes by active_moq_idx.
    // Tier 0 → top-level. Tier>0 → extra_moqs[idx-1].packing[field].
    // Empty/null value deletes the key (revert to base); explicit 0
    // stores 0 (Henry's dễ-vỡ case).
    case A.SET_STD_TIER_PACKING_FIELD: {
      const { field, value } = payload;
      const activeIdx = state.stdState.active_moq_idx || 0;
      if (activeIdx === 0) {
        return {
          ...state,
          isDirty: true,
          stdState: { ...state.stdState, [field]: value },
        };
      }
      const ei = activeIdx - 1;
      const extra = (state.stdState.extra_moqs || []).map((em, i) => {
        if (i !== ei) return em;
        const packing = { ...(em?.packing || {}) };
        if (value === '' || value == null) delete packing[field];
        else packing[field] = value;
        return { ...em, packing };
      });
      return { ...state, isDirty: true, stdState: { ...state.stdState, extra_moqs: extra } };
    }

    // ── Complex ──
    case A.SET_CPLX_FIELD:
      return {
        ...state,
        isDirty: true,
        cplxState: { ...state.cplxState, [payload.field]: payload.value },
      };

    case A.SET_CPLX_STATE:
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, ...payload } };

    // Sprint S-PACK-SHIP-PER-TIER — Cpx mirror of SET_STD_TIER_PACKING_FIELD.
    // Same delete/explicit-0 semantics; routes against cplxState.active_moq_idx.
    case A.SET_CPLX_TIER_PACKING_FIELD: {
      const { field, value } = payload;
      const activeIdx = state.cplxState.active_moq_idx || 0;
      if (activeIdx === 0) {
        return {
          ...state,
          isDirty: true,
          cplxState: { ...state.cplxState, [field]: value },
        };
      }
      const ei = activeIdx - 1;
      const extra = (state.cplxState.extra_moqs || []).map((em, i) => {
        if (i !== ei) return em;
        const packing = { ...(em?.packing || {}) };
        if (value === '' || value == null) delete packing[field];
        else packing[field] = value;
        return { ...em, packing };
      });
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, extra_moqs: extra } };
    }

    case A.ADD_SUBPRODUCT: {
      const code =
        payload.code || `SP ${String.fromCharCode(65 + state.cplxState.subproducts.length)}`;
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: [...state.cplxState.subproducts, createSubProduct(code)],
        },
      };
    }

    case A.REMOVE_SUBPRODUCT: {
      // SP removal shifts every index > removed by -1. Any v2-shape
      // reference arrays (bom[].sp_index, tooling_alloc[].sp_index)
      // that point at the removed SP must drop; everything above must
      // decrement. Without this, the BOM silently re-targets the wrong
      // SP after a delete — cost impact becomes invisible until the
      // user notices the tree misdraws.
      const removedIdx = payload.idx;
      const nextSps = state.cplxState.subproducts.filter((_, i) => i !== removedIdx);
      const shiftIndex = (entry) => {
        if (!entry || typeof entry.sp_index !== 'number') return entry;
        if (entry.sp_index === removedIdx) return null;
        if (entry.sp_index > removedIdx) return { ...entry, sp_index: entry.sp_index - 1 };
        return entry;
      };
      const prevBom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      const prevAlloc = Array.isArray(state.cplxState.tooling_alloc)
        ? state.cplxState.tooling_alloc
        : [];
      const nextBom = prevBom.map(shiftIndex).filter(Boolean);
      const nextAlloc = prevAlloc.map(shiftIndex).filter(Boolean);
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: nextSps,
          bom: nextBom,
          tooling_alloc: nextAlloc,
        },
      };
    }

    case A.SET_SP_FIELD: {
      // FIX-32: same print → cut lazy mirror as SET_STD_FIELD, scoped to
      // THIS subproduct (Complex's PrintSubTab reuses the shared
      // AdvancedLayoutBlock so the same trap surfaces per-SP).
      const sp = state.cplxState.subproducts[payload.spIdx];
      const patch = applyPrintToCutSync(sp, payload.field, payload.value);
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, patch),
        },
      };
    }

    case A.SET_SP_MATERIAL_FIELD: {
      // PR #B: route to active set + sync mirror (parallel to Std's
      // SET_MATERIAL_FIELD pattern). Existing readers of sp.materials
      // (aggregateComplex, applyCplxTierToSp) continue to work — the
      // mirror invariant is enforced by spWithMaterials.
      const sp = state.cplxState.subproducts[payload.spIdx];
      const current = spActiveMaterials(sp);
      const nextMats = updateAt(current, payload.idx, { [payload.field]: payload.value });
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(
            state.cplxState.subproducts,
            payload.spIdx,
            spWithMaterials(sp, nextMats)
          ),
        },
      };
    }

    case A.SET_SP_INK_FIELD: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
            inks: updateAt(sp.inks, payload.idx, { [payload.field]: payload.value }),
          }),
        },
      };
    }

    case A.SET_SP_PROCESS_FIELD: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
            processes: updateAt(sp.processes, payload.idx, { [payload.field]: payload.value }),
          }),
        },
      };
    }

    case A.ADD_SP_MATERIAL_ROW: {
      // PR #B: route to active set + sync mirror.
      const sp = state.cplxState.subproducts[payload.spIdx];
      const current = spActiveMaterials(sp);
      const mats = [
        ...current,
        {
          _mid: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          row_type: 'Main.Mat',
          code: '',
          ifs_code: '',
          desc: '',
          qpa: 0,
          usage: 0,
          setup_lm: 0,
          free_liner: 0,
          pitch: 0,
          width: 0,
          log_width: 0,
          pitch_ovr: 0,
          offcut_yn: '',
          slitting_yn: '',
          df_yn: '',
          offcut_pct: 0,
          import_duty: 0,
          s_price: 0,
          g_price: 0,
          latest: 0,
        },
      ];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(
            state.cplxState.subproducts,
            payload.spIdx,
            spWithMaterials(sp, mats)
          ),
        },
      };
    }

    case A.REMOVE_SP_MATERIAL_ROW: {
      // PR #B: filter active set + sync mirror.
      const sp = state.cplxState.subproducts[payload.spIdx];
      const current = spActiveMaterials(sp);
      const mats = current.filter((_, i) => i !== payload.idx);
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(
            state.cplxState.subproducts,
            payload.spIdx,
            spWithMaterials(sp, mats)
          ),
        },
      };
    }

    // ── Alt-materials per-subproduct toggle + copy (PR #B) ──
    // SET_SP_MATERIALS_ACTIVE: switch the SP's active discriminator and
    // remirror sp.materials to the new active set. Data of the inactive
    // set is preserved. isDirty=true so the next save round-trips.
    case A.SET_SP_MATERIALS_ACTIVE: {
      const { spIdx } = payload;
      const want = payload?.value === 'alt' ? 'alt' : 'main';
      const sp = state.cplxState.subproducts[spIdx];
      if (!sp) return state;
      if ((sp.materials_active || 'main') === want) return state;
      const nextActive = want === 'alt' ? sp.materials_alt || [] : sp.materials_main || [];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, spIdx, {
            materials_active: want,
            materials: nextActive,
          }),
        },
      };
    }

    // COPY_SP_MATERIALS: deep-clone one set onto the other for a single SP.
    // Mirrors the Std-side COPY_MATERIALS contract: structuredClone source
    // onto dest, refresh mirror when dest is active, attach an ephemeral
    // _alt_materials_op (NESTED per-SP — server iterates subproducts to
    // emit MATERIALS_COPY with sp_index in the detail JSON).
    case A.COPY_SP_MATERIALS: {
      const { spIdx, direction } = payload || {};
      if (direction !== 'main_to_alt' && direction !== 'alt_to_main') return state;
      const sp = state.cplxState.subproducts[spIdx];
      if (!sp) return state;
      const src = direction === 'main_to_alt' ? sp.materials_main || [] : sp.materials_alt || [];
      const destBeforeKey = direction === 'main_to_alt' ? 'materials_alt' : 'materials_main';
      const destBefore = sp[destBeforeKey] || [];
      const cloned =
        typeof structuredClone === 'function'
          ? structuredClone(src)
          : JSON.parse(JSON.stringify(src));
      const patch = {};
      if (direction === 'main_to_alt') patch.materials_alt = cloned;
      else patch.materials_main = cloned;
      const active = sp.materials_active || 'main';
      const destIsActive =
        (direction === 'main_to_alt' && active === 'alt') ||
        (direction === 'alt_to_main' && active === 'main');
      if (destIsActive) patch.materials = cloned;
      // Per-SP audit signal — stripped server-side before persist. Server
      // loops subproducts on save to emit one MATERIALS_COPY per SP that
      // carries the op.
      patch._alt_materials_op = {
        type: 'copy',
        direction,
        source_count: src.length,
        dest_count_before: destBefore.length,
        ts: Date.now(),
      };
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, spIdx, patch),
        },
      };
    }

    case A.ADD_SP_INK_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      const inks = [
        ...sp.inks,
        {
          // Row-identity for React key stability (mirrors Std ADD_INK_ROW).
          _mid: `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: `Ink ${sp.inks.length + 1}`,
          ifs_code: '',
          color: '',
          print_type: '',
          mesh_spec: '',
          pitch_mm: 0,
          base_mat: '',
          width: 0,
          coverage: 0,
          setup_kg: 0,
          area_pct: 0,
          s_price: 0,
          g_price: 0,
          latest: 0,
        },
      ];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { inks }),
        },
      };
    }

    case A.REMOVE_SP_INK_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
            inks: sp.inks.filter((_, i) => i !== payload.idx),
          }),
        },
      };
    }

    case A.ADD_SP_PROCESS_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      // layout: 0 = empty (see Standard ADD_PROCESS_ROW). Engine falls
      // back to 1 for labor-only workcenters; machine workcenters fail
      // validation until the user fills it.
      const procs = [
        ...sp.processes,
        {
          // Row-identity for React key stability (mirrors Std ADD_PROCESS_ROW).
          _mid: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: `Process ${sp.processes.length + 1}`,
          process_type: '',
          workcenter: '',
          speed: 0,
          layout: 0,
          efficiency: 0.85,
          setup_h: 0,
          scrap_pct: 0.03,
          manual_uph: 0,
          tool_cost: 0,
          tool_type: '',
          tool_life: 0,
          extra_cost: 0,
          product_life: 1,
          eau_ovr: 0,
          repeat: 1,
        },
      ];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { processes: procs }),
        },
      };
    }

    case A.REMOVE_SP_PROCESS_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
            processes: sp.processes.filter((_, i) => i !== payload.idx),
          }),
        },
      };
    }

    // ── BOM tree ──
    case A.SET_SP_ASSEMBLY: {
      // Setting is_assembly=true is exclusive: clear it on all other SPs so
      // findAssemblyIndex always resolves a single parent. Setting false
      // just clears the flag on that one SP.
      const { spIdx, value } = payload;
      const sps = state.cplxState.subproducts || [];
      const nextSps = sps.map((sp, i) => {
        if (!sp) return sp;
        if (i === spIdx) return { ...sp, is_assembly: !!value };
        if (value) return { ...sp, is_assembly: false };
        return sp;
      });
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, subproducts: nextSps } };
    }

    case A.ADD_BOM_ENTRY: {
      const { sp_index, qty = 1, notes = '' } = payload;
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      if (bom.some((e) => e && e.sp_index === sp_index)) return state; // dedupe
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          bom: [...bom, { sp_index, qty, notes }],
        },
      };
    }

    case A.REMOVE_BOM_ENTRY: {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          bom: bom.filter((_, i) => i !== payload.idx),
        },
      };
    }

    case A.SET_BOM_ENTRY_FIELD: {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return {
        ...state,
        isDirty: true,
        cplxState: {
          ...state.cplxState,
          bom: updateAt(bom, payload.idx, { [payload.field]: payload.value }),
        },
      };
    }

    // ── Global ──
    case A.LOAD_QUOTE: {
      const { quoteType, state: qState, action } = payload;
      // Phase 3 — `action === 'copy'` resets quote identity (so the
      // next save creates a NEW server record instead of updating the
      // source) and stamps `pricing_snapshot._synthesized = true` +
      // clears `_captured_at` / `_captured_by` so the next save re-
      // freezes against the current master library + records the
      // copying operator. `action === 'load'` (or omitted) preserves
      // identity exactly as pre-Phase-3 — BC for every existing caller.
      const isCopy = action === 'copy';
      const copySnapshot = (snap) => {
        if (!snap || typeof snap !== 'object') return snap;
        return { ...snap, _synthesized: true, _captured_at: null, _captured_by: null };
      };
      // Sprint 18: schema migration moved into dedicated migrator
      // modules (stdMigration / cplxMigration). LOAD_QUOTE now spreads
      // the factory defaults first (so legacy quotes missing a field
      // get the current default), then hands off to the migrator to
      // stamp the version marker + apply any shape upgrades. Keeping
      // the migration pure + per-quote-type means future shape changes
      // bump the step list in ONE file instead of sprinkling fixups
      // throughout the reducer.
      if (quoteType === 'std') {
        const merged = { ...createStdState(), ...qState };
        const upgraded = upgradeStdState(merged);
        const next = isCopy
          ? { ...upgraded, pricing_snapshot: copySnapshot(upgraded.pricing_snapshot) }
          : upgraded;
        return {
          ...state,
          isDirty: false,
          activeQuoteId: isCopy ? null : payload.id || null,
          activeQuoteVersion: isCopy ? 0 : payload.version || 0,
          stdState: next,
        };
      }
      // Back-fill _mid on SP materials for cplx — cplxMigration handles
      // is_assembly + bom/tooling_alloc scaffolding but leaves _mid to
      // the caller (historical split; harmless to duplicate the cheap
      // walk here rather than widen cplxMigration's surface).
      const newMidForLegacy = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mergedCplx = { ...createCplxState(), ...qState };
      if (Array.isArray(mergedCplx.subproducts)) {
        mergedCplx.subproducts = mergedCplx.subproducts.map((sp) => {
          if (!sp) return sp;
          const mats = Array.isArray(sp.materials) ? sp.materials : [];
          return {
            ...sp,
            materials: mats.map((m) => (m && !m._mid ? { ...m, _mid: newMidForLegacy() } : m)),
          };
        });
      }
      const upgradedCpx = upgradeCplxState(mergedCplx);
      const nextCpx = isCopy
        ? { ...upgradedCpx, pricing_snapshot: copySnapshot(upgradedCpx.pricing_snapshot) }
        : upgradedCpx;
      return {
        ...state,
        isDirty: false,
        activeQuoteId: isCopy ? null : payload.id || null,
        activeQuoteVersion: isCopy ? 0 : payload.version || 0,
        cplxState: nextCpx,
      };
    }

    case A.RESET_STD:
      return {
        ...state,
        isDirty: false,
        activeQuoteId: null,
        activeQuoteVersion: 0,
        stdState: createEmptyStdState(),
      };

    case A.RESET_CPLX:
      return {
        ...state,
        isDirty: false,
        activeQuoteId: null,
        activeQuoteVersion: 0,
        cplxState: createCplxState(),
      };

    case A.MARK_CLEAN:
      return { ...state, isDirty: false };

    case A.SET_ACTIVE_QUOTE_ID:
      return {
        ...state,
        activeQuoteId: payload.id,
        // Caller can pass `version` alongside id when setting after a
        // fresh save. Default 0 keeps backward-compat for callers that
        // don't know about optimistic locking yet.
        activeQuoteVersion: payload.version != null ? payload.version : state.activeQuoteVersion,
      };

    case A.SET_PENDING_QUOTE:
      return {
        ...state,
        pendingQuote: {
          id: payload.id,
          type: payload.type,
          action: payload.action || 'load',
          data: payload.data || null,
        },
      };

    case A.CLEAR_PENDING_QUOTE:
      return { ...state, pendingQuote: null };

    default:
      return state;
  }
}
