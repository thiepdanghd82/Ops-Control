/**
 * PwdAgeBanner — top-of-app warning when the logged-in user's password
 * is near rotation deadline. Reads `pwdAge` from AuthContext (server
 * populates on /auth/me + /auth/login).
 *
 * Shown when:
 *   - pwdAge.days_remaining <= 14 (soft nudge: yellow, dismissible for 24h)
 *   - pwdAge.days_remaining <=  0 (hard: red, non-dismissible, tells
 *     user to change password in Settings; server-side the next write
 *     request will likely 403 with pwd_expired until they rotate)
 *
 * Dismissal is persisted in localStorage keyed by current date, so
 * "dismissed today" carries over reloads but re-appears tomorrow.
 * Hard expiry is NOT dismissible — users need to see it until they act.
 */
import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';

const DISMISS_KEY = 'ops_pwd_age_dismiss';
const WARN_THRESHOLD_DAYS = 14;

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PwdAgeBanner({ onOpenSettings }) {
  const { pwdAge, user } = useAuth();
  // `dismissTick` bumps whenever the user clicks "Later"; it forces the
  // useMemo below to re-read localStorage. Using a tick + useMemo
  // instead of a derived useState avoids the cascading-render lint
  // warning (react-hooks/set-state-in-effect) and keeps the dismiss
  // check idempotent across renders.
  const [dismissTick, setDismissTick] = useState(0);

  // Re-eval when the tick bumps, the logged-in user changes, or the
  // remaining-days bucket changes. `void dismissTick` references the
  // dep so eslint's exhaustive-deps doesn't flag it as "unnecessary" —
  // semantically it IS a cache-invalidation trigger even though the
  // body reads localStorage rather than the tick number itself.
  const remainingBucket = pwdAge?.days_remaining;
  const dismissedToday = useMemo(() => {
    void dismissTick; void remainingBucket;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const { date, userId } = JSON.parse(raw);
      return date === todayYYYYMMDD() && userId === user?.id;
    } catch { return false; }
  }, [user?.id, remainingBucket, dismissTick]);

  if (!pwdAge || typeof pwdAge.days_remaining !== 'number') return null;
  const remaining = pwdAge.days_remaining;
  const isExpired = remaining <= 0;
  const isWarning = !isExpired && remaining <= WARN_THRESHOLD_DAYS;
  if (!isExpired && !isWarning) return null;
  if (isWarning && dismissedToday) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({
        date: todayYYYYMMDD(), userId: user?.id,
      }));
    } catch { /* private mode / quota — dismissal won't persist */ }
    setDismissTick(t => t + 1);
  }

  const bg    = isExpired ? '#fef2f2' : '#fef3c7';
  const color = isExpired ? '#7f1d1d' : '#78350f';
  const icon  = isExpired ? '🔒' : '⏰';
  const headline = isExpired
    ? 'Password expired — please change it now to keep saving.'
    : `Password expires in ${remaining} day${remaining === 1 ? '' : 's'} (max ${pwdAge.max_age_days}d). Change it soon.`;

  return (
    <div
      role="alert"
      aria-live={isExpired ? 'assertive' : 'polite'}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', fontSize: 13, fontWeight: 500,
        background: bg, color,
        borderBottom: `1px solid ${isExpired ? '#fca5a5' : '#fcd34d'}`,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{headline}</span>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            padding: '4px 10px', fontSize: 12, fontWeight: 600,
            background: isExpired ? '#dc2626' : '#b45309',
            color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Change password
        </button>
      )}
      {!isExpired && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss warning for today"
          style={{
            padding: '4px 8px', fontSize: 11, background: 'transparent',
            color, border: `1px solid ${color}`, borderRadius: 4, cursor: 'pointer',
          }}
        >
          Later
        </button>
      )}
    </div>
  );
}
