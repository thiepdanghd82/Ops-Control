/**
 * HomePage — Sprint S-HOME (2026-05-03).
 *
 * Operator dashboard. Designed around "what needs my attention TODAY"
 * — not a flashy KPI wall. 5 sections, top-down priority:
 *
 *   1. Greeting          — orient: who am I, what date, what factory
 *   2. KPI strip         — 4 numbers that drive decisions today
 *   3. My queue          — what's mine to act on (role-aware)
 *   4. Recent activity   — what just happened across the team
 *   5. Quick actions     — shortcuts to start common workflows
 *
 * Data sources (all existing endpoints — no new API):
 *   - planningApi.getOrders()      → open order count
 *   - planningApi.getWorkOrders()  → active / overdue / due-today
 *   - useMyApprovalCount()         → my pending approvals (poll)
 *
 * Role gates apply via useAccess — sections the operator can't see
 * (e.g. permission_group hides 'work-orders') are hidden here too.
 *
 * Cards click → onTabChange(tabId) routes to the actual feature, so
 * the home page is a navigation hub, not a duplicate UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccess } from '../../context/useAccess';
import { useI18n } from '../../utils/useI18n';
import { useMyApprovalCount } from '../../utils/useMyApprovalCount';
import { planningApi } from '../../services/api';
import { err as logErr } from '../../utils/logger';
import { SidebarIcon } from '../../components/Layout/SidebarIcon.jsx';
import { landingTabFor } from '../../components/Layout/sectionDefs.js';
import './HomePage.css';

const TERMINAL_WO_STATUSES = new Set(['COMPLETED', 'QC_RELEASED', 'CLOSED', 'CANCELLED']);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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

  const [stats, setStats] = useState({
    activeWOs: null,
    overdueWOs: null,
    dueToday: null,
    activeOrders: null,
  });
  const [dueWOs, setDueWOs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      planningApi.getWorkOrders().catch(() => []),
      planningApi.getOrders().catch(() => []),
    ])
      .then(([wos, orders]) => {
        if (cancelled) return;
        const today = todayIso();
        const woList = Array.isArray(wos) ? wos : wos?.items || [];
        const orderList = Array.isArray(orders) ? orders : [];
        const active = woList.filter((w) => !TERMINAL_WO_STATUSES.has(w.status));
        const overdue = active.filter((w) => w.due_date && w.due_date < today);
        const dueToday = active.filter((w) => w.due_date === today);
        const dueSoon = active
          .filter((w) => w.due_date && w.due_date >= today)
          .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
          .slice(0, 6);
        setStats({
          activeWOs: active.length,
          overdueWOs: overdue.length,
          dueToday: dueToday.length,
          activeOrders: orderList.filter((o) => o.status !== 'Completed').length,
        });
        setDueWOs(dueSoon);
        setLoading(false);
      })
      .catch((e) => {
        logErr('HomePage stats load failed', e);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = useMemo(() => pickGreeting(t), [t]);
  const todayStr = useMemo(() => formatLongDate(lang), [lang]);

  // Quick-action cards — filtered by access so a hidden tab doesn't
  // show as a clickable shortcut that lands on a forbidden page.
  const quickActions = useMemo(
    () =>
      [
        { id: 'standard', icon: 'calc_std', labelKey: 'home.qa.new_quote' },
        { id: 'order-entry', icon: 'orders', labelKey: 'home.qa.new_order', module: 'planning' },
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

      {/* ── KPI Strip — S-DESIGN-1 Dashboard-aligned tiles ──
            Label-on-top + big number + optional caption. Icon dropped
            (was operational duplicate of the destination tab's icon).
            Severity drives the 3px left rail tone, matching the
            Dashboard `tone-*` system. No delta pill / sparkline —
            these are operational counters, not analytics trends. */}
      <section className="home-kpis">
        <KpiCard
          label={t('home.kpi.active_wos')}
          value={loading ? '…' : (stats.activeWOs ?? 0)}
          severity={stats.overdueWOs > 0 ? 'warn' : 'ok'}
          subValue={
            stats.overdueWOs > 0 ? `${stats.overdueWOs} ${t('home.kpi.overdue_suffix')}` : null
          }
          onClick={() => onTabChange('work-orders')}
        />
        <KpiCard
          label={t('home.kpi.due_today')}
          value={loading ? '…' : (stats.dueToday ?? 0)}
          severity={stats.dueToday > 0 ? 'info' : 'neutral'}
          onClick={() => onTabChange('work-orders')}
        />
        <KpiCard
          label={t('home.kpi.my_approvals')}
          value={approvalCount ?? 0}
          severity={approvalCount > 0 ? 'urgent' : 'neutral'}
          onClick={() => onTabChange('approvals-inbox')}
        />
        <KpiCard
          label={t('home.kpi.active_orders')}
          value={loading ? '…' : (stats.activeOrders ?? 0)}
          severity="info"
          onClick={() => onTabChange('order-entry')}
        />
      </section>

      {/* ── Two-column main ── */}
      <div className="home-main">
        {/* My Queue / Today's Focus */}
        <section className="home-card">
          <header className="home-card-header">
            <h2>{t('home.section.todays_focus')}</h2>
            <button
              type="button"
              className="home-card-link"
              onClick={() => onTabChange('work-orders')}
            >
              {t('home.view_all')} →
            </button>
          </header>
          {loading ? (
            <p className="home-empty">{t('home.loading')}</p>
          ) : dueWOs.length === 0 ? (
            <p className="home-empty">{t('home.empty.no_active_wo')}</p>
          ) : (
            <ul className="home-list">
              {dueWOs.map((wo) => {
                const isOverdue = wo.due_date && wo.due_date < todayIso();
                const isToday = wo.due_date === todayIso();
                return (
                  <li
                    key={wo.id}
                    className={`home-list-item ${
                      isOverdue ? 'is-overdue' : isToday ? 'is-today' : ''
                    }`}
                    onClick={() => onTabChange('work-orders')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onTabChange('work-orders');
                    }}
                  >
                    <span className="home-list-code">{wo.code || `WO-${wo.id}`}</span>
                    <span className="home-list-meta">
                      {wo.customer || '—'}
                      {wo.qty_planned ? ` · qty ${Number(wo.qty_planned).toLocaleString()}` : ''}
                    </span>
                    <span
                      className={`home-list-due ${isOverdue ? 'overdue' : isToday ? 'today' : ''}`}
                    >
                      {wo.due_date || '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Module Shortcuts */}
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
