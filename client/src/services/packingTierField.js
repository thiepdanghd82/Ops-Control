/**
 * packingTierField — shared resolver for per-MOQ pack/ship UI binding.
 *
 * Sprint S-PACK-SHIP-PER-TIER step 3. Bridges the persisted shape
 * (top-level state + extra_moqs[i].packing override) into the UI
 * binding so a single component can render the right value for any
 * active tier without inline ternary soup.
 *
 * Both Std (CalcPackingShip.jsx) and Cpx (ComplexCalc.jsx Packing
 * tab) use the same resolver so the 10 fields stay symmetric.
 */

/**
 * Resolve the value + override status for a single pack/ship field at
 * the currently-active tier.
 *
 * Contract — presence-based, NOT truthiness:
 *   - override key present (any value, including 0 / '' / false) wins
 *   - override key absent → fall back to base
 * This is the dễ-vỡ case: `??` and `||` both swallow 0; using `'key' in obj`
 * preserves explicit-0 overrides per Henry's Q3 + reducer rule.
 *
 * @param {object|null|undefined} em - extra_moqs[activeIdx-1] when activeIdx>0; null/undefined for tier 0
 * @param {object|null|undefined} st - top-level state slice (tier 0 base)
 * @param {string} field - one of the 10 pack/ship keys
 * @returns {{ value: any, isOverride: boolean }}
 */
export function resolveTierField(em, st, field) {
  if (em && em.packing && Object.prototype.hasOwnProperty.call(em.packing, field)) {
    return { value: em.packing[field], isOverride: true };
  }
  return { value: st?.[field], isOverride: false };
}

/**
 * Compute the value DecimalInput should pass upstream when the user
 * blurs an empty field. Existing 100+ callsites get `0` (legacy
 * convention so tier-0 base inputs default to 0); per-tier override
 * fields opt into `preserveEmpty: true` to fire `''` instead, which
 * the reducer interprets as "delete the key, revert to base".
 *
 * Extracted as a pure helper so the blur-decision is unit-testable
 * without rendering React; the DecimalInput blur handler delegates
 * to this single line.
 *
 * @param {boolean} [preserveEmpty=false]
 * @returns {0 | ''}
 */
export function blurEmptyValue(preserveEmpty = false) {
  return preserveEmpty ? '' : 0;
}
