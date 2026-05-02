/**
 * MES-1.6 — Release confirmation modal.
 *
 * Pre-conditions live server-side; this UI only shows the button when
 * status === 'CREATED' AND ops_count >= 1, so reaching this modal means
 * release should succeed. Server-side errors (state-machine drift,
 * race conditions) surface inline as RFC-7807 detail.
 */
import { useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import { releaseWorkOrder } from './api';

export default function ReleaseModal({ wo, onClose, onSuccess }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const tooLong = notes.length > 500;

  async function handleRelease() {
    setPending(true);
    setError(null);
    try {
      const updated = await releaseWorkOrder(wo.id, { notes: notes.trim() || undefined });
      onSuccess(updated);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={pending ? undefined : onClose} size="md" severity="info">
      <Modal.Header
        title={t('planning.workOrder.release.title', { code: wo.code })}
        subtitle={t('planning.workOrder.release.subtitle', {
          ops_count: wo.operations?.length ?? 0,
        })}
      />
      <Modal.Body>
        <p className="wo-modal-text">{t('planning.workOrder.release.confirm_text')}</p>
        <label className="wo-modal-field">
          <span>{t('planning.workOrder.release.notes_label')}</span>
          <textarea
            className="wo-modal-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={600}
            rows={3}
            disabled={pending}
            placeholder={t('planning.workOrder.release.notes_placeholder')}
          />
          <span className={`wo-modal-counter${tooLong ? ' wo-modal-counter-err' : ''}`}>
            {notes.length} / 500
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
          {t('planning.workOrder.action.cancel')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-primary"
          onClick={handleRelease}
          disabled={pending || tooLong}
        >
          {pending
            ? t('planning.workOrder.action.pending')
            : t('planning.workOrder.release.submit')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
