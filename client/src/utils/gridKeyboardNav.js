/**
 * gridKeyboardNav — cell-to-cell navigation for the pricing calculators.
 *
 * Two decision layers, both pure + unit-testable:
 *   • resolveTableTarget(grid, pos, dir) — STRUCTURAL nav for real <table>s
 *     (Materials / Inks / Processes and the Cpx sub-product tables). Left/Right
 *     step columns within the SAME row; Up/Down step rows within the SAME
 *     column. This is exact — no geometry, so it can't drift to another row.
 *   • nextControlInDirection(controls, activeRect, dir) — GEOMETRY fallback for
 *     the CSS-grid forms (RFQ & MOQ Info, Layout, Pack & Ship). Cross-axis
 *     ALIGNMENT gates first (a tolerance band), THEN nearest along the axis —
 *     so Right can't jump to a horizontally-nearer control in a different row.
 *
 * collectFocusable / rectOf touch the DOM and run at runtime only.
 */

// 1px band separates "same row/column" from "different" once alignment has
// already gated the candidates (below). Also absorbs sub-pixel jitter.
export const NAV_EPS = 1;

// ── Structural table nav (primary path) ──────────────────────────────────

/**
 * Nearest focusable cell in a row to `col`: same column first, else scan
 * outward (col-1, col+1, col-2, col+2, …) — deterministic, left-before-right
 * on a tie. Returns the cell's `el` or null.
 */
function nearestFocusableInRow(rowArr, col) {
  if (!Array.isArray(rowArr)) return null;
  if (rowArr[col] && rowArr[col].el != null) return rowArr[col].el;
  const reach = Math.max(rowArr.length, col + 1);
  for (let d = 1; d <= reach; d++) {
    const left = rowArr[col - d];
    if (left && left.el != null) return left.el;
    const right = rowArr[col + d];
    if (right && right.el != null) return right.el;
  }
  return null;
}

/**
 * Decide the navigation target inside a table, purely from its grid.
 * @param {Array<Array<{el:any}|null>>} grid  grid[rowIndex][cellIndex] → {el} or null
 * @param {{row:number, col:number}} pos       active cell's row / cellIndex
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {any|null} the target cell's `el`, or null to clamp (no move)
 */
export function resolveTableTarget(grid, pos, dir) {
  if (!Array.isArray(grid) || !pos) return null;
  const { row, col } = pos;
  if (!Array.isArray(grid[row])) return null;

  if (dir === 'left' || dir === 'right') {
    // Step columns within the SAME row; clamp at the row ends.
    const cells = grid[row];
    const step = dir === 'right' ? 1 : -1;
    for (let c = col + step; c >= 0 && c < cells.length; c += step) {
      if (cells[c] && cells[c].el != null) return cells[c].el;
    }
    return null;
  }

  if (dir === 'up' || dir === 'down') {
    // Step rows in the SAME column; if a row's same-column cell is empty,
    // take the nearest focusable column in THAT row; skip fully-empty rows.
    const step = dir === 'down' ? 1 : -1;
    for (let r = row + step; r >= 0 && r < grid.length; r += step) {
      const target = nearestFocusableInRow(grid[r], col);
      if (target != null) return target;
    }
    return null;
  }

  return null;
}

// ── Geometry fallback (CSS-grid forms) ───────────────────────────────────

// Among candidates already gated to the alignment band, prefer smallest axis
// distance, then smallest residual misalignment, then array order (stable).
function isBetter(a, b) {
  if (a.primary < b.primary - NAV_EPS) return true;
  if (a.primary > b.primary + NAV_EPS) return false;
  if (a.cross < b.cross - NAV_EPS) return true;
  if (a.cross > b.cross + NAV_EPS) return false;
  return a.idx < b.idx;
}

/**
 * Best control to move to from `activeRect` in `dir`, or null.
 *
 * Cross-axis ALIGNMENT gates first: a candidate must sit within a tolerance
 * band of the active control on the perpendicular axis (tol = max(8, half the
 * active control's cross-axis size)). Among in-band candidates in the pressed
 * direction, the nearest along the axis wins. Zero in-band candidates → null
 * (clamp) — never a far-off-axis fallback.
 *
 * @param {Array<{el:any, rect:{top:number,left:number,right:number,bottom:number,cx:number,cy:number}}>} controls
 * @param {{cx:number, cy:number, top?:number, bottom?:number, left?:number, right?:number}} activeRect
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {any|null}
 */
