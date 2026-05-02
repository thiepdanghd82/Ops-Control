/**
 * MES-1.6 — Cancel work-order modal.
 *
 * Reason is required (1–500 chars). The server enforces the same rule;
 * we mirror it client-side so the submit button is disabled until the
 * reason is valid (avoids a round-trip for an obvious 400).
 */
import { useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import { cancelWorkOrder } from './api';

export default function CancelModal({ wo, onClose, onSuccess }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = reason.trim();
  const tooLong = reason.length > 500;
  const valid = trimmed.length > 0 && !tooLong;

  async function handleCancel() {
    setPending(true);
    setError(null);
    try {
      const updated = await cancelWorkOrder(wo.id, { reason: trimmed });
      onSuccess(updated);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={pending ? undefined : onClose} size="md" severity="warning">
      <Modal.Header title={t('planning.workOrder.cancel.title', { code: wo.code })} />
      <Modal.Body>
        <p className="wo-modal-text wo-modal-warning">{t('planning.workOrder.cancel.warning')}</p>
        <label className="wo-modal-field">
          <span>
            {t('planning.workOrder.cancel.reason_label')}{' '}
            <span className="wo-modal-required">*</span>
          </span>
          <textarea
            className="wo-modal-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={600}
            rows={3}
            disabled={pending}
            required
            placeholder={t('planning.workOrder.cancel.reason_placeholder')}
            autoFocus
          />
          <span className={`wo-modal-counter${tooLong ? ' wo-modal-counter-err' : ''}`}>
            {reason.length} / 500
          </span>
        </label>
        {error ? (
          <div className="wo-modal-error">
            {error.body?.detail || error.message}
            {error.body?.allowed_from?.length ? (
              <span className="wo-modal-error-hint">
                {' '}
                {t('planning.workOrder.error.allowed_from')}: {error.body.allowed_from.join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose} disabled={pending}>
          {t('planning.workOrder.cancel.keep')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-danger"
          onClick={handleCancel}
          disabled={pending || !valid}
        >
          {pending ? t('planning.workOrder.action.pending') : t('planning.workOrder.cancel.submit')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
