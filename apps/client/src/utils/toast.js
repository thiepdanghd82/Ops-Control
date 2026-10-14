/**
 * Toast — lightweight, queueable notification.
 * Previously this function was duplicated in StandardCalc.jsx and
 * ComplexCalc.jsx (~15 lines each, different-ish styles). Unified here
 * so overlapping saves queue cleanly instead of flashing on top of each
 * other, and so there is a single place to restyle later.
 *
 * Palette (reused from StandardCalc.css, no new colors):
 *   ok  → #16a34a (same green as .sc-btn-save success & GM-pass colors)
 *   err → #dc2626 (same red as .sc-input-err / .sc-btn-del)
 *
 * Accessibility: ok toasts use role="status" + aria-live="polite"
 * (announced without interrupting); err toasts use role="alert" +
 * aria-live="assertive" so screen readers surface failures immediately.
 */

const STACK = [];
const GAP = 8; // px between stacked toasts
const BASE = 24; // px from bottom for the first toast
const DURATION = 2500;

function reflow() {
  // Re-stack remaining toasts from the bottom upward.
  let offset = BASE;
  for (const el of STACK) {
    el.style.bottom = `${offset}px`;
    offset += el.offsetHeight + GAP;
  }
}

function remove(el) {
  const idx = STACK.indexOf(el);
  if (idx >= 0) STACK.splice(idx, 1);
  el.style.opacity = '0';
  setTimeout(() => {
    el.remove();
    reflow();
  }, 300);
}

export function showToast(msg, type = 'ok') {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.setAttribute('role', type === 'ok' ? 'status' : 'alert');
  el.setAttribute('aria-live', type === 'ok' ? 'polite' : 'assertive');
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 22px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    lineHeight: '1.4',
    letterSpacing: '.01em',
    zIndex: '9999',
    color: '#fff',
    background: type === 'ok' ? '#16a34a' : '#dc2626',
    boxShadow: type === 'ok' ? '0 6px 20px rgba(22,163,74,.35)' : '0 6px 20px rgba(220,38,38,.35)',
    transition: 'opacity .3s, bottom .2s',
    opacity: '1',
    bottom: `${BASE}px`,
    maxWidth: 'min(420px, calc(100vw - 32px))',
    textAlign: 'center',
  });
  document.body.appendChild(el);
  STACK.push(el);
  reflow();
  setTimeout(() => remove(el), DURATION);
}
