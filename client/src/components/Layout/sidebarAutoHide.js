/**
 * Auto-hide mode for the sidebar.
 *
 * A third way to run the sidebar, ORTHOGONAL to the existing width choice
 * rather than a replacement for it: the rail (`collapsed`) decides how WIDE
 * the sidebar is, auto-hide decides whether it takes up room at all.
 *
 *   pinned (default)  the sidebar sits in the layout flex row, as always
 *   auto-hide         it leaves the flow and slides OVER the work area;
 *                     a thin strip along the left edge brings it back
 *
 * It overlays rather than pushes on purpose. If revealing the sidebar
 * widened the flex row, every hover near the left edge would reflow the
 * table underneath and the row under the cursor would jump — the opposite
 * of what a peek is for.
 *
 * Pure so the class matrix and the click-outside rule can be tested; this
 * repo has no React test renderer, so anything with real branching lives
 * in a plain .js beside its component.
 */

/** localStorage key — sibling of App.jsx's `ops_sidebar_collapsed`. */
export const AUTO_HIDE_KEY = 'ops_sidebar_autohide';

/**
 * Class names for the two elements that react to the mode.
 *
 * `sidebar-collapsed` keeps its existing meaning and placement on BOTH
 * nodes, because rules elsewhere already key off it.
 *
 * @param {{autoHide?: boolean, collapsed?: boolean, revealed?: boolean}} s
 * @returns {{layout: string, aside: string, showHandle: boolean, inert: boolean}}
 */
export function resolveSidebarLayout(s = {}) {
  const autoHide = !!s.autoHide;
  const collapsed = !!s.collapsed;
  // Only meaningful while auto-hiding; a pinned sidebar is always shown.
  const revealed = autoHide ? !!s.revealed : true;

  const layout = ['app-layout'];
  if (collapsed) layout.push('sidebar-collapsed');
  if (autoHide) layout.push('sidebar-auto');

  const aside = ['sidebar'];
  if (collapsed) aside.push('sidebar-collapsed');
  if (autoHide) aside.push('sidebar-auto');
  if (autoHide && revealed) aside.push('sidebar-revealed');

  return {
    layout: layout.join(' '),
    aside: aside.join(' '),
    // The handle only exists while hidden — leaving it live under a
    // revealed sidebar would swallow clicks meant for the first nav item.
    showHandle: autoHide && !revealed,
    // Off-canvas content must not be reachable by Tab or read aloud.
    inert: autoHide && !revealed,
  };
}

/**
 * Henry's rule: "when you select the work area, it hides." A pointer press
 * that lands inside the sidebar (or on the edge handle) is the operator
 * still using the sidebar, so it must NOT dismiss.
 *
 * @param {EventTarget|null} target  event.target of the pointer press
 * @param {{contains?: (n: any) => boolean}|null} sidebarEl
 * @returns {boolean} true when the press should hide the sidebar
 */
export function shouldHideOnPointerDown(target, sidebarEl) {
  if (!sidebarEl || typeof sidebarEl.contains !== 'function') return false;
  if (!target) return false;
  if (sidebarEl.contains(target)) return false;
  // The handle is a sibling of the sidebar, not a child.
  const el = /** @type {any} */ (target);
  if (el.classList && typeof el.classList.contains === 'function') {
    if (el.classList.contains('sidebar-edge-handle')) return false;
  }
  return true;
}
