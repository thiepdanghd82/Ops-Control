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
  ADD_INK_ROW: 'ADD_INK_ROW',
  REMOVE_INK_ROW: 'REMOVE_INK_ROW',
  ADD_PROCESS_ROW: 'ADD_PROCESS_ROW',
  REMOVE_PROCESS_ROW: 'REMOVE_PROCESS_ROW',
  TOGGLE_ROW_HIDDEN: 'TOGGLE_ROW_HIDDEN',
  SET_ACTIVE_MOQ: 'SET_ACTIVE_MOQ',
  SET_EXTRA_MOQ: 'SET_EXTRA_MOQ',
  SET_NUM_MOQ: 'SET_NUM_MOQ',

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
  return arr.map((item, i) => i === idx ? { ...item, ...updates } : item);
}

export function updateSP(subproducts, spIdx, updates) {
  return subproducts.map((sp, i) => i === spIdx ? { ...sp, ...updates } : sp);
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
    case A.SET_STD_FIELD:
      return { ...state, isDirty: true, stdState: { ...state.stdState, [payload.field]: payload.value } };

    case A.SET_STD_STATE:
      return { ...state, isDirty: true, stdState: { ...state.stdState, ...payload } };

    case A.SET_MATERIAL_FIELD:
      return { ...state, isDirty: true, stdState: {
        ...state.stdState,
        materials: updateAt(state.stdState.materials, payload.idx, { [payload.field]: payload.value })
      }};

    case A.SET_INK_FIELD:
      return { ...state, isDirty: true, stdState: {
        ...state.stdState,
        inks: updateAt(state.stdState.inks, payload.idx, { [payload.field]: payload.value })
      }};

    case A.SET_PROCESS_FIELD:
      return { ...state, isDirty: true, stdState: {
        ...state.stdState,
        processes: updateAt(state.stdState.processes, payload.idx, { [payload.field]: payload.value })
      }};

    case A.ADD_MATERIAL_ROW: {
      const mats = [...state.stdState.materials];
      if (mats.length < 20) {
        mats.push({
          _mid: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          row_type: mats.length < 10 ? 'Main.Mat' : 'Process Mat',
          code: '', ifs_code: '', desc: '', usage: 0, setup_lm: 0, cavities: 0,
          free_liner: 0, width: 0, log_width: 0, pitch_ovr: 0,
          offcut_yn: '', slitting_yn: '', df_yn: '', offcut_pct: 0,
          import_duty: 0, s_price: 0, g_price: 0, latest: 0
        });
      }
      return { ...state, isDirty: true, stdState: { ...state.stdState, materials: mats } };
    }

    case A.REMOVE_MATERIAL_ROW: {
      const mats = state.stdState.materials.filter((_, i) => i !== payload.idx);
      return { ...state, isDirty: true, stdState: { ...state.stdState, materials: mats } };
    }

    case A.ADD_INK_ROW: {
      const inks = [...state.stdState.inks];
      if (inks.length < 10) {
        inks.push({
          label: `Ink ${inks.length + 1}`,
          ifs_code: '', color: '', print_type: '', mesh_spec: '', pitch_mm: 0, base_mat: '', coverage: 0,
          setup_kg: 0, area_pct: 0, clicks: 0,
          s_price: 0, g_price: 0, latest: 0
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
      const procs = [...state.stdState.processes, {
        label: `Process ${state.stdState.processes.length + 1}`,
        process_type: '', workcenter: '', speed: 0, layout: 0,
        efficiency: 0.85, setup_h: 0, scrap_pct: 0.03,
        manual_uph: 0, tool_cost: 0, tool_type: '', tool_life: 0,
        extra_cost: 0, product_life: 1, eau_ovr: 0, repeat: 1
      }];
      return { ...state, isDirty: true, stdState: { ...state.stdState, processes: procs } };
    }

    case A.REMOVE_PROCESS_ROW: {
      const procs = state.stdState.processes.filter((_, i) => i !== payload.idx);
      return { ...state, isDirty: true, stdState: { ...state.stdState, processes: procs } };
    }

    case A.TOGGLE_ROW_HIDDEN: {
      const { section, idx } = payload;
      const arr = [...state.stdState[section]];
      arr[idx] = { ...arr[idx], hidden: !arr[idx].hidden };
      return { ...state, isDirty: true, stdState: { ...state.stdState, [section]: arr } };
    }

    case A.SET_ACTIVE_MOQ:
      return { ...state, stdState: { ...state.stdState, active_moq_idx: payload.idx } };

    case A.SET_NUM_MOQ: {
      const num = payload.value;
      const extra = [...(state.stdState.extra_moqs || [])];
      while (extra.length < num - 1) extra.push({ moq: 0, price: 0, eau: '', target: null, price_vnd: 0, target_vnd: null });
      return { ...state, isDirty: true, stdState: { ...state.stdState, num_moq: num, extra_moqs: extra.slice(0, num - 1) } };
    }

    case A.SET_EXTRA_MOQ: {
      const extra = [...(state.stdState.extra_moqs || [])];
      extra[payload.idx] = { ...(extra[payload.idx] || {}), [payload.field]: payload.value };
      return { ...state, isDirty: true, stdState: { ...state.stdState, extra_moqs: extra } };
    }

    // ── Complex ──
    case A.SET_CPLX_FIELD:
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, [payload.field]: payload.value } };

    case A.SET_CPLX_STATE:
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, ...payload } };

    case A.ADD_SUBPRODUCT: {
      const code = payload.code || `SP ${String.fromCharCode(65 + state.cplxState.subproducts.length)}`;
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: [...state.cplxState.subproducts, createSubProduct(code)]
      }};
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
      const prevAlloc = Array.isArray(state.cplxState.tooling_alloc) ? state.cplxState.tooling_alloc : [];
      const nextBom = prevBom.map(shiftIndex).filter(Boolean);
      const nextAlloc = prevAlloc.map(shiftIndex).filter(Boolean);
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: nextSps,
        bom: nextBom,
        tooling_alloc: nextAlloc,
      }};
    }

    case A.SET_SP_FIELD:
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { [payload.field]: payload.value })
      }};

    case A.SET_SP_MATERIAL_FIELD: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          materials: updateAt(sp.materials, payload.idx, { [payload.field]: payload.value })
        })
      }};
    }

    case A.SET_SP_INK_FIELD: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          inks: updateAt(sp.inks, payload.idx, { [payload.field]: payload.value })
        })
      }};
    }

    case A.SET_SP_PROCESS_FIELD: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          processes: updateAt(sp.processes, payload.idx, { [payload.field]: payload.value })
        })
      }};
    }

    case A.ADD_SP_MATERIAL_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      const mats = [...sp.materials, {
        _mid: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        row_type: 'Main.Mat', code: '', ifs_code: '', desc: '', qpa: 0, usage: 0, setup_lm: 0, free_liner: 0,
        pitch: 0, width: 0, log_width: 0, pitch_ovr: 0, offcut_yn: '', slitting_yn: '',
        df_yn: '', offcut_pct: 0, import_duty: 0, s_price: 0, g_price: 0, latest: 0
      }];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { materials: mats })
      }};
    }

    case A.REMOVE_SP_MATERIAL_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          materials: sp.materials.filter((_, i) => i !== payload.idx)
        })
      }};
    }

    case A.ADD_SP_INK_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      const inks = [...sp.inks, {
        label: `Ink ${sp.inks.length + 1}`, ifs_code: '', color: '', print_type: '', mesh_spec: '', pitch_mm: 0, base_mat: '',
        coverage: 0, setup_kg: 0, area_pct: 0, s_price: 0, g_price: 0, latest: 0
      }];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { inks })
      }};
    }

    case A.REMOVE_SP_INK_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          inks: sp.inks.filter((_, i) => i !== payload.idx)
        })
      }};
    }

    case A.ADD_SP_PROCESS_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      // layout: 0 = empty (see Standard ADD_PROCESS_ROW). Engine falls
      // back to 1 for labor-only workcenters; machine workcenters fail
      // validation until the user fills it.
      const procs = [...sp.processes, {
        label: `Process ${sp.processes.length + 1}`, process_type: '', workcenter: '',
        speed: 0, layout: 0, efficiency: 0.85, setup_h: 0,
        scrap_pct: 0.03, manual_uph: 0, tool_cost: 0, tool_type: '', tool_life: 0,
        extra_cost: 0, product_life: 1, eau_ovr: 0, repeat: 1
      }];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, { processes: procs })
      }};
    }

    case A.REMOVE_SP_PROCESS_ROW: {
      const sp = state.cplxState.subproducts[payload.spIdx];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: updateSP(state.cplxState.subproducts, payload.spIdx, {
          processes: sp.processes.filter((_, i) => i !== payload.idx)
        })
      }};
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
      if (bom.some(e => e && e.sp_index === sp_index)) return state; // dedupe
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        bom: [...bom, { sp_index, qty, notes }]
      }};
    }

    case A.REMOVE_BOM_ENTRY: {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        bom: bom.filter((_, i) => i !== payload.idx)
      }};
    }

    case A.SET_BOM_ENTRY_FIELD: {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        bom: updateAt(bom, payload.idx, { [payload.field]: payload.value })
      }};
    }

    // ── Global ──
    case A.LOAD_QUOTE: {
      const { quoteType, state: qState } = payload;
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
        const next = upgradeStdState(merged);
        return {
          ...state,
          isDirty: false,
          activeQuoteId: payload.id || null,
          activeQuoteVersion: payload.version || 0,
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
        mergedCplx.subproducts = mergedCplx.subproducts.map(sp => {
          if (!sp) return sp;
          const mats = Array.isArray(sp.materials) ? sp.materials : [];
          return { ...sp, materials: mats.map(m => (m && !m._mid) ? { ...m, _mid: newMidForLegacy() } : m) };
        });
      }
      const next = upgradeCplxState(mergedCplx);
      return {
        ...state,
        isDirty: false,
        activeQuoteId: payload.id || null,
        activeQuoteVersion: payload.version || 0,
        cplxState: next,
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
      return { ...state, pendingQuote: { id: payload.id, type: payload.type, action: payload.action || 'load', data: payload.data || null } };

    case A.CLEAR_PENDING_QUOTE:
      return { ...state, pendingQuote: null };

    default:
      return state;
  }
}
