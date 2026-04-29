/**
 * AppBootstrap — post-login data preload gate (Phase 10K).
 *
 * Sits between successful auth and the main app shell. Mounts
 * CostLibProvider (which fires rates/DDL/materials/finance/inkCalc
 * in parallel), plus triggers a few auxiliary fetches the rest of
 * the UI will want within the first few seconds (chat rooms + users,
 * approvals count). The user sees a Carbon-styled loading screen
 * with per-task progress until every required dataset is in.
 *
 * Why gate here and not just lazy-load per screen: first-impression.
 * Operators expect "I just signed in → app is ready", not "I signed
 * in → I see chrome but click anything and it's still loading".
 *
 * Failure mode: if a preload fails, we still land in the app after
 * ~5s (timeout) so a single down endpoint can't strand the user at
 * a loading screen. The failing task is logged but doesn't block.
 */
import { useEffect, useState, useMemo } from 'react';
import { CostLibProvider, useCostLib } from '../../context/CostLibContext';
import { sharedApi } from '../../services/api';
import { chatApi } from '../../services/chatApi';
import { useI18n } from '../../utils/useI18n';
import './AppBootstrap.css';

// Tasks to run in parallel after login. Each has a stable `key` (for
// the progress list) and an invocation. Failure of one doesn't fail
// the whole bootstrap.
function makeBootstrapTasks() {
  return [
    { key: 'approvals', label: 'Approvals status',   run: () => sharedApi.getMyApprovalCount?.() },
    { key: 'chat_rooms', label: 'Chat rooms',         run: () => chatApi.rooms() },
    { key: 'chat_users', label: 'User directory',     run: () => chatApi.users() },
    { key: 'chat_mentions', label: 'Mentions inbox',  run: () => chatApi.mentions({ limit: 50 }) },
  ].filter(t => typeof t.run === 'function');
}

// Hard ceiling so one flaky endpoint doesn't hold the whole app
// hostage. After 6s we let the user in regardless of outstanding
// tasks — failing preloads log to console.
const MAX_WAIT_MS = 6000;

function BootstrapInner({ children }) {
  const { loading: libLoading, error: libError } = useCostLib();
  const [auxDone, setAuxDone] = useState(false);
  const tasks = useMemo(() => makeBootstrapTasks(), []);
  // Lazy-init: every task starts "pending" before the first render,
  // so the useEffect below doesn't need a setState to seed the list
  // (which would trigger a useless second render + a lint warning).
  const [taskStatus, setTaskStatus] = useState(
    () => Object.fromEntries(tasks.map(t => [t.key, 'pending'])),
  );
  const [timedOut, setTimedOut] = useState(false);
  const { t } = useI18n();

  // Fire aux tasks in parallel on mount. Each task updates its own
  // status cell so the UI can render a live checklist.
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    const promises = tasks.map(task =>
      Promise.resolve()
        .then(() => task.run())
        .then(() => { if (!cancelled) setTaskStatus(s => ({ ...s, [task.key]: 'done' })); })
        .catch(err => {
          if (!cancelled) setTaskStatus(s => ({ ...s, [task.key]: 'error' }));
          // Log but don't reject — a single failure shouldn't block boot.
          console.warn(`[bootstrap] ${task.key} failed:`, err?.message);
        })
    );

    Promise.allSettled(promises).then(() => {
      if (!cancelled) {
        setAuxDone(true);
        console.log(`[bootstrap] aux tasks settled in ${Date.now() - started}ms`);
      }
    });

    // Timeout watchdog — let the user in after MAX_WAIT_MS.
    const watchdog = setTimeout(() => { if (!cancelled) setTimedOut(true); }, MAX_WAIT_MS);

    return () => { cancelled = true; clearTimeout(watchdog); };
  }, [tasks]);

  // Ready when the library loader AND the aux tasks are done, OR the
  // watchdog fired. CostLib error also releases the gate so the user
  // isn't stranded — the component that depends on it will surface
  // its own error UI in-app.
  const ready = (!libLoading && auxDone) || timedOut || !!libError;

  if (ready) return children;

  const completedCount = Object.values(taskStatus).filter(s => s !== 'pending').length;
  const totalCount     = tasks.length + 1; // +1 for the library load
  const libDone        = !libLoading || !!libError;
  const progress       = Math.round(((completedCount + (libDone ? 1 : 0)) / totalCount) * 100);

  return (
    <div className="bootstrap-overlay">
      {/* Reuse login backdrop layers so the transition from login →
          loading feels like one continuous surface. */}
      <div className="login-bg-grid" aria-hidden />
      <div className="login-bg-lines" aria-hidden />
      <div className="bootstrap-card" role="status" aria-live="polite">
        <div className="bootstrap-spinner" aria-hidden>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="18" stroke="rgba(15,98,254,0.18)" strokeWidth="3" />
            <circle cx="22" cy="22" r="18"
              stroke="#0f62fe" strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="28 90"
              style={{ transformOrigin: '22px 22px', animation: 'bootstrap-spin 1s linear infinite' }} />
          </svg>
        </div>
        <p className="bootstrap-title">{t('bootstrap.title')}</p>
        <p className="bootstrap-subtitle">{t('bootstrap.subtitle')}</p>
        <div className="bootstrap-progress" aria-hidden>
          <div className="bootstrap-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <ul className="bootstrap-tasks">
          <li className={libDone ? 'done' : libError ? 'error' : 'pending'}>
            <span className="bootstrap-task-icon" aria-hidden>
              {libDone ? '✓' : libError ? '!' : '·'}
            </span>
            <span>{t('bootstrap.task.library')}</span>
          </li>
          {tasks.map(task => {
            const s = taskStatus[task.key] || 'pending';
            // t() returns the raw key when the string isn't registered,
            // so detect that as "no translation" and fall back to the
            // hard-coded English label.
            const k = `bootstrap.task.${task.key}`;
            const translated = t(k);
            const label = translated === k ? task.label : translated;
            return (
              <li key={task.key} className={s}>
                <span className="bootstrap-task-icon" aria-hidden>
                  {s === 'done' ? '✓' : s === 'error' ? '!' : '·'}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function AppBootstrap({ children }) {
  return (
    <CostLibProvider>
      <BootstrapInner>{children}</BootstrapInner>
    </CostLibProvider>
  );
}
