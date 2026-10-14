/**
 * SaveChoiceModal — prompts the user to choose between overwriting the
 * currently-loaded quote (Update) or saving a fresh copy as a new
 * revision (Save as new). Rendered only when a quote was loaded (i.e.
 * activeQuoteId is set) AND the user pressed Save.
 *
 * Migrated to the shared `<Modal>` primitive (2026-04-24 redesign) so
 * it follows the same IBM Carbon / SAP Fiori conventions as every
 * other dialog in the app.
 *
 * `drift` is set when what Save is about to write moves the subtotal by more
 * than half the selling price from the saved result — more than a formula
 * change explains (RFQ-2026-S0002 reached GM −238% on 2026-09-28 because a
 * tool-type fix let a labour misread through). The dialog then says so, and
 * the go-back button becomes the primary one: Modal focuses the first
 * `.op-btn-primary`, so Enter must not be the key that saves it.
 *
 * Keyboard: Enter = the primary button (Update; Go back while `drift`),
 * Esc = Cancel.
 */
import Modal from '../components/Shared/Modal';
import { useI18n } from './useI18n';
import './SaveChoiceModal.css';

const fmt = (v) => (Number.isFinite(v) ? v.toFixed(6) : '—');

export default function SaveChoiceModal({
  open,
  quoteId,
  quoteLabel,
  drift = null,
  onUpdate,
  onSaveAsNew,
  onCancel,
}) {
  const { t } = useI18n();
  const severity = drift ? 'warning' : 'question';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      severity={severity}
      ariaLabelledBy="save-choice-title"
    >
      <Modal.Header
        id="save-choice-title"
        title={t('savechoice.title')}
        subtitle={
          quoteId != null
            ? `${t('savechoice.quote', { id: quoteId })}${quoteLabel ? ` — ${quoteLabel}` : ''}`
            : undefined
        }
        severity={severity}
      />
      <Modal.Body>
        {drift && (
          <div className="scm-drift" role="alert">
            <strong>{t('savechoice.drift_title')}</strong>
            <span>
              {t('savechoice.drift_body', {
                was: fmt(drift.savedSubtotal),
                now: fmt(drift.liveSubtotal),
                pct: Math.round(drift.share * 100),
              })}
            </span>
          </div>
        )}
        <p>{t('savechoice.prompt')}</p>
        <ul className="op-modal-choice-list">
          <li>
            <b>{t('savechoice.update_label')}</b> — {t('savechoice.update_desc', { id: quoteId })}
          </li>
          <li>
            <b>{t('savechoice.saveas_label')}</b> — {t('savechoice.saveas_desc')}
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className={drift ? 'op-btn op-btn-primary' : 'op-btn op-btn-ghost'}
          onClick={onCancel}
        >
          {t(drift ? 'savechoice.go_back' : 'savechoice.cancel')}
        </button>
        <button type="button" className="op-btn op-btn-secondary" onClick={onSaveAsNew}>
          {t(drift ? 'savechoice.saveas_anyway' : 'savechoice.saveas_label')}
        </button>
        <button
          type="button"
          className={drift ? 'op-btn op-btn-secondary' : 'op-btn op-btn-primary'}
          onClick={onUpdate}
        >
          {t(drift ? 'savechoice.update_anyway' : 'savechoice.update_label')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
