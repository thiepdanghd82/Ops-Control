/**
 * ReasonCodeDisableModal — confirm soft-delete of a reason code.
 * Bilingual copy: explains that history is preserved + the row will
 * disappear from kiosk pickers.
 */
import { useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';

export default function ReasonCodeDisableModal({ row, onCancel, onConfirm }) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await onConfirm();
    } catch (e) {
      setErr(e.message || 'Disable failed');
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onCancel} size="sm" severity="warn" ariaLabelledBy="rc-disable-title">
      <Modal.Header
        id="rc-disable-title"
        title={t('library.reasonCodes.disableTitle', { code: row.code })}
        subtitle={t('library.reasonCodes.disableSubtitle')}
        severity="warn"
      />
      <Modal.Body>
        <p className="rc-modal-body">
          {t('library.reasonCodes.confirmDisable', { code: row.code })}
        </p>
        <ul className="rc-disable-list">
          <li>{t('library.reasonCodes.disableEffect.kiosk')}</li>
          <li>{t('library.reasonCodes.disableEffect.history')}</li>
          <li>{t('library.reasonCodes.disableEffect.reenable')}</li>
        </ul>
        {err && <div className="form-msg error">{err}</div>}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-secondary" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-danger"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? t('common.saving') : t('library.reasonCodes.disable')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
