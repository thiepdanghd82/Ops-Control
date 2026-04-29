// @ts-check
/**
 * Complex state shape migrator.
 *
 * Shape v1 (legacy): subproducts keyed by string code prefix "FG…" for
 * the assembly, with implicit qty-per-assembly = 1 and no explicit
 * tooling allocation.
 *
 * Shape v2 (current, additive):
 *   - Each SP gets optional `is_assembly: boolean` (default: derived
 *     from code.startsWith('FG'))
 *   - State gets optional `bom: [{ sp_index: N, qty: M, notes: '' }]`
 *     (default: derived as qty=1 for each non-FG SP pointing to FG SP)
 *   - State gets optional `tooling_alloc: []` (empty by default —
 *     shared-tooling math not wired yet, preserved for future)
 *   - State gets `_shape_version: 2` marker
 *
 * Goal: zero behavior change until downstream code opts into v2 fields.
 * Old code reading SPs still gets the same array. New code checking
 * `sp.is_assembly` or `state.bom` sees populated defaults that match the
 * FG-prefix heuristic.
 *
 * Migration runs on load (lazy) + save (eager) so saved quotes drift
 * toward v2 over time without needing a bulk migration pass.
 */

export const CPLX_SHAPE_VERSION = 2;

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
export function upgradeCplxState(state) {
  if (!state || typeof state !== 'object') return state;
  if (state._shape_version === CPLX_SHAPE_VERSION
      && Array.isArray(state.bom)
      && Array.isArray(state.tooling_alloc)
      && Array.isArray(state.subproducts)
      && state.subproducts.every(sp => typeof sp.is_assembly === 'boolean')) {
    return state; // already upgraded
  }

  const sps = Array.isArray(state.subproducts) ? state.subproducts : [];

  // Annotate each SP with is_assembly. Explicit value wins; else derive
  // from FG prefix.
  const newSps = sps.map(sp => {
    if (!sp || typeof sp !== 'object') return sp;
    if (typeof sp.is_assembly === 'boolean') return sp;
    return { ...sp, is_assembly: startsWithFG(sp.code) };
  });

  // Derive BOM if missing: every non-assembly SP contributes qty=1 into
  // the first assembly SP. If no assembly detected, BOM stays empty
  // (sum fallback matches current behavior).
  let bom = Array.isArray(state.bom) ? state.bom : null;
  if (!bom) {
    const asmIdx = newSps.findIndex(sp => sp && sp.is_assembly);
    if (asmIdx >= 0) {
      bom = newSps
        .map((sp, i) => ({ sp_index: i, qty: 1, notes: '' }))
        .filter(entry => entry.sp_index !== asmIdx && newSps[entry.sp_index]);
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
  const withFlag = state.subproducts.findIndex(sp => sp && sp.is_assembly === true);
  if (withFlag >= 0) return withFlag;
  return state.subproducts.findIndex(sp => startsWithFG(sp?.code));
}
