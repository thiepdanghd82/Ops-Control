// @ts-check
/**
 * summariseMaterialActive — pure helper extracted from
 * MaterialActiveBadge.jsx so node:test can import it (the .jsx extension
 * is not resolvable by Node's native ESM loader without a transform).
 *
 * Returns:
 *   null            — no badge (Std without materials_active OR empty subproducts)
 *   { kind: 'main' } — single 'Main' label
 *   { kind: 'alt' }  — single 'Alt' label
 *   { kind: 'mixed', altCount, mainCount } — Cpx mixed-state
 *
 * Edge cases per PR #C amendment B:
 *   - Std quote without materials_active field → null
 *   - Cpx with 0 SPs → null
 *   - Cpx with 1 SP → single 'main' or 'alt' (NOT 'Mixed (1/0)')
 *   - all main → 'main', all alt → 'alt', else 'mixed' with counts
 */
export function summariseMaterialActive(state, quoteType) {
  if (!state || typeof state !== 'object') return null;
  if (quoteType === 'complex') {
    const sps = Array.isArray(state.subproducts) ? state.subproducts : [];
    if (sps.length === 0) return null;
    let altCount = 0;
    let mainCount = 0;
    for (const sp of sps) {
      if (sp && sp.materials_active === 'alt') altCount++;
      else mainCount++;
    }
    if (sps.length === 1) {
      return altCount === 1 ? { kind: 'alt' } : { kind: 'main' };
    }
    if (altCount === 0) return { kind: 'main' };
    if (mainCount === 0) return { kind: 'alt' };
    return { kind: 'mixed', altCount, mainCount };
  }
  if (state.materials_active === 'alt') return { kind: 'alt' };
  if (state.materials_active === 'main') return { kind: 'main' };
  return null;
}
