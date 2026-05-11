// @ts-check
/**
 * Sprint S-ALT-MAT flag-flip — display label for the primary row-type
 * dropdown option (`<option value="Main.Mat">`). When the operator
 * views the alternative set, the displayed label flips to "Alt.Mat"
 * while the underlying data value stays "Main.Mat" (calcEngine reads
 * `row_type === 'Main.Mat'` to classify primary vs Process rows, so
 * the schema MUST stay stable across the toggle).
 *
 * @param {'main'|'alt'|string|undefined|null} active
 * @returns {'Main.Mat'|'Alt.Mat'}
 */
export function primaryRowTypeLabel(active) {
  return active === 'alt' ? 'Alt.Mat' : 'Main.Mat';
}
