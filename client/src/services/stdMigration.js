// @ts-check
/**
 * Standard state shape migrator — parallel to cplxMigration.js.
 *
 * Sprint 18 background: Complex state has had `_shape_version` since
 * Sprint 4 (`cplxMigration.js`). Standard state did NOT, so every time
 * we changed the save shape (Sprint 14 expanded result schema, the
 * on-load `_mid` back-fill, default-field fills from `createStdState`)
 * it was handled by ad-hoc code in the LOAD_QUOTE reducer case. That
 * made future schema changes risky — no single place to audit the
 * chain of migrations, no way to skip work on already-upgraded quotes,
 * and no test surface separate from the reducer.
 *
 * Shape v1 (this module's entry point; first declared version):
 *   - `_mid` present on every material row (React key stability)
 *   - `_schema_version: 1` marker set
 *   - All numeric defaults in place (extra_moqs, num_moq, active_moq_idx)
 *
 * Future shape changes add `migrateV1toV2()` etc. and bump
 * `STD_SHAPE_VERSION`. upgradeStdState applies every step sequentially
 * so a v1 quote loaded into a v3 deployment walks 1→2→3 cleanly.
 *
 * Contract:
 *   - Idempotent: running twice yields the same state.
 *   - Additive: never removes user fields.
 *   - Pure: returns a NEW object on upgrade, SAME reference if already
 *     current. Callers that rely on referential equality (React memo)
 *     can short-circuit on unchanged state.
 *   - Robust to null / non-object input (returns input unchanged).
 */

// v3 (MES-3-FIX-41): adds optional `result.rows` + `result.tiers[N].rows`
// for per-row Setup/Run/Total export visibility. Heal is on save (next
// time operator re-saves), not on read — calcEngine is client-only and
// reading-side heal would need orchestration. Quotes saved before v3
// stay readable; export route returns 422 `legacy_no_rows` to prompt re-save.
export const STD_SHAPE_VERSION = 3;

// Phase 1 pricing-snapshot foundation (additive field, NO version bump
// per PR #110 / Sprint S-D21-LEADTIME precedent). Imported here, not
// re-implemented, so the canonical shape stays single-source — same
// pricingSnapshot.js the calcReducer factories + freezeLib use.
import { createEmptySnapshot } from './pricingSnapshot.js';

// Idempotent: returns SAME reference when state already carries a
// snapshot object so the React-memo short-circuit in upgradeStdState
// stays intact for fully-current quotes.
function healPricingSnapshot(state) {
  if (state && state.pricing_snapshot && typeof state.pricing_snapshot === 'object') {
    return state;
  }
  return { ...state, pricing_snapshot: createEmptySnapshot() };
}

// Stable _mid generator — duplicated from createStdState() so this
// module doesn't import calcEngine (keeps migrator pure + zero-dep).
// Collision risk: Date.now + 6 random chars = ~64 bits of entropy per
// row. A single quote never has enough rows to realistically collide.
function newMid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureMids(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => (r && typeof r === 'object' && !r._mid ? { ...r, _mid: newMid() } : r));
}

/**
 * Apply all migration steps up to STD_SHAPE_VERSION. Safe to call
 * repeatedly — later runs detect the version marker and bail.
 *
 * Returns:
 *   - SAME reference if state is already current (React memo friendly)
 *   - NEW object with upgraded fields otherwise
 *   - UNCHANGED input if null / non-object / array (defensive)
 */
export function upgradeStdState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const current = Number(state._schema_version) || 0;
  if (current >= STD_SHAPE_VERSION) {
    // Still verify _mid coverage on ALL row types (materials + inks +
    // processes) AND alt-materials shape AND print/cut canonical fields
    // — legacy quotes stamped at an earlier version in dev builds may
    // have skipped the backfill. _mid is required for stable React keys
    // so list-row inputs don't remount on data refresh (Option 2 of the
    // anti-flash work).
    const live = getLiveMaterials(state);
    const allMidsOnRows = (arr) =>
      !Array.isArray(arr) || arr.every((r) => !r || typeof r !== 'object' || r._mid);
    const hasMids =
      Array.isArray(live) &&
      live.every((m) => m && m._mid) &&
      allMidsOnRows(state.inks) &&
      allMidsOnRows(state.processes);
    const hasAltShape =
      Array.isArray(state.materials_main) &&
      Array.isArray(state.materials_alt) &&
      (state.materials_active === 'main' || state.materials_active === 'alt');
    if (hasMids && hasAltShape) return healPricingSnapshot(state);
  }

  let next = state;
  if (current < 1) next = migrateTo_v1(next);
  if (current < 2) next = migrateTo_v2(next);
  if (current < 3) next = migrateTo_v3(next);
  // Heal: a quote stamped with the current version but missing _mid on
  // some rows (e.g. stale dev-build artifact) still gets the back-fill.
  // Cheap no-op when every row is complete — ensureMids returns the
  // same refs. Covers inks + processes too (Option 2 anti-flash: stable
  // React keys avoid input remount on data refresh).
  if (Array.isArray(next.materials_main) && next.materials_main.some((m) => m && !m._mid)) {
    next = { ...next, materials_main: ensureMids(next.materials_main) };
  }
  if (Array.isArray(next.materials_alt) && next.materials_alt.some((m) => m && !m._mid)) {
    next = { ...next, materials_alt: ensureMids(next.materials_alt) };
  }
  if (Array.isArray(next.inks) && next.inks.some((r) => r && !r._mid)) {
    next = { ...next, inks: ensureMids(next.inks) };
  }
  if (Array.isArray(next.processes) && next.processes.some((r) => r && !r._mid)) {
    next = { ...next, processes: ensureMids(next.processes) };
  }
  // Keep the legacy `materials` mirror in sync with the active set so
  // existing readers (calcAll, CalcHeader, validators, ink base-mat
  // lookups) work without callsite churn.
  const live = getLiveMaterials(next);
  if (next.materials !== live) {
    next = { ...next, materials: live };
  }
  // Pricing-snapshot heal (Phase 1) — additive, runs after version
  // chain so newly-migrated states also pick up the empty default.
  next = healPricingSnapshot(next);
  return next;
}

