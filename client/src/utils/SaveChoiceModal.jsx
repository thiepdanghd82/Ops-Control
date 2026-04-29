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
 * Keyboard: Enter = Update (primary), Esc = Cancel.
 */

import Modal from '../components/Shared/Modal';

export default function SaveChoiceModal({
  open,
  quoteId,
  quoteLabel,
  onUpdate,
  onSaveAsNew,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      severity="question"
      ariaLabelledBy="save-choice-title"
    >
      <Modal.Header
        id="save-choice-title"
        title="Save quote"
        subtitle={quoteId != null ? `Quote #${quoteId}${quoteLabel ? ` — ${quoteLabel}` : ''}` : undefined}
        severity="question"
      />
      <Modal.Body>
        <p>
          This quote was loaded from history. How would you like to save your changes?
        </p>
        <ul className="op-modal-choice-list">
          <li>
            <b>Update existing</b> — replace the current revision in place.
            Anyone viewing quote #{quoteId} will see the new values.
          </li>
          <li>
            <b>Save as new version</b> — keep the original quote untouched and
            create a separate revision from your edits.
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="op-btn op-btn-secondary" onClick={onSaveAsNew}>
          Save as new version
        </button>
        <button type="button" className="op-btn op-btn-primary" onClick={onUpdate}>
          Update existing
        </button>
      </Modal.Footer>
    </Modal>
  );
}
