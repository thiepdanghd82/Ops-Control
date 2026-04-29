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

export const STD_SHAPE_VERSION = 1;

// Stable _mid generator — duplicated from createStdState() so this
// module doesn't import calcEngine (keeps migrator pure + zero-dep).
// Collision risk: Date.now + 6 random chars = ~64 bits of entropy per
// row. A single quote never has enough rows to realistically collide.
function newMid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureMids(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => (r && typeof r === 'object' && !r._mid)
    ? { ...r, _mid: newMid() }
    : r);
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
    // Still verify _mid coverage — legacy quotes were stamped with
    // version 1 in an earlier dev build before we enforced _mid on
    // load. Defensive re-backfill is a no-op when every row already
    // has _mid (ensureMids returns the same array-of-same-refs).
    const mats = state.materials;
    if (Array.isArray(mats) && mats.every(m => m && m._mid)) return state;
  }

  let next = state;
  if (current < 1) next = migrateTo_v1(next);
  // Heal: a quote stamped with the current version but missing _mid on
  // some rows (e.g. stale dev-build artifact) still gets the back-fill.
  // Cheap no-op when every row is complete — ensureMids returns the
  // same refs.
  if (Array.isArray(next.materials) && next.materials.some(m => m && !m._mid)) {
    next = { ...next, materials: ensureMids(next.materials) };
  }
  return next;
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