// Resolve the "live" (active) materials list from an upgraded state.
// Prefers materials_main / materials_alt (post-v2); falls back to the
// legacy materials field for partially-migrated test fixtures.
function getLiveMaterials(state) {
  if (state.materials_active === 'alt') return state.materials_alt || [];
  return state.materials_main || state.materials || [];
}

/**
 * v0 → v1: stamp version + guarantee _mid on every material row.
 * Also replaces a bare-number `active_moq_idx` legacy with 0 default
 * when missing (the reducer was tolerant but downstream calc code
 * assumed a number).
 */
function migrateTo_v1(state) {
  return {
    ...state,
    materials: ensureMids(state.materials),
    active_moq_idx: typeof state.active_moq_idx === 'number' ? state.active_moq_idx : 0,
    num_moq: typeof state.num_moq === 'number' && state.num_moq > 0 ? state.num_moq : 1,
    extra_moqs: Array.isArray(state.extra_moqs) ? state.extra_moqs : [],
    _schema_version: 1,
  };
}

/**
 * v1 → v2: alt-materials feature (Sprint S-ALT-MAT, PR #A). Splits the
 * single `materials` array into `materials_main` (canonical) +
 * `materials_alt` (default empty) + `materials_active` ('main' default).
 *
 * Old quotes have only `materials` — we copy it into materials_main and
 * leave the alt set empty. The legacy `materials` field is preserved as
 * a mirror of the active set so existing readers (calcAll, validators,
 * UI tables, ink base-mat lookups) keep working without callsite churn.
 *
 * Forward-compat: a quote saved on a build WITH alt-materials enabled
 * carries materials_alt + materials_active='alt' even when loaded on a
 * build with the feature flag OFF. The migrator just stamps the version
 * and keeps the alt fields; the calc engine reads via getActiveMaterials
 * which respects materials_active. The feature flag gates only the UI
 * exposure (toggle/copy controls); see AppConfigContext.
 */
function migrateTo_v2(state) {
  // LOAD_QUOTE spreads createStdState() defaults BEFORE the saved quote,
  // so a v1 quote loads with materials_main = [factory default rows] from
  // defaults even though the saved truth is state.materials. We detect
  // the pre-v2 case via the schema version and recover the main set from
  // the legacy materials field, dropping the defaults that snuck in.
  const wasPreV2 = (Number(state._schema_version) || 0) < 2;
  const legacy = Array.isArray(state.materials) ? state.materials : [];

  const materials_main = wasPreV2
    ? legacy
    : Array.isArray(state.materials_main)
      ? state.materials_main
      : legacy;
  const materials_alt = wasPreV2
    ? []
    : Array.isArray(state.materials_alt)
      ? state.materials_alt
      : [];
  const materials_active = wasPreV2 ? 'main' : state.materials_active === 'alt' ? 'alt' : 'main';
  const mirror = materials_active === 'alt' ? materials_alt : materials_main;

  return {
    ...state,
    materials_main: ensureMids(materials_main),
    materials_alt: ensureMids(materials_alt),
    materials_active,
    materials: mirror,
    _schema_version: 2,
  };
}

/**
 * v2 → v3 (MES-3-FIX-41): no state changes. The quote shape stays the
 * same; v3 marks "this quote was saved AFTER per-row breakdown landed."
 * On read, legacy v2 quotes (or earlier) won't have `result.rows` so the
 * export route returns 422 `legacy_no_rows` — operator re-saves in the
 * calculator and v3 stamps + populates rows in one step.
 *
 * Idempotent: bumps `_schema_version` only; state fields untouched.
 */
function migrateTo_v3(state) {
  return { ...state, _schema_version: 3 };
}
