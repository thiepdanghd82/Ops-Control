/**
 * HeaderGateModal — shown when the operator tries to leave the RFQ & MOQ
 * tab with a required field still empty.
 *
 * The four fields (see HEADER_GATE_FIELDS) poison every downstream tab
 * when blank instead of failing loudly, so navigation stops here rather
 * than letting a quote reach Cost Breakdown with an empty USD rate.
 * Shared by the Standard and Complex calculators — do not fork it.
 */
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import './HeaderGateModal.css';

export default function HeaderGateModal({ missing = [], onClose }) {
  const { t } = useI18n();
  return (
    <Modal open={missing.length > 0} onClose={onClose} size="sm" severity="warning">
      <Modal.Header title={t('gate.title')} subtitle={t('gate.subtitle', { n: missing.length })} />
      <Modal.Body>
        <ul className="hg-list">
          {missing.map((f) => (
            <li key={f}>{t(`gate.field.${f}`)}</li>
          ))}
        </ul>
        <p className="hg-why">{t('gate.body')}</p>
      </Modal.Body>
      <Modal.Footer>
        <button className="op-btn op-btn-primary" onClick={onClose}>
          {t('gate.ok')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
