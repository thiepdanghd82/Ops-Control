/**
 * PwdAgeBar (Phase 10L) — horizontal progress showing how much of
 * the password-rotation window remains for a given user.
 *
 * Colors follow the operator's policy:
 *   • ratio > 2/3  → green  (healthy)
 *   • ratio 1/3–2/3 → orange (nudge)
 *   • ratio ≤ 1/3  → red    (change now)
 *
 * Expects props: { daysRemaining, maxAgeDays } or null/undefined
 * (in which case nothing renders — easier for callers that don't
 * always have the data yet).
 */
import './PwdAgeBar.css';

function tierFor(ratio) {
  if (ratio > 2 / 3) return 'ok';
  if (ratio > 1 / 3) return 'warn';
  return 'urgent';
}

export default function PwdAgeBar({ daysRemaining, maxAgeDays, label, compact = false }) {
  if (
    daysRemaining == null ||
    maxAgeDays == null ||
    !Number.isFinite(maxAgeDays) ||
    maxAgeDays <= 0
  ) {
    return null;
  }
  const ratio = Math.max(0, Math.min(1, daysRemaining / maxAgeDays));
  const tier = tierFor(ratio);
  const pct = Math.round(ratio * 100);

  return (
    <div
      className={`pwd-age-bar tier-${tier} ${compact ? 'compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      {label !== false && (
        <div className="pwd-age-label">
          <span>{label || (daysRemaining === 0 ? 'Password expired' : 'Password age')}</span>
          <span className="pwd-age-days">
            {daysRemaining} / {maxAgeDays} {daysRemaining === 1 ? 'day' : 'days'}
          </span>
        </div>
      )}
      <div className="pwd-age-track" aria-hidden>
        <div className="pwd-age-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
