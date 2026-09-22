/**
 * UsdRateNoticeModal — says, once, that the USD rate in the box was
 * inherited rather than typed.
 *
 * A new or copied quote now starts with the rate from the most recently
 * saved one, because it barely moves and retyping it on every RFQ was the
 * friction being removed. The cost of that convenience is the hazard #345
 * recorded on the Target price: a number arrives that nobody set, and the
 * operator cannot tell it apart from one they entered. So the rate is
 * stated on the way out of the RFQ tab, with where it came from, and the
 * operator acknowledges it.
 *
 * ONCE per quote, and not again after they edit the rate. Repeating it
 * would make it the alarm people click through without reading, which is
 * the failure this is trying to avoid rather than cause.
 *
 * Shared by the Standard and Complex calculators — do not fork it.
 */
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import './HeaderGateModal.css';

/** `2026-09-22T03:42:00Z` → `22/09/2026`, in the viewer's own zone. */
function fmtDate(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-GB');
}

export default function UsdRateNoticeModal({ notice, onConfirm, onEdit }) {
  const { t } = useI18n();
  if (!notice) return null;
  const from = [notice.rfq_number, fmtDate(notice.saved_at)].filter(Boolean).join(' · ');
  return (
    <Modal open onClose={onEdit} size="sm" severity="info">
      <Modal.Header title={t('rate_notice.title')} />
      <Modal.Body>
        <p className="hg-rate">{notice.rate.toLocaleString('en-US')}</p>
        <p className="hg-why">
          {from ? t('rate_notice.from', { from }) : t('rate_notice.from_any')}
        </p>
        <p className="hg-why">{t('rate_notice.body')}</p>
      </Modal.Body>
      <Modal.Footer>
        <button className="op-btn op-btn-secondary" onClick={onEdit}>
          {t('rate_notice.edit')}
        </button>
        <button className="op-btn op-btn-primary" onClick={onConfirm}>
          {t('rate_notice.confirm')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
