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

/**
 * Load-time companion to `applyPrintToCutSync`. The reducer-side helper
 * only fires on LIVE writes — a quote loaded from history that already
 * has `print_part_*` populated but `part_*` = 0 (created on a pre-fix
 * build, or saved mid-edit before the operator clicked "Sync to Cut")
 * never triggers the auto-mirror. Result: layout validator complains
 * "Part Width TD là bắt buộc" even though the Print sub-tab clearly
 * has the value.
 *
 * This heal pass mirrors `print_part_*` → `part_*` when canonical is 0
 * and print is > 0. Idempotent + cheap when nothing needs healing.
 * Used by `upgradeStdState` (Std) and per-SP inside `upgradeCplxState`
 * (Cpx), so both calculator types are covered. Does NOT bump schema
 * version — this is a defensive heal, not a shape change.
 *
 * @param {object|null|undefined} state  Std state or single Cpx subproduct.
 * @returns {object}                     State with canonical fields filled
 *                                       if they were missing.
 */
export function healPrintCutMissingCanonical(state) {
  if (!state || typeof state !== 'object') return state;
  let next = state;
  const pw = Number(next.part_width) || 0;
  const printPw = Number(next.print_part_width) || 0;
  if (pw <= 0 && printPw > 0) {
    next = { ...next, part_width: printPw };
  }
  const pl = Number(next.part_length_md) || 0;
  const printPl = Number(next.print_part_length_md) || 0;
  if (pl <= 0 && printPl > 0) {
    next = { ...next, part_length_md: printPl };
  }
  return next;
}
