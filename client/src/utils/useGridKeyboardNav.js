/**
 * useGridKeyboardNav — install spreadsheet-style arrow/Enter navigation on a
 * scope container (a pricing sub-tab's content root). Scoped to the ref so it
 * never hijacks the sidebar, modals, Quote History, etc.
 *
 * Behavior:
 *   • Up / Down  → nearest control above / below (same column); Enter = Down,
 *     Shift+Enter = Up (Excel-like). Never submits.
 *   • Left / Right → nearest control left / right, but for TEXT inputs only
 *     once the caret is at the boundary (start for Left, end for Right) so
 *     mid-number editing isn't broken. Controls with no caret (select /
 *     checkbox / number) always move.
 *   • Moving focus selects the value so typing overwrites; the blur that focus
 *     movement triggers commits DecimalInput naturally, so values persist.
 *   • Clamps at grid edges (no candidate → no-op). preventDefault ONLY when we
 *     actually move focus.
 *
 * Capture-phase so it sees keys before the inputs; DecimalInput needs no change.
 */
import { useEffect } from 'react';
import { collectFocusable, rectOf, nextControlInDirection } from './gridKeyboardNav.js';

const KEY_DIR = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

// Caret position for text-like inputs. Controls with no text selection
// (select, checkbox, and type=number which throws on selectionStart access)
// report both boundaries true → Left/Right always navigate.
function caretBoundary(el) {
  try {
    const { selectionStart: start, selectionEnd: end } = el;
    if (start == null || end == null) return { atStart: true, atEnd: true };
    const len = (el.value == null ? '' : String(el.value)).length;
    return { atStart: start === 0 && end === 0, atEnd: start === len && end === len };
  } catch {
    return { atStart: true, atEnd: true };
  }
}

function focusAndSelect(el) {
  el.focus();
  try {
    if (typeof el.select === 'function') el.select();
  } catch {
    /* select() unsupported on this control type — focus is enough */
  }
}

/**
 * @param {{current: HTMLElement|null}} scopeRef  ref to the sub-tab content root
 */
export function useGridKeyboardNav(scopeRef) {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return undefined;

    function onKeyDown(e) {
      // Leave shortcuts (Ctrl/Cmd/Alt) alone entirely.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isEnter = e.key === 'Enter';
      let dir = KEY_DIR[e.key];
      if (isEnter) dir = e.shiftKey ? 'up' : 'down';
      else if (!dir)
        return; // not a nav key
      else if (e.shiftKey) return; // Shift+Arrow = extend selection, keep native

      const active = document.activeElement;
      if (!active || !scope.contains(active)) return; // focus is elsewhere (sidebar)
      // Focus inside a skip region (an inline modal/popover, the alt-mat
      // toggle) — leave the key entirely to that widget.
      if (active.closest('[data-kbd-skip]')) return;

      // Only drive navigation from a control we manage.
      const tag = active.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;

      // Left/Right only leave a text cell at its caret boundary.
      if (dir === 'left' || dir === 'right') {
        const { atStart, atEnd } = caretBoundary(active);
        if (dir === 'left' && !atStart) return;
        if (dir === 'right' && !atEnd) return;
      }

      const controls = collectFocusable(scope);
      if (controls.length < 2) return;
      const activeRect = rectOf(active);
      const rects = controls.filter((el) => el !== active).map((el) => ({ el, rect: rectOf(el) }));

      const target = nextControlInDirection(rects, activeRect, dir);
      if (!target) return; // clamp at edge — don't swallow the key

      e.preventDefault();
      focusAndSelect(target);
    }

    // Capture phase: see the key before the focused input's own handling.
    scope.addEventListener('keydown', onKeyDown, true);
    return () => scope.removeEventListener('keydown', onKeyDown, true);
  }, [scopeRef]);
}
