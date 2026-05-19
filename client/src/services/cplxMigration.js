// @ts-check
/**
 * Complex state shape migrator.
 *
 * Shape v1 (legacy): subproducts keyed by string code prefix "FG…" for
 * the assembly, with implicit qty-per-assembly = 1 and no explicit
 * tooling allocation.
 *
 * Shape v2: additive scaffolding (carry-forward).
 *   - Each SP gets optional `is_assembly: boolean` (default: derived
 *     from code.startsWith('FG'))
 *   - State gets optional `bom: [{ sp_index: N, qty: M, notes: '' }]`
 *     (default: derived as qty=1 for each non-FG SP pointing to FG SP)
 *   - State gets optional `tooling_alloc: []` (empty by default —
 *     shared-tooling math not wired yet, preserved for future)
 *
 * Shape v3 (current — Sprint S-ALT-MAT, PR #B):
 *   - Each SP gains `materials_main` + `materials_alt` + `materials_active`
 *     ('main' | 'alt'). Pre-v3 quotes have only `sp.materials` — migrator
 *     copies it to `materials_main`, seeds `materials_alt = []`, sets
 *     `materials_active = 'main'`. The legacy `sp.materials` field is
 *     preserved as a MIRROR of the active set so calcEngine readers
 *     (aggregateComplex, applyCplxTierToSp, calcAll, validators) keep
 *     working without callsite churn — the reducer enforces the mirror
 *     invariant on every per-SP material mutation.
 *
 * Goal: zero behavior change until downstream code opts into v3 fields.
 * Old code reading `sp.materials` still gets the same array. New code
 * checking `sp.materials_active` for an alt-materials toggle sees a
 * populated default.
 *
 * Migration runs on load (lazy) + save (eager) so saved quotes drift
 * toward v3 over time without needing a bulk migration pass.
 */

// v4 (MES-3-FIX-41): adds optional `result.subproducts[spi].rows` +
// `result.subproducts[spi].tiers[N].rows` for per-row Setup/Run/Total
// export visibility. Heal is on save — calcEngine is client-only and
// read-side heal would need orchestration. Pre-v4 quotes export with
// em-dash placeholders; route returns 422 `legacy_no_rows` to prompt
// re-save in the calculator.
export const CPLX_SHAPE_VERSION = 4;

function startsWithFG(code) {
  return typeof code === 'string' && code.toUpperCase().startsWith('FG');
}

/**
 * Idempotent upgrade: applies defaults if v1/missing, returns existing
 * state unchanged if already v2 with all fields set.
 *
 * Returns a NEW object — never mutates input. Callers that rely on
 * reference equality (React re-render) should compare via _shape_version.
 */
// PR #B (Sprint S-ALT-MAT) — per-SP alt-materials shape.
//
// upgradeSubProductAltMaterials(sp, sourceVersion)
// Adds materials_main / materials_alt / materials_active to a subproduct
// and keeps `sp.materials` as a mirror of the active set. Pre-v3 SPs
// have only `sp.materials` — that becomes materials_main, alt empty,
// active='main'. Post-v3 SPs are passed through unchanged if the three
// fields are already correctly populated.
//
// The function is idempotent: calling it on an already-upgraded SP
// returns the same shape (alt + active preserved). Mirror is always
// rebuilt from (active, _main, _alt) so any drift in the legacy
// materials field gets healed on every load.
function upgradeSubProductAltMaterials(sp, sourceVersion) {
  if (!sp || typeof sp !== 'object') return sp;
  const wasPreV3 = sourceVersion < 3;
  const legacy = Array.isArray(sp.materials) ? sp.materials : [];

  const materials_main = wasPreV3
    ? legacy
    : Array.isArray(sp.materials_main)
      ? sp.materials_main
      : legacy;
  const materials_alt = wasPreV3 ? [] : Array.isArray(sp.materials_alt) ? sp.materials_alt : [];
  const materials_active = wasPreV3 ? 'main' : sp.materials_active === 'alt' ? 'alt' : 'main';
  const mirror = materials_active === 'alt' ? materials_alt : materials_main;

  return {
    ...sp,
    materials_main,
    materials_alt,
    materials_active,
    materials: mirror,
  };
}

