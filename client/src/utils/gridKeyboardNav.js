/**
 * gridKeyboardNav — geometry-based cell-to-cell navigation for the pricing
 * calculators. Works uniformly for <table> rows AND CSS-grid forms because it
 * reasons purely about bounding-box centers, not DOM structure.
 *
 * `nextControlInDirection` is a PURE function of rects → it unit-tests without
 * a DOM. `collectFocusable` / `rectOf` touch the DOM and are exercised at
 * runtime (the repo has no DOM test infra; the hook wiring is verified by
 * hardware smoke).
 */

// Rows/columns in a real grid share an exact center on the cross axis, so a
// 1px band cleanly separates "same row/column" from "a different one". It also
// absorbs sub-pixel jitter from getBoundingClientRect.
export const NAV_EPS = 1;

/**
 * Lexicographic "is A a better target than B" for a pressed direction:
 *   1. smaller PRIMARY gap wins (nearest row for up/down, nearest column for
 *      left/right) — this is what keeps ragged rows landing in the NEAREST row
 *      rather than skipping to a farther but better-aligned cell;
 *   2. within the same primary band (±EPS), smaller CROSS misalignment wins
 *      (best column alignment for up/down; best row alignment for left/right);
 *   3. ties broken by original array index → deterministic on equal positions.
 */
function isBetter(a, b) {
  if (a.primary < b.primary - NAV_EPS) return true;
  if (a.primary > b.primary + NAV_EPS) return false;
  if (a.cross < b.cross - NAV_EPS) return true;
  if (a.cross > b.cross + NAV_EPS) return false;
  return a.idx < b.idx;
}

/**
 * Best control to move to from `activeRect` in `dir`, or null if none.
 * @param {Array<{el:any, rect:{top:number,left:number,right:number,bottom:number,cx:number,cy:number}}>} controls
 * @param {{cx:number, cy:number}} activeRect
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {any|null} the winning control's `el`, or null
 */
export function nextControlInDirection(controls, activeRect, dir) {
  if (!Array.isArray(controls) || !activeRect || !dir) return null;
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
    } else if (dir === 'left') {
      if (!(r.cx < activeRect.cx - NAV_EPS)) continue;
      primary = activeRect.cx - r.cx;
      cross = Math.abs(r.cy - activeRect.cy);
    } else {
      return null; // unknown direction
    }
    const cand = { el: c.el, primary, cross, idx };
    if (best == null || isBetter(cand, best)) best = cand;
  }
  return best ? best.el : null;
}

/** getBoundingClientRect → the {cx,cy}-augmented rect shape nav expects. */
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

/**
 * Visible, enabled controls inside `scope`, excluding disabled / readonly and
 * anything inside a [data-kbd-skip] subtree. DOM-only (not unit-tested).
 * @param {Element} scope
 * @returns {HTMLElement[]}
 */
export function collectFocusable(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  const out = [];
  const nodes = scope.querySelectorAll(FOCUSABLE_SELECTOR);
  for (const el of nodes) {
    if (el.disabled || el.readOnly) continue;
    if (el.closest('[data-kbd-skip]')) continue;
    // Visible = laid out (offsetParent set, or has a box). Cheap check first.
    if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
    out.push(el);
  }
  return out;
}