export function nextControlInDirection(controls, activeRect, dir) {
  if (!Array.isArray(controls) || !activeRect || !dir) return null;
  const horizontal = dir === 'left' || dir === 'right';
  if (!horizontal && dir !== 'up' && dir !== 'down') return null;

  const activeH = (activeRect.bottom ?? activeRect.cy) - (activeRect.top ?? activeRect.cy);
  const activeW = (activeRect.right ?? activeRect.cx) - (activeRect.left ?? activeRect.cx);
  // Gate on the perpendicular axis: for Left/Right, rows align by y (use
  // height); for Up/Down, columns align by x (use width).
  const tol = horizontal ? Math.max(8, activeH / 2) : Math.max(8, activeW / 2);

  let best = null;
  for (let idx = 0; idx < controls.length; idx++) {
    const c = controls[idx];
    if (!c || !c.rect) continue;
    const r = c.rect;
    let primary;
    let cross;
    if (dir === 'down') {
      if (!(r.cy > activeRect.cy + NAV_EPS)) continue;
      primary = r.cy - activeRect.cy;
      cross = Math.abs(r.cx - activeRect.cx);
    } else if (dir === 'up') {
      if (!(r.cy < activeRect.cy - NAV_EPS)) continue;
      primary = activeRect.cy - r.cy;
      cross = Math.abs(r.cx - activeRect.cx);
    } else if (dir === 'right') {
      if (!(r.cx > activeRect.cx + NAV_EPS)) continue;
      primary = r.cx - activeRect.cx;
      cross = Math.abs(r.cy - activeRect.cy);
    } else {
      // left
      if (!(r.cx < activeRect.cx - NAV_EPS)) continue;
      primary = activeRect.cx - r.cx;
      cross = Math.abs(r.cy - activeRect.cy);
    }
    if (cross > tol) continue; // NOT in line → reject (no off-axis fallback)
    const cand = { el: c.el, primary, cross, idx };
    if (best == null || isBetter(cand, best)) best = cand;
  }
  return best ? best.el : null;
}

// ── DOM adapters (runtime only) ──────────────────────────────────────────

/** getBoundingClientRect → the {cx,cy}-augmented rect shape geometry nav expects. */
export function rectOf(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

const FOCUSABLE_SELECTOR = 'input:not([type=hidden]), select, textarea';

function isNavigable(el) {
  if (el.disabled || el.readOnly) return false;
  if (el.closest('[data-kbd-skip]')) return false;
  // Visible = laid out (has an offset parent or any box).
  if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  return true;
}

/**
 * Visible, enabled controls inside `scope`, excluding disabled / readonly and
 * anything inside a [data-kbd-skip] subtree. DOM-only (not unit-tested).
 * @param {Element} scope
 * @returns {HTMLElement[]}
 */
export function collectFocusable(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  const out = [];
  for (const el of scope.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (isNavigable(el)) out.push(el);
  }
  return out;
}

/** First navigable control inside a table cell, or null. */
function firstFocusableInCell(td) {
  for (const el of td.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (isNavigable(el)) return el;
  }
  return null;
}

/**
 * Build the structural grid + active position for the <table> containing
 * `active`, or null if `active` is not inside a table cell within `scope`.
 * grid[rowIndex][cellIndex] = { el } | null, indexed by <td>.cellIndex.
 * @returns {{grid:Array<Array<{el:HTMLElement}|null>>, pos:{row:number, col:number}}|null}
 */
export function buildTableContext(active, scope) {
  if (!active) return null;
  const cell = active.closest('td, th');
  const table = active.closest('table');
  if (!cell || !table || (scope && !scope.contains(table))) return null;
  const tr = cell.parentElement;
  if (!tr || typeof tr.rowIndex !== 'number' || tr.rowIndex < 0) return null;

  const grid = [];
  for (let r = 0; r < table.rows.length; r++) {
    const rowEl = table.rows[r];
    const rowArr = [];
    for (let c = 0; c < rowEl.cells.length; c++) {
      const el = firstFocusableInCell(rowEl.cells[c]);
      rowArr[c] = el ? { el } : null;
    }
    grid.push(rowArr);
  }
  return { grid, pos: { row: tr.rowIndex, col: cell.cellIndex } };
}
