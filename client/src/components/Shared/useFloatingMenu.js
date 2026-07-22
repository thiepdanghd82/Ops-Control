import { useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { placeMenu, clampMenu } from './menuPosition';

// useFloatingMenu — one binding for every right-click context menu.
//
// Responsibilities:
//   1. Position the menu at the cursor (x, y) with edge-aware flipping +
//      clamping (placeMenu), measured AFTER mount so it can't be clipped
//      by an ancestor's overflow. Menu must be `position: fixed`.
//   2. Let the operator drag the menu by an element flagged
//      `[data-menu-drag-handle]` (its title/header row). The drag offset
//      is written imperatively to the element's `transform` on mousemove
//      and re-clamped so the menu can never be lost off-screen.
//
// Placement is written imperatively to the element (left/top/visibility)
// in a useLayoutEffect — no setState, no dynamic inline style in JSX for
// either placement or drag (Lesson 6). The element renders `visibility:
// hidden` at the raw coords, is measured + placed before the browser
// paints, then revealed — so there is no visible flash or jump.
//
// @param {{open:boolean, x:number, y:number}} p
// @returns {{ menuRef: import('react').RefObject<HTMLElement>, style: object }}
export function useFloatingMenu({ open, x, y }) {
  const menuRef = useRef(null);
  const dragRef = useRef({ dx: 0, dy: 0 });

  // Measure + place before paint. Runs on every open and whenever the
  // cursor coords change (a fresh right-click).
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) return;
    dragRef.current = { dx: 0, dy: 0 }; // reset drag offset on each open
    el.style.transform = ''; // clear any prior drag
    const r = el.getBoundingClientRect();
    const { left, top } = placeMenu({ x, y, menuW: r.width, menuH: r.height });
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [open, x, y]);

  // Drag by the [data-menu-drag-handle] element. Left-button only; ignore
  // drags that start on an interactive child so buttons/links/inputs/color
  // swatches still click.
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    let start = null;
    const onDown = (e) => {
      if (e.button !== 0) return;
      const handle = e.target.closest('[data-menu-drag-handle]');
      if (!handle || !el.contains(handle)) return;
      if (e.target.closest('button, a, input, select, textarea, [data-no-drag]')) return;
      start = {
        x: e.clientX,
        y: e.clientY,
        dx: dragRef.current.dx,
        dy: dragRef.current.dy,
      };
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!start) return;
      const r = el.getBoundingClientRect();
      // Origin of the placed box, backing out the transform already applied.
      const baseLeft = r.left - dragRef.current.dx;
      const baseTop = r.top - dragRef.current.dy;
      const wantLeft = baseLeft + start.dx + (e.clientX - start.x);
      const wantTop = baseTop + start.dy + (e.clientY - start.y);
      const c = clampMenu({ left: wantLeft, top: wantTop, menuW: r.width, menuH: r.height });
      const dx = c.left - baseLeft;
      const dy = c.top - baseTop;
      dragRef.current = { dx, dy };
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onUp = () => {
      start = null;
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open, x, y]);

  // Base style: fixed at the raw coords, hidden until measured + placed by
  // the layout effect above (which overwrites left/top/visibility on the
  // DOM node directly).
  const style = { position: 'fixed', left: x, top: y, visibility: 'hidden' };

  return { menuRef, style };
}

// Merge the hook's menuRef with a caller's own ref (e.g. an existing
// outside-click ref) into one stable callback ref.
export function useMergedMenuRef(menuRef, otherRef) {
  return useCallback(
    (el) => {
      menuRef.current = el;
      if (otherRef) otherRef.current = el;
    },
    [menuRef, otherRef]
  );
}
