/**
 * Pure helpers for the Summarize tab's two new materials-aggregation
 * columns (DRAW_MATERIALS + QUOTE_MATERIALS) plus the multi-line bullet
 * formatter shared with REMARK / PROCESS / TYPE_OF_MATERIAL cells.
 * Lives in `.js` so vanilla node:test can import without the JSX
 * loader — same pattern as ColumnsToggle.helpers /
 * CalcLeadTimeNotice.helpers.
 *
 * Active-set contract (Sprint S-ALT-MAT, PR #39/40/41):
 *   - Standard quote: `state.materials` is a LIVE MIRROR of the active
 *     set (`materials_main` or `materials_alt`), kept in sync by the
 *     SET_MATERIALS_ACTIVE reducer. Reading `state.materials` always
 *     returns whatever set the operator currently picked.
 *   - Complex quote: per-subproduct `subproducts[i].materials` mirrors
 *     `subproducts[i].materials_main|_alt` the same way.
 *   - We intentionally DO NOT dedupe across sub-products. Operator wants
 *     visibility into what's literally in the BOM — duplicate row
 *     entries across sub-products (e.g. "Mat-A, Mat-A, Mat-B") signal
 *     real production parallelism, not a stale render.
 *
 * Main.Mat filter (added 2026-06-10 follow-up to PR #124):
 *   The Summarize "Materials" columns are customer-facing — only
 *   primary (`row_type: 'Main.Mat'`) rows belong in the join. Ancillary
 *   `Process Mat` rows (release liner, primer, anti-static spray) flow
 *   through their own calc path and don't represent the substrate the
 *   customer is buying. `isMainMat` from `../lib/rowTypeNormalize.js`
 *   tolerates the legacy "Main.Mat 1" / "Main.Mat 2" forms in case
 *   operator-typed sequence suffixes drifted into the data.
 */

import { isMainMat } from '../lib/rowTypeNormalize.js';

function nonEmpty(s) {
  return typeof s === 'string' && s.length > 0;
}

/**
 * Turn an array of strings into a multi-line bullet list
 * ("- a\n- b\n- c"). Empty / null / whitespace-only entries are dropped
 * (operator-typed material rows often carry blank `drw_material` cells
 * the operator hasn't filled in yet — those shouldn't render as blank
 * bullets).
 *
 * @param {Array<string>|null|undefined} items
 * @returns {string}
 */
export function formatBulletList(items) {
  if (!Array.isArray(items)) return '';
  const cleaned = items
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return '';
  // `\u2022 ` not `- `: a cell that starts with a dash is read as a
  // formula by Excel, which is how the Summarize export came out as
  // #NAME? in the Draw Materials column. csvEscape neutralises that
  // case too, but a bullet that is simply not a formula character is
  // the better fix — it also reads better on screen.
  return cleaned.map((s) => `\u2022 ${s}`).join('\n');
}

/**
 * Split an operator-typed textarea value (Lead Time & Notice cells —
 * `lt_remark`, `lt_process`, `lt_material_type`) into a bullet list.
 * Blank lines tolerated + ignored so operator can use double-Enter for
 * paragraph spacing in the source textarea without polluting the
 * Summarize cell.
 *
 * @param {string|null|undefined} rawText
 * @returns {string}
 */
export function toBulletFromTextarea(rawText) {
  if (typeof rawText !== 'string') return '';
  // Split on \n (covers \r\n via the trim() below dropping the \r).
  const lines = rawText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return formatBulletList(lines);
}

/**
 * Bullet-list `drw_material` strings from every primary (Main.Mat)
 * material row of a quote. Standard quote walks `state.materials`;
 * Complex quote walks every `subproducts[i].materials`. Process Mat
 * rows are explicitly skipped (customer-facing column).
 *
 * @param {object|null|undefined} state - Persisted quote state
 * @returns {string} bullet-separated material identifiers, '' if none
 */
export function collectDrwMaterials(state) {
  if (!state || typeof state !== 'object') return '';
  let items;
  if (Array.isArray(state.subproducts) && state.subproducts.length > 0) {
    items = state.subproducts
      .flatMap((sp) => (Array.isArray(sp?.materials) ? sp.materials : []))
      .filter((m) => m && isMainMat(m.row_type))
      .map((m) => m.drw_material);
  } else {
    items = (Array.isArray(state.materials) ? state.materials : [])
      .filter((m) => m && isMainMat(m.row_type))
      .map((m) => m.drw_material);
  }
  // Strip non-strings before bullet-format so the helper stays
  // strict about its input contract.
  return formatBulletList(items.filter(nonEmpty));
}

/**
 * Bullet-list `desc` (Quote materials — operator-typed material
 * identifier sent to customer) from every primary (Main.Mat) row.
 * Same Std-vs-Cpx branching + Process Mat skip as collectDrwMaterials.
 *
 * @param {object|null|undefined} state
 * @returns {string}
 */
/**
 * The value shown in the grid's "IFS CODE" column, for one material row.
 *
 * That column is bound to `mat.code`, not `mat.ifs_code` — `ifs_code` is a
 * shadow field with no input of its own, written only as a side effect of
 * picking from the library (`CalcMaterials.jsx` onPick). Measured across the
 * 132 live quotes: it is set on 4 material rows out of 656 populated ones, and
 * never holds a value different from `code`. So `code` is the source and
 * `ifs_code` merely wins when both are present.
 *
 * This is the resolution the xlsx Materials sheet already ships
 * (`server/services/quoteExport/sheets/03-materials.js`), reused verbatim so
 * the two exports cannot disagree about what an IFS code is.
 */
function ifsCodeOf(m) {
  return m.ifs_code || m.code;
}

export function collectQuoteMaterials(state) {
  if (!state || typeof state !== 'object') return '';
  let items;
  if (Array.isArray(state.subproducts) && state.subproducts.length > 0) {
    items = state.subproducts
      .flatMap((sp) => (Array.isArray(sp?.materials) ? sp.materials : []))
      .filter((m) => m && isMainMat(m.row_type))
      .map(ifsCodeOf);
  } else {
    items = (Array.isArray(state.materials) ? state.materials : [])
      .filter((m) => m && isMainMat(m.row_type))
      .map(ifsCodeOf);
  }
  return formatBulletList(items.filter(nonEmpty));
}
