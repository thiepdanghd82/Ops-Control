// @ts-check
/**
 * Sprint S-LAYOUT-SYNC — Print-tab → Cut-tab lazy auto-sync (MES-3-FIX-32).
 *
 * Sprint S-SPLIT 2026-04-24 intentionally split layout dimensions into two
 * field families:
 *   • `part_width` / `part_length_md`             — Cut sub-tab (CANONICAL;
 *     calcEngine, validator, layoutOptimizer all read these).
 *   • `print_part_width` / `print_part_length_md` — Print sub-tab (intent;
 *     used only by PrintCutSizeMismatch banner for divergence detection).
 *
 * That split was designed to catch the rare bug where print artwork is
 * sized for one spec while the die is made for another. In the common
 * case the two are identical — and a new Std quote DEFAULTS to the Print
 * sub-tab, so an operator who types "Product Size Width TD = 462" never
 * populates the canonical `part_width`. Result: calc engine + validator +
 * layout optimizer all see `part_width = 0`, Run Material cost = "—",
 * Ink Setup/Run = "—", "Part Width TD là bắt buộc" errors. The
 * existing `PrintCutSizeMismatch` banner DOES surface a "Sync to Cut"
 * button but operators routinely miss it (3 P1 bugs filed downstream
 * before root-cause was identified).
 *
 * Fix (Option C in MES-3-FIX-32 design): lazy mirror — when the operator
 * writes a `print_part_*` field AND the matching canonical `part_*`
 * field is still 0/unset, also write the canonical field. Once the Cut
 * sub-tab has a non-zero value, the auto-sync stops (the existing
 * divergence banner takes over).
 *
 * Properties preserved:
 *   1. Schema unchanged — no new fields, no migration needed.
 *   2. Divergence detection intact — operator can still type a DIFFERENT
 *      value on the Cut sub-tab; the banner flags it.
 *   3. Reducer-side fix — no useEffect timing hazards, no double-render.
 *   4. Std + Cpx share the helper — same trap exists in
 *      ComplexCalc.SubProductRow via the shared AdvancedLayoutBlock.
 *
 * @param {object} prev    State slice BEFORE the write (stdState OR sp).
 * @param {string} field   Field name being written.
 * @param {*}      value   New value.
 * @returns {Record<string, any>} Patch object to spread onto `prev`.
 *   Always contains `{ [field]: value }`. May ALSO contain the mirror
 *   canonical field when the lazy-sync condition fires.
 */
export function applyPrintToCutSync(prev, field, value) {
  const patch = { [field]: value };
  if (!prev) return patch;

  const v = Number(value) || 0;
  if (v <= 0) return patch;

  if (field === 'print_part_width' && !(Number(prev.part_width) > 0)) {
    patch.part_width = value;
  } else if (field === 'print_part_length_md' && !(Number(prev.part_length_md) > 0)) {
    patch.part_length_md = value;
  }
  return patch;
}