export function upgradeCplxState(state) {
  if (!state || typeof state !== 'object') return state;
  // Short-circuit only when the entire v3 shape is present AND the alt-
  // materials fields are populated on every SP. v2-stamped quotes need a
  // walk to seed the new per-SP fields even though _shape_version=2
  // already covered is_assembly / bom / tooling_alloc.
  if (
    state._shape_version === CPLX_SHAPE_VERSION &&
    Array.isArray(state.bom) &&
    Array.isArray(state.tooling_alloc) &&
    Array.isArray(state.subproducts) &&
    state.subproducts.every(
      (sp) =>
        typeof sp.is_assembly === 'boolean' &&
        Array.isArray(sp.materials_main) &&
        Array.isArray(sp.materials_alt) &&
        (sp.materials_active === 'main' || sp.materials_active === 'alt')
    ) &&
    // _mid coverage on per-SP inks + processes — needed for stable
    // React keys (Option 2 anti-flash). Don't short-circuit if any
    // row is missing _mid; the heal pass below back-fills.
    state.subproducts.every(
      (sp) =>
        (!Array.isArray(sp?.inks) || sp.inks.every((r) => !r || typeof r !== 'object' || r._mid)) &&
        (!Array.isArray(sp?.processes) ||
          sp.processes.every((r) => !r || typeof r !== 'object' || r._mid))
    )
  ) {
    return state; // already upgraded
  }

  const sourceVersion = Number(state._shape_version) || 0;
  const sps = Array.isArray(state.subproducts) ? state.subproducts : [];

  // Annotate each SP with is_assembly. Explicit value wins; else derive
  // from FG prefix.
  const newSps = sps.map((sp) => {
    if (!sp || typeof sp !== 'object') return sp;
    let out = sp;
    if (typeof out.is_assembly !== 'boolean') {
      out = { ...out, is_assembly: startsWithFG(out.code) };
    }
    // Alt-materials (PR #B): per-SP main/alt/active + legacy mirror.
    out = upgradeSubProductAltMaterials(out, sourceVersion);
    // _mid back-fill on inks + processes (Option 2 anti-flash). Stable
    // React keys prevent row remount on data refresh. Inline ID gen so
    // this module stays zero-dep (mirror of stdMigration.ensureMids).
    const fillMid = (rows) =>
      Array.isArray(rows)
        ? rows.map((r) =>
            r && typeof r === 'object' && !r._mid
              ? { ...r, _mid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
              : r
          )
        : rows;
    if (Array.isArray(out.inks) && out.inks.some((r) => r && !r._mid)) {
      out = { ...out, inks: fillMid(out.inks) };
    }
    if (Array.isArray(out.processes) && out.processes.some((r) => r && !r._mid)) {
      out = { ...out, processes: fillMid(out.processes) };
    }
    return out;
  });

  // Derive BOM if missing: every non-assembly SP contributes qty=1 into
  // the first assembly SP. If no assembly detected, BOM stays empty
  // (sum fallback matches current behavior).
  let bom = Array.isArray(state.bom) ? state.bom : null;
  if (!bom) {
    const asmIdx = newSps.findIndex((sp) => sp && sp.is_assembly);
    if (asmIdx >= 0) {
      bom = newSps
        .map((sp, i) => ({ sp_index: i, qty: 1, notes: '' }))
        .filter((entry) => entry.sp_index !== asmIdx && newSps[entry.sp_index]);
    } else {
      bom = [];
    }
  }

  const tooling_alloc = Array.isArray(state.tooling_alloc) ? state.tooling_alloc : [];

  return {
    ...state,
    subproducts: newSps,
    bom,
    tooling_alloc,
    _shape_version: CPLX_SHAPE_VERSION,
  };
}

/**
 * Detect the explicit assembly SP in a (possibly legacy) cplx state.
 * Returns the index or -1. Uses `is_assembly` flag when present,
 * otherwise FG-prefix heuristic. Exposed so calcEngine / UI can share
 * one source of truth.
 */
export function findAssemblyIndex(state) {
  if (!state || !Array.isArray(state.subproducts)) return -1;
  const withFlag = state.subproducts.findIndex((sp) => sp && sp.is_assembly === true);
  if (withFlag >= 0) return withFlag;
  return state.subproducts.findIndex((sp) => startsWithFG(sp?.code));
}
