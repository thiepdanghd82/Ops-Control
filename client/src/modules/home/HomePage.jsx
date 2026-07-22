/**
 * HomePage — Sprint S-HOME (2026-05-03); trimmed 2026-07-22 when the
 * Planning module was removed (the WO/order KPIs + "Today's Focus" queue
 * were planning-only).
 *
 * Operator dashboard — a navigation hub, not a duplicate UI:
 *   1. Greeting          — orient: who am I, what date, what factory
 *   2. My approvals      — the one counter that drives action today
 *   3. Module shortcuts  — into the ERPAG-style landing grids (S-LANDING)
 *   4. Quick actions     — shortcuts to start common Cost workflows
 *
 * Cards click → onTabChange(tabId). Role gates apply via useAccess.
 */
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccess } from '../../context/useAccess';
import { useI18n } from '../../utils/useI18n';
import { useMyApprovalCount } from '../../utils/useMyApprovalCount';
import { SidebarIcon } from '../../components/Layout/SidebarIcon.jsx';
import { landingTabFor } from '../../components/Layout/sectionDefs.js';
import './HomePage.css';

function pickGreeting(t) {
  const h = new Date().getHours();
  if (h < 12) return t('home.morning');
  if (h < 18) return t('home.afternoon');
  return t('home.evening');
}

function formatLongDate(lang) {
  return new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HomePage({ onTabChange }) {
  const { user } = useAuth();
  const { access } = useAccess();
  const { t, lang } = useI18n();
  const { count: approvalCount } = useMyApprovalCount({ enabled: !!user });

  const greeting = useMemo(() => pickGreeting(t), [t]);
  const todayStr = useMemo(() => formatLongDate(lang), [lang]);

  // Quick-action cards — filtered by access so a hidden tab doesn't
  // show as a clickable shortcut that lands on a forbidden page.
  const quickActions = useMemo(
    () =>
      [
        { id: 'standard', icon: 'calc_std', labelKey: 'home.qa.new_quote' },
        { id: 'rfq-tracker', icon: 'rfq_tracker', labelKey: 'home.qa.rfq' },
        { id: 'approvals-inbox', icon: 'approvals', labelKey: 'home.qa.approvals' },
        { id: 'lib-inventory', icon: 'ifs', labelKey: 'home.qa.inventory' },
        { id: 'help', icon: 'help', labelKey: 'home.qa.help' },
      ].filter((qa) => access(qa.id) !== 'hidden'),
    [access]
  );

  // Module landing shortcuts — bottom row links straight into the
  // ERPAG-style landing grids we built in Sprint S-LANDING.
  const moduleShortcuts = useMemo(
    () => [
      { sid: 'calculators', icon: 'calc_std', labelKey: 'nav.section.calculators' },
      { sid: 'manufacturing', icon: 'mfg', labelKey: 'nav.section.manufacturing' },
      { sid: 'tracking', icon: 'rfq_tracker', labelKey: 'nav.section.tracking' },
      { sid: 'reports', icon: 'dashboard', labelKey: 'nav.section.reports' },
    ],
    []
  );

  return (
    <div className="home-page">
      {/* ── Greeting Header ── */}
      <header className="home-greeting">
        <div>
          <h1 className="home-greeting-title">
            {greeting}, {user?.full_name || user?.username || ''}
          </h1>
          <p className="home-greeting-meta">
            <span>{todayStr}</span>
            <span className="home-greeting-sep">·</span>
            <span className="home-greeting-org">CCL Design Vietnam</span>
            {user?.role ? (
              <>
                <span className="home-greeting-sep">·</span>
                <span className="home-greeting-role">{user.role}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="home-greeting-clock" aria-hidden="true">
          {new Date().toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </header>

      {/* ── KPI Strip — My Approvals (the one action-driving counter left
            after Planning removal). Severity drives the 3px left rail tone. */}
      <section className="home-kpis">
        <KpiCard
          label={t('home.kpi.my_approvals')}
          value={approvalCount ?? 0}
          severity={approvalCount > 0 ? 'urgent' : 'neutral'}
          onClick={() => onTabChange('approvals-inbox')}
        />
      </section>

      {/* ── Module Shortcuts ── */}
      <div className="home-main">
        <section className="home-card">
          <header className="home-card-header">
            <h2>{t('home.section.modules')}</h2>
          </header>
          <div className="home-module-grid">
            {moduleShortcuts.map((m) => (
              <button
                key={m.sid}
                type="button"
                className="home-module-card"
                onClick={() => onTabChange(landingTabFor(m.sid))}
              >
                <span className="home-module-icon">
                  <SidebarIcon name={m.icon} />
                </span>
                <span className="home-module-label">{t(m.labelKey)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── Quick Actions ── */}
      {quickActions.length > 0 && (
        <section className="home-quick">
          <h2 className="home-section-title">{t('home.section.quick_actions')}</h2>
          <div className="home-quick-grid">
            {quickActions.map((qa) => (
              <button
                key={qa.id}
                type="button"
                className="home-quick-card"
                onClick={() => onTabChange(qa.id)}
              >
                <span className="home-quick-icon">
                  <SidebarIcon name={qa.icon} />
                </span>
                <span className="home-quick-label">{t(qa.labelKey)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function KpiCard({ label, value, subValue, severity = 'neutral', onClick }) {
  return (
    <button
      type="button"
      className={`home-kpi home-kpi-v2 home-kpi-tone-${severity}`}
      onClick={onClick}
    >
      <span className="home-kpi-label">{label}</span>
      <span className="home-kpi-value">{value}</span>
      {subValue ? <span className="home-kpi-sub">{subValue}</span> : null}
    </button>
  );
}
