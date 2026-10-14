/**
 * touchedState — pure helpers for the "which fields has the operator
 * actually edited" set held by CalcContext.
 *
 * Kept out of the provider so it can be unit-tested without a React
 * renderer, and so the identity guarantee below is pinned by a test:
 * re-adding an existing field returns the SAME array reference, which
 * is what stops every keystroke from re-rendering the whole calculator.
 */

export function addTouched(touched, field) {
  if (!field) return touched;
  if (touched.includes(field)) return touched;
  return [...touched, field];
}
