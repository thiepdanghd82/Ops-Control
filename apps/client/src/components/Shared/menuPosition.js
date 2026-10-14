// Pure geometry for floating right-click context menus.
//
// Both helpers are framework-free and unit-tested (menuPosition.test.js)
// so the edge-flip + clamp math has one implementation shared by every
// context menu (QuoteHistory, Summarize, PrintAreaCalc, FileUploadZone,
// LibraryPicker) — see useFloatingMenu.js for the React binding.
//
// `vw`/`vh` default to the live viewport but are always injectable so the
// math runs headless in node:test. The defaults reference `window` lazily
// (only evaluated when the arg is omitted), so importing this module in
// node is safe.

/**
 * Clamp a menu box fully inside the viewport margins.
 *
 * When the menu is larger than the viewport the upper bound
 * (`vp - size - margin`) drops below `margin`, so `Math.max(margin, …)`
 * pins the box to the top/left margin — it never goes negative.
 *
 * @param {{left:number, top:number, menuW:number, menuH:number,
 *          margin?:number, vw?:number, vh?:number}} p
 * @returns {{left:number, top:number}}
 */
export function clampMenu({
  left,
  top,
  menuW,
  menuH,
  margin = 8,
  vw = window.innerWidth,
  vh = window.innerHeight,
}) {
  return {
    left: Math.max(margin, Math.min(left, vw - menuW - margin)),
    top: Math.max(margin, Math.min(top, vh - menuH - margin)),
  };
}

/**
 * Place a menu opened at cursor (x, y): flip it above/left of the cursor
 * when opening down/right would overflow, then clamp inside the margins.
 *
 * @param {{x:number, y:number, menuW:number, menuH:number,
 *          margin?:number, vw?:number, vh?:number}} p
 * @returns {{left:number, top:number}}
 */
export function placeMenu({
  x,
  y,
  menuW,
  menuH,
  margin = 8,
  vw = window.innerWidth,
  vh = window.innerHeight,
}) {
  let left = x;
  let top = y;
  // Flip above the cursor if opening downward overflows the bottom edge.
  if (y + menuH > vh) top = y - menuH;
  // Flip to the left of the cursor if opening rightward overflows.
  if (x + menuW > vw) left = x - menuW;
  return clampMenu({ left, top, menuW, menuH, margin, vw, vh });
}
