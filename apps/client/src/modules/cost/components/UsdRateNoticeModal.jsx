/**
 * UsdRateNoticeModal — says, once, that the USD rate in the box was
 * inherited rather than typed, and lets it be corrected on the spot.
 *
 * A new or copied quote starts with the rate from the most recently saved
 * one, because it barely moves and retyping it on every RFQ was the friction
 * being removed. The cost of that convenience is the hazard #345 recorded on
 * the Target price: a number arrives that nobody set, and the operator cannot
 * tell it apart from one they entered. So the rate is stated on the way out
 * of the RFQ tab, with where it came from, and acknowledged.
 *
 * The rate is EDITABLE here. Whoever is being asked to confirm a number is
 * the person who knows whether it is right, and sending them back to another
 * tab to change one field — then through this dialog again — is friction of
 * the kind this feature exists to remove.
 *
 * Confirm is REFUSED on a non-positive rate rather than writing it. A zero
 * silently zeroes both VND mirrors (#311), and a dialog whose whole purpose
 * is to make the operator look at this number must not be the thing that
 * accepts a bad one.
 *
 * ONCE per quote, and not again after the rate is edited. Repeating it would
 * make it the alarm people click through without reading, which is the
 * failure this is trying to avoid rather than cause.
 *
 * Shared by the Standard and Complex calculators — do not fork it.
 */
import { useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import DecimalInput from '../../../utils/DecimalInput';
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
  // A fresh notice must not keep the previous dialog's typing. Reset comes
  // from the `key` the calculators pass, not from an effect that syncs state
  // to a prop -- that pattern re-renders twice and is what
  // react-hooks/set-state-in-effect flags.
  const [rate, setRate] = useState(notice ? notice.rate : 0);

  if (!notice) return null;
  const from = [notice.rfq_number, fmtDate(notice.saved_at)].filter(Boolean).join(' · ');
  const ok = Number(rate) > 0;

  return (
    <Modal open onClose={onEdit} size="sm" severity="info">
      <Modal.Header title={t('rate_notice.title')} />
      <Modal.Body>
        <DecimalInput
          value={rate}
          onChange={setRate}
          className={`hg-rate-inp ${ok ? '' : 'sc-input-warn'}`}
          aria-label={t('moqcard.usd_rate')}
        />
        <p className="hg-why">
          {from ? t('rate_notice.from', { from }) : t('rate_notice.from_any')}
        </p>
        <p className="hg-why">{t('rate_notice.body')}</p>
      </Modal.Body>
      <Modal.Footer>
        <button className="op-btn op-btn-secondary" onClick={onEdit}>
          {t('rate_notice.back')}
        </button>
        <button
          className="op-btn op-btn-primary"
          disabled={!ok}
          title={ok ? undefined : t('gate.required_tip')}
          onClick={() => onConfirm(Number(rate))}
        >
          {t('rate_notice.confirm')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
