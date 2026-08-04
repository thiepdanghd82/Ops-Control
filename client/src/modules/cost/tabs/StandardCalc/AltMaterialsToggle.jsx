// @ts-check
/**
 * AltMaterialsToggle — Sprint S-ALT-MAT, PR #A.
 *
 * Renders the Main / Alternative materials selector + bi-directional
 * copy popover at the top of the Materials tab. Gated by the
 * `alt_materials` feature flag (see AppConfigContext); when off, the
 * toggle isn't rendered and behavior matches the v1.5.2 baseline.
 *
 * Contract (Std only — PR #B will add a Cpx variant):
 *   - stdState.materials_active: 'main' | 'alt' — discriminator
 *   - stdState.materials_main, materials_alt: the two row arrays
 *   - dispatch SET_MATERIALS_ACTIVE to swap; reducer keeps the legacy
 *     stdState.materials mirror in sync with the active set
 *   - dispatch COPY_MATERIALS with { direction } to clone source onto
 *     destination; reducer attaches an ephemeral _alt_materials_op
 *     signal that the server consumes on next save (for audit emit)
 *
 * Accessibility:
 *   - Two <input type="radio" name="materials-active"> backing pills
 *     so screen readers + keyboard arrow-nav work natively
 *   - Copy button = <button aria-haspopup="menu" aria-expanded={open}>
 *   - Popover menu items = <button role="menuitem"> with disabled state
 *     wired to aria-disabled
 *   - ESC + click-outside dismisses the popover
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../../utils/useI18n';
import Modal from '../../../../components/Shared/Modal';
import './AltMaterialsToggle.css';

const SwapIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 16h13M7 16l4-4M7 16l4 4M17 8H4M17 8l-4-4M17 8l-4 4" />
  </svg>
);

export default function AltMaterialsToggle({
  active,
  mainCount,
  altCount,
  onSwitch,
  onCopy,
  readOnly = false,
}) {
  const { t } = useI18n();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pendingCopy, setPendingCopy] = useState(null); // { direction, sourceCount, destCount, sourceLabel, destLabel }
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // Click-outside + ESC dismissal for the popover. Modal handles its
  // own dismissal so we only wire this for the menu, not the dialog.
  useEffect(() => {
    if (!popoverOpen) return;
    const onClick = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPopoverOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const handleSwitch = useCallback(
    (next) => {
      if (readOnly) return;
      if (next === active) return;
      onSwitch(next);
    },
    [active, onSwitch, readOnly]
  );

  // Map a direction string to source/dest label + counts, used by the
  // popover items + confirm modal. Keeping this central means the i18n
  // keys + counts can't drift between the two surfaces.
  const directionMeta = useCallback(
    (direction) => {
      if (direction === 'main_to_alt') {
        return {
          sourceCount: mainCount,
          destCount: altCount,
          sourceLabel: t('pricing.materials.toggle.main'),
          destLabel: t('pricing.materials.toggle.alt'),
        };
      }
      return {
        sourceCount: altCount,
        destCount: mainCount,
        sourceLabel: t('pricing.materials.toggle.alt'),
        destLabel: t('pricing.materials.toggle.main'),
      };
    },
    [mainCount, altCount, t]
  );

  const handleCopyChoice = useCallback(
    (direction) => {
      setPopoverOpen(false);
      const meta = directionMeta(direction);
      if (meta.sourceCount === 0) return; // safety — buttons should be disabled
      if (meta.destCount > 0) {
        setPendingCopy({ direction, ...meta });
        return;
      }
      onCopy(direction, meta);
    },
    [directionMeta, onCopy]
  );

  const confirmCopy = useCallback(() => {
    if (!pendingCopy) return;
    onCopy(pendingCopy.direction, pendingCopy);
    setPendingCopy(null);
  }, [pendingCopy, onCopy]);

  const cancelCopy = useCallback(() => setPendingCopy(null), []);

  const labelMain = t('pricing.materials.toggle.main');
  const labelAlt = t('pricing.materials.toggle.alt');
  const mainToAltDisabled = readOnly || mainCount === 0;
  const altToMainDisabled = readOnly || altCount === 0;

  // Confirm-modal text uses the dest count to make the destructive
  // action obvious — see Lesson 10 (shared Modal primitive).
  const confirmBody = useMemo(() => {
    if (!pendingCopy) return '';
    return t('pricing.materials.copy.confirm_body', {
      dest: pendingCopy.destLabel,
      count: pendingCopy.destCount,
      sourceCount: pendingCopy.sourceCount,
      source: pendingCopy.sourceLabel,
    });
  }, [pendingCopy, t]);

  return (
    <div className="alt-mat-toggle" role="group" aria-label="Materials set selector" data-kbd-skip>
      <label className={`alt-mat-pill ${active === 'main' ? 'alt-mat-pill-on' : ''}`}>
        <input
          type="radio"
          name="materials-active"
          value="main"
          checked={active === 'main'}
          onChange={() => handleSwitch('main')}
          disabled={readOnly}
        />
        <span className="alt-mat-pill-dot" aria-hidden="true" />
        <span className="alt-mat-pill-label">{labelMain}</span>
        <span className="alt-mat-pill-badge">{mainCount}</span>
      </label>

      <label className={`alt-mat-pill ${active === 'alt' ? 'alt-mat-pill-on' : ''}`}>
        <input
          type="radio"
          name="materials-active"
          value="alt"
          checked={active === 'alt'}
          onChange={() => handleSwitch('alt')}
          disabled={readOnly}
        />
        <span className="alt-mat-pill-dot" aria-hidden="true" />
        <span className="alt-mat-pill-label">{labelAlt}</span>
        <span className="alt-mat-pill-badge">{altCount}</span>
      </label>

      <div className="alt-mat-copy-wrap">
        <button
          ref={triggerRef}
          type="button"
          className="alt-mat-copy-btn"
          onClick={() => setPopoverOpen((v) => !v)}
          title={t('pricing.materials.copy.tooltip')}
          aria-haspopup="menu"
          aria-expanded={popoverOpen}
          aria-label={t('pricing.materials.copy.tooltip')}
          disabled={readOnly || (mainCount === 0 && altCount === 0)}
        >
          <SwapIcon />
        </button>

        {popoverOpen && (
          <div ref={popoverRef} className="alt-mat-popover" role="menu">
            <button
              type="button"
              role="menuitem"
              className="alt-mat-popover-item"
              onClick={() => handleCopyChoice('main_to_alt')}
              disabled={mainToAltDisabled}
              aria-disabled={mainToAltDisabled}
            >
              {t('pricing.materials.copy.main_to_alt')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="alt-mat-popover-item"
              onClick={() => handleCopyChoice('alt_to_main')}
              disabled={altToMainDisabled}
              aria-disabled={altToMainDisabled}
            >
              {t('pricing.materials.copy.alt_to_main')}
            </button>
          </div>
        )}
      </div>

      <Modal open={!!pendingCopy} onClose={cancelCopy} size="sm" severity="warning">
        <Modal.Header title={t('pricing.materials.copy.confirm_title')} />
        <Modal.Body>
          <p>{confirmBody}</p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="op-btn op-btn-ghost" onClick={cancelCopy}>
            {t('pricing.materials.copy.btn_cancel')}
          </button>
          <button type="button" className="op-btn op-btn-primary" onClick={confirmCopy}>
            {t('pricing.materials.copy.btn_overwrite')}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
