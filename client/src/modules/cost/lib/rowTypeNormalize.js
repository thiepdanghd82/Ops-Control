/**
 * Row-type normalization for material rows. Operator-typed `row_type`
 * values drift over time — legacy quotes carry strings like
 * "Main.Mat 1", "Main.Mat 2", "Process Mat 5" (operator appended a
 * sequence number for personal bookkeeping). The canonical post-Sprint
 * S-ALT-MAT values are just "Main.Mat" / "Process Mat" — calcEngine
 * already treats both forms equivalently via this normalizer pattern.
 *
 * Extracted to its own module (under `lib/`) because future work
 * (Cpx Materials filtering, xlsx export classification) will reuse the
 * same predicate. Pure functions, vanilla node:test compatible.
 */

/**
 * Strip trailing whitespace + numeric suffix so the canonical row-type
 * label remains. Returns '' for non-string input (defensive — callers
 * shouldn't have to null-guard before classifying).
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function normalizeRowType(raw) {
  if (typeof raw !== 'string') return '';
  // Trim outer whitespace FIRST so the suffix-strip regex anchors on the
  // last non-space character. Then drop any " 12" / "  3" suffix.
  return raw.trim().replace(/\s+\d+$/, '');
}

/**
 * Main.Mat = primary material rows that flow through the standard
 * mat-cost formula. Includes "Main.Mat 1" / "Main.Mat 2" legacy forms.
 *
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
export function isMainMat(raw) {
  return normalizeRowType(raw) === 'Main.Mat';
}

/**
 * Process Mat = ancillary materials consumed during a process step
 * (e.g. release liner, primer, anti-static spray) — should NOT be
 * surfaced in the customer-facing Summarize "Materials" columns.
 *
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
export function isProcessMat(raw) {
  return normalizeRowType(raw) === 'Process Mat';
}
