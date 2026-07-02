/**
 * Modal — shared dialog primitive.
 *
 * Design: IBM Carbon Dialog + SAP Fiori conventions adapted to the Ops
 * Control visual language (IBM Plex Sans, brand blue, 4px radius).
 *
 * Anatomy:
 *   <Modal open={...} onClose={...} size="md" severity="question">
 *     <Modal.Header title="Save quote" subtitle="#42 — CCL-1234" />
 *     <Modal.Body>...</Modal.Body>
 *     <Modal.Footer>
 *       <button className="op-btn op-btn-ghost">Cancel</button>
 *       <button className="op-btn op-btn-secondary">...</button>
 *       <button className="op-btn op-btn-primary">...</button>
 *     </Modal.Footer>
 *   </Modal>
 *
 * Sizes (Carbon-sized):
 *   sm  400px  — short confirmations ("Delete this?")
 *   md  560px  — standard form / save-choice / info digest
 *   lg  800px  — complex forms, tables inside dialogs
 *   xl  960px  — approval history, multi-section editors
 *
 * Severities (controls the leading icon + accent bar colour):
 *   question (default) · info · success · warning · danger
 *
 * Dismissal:
 *   - ESC key
 *   - Click outside the card (unless `dismissable={false}`)
 *   - × close button in header (unless `closable={false}`)
 *
 * Focus:
 *   First primary action button inside the modal is focused on open.
 *   Focus is restored to the previously-active element on close.
 */
import { useEffect, useRef } from 'react';
import './Modal.css';

const SEVERITY_ICONS = {
  question: (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V12" />
      <circle cx="10" cy="15" r=".5" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6" r=".5" fill="currentColor" />
    </svg>
  ),
  success: (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="m6.5 10.5 2.5 2.5L14 8" />
    </svg>
  ),
  warning: (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2 2 17h16L10 2Z" />
      <path d="M10 8v4" />
      <circle cx="10" cy="14.5" r=".5" fill="currentColor" />
    </svg>
  ),
  danger: (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="m7 7 6 6M13 7l-6 6" />
    </svg>
  ),
};

export default function Modal({
  open,
  onClose,
  size = 'md',
  severity, // 'question' | 'info' | 'success' | 'warning' | 'danger' | undefined
  dismissable = true,
  closable = true,
  ariaLabelledBy,
  // Drag the card by its header to reposition. Default: AUTO — on for the
  // content-rich sizes (lg/xl: showcards, tables, pickers, previews) where
  // moving the dialog to see the screen behind is useful; off for sm/md
  // (short confirmations / small forms stay centered). Pass an explicit
  // boolean to force it either way.
  draggable,
  children,
}) {
  const isDraggable = draggable ?? (size === 'lg' || size === 'xl');
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // Keep the latest onClose without retriggering the open/focus effect below.
  // Consumers pass an inline arrow for onClose (new identity every render), so
  // listing it as an effect dep re-ran the autofocus on every keystroke and
  // stole focus back to the primary button after one character. See Lesson 38.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement;

    // Focus: prefer the primary action button, else any button, else the card.
    requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;
      const primary = card.querySelector('.op-btn-primary, [data-modal-autofocus], [autofocus]');
      const anyBtn = card.querySelector('button:not([disabled])');
      (primary || anyBtn || card).focus();
    });

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);

    // Prevent the page behind from scrolling while the modal is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const toRestore = restoreFocusRef.current;
      if (toRestore && typeof toRestore.focus === 'function') {
        try {
          toRestore.focus();
        } catch {
          /* noop */
        }
      }
    };
  }, [open, dismissable]);

  // Opt-in drag: move the card by its header. Imperative (writes
  // card.style.transform directly) so there's no per-mousemove re-render and
  // no dynamic inline style in JSX (Lesson 6). Offset resets each open.
  useEffect(() => {
    if (!open || !isDraggable) return;
    const card = cardRef.current;
    const header = card?.querySelector('.op-modal-header');
    if (!card || !header) return;
    card.style.transform = '';
    let dx = 0,
      dy = 0,
      startX = 0,
      startY = 0,
      dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      card.style.transform = `translate(${dx + e.clientX - startX}px, ${dy + e.clientY - startY}px)`;
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      dx += e.clientX - startX;
      dy += e.clientY - startY;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    const onDown = (e) => {
      // Left button only; ignore drags that start on an interactive control.
      if (e.button !== 0 || e.target.closest('button, a, input, select, textarea')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    };
    header.addEventListener('mousedown', onDown);
    return () => {
      header.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open, isDraggable]);

  if (!open) return null;

  const handleOverlayMouseDown = (e) => {
    if (!dismissable) return;
    if (e.target === e.currentTarget) onClose?.();
  };

  const severityClass = severity ? ` op-modal--${severity}` : '';

  return (
    <div className="op-modal-overlay" role="presentation" onMouseDown={handleOverlayMouseDown}>
      <div
        ref={cardRef}
        className={`op-modal-card size-${size}${severityClass}${isDraggable ? ' op-modal-card--draggable' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
        {closable && (
          <button
            type="button"
            className="op-modal-close"
            aria-label="Close dialog"
            onClick={() => onClose?.()}
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 3l10 10M13 3 3 13" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

Modal.Header = function ModalHeader({ title, subtitle, severity, id, children }) {
  const icon = severity ? SEVERITY_ICONS[severity] : null;
  return (
    <header className="op-modal-header">
      {icon && (
        <span className={`op-modal-header-icon op-modal-header-icon--${severity}`}>{icon}</span>
      )}
      <div className="op-modal-header-text">
        {title && (
          <h2 id={id} className="op-modal-title">
            {title}
          </h2>
        )}
        {subtitle && <div className="op-modal-subtitle">{subtitle}</div>}
        {children}
      </div>
    </header>
  );
};

Modal.Body = function ModalBody({ children, className = '' }) {
  return <div className={`op-modal-body ${className}`.trim()}>{children}</div>;
};

Modal.Footer = function ModalFooter({ children, align = 'end' }) {
  return <footer className={`op-modal-footer align-${align}`}>{children}</footer>;
};
