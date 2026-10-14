// @ts-check
/**
 * MES-3-FIX-33 + FIX-46 — Indigo PRESS detection (click-charges path).
 *
 * Returns true ONLY for the main `Indigo` ink and Indigo press-subtype
 * literals (`Indigo6800`, `Indigo7800`, future `Indigo Vmax`, etc.) —
 * the categories that use the click-charges formula in calcInk.
 *
 * Returns FALSE for the paren-suffixed CONSUMABLE subtypes
 * (`Indigo(Primer)`, `Indigo(oil)`, `Indigo(Spot)`) — these have
 * dedicated rows in `lib.ddl.coverage` (400 / 400 / 176) and must
 * flow through the non-Indigo coverage-based formula in calcInk.
 *
 * Original FIX-33 used `.startsWith('Indigo')` which swept the
 * consumable subtypes into the click branch by mistake, so their
 * coverage entries were ignored, CLICKS column was wrongly enabled,
 * and the COV OVR placeholder stayed blank instead of XLOOKUP'ing.
 * Operator RFQ-2026-S0013 (2026-05-26) hit this: Ink 2-4 picked
 * `Indigo(Primer)` / `Indigo(oil)` / `Indigo(Spot)`, COV OVR cell
 * blank, Setup/Run = '—'. Coverage entries existed all along.
 *
 * Detection rule: exact 'Indigo' OR Indigo followed by digits/space
 * (press model name). Anything in parens is a consumable subtype.
 *
 * @param {string|null|undefined} printType
 * @returns {boolean}
 */
export function isIndigoPrintType(printType) {
  if (!printType) return false;
  const s = String(printType);
  if (s === 'Indigo') return true;
  // Press subtype: 'Indigo' followed by digit (Indigo6800) or space
  // (Indigo Vmax). Parens (Indigo(Primer)) intentionally NOT matched.
  return /^Indigo[\d ]/.test(s);
}
