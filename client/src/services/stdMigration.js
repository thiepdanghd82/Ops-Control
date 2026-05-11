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

export const STD_SHAPE_VERSION = 2;

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
    // Still verify _mid coverage AND alt-materials shape — legacy quotes
    // stamped at an earlier version in dev builds may have skipped the
    // backfill. Defensive re-check is a no-op when shape is current.
    const live = getLiveMaterials(state);
    const hasMids = Array.isArray(live) && live.every((m) => m && m._mid);
    const hasAltShape =
      Array.isArray(state.materials_main) &&
      Array.isArray(state.materials_alt) &&
      (state.materials_active === 'main' || state.materials_active === 'alt');
    if (hasMids && hasAltShape) return state;
  }

  let next = state;
  if (current < 1) next = migrateTo_v1(next);
  if (current < 2) next = migrateTo_v2(next);
  // Heal: a quote stamped with the current version but missing _mid on
  // some rows (e.g. stale dev-build artifact) still gets the back-fill.
  // Cheap no-op when every row is complete — ensureMids returns the
  // same refs.
  if (Array.isArray(next.materials_main) && next.materials_main.some((m) => m && !m._mid)) {
    next = { ...next, materials_main: ensureMids(next.materials_main) };
  }
  if (Array.isArray(next.materials_alt) && next.materials_alt.some((m) => m && !m._mid)) {
    next = { ...next, materials_alt: ensureMids(next.materials_alt) };
  }
  // Keep the legacy `materials` mirror in sync with the active set so
  // existing readers (calcAll, CalcHeader, validators, ink base-mat
  // lookups) work without callsite churn.
  const live = getLiveMaterials(next);
  if (next.materials !== live) {
    next = { ...next, materials: live };
  }
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
