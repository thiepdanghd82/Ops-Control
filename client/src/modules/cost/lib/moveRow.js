/**
 * Reorder one row of a grid by one VISIBLE position.
 *
 * The grids hide rows rather than deleting them (`hidden: true`), and
 * CalcProcesses renders `processes.filter(p => !p.hidden)` — so a hidden row
 * sits in the backing array at an index the operator cannot see. Swapping
 * with the raw neighbour would therefore be a button that sometimes does
 * nothing at all: the array changes, the screen does not. That is the failure
 * shape Lesson 41 records — a control whose effect and whose display are
 * derived by different rules.
 *
 * So the swap is with the next VISIBLE neighbour. Hidden rows keep their own
 * slots; the visible order moves by exactly one, which is what was clicked.
 *
 * Returns the SAME array reference when the move is impossible (already at
 * the visible edge, bad index, not an array) so React can skip the re-render
 * and callers need no separate "can I move?" predicate.
 */

/** @param {Array} rows @param {number} idx @param {'up'|'down'} dir */
export function moveRowAmongVisible(rows, idx, dir) {
  if (!Array.isArray(rows)) return rows;
  if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) return rows;
  if (dir !== 'up' && dir !== 'down') return rows;
  if (rows[idx] && rows[idx].hidden) return rows; // not on screen to move

  const step = dir === 'up' ? -1 : 1;
  let j = idx + step;
  while (j >= 0 && j < rows.length && rows[j] && rows[j].hidden) j += step;
  if (j < 0 || j >= rows.length) return rows; // at the visible edge

  const out = [...rows];
  out[idx] = rows[j];
  out[j] = rows[idx];
  return out;
}

/** True when `moveRowAmongVisible` would change anything — for disabling a button. */
export function canMoveRow(rows, idx, dir) {
  return moveRowAmongVisible(rows, idx, dir) !== rows;
}
