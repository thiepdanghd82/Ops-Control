/**
 * Tells the operator the engine now computes a different result than the one
 * this quote was SAVED with — and why that matters. The calculator recomputes
 * live, but every export (xlsx, CSV), Quote History and the Cost Breakdown list
 * read the persisted result, so until the quote is saved again the screen and
 * the files show two different numbers for one quote.
 *
 * ONE component for Standard and Complex (Lesson 48): two copies are two places
 * for the wording, and for the condition that shows it, to drift apart.
 * It owns its stylesheet rather than borrowing a class from one that happens to
 * load in the same chunk (#309).
 */
import { useI18n } from '../../../utils/useI18n';
import './SavedResultDriftBanner.css';

const fmt = (v) => (Number.isFinite(v) ? v.toFixed(6) : '—');

export default function SavedResultDriftBanner({ drift }) {
  const { t } = useI18n();
  if (!drift) return null;
  const hasSubtotal = Number.isFinite(drift.savedSubtotal) && Number.isFinite(drift.liveSubtotal);
  return (
    <div className="srd-banner" role="status" aria-live="polite">
      <span className="srd-banner-icon" aria-hidden="true">
        ⚠
      </span>
      <div className="srd-banner-text">
        <strong>{t('pricing.drift.title')}</strong>
        {hasSubtotal && (
          <span className="srd-banner-num">
            {t('pricing.drift.subtotal', {
              was: fmt(drift.savedSubtotal),
              now: fmt(drift.liveSubtotal),
            })}
          </span>
        )}
        <span>{t('pricing.drift.body')}</span>
      </div>
    </div>
  );
}
