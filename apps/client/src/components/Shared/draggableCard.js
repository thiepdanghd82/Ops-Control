// Global drag-to-move + resize for any overlay card/drawer/modal.
//
// Usage (markup-only):
//   <div className="... ops-card" data-ops-draggable-card>
//     <div className="... ops-card-head" data-ops-drag-handle>
//       ...
//     </div>
//     ...
//   </div>
//
// How it works:
//   - One delegated pointerdown listener on document.
//   - When the user starts a drag on a `[data-ops-drag-handle]`, the
//     nearest ancestor `[data-ops-draggable-card]` is reparented to
//     `position:fixed` with explicit left/top so it can move freely.
//   - Moves are clamped to the viewport so the card can't be lost
//     off-screen.
//   - Resize is pure CSS (`resize: both`) in `draggableCard.css` —
//     the handle sits in the card's bottom-right corner.
//
// Exclusions: clicks on inputs/buttons/links inside the handle are
// ignored so the native UI still works (e.g. the × close button).

let installed = false;

export function installDraggableCards() {
  if (installed) return;
  installed = true;

  let drag = null;

  const onPointerDown = (e) => {
    // Only left-button drags
    if (e.button !== 0) return;

    // Never capture clicks on interactive children
    if (e.target.closest('button, a, input, select, textarea, [data-no-drag]')) return;

    const handle = e.target.closest('[data-ops-drag-handle]');
    if (!handle) return;

    const card = handle.closest('[data-ops-draggable-card]');
    if (!card) return;

    const rect = card.getBoundingClientRect();

    // Convert to free-floating fixed positioning so we can move it.
    // Side drawers (right:0) and centered modals both normalise to
    // explicit left/top with right/bottom cleared.
    card.style.position = 'fixed';
    card.style.left = rect.left + 'px';
    card.style.top = rect.top + 'px';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    card.style.margin = '0';
    card.style.transform = 'none';
    card.setAttribute('data-ops-dragging', 'true');

    drag = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    };

    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // Re-measure live in case the user resized the card mid-drag.
    // Card height isn't used for clamping — Y is bounded by [0, viewport-pad]
    // so the title bar can never disappear above the top edge (X allows
    // partial off-screen so the card can be tucked aside).
    const live = drag.card.getBoundingClientRect();
    const w = live.width;
    let nx = drag.startLeft + dx;
    let ny = drag.startTop + dy;
    // Clamp so at least a 40px strip stays visible in each direction
    const pad = 40;
    nx = Math.max(-w + pad, Math.min(nx, window.innerWidth - pad));
    ny = Math.max(0, Math.min(ny, window.innerHeight - pad));
    drag.card.style.left = nx + 'px';
    drag.card.style.top = ny + 'px';
  };

  const onPointerUp = () => {
    if (!drag) return;
    drag.card.removeAttribute('data-ops-dragging');
    drag = null;
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
}
