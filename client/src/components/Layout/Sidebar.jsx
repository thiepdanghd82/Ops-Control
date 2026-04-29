import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccess } from '../../context/useAccess';
import { costApi } from '../../services/api';
import { useMyApprovalCount } from '../../utils/useMyApprovalCount';
import { useI18n } from '../../utils/useI18n';
import { preloadCostTab, preloadPlanningTab } from '../../utils/tabPreload';
import { SidebarIcon } from './SidebarIcon.jsx';
import './Sidebar.css';

// Sprint S-ICON (2026-04-29) — Unicode glyphs replaced by 16px monochrome
// inline-SVG icons (Carbon-style, see SidebarIcon.jsx). The `icon` field
// now carries an icon-name string that maps to a path in PATHS{}.
const COST_SECTIONS = [
  {
    id: 'calculators',
    labelKey: 'nav.section.calculators',
    tabs: [
      { id: 'standard',    icon: 'calc_std',     labelKey: 'nav.tab.standard' },
      { id: 'complex',     icon: 'calc_cplx',    labelKey: 'nav.tab.complex' },
      { id: 'lib-mat',     icon: 'material',     labelKey: 'nav.tab.material_cost' },
      { id: 'ink-calc',    icon: 'ink',          labelKey: 'nav.tab.inks_calc' },
      { id: 'print-area',  icon: 'print_area',   labelKey: 'nav.tab.print_area' },
      { id: 'design-tools',icon: 'design',       label: 'Design Tools' },
      { id: 'messages',    icon: 'messages',     labelKey: 'nav.tab.messages' },
    ]
  },
  {
    id: 'quoting',
    labelKey: 'nav.section.quoting',
    tabs: [
      { id: 'summarize',       icon: 'summarize',    labelKey: 'nav.tab.cost_breakdown' },
      { id: 'formal-quote',    icon: 'formal_quote', labelKey: 'nav.tab.formal_quotation' },
      { id: 'quote-history',   icon: 'history',      labelKey: 'nav.tab.quote_history' },
      { id: 'approvals-inbox', icon: 'approvals',    labelKey: 'nav.tab.pending_approvals' },
    ]
  },
  {
    id: 'manufacturing',
    labelKey: 'nav.section.manufacturing',
    tabs: [
      { id: 'lib-mfg',       icon: 'mfg',     labelKey: 'nav.tab.mfg_structures' },
      { id: 'lib-rop',       icon: 'routing', labelKey: 'nav.tab.routing_ops' },
      { id: 'lib-inventory', icon: 'ifs',     labelKey: 'nav.tab.ifs_inventory' },
    ]
  },
  {
    id: 'tracking',
    labelKey: 'nav.section.tracking',
    tabs: [
      { id: 'rfq-tracker',     icon: 'rfq_tracker', labelKey: 'nav.tab.rfq_tracker' },
      { id: 'sample-tracking', icon: 'samples',     labelKey: 'nav.tab.sample_tracking' },
    ]
  },
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    tabs: [
      { id: 'dashboard',      icon: 'dashboard', labelKey: 'nav.tab.dashboard', minRole: 'user' },
      { id: 'quote-analysis', icon: 'analysis',  labelKey: 'nav.tab.quote_analysis' },
    ]
  },
  {
    id: 'libraries',
    labelKey: 'nav.section.libraries',
    tabs: [
      { id: 'lib-rate',         icon: 'rates',   labelKey: 'nav.tab.rate_table' },
      { id: 'lib-ddl',          icon: 'ddl',     labelKey: 'nav.tab.ddl' },
      { id: 'lib-finance',      icon: 'finance', labelKey: 'nav.tab.finance_data' },
      { id: 'lib-machine-tech', icon: 'machine', label: 'Machine Technical' },
    ]
  },
  {
    id: 'system',
    labelKey: 'nav.section.system',
    tabs: [
      { id: 'settings',  icon: 'settings', labelKey: 'nav.tab.settings' },
      { id: 'metrics',   icon: 'metrics',  labelKey: 'nav.tab.metrics', minRole: 'sys' },
      // Sprint S-AUDIT (2026-04-29) — append-only event stream viewer
      // ported from v1.3 (apps/client/src/AuditLog.jsx). Sys-only.
      { id: 'audit-log', icon: 'audit',    labelKey: 'nav.tab.audit_log', minRole: 'sys' },
      { id: 'help',      icon: 'help',     labelKey: 'nav.tab.help' },
    ]
  }
];

const PLANNING_SECTIONS = [
  {
    id: 'production',
    label: 'PRODUCTION',
    tabs: [
      { id: 'order-entry',   icon: 'orders',        label: 'Order Entry' },
      { id: 'bom-explosion', icon: 'bom',           label: 'BOM Explosion' },
      { id: 'material-check',icon: 'materials_chk', label: 'Material Check' },
    ]
  },
  {
    id: 'scheduling',
    label: 'SCHEDULING',
    tabs: [
      { id: 'capacity',    icon: 'capacity', label: 'Capacity Planning' },
      { id: 'work-orders', icon: 'settings', label: 'Work Orders' },
    ]
  },
  {
    id: 'planning-tracking',
    label: 'TRACKING',
    tabs: [
      { id: 'wip-tracker', icon: 'wip', label: 'WIP Tracker' },
    ]
  }
];

const COLLAPSE_KEY = 'opsctl.sidebar.section-collapsed.v1';

function loadCollapsedSections() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export default function Sidebar({ activeModule, activeTab, onModuleChange, onTabChange, collapsed = false, onToggleCollapsed }) {
  const { user, hasModule, logout } = useAuth();
  const { access } = useAccess();
  const { t } = useI18n();
  const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

  const sections = activeModule === 'planning' ? PLANNING_SECTIONS : COST_SECTIONS;

  // Sprint S-COLLAPSE (2026-04-29) — section header is now collapsible.
  // Persists per section ID across reloads via localStorage so the
  // operator's last layout sticks.
  const [collapsedSections, setCollapsedSections] = useState(loadCollapsedSections);
  const toggleSection = useCallback((id) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Sprint 6.5 — live badge count for the Pending Approvals nav item.
  // Disabled when the user is unauthenticated or not on the cost
  // module so we don't poll unnecessarily from the planning module.
  const { count: approvalCount } = useMyApprovalCount({
    enabled: !!user && activeModule === 'cost',
  });

  // Team Online — poll every 30s, only show OTHER users who are online.
  // The current user is already shown in the footer so including them
  // in this card would duplicate the row.
  const [onlineUsers, setOnlineUsers] = useState([]);
  useEffect(() => {
    // AbortController supersedes the previous "cancelled flag" pattern —
    // this also aborts the HTTP request itself (not just the setState),
    // so a slow /users/status response doesn't keep the socket open
    // after the user navigates away.
    let activeCtrl = null;
    async function fetchOnline() {
      activeCtrl?.abort();
      const ctrl = new AbortController();
      activeCtrl = ctrl;
      try {
        const r = await costApi.getUsersStatus({ signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const list = Array.isArray(r?.users) ? r.users : [];
        setOnlineUsers(list.filter(u => u.online && u.id !== user?.id));
      } catch (e) {
        if (e?.name !== 'AbortError') { /* silent on real errors — badge-only UI */ }
      }
    }
    fetchOnline();
    const t = setInterval(fetchOnline, 30000);
    return () => { clearInterval(t); activeCtrl?.abort(); };
  }, [user?.id]);

  function handleModuleSwitch(mod) {
    if (mod !== activeModule) {
      onModuleChange(mod);
      const defaultTab = mod === 'cost' ? 'standard' : 'order-entry';
      onTabChange(defaultTab);
    }
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="7" fill="#1e3a5f"/>
            <rect x="7" y="14" width="4.5" height="12" rx="1.2" fill="#ef4444"/>
            <rect x="13.75" y="8" width="4.5" height="18" rx="1.2" fill="#22c55e"/>
            <rect x="20.5" y="11" width="4.5" height="15" rx="1.2" fill="#3b82f6"/>
          </svg>
        </div>
        <div className="sidebar-title">
          <span className="sidebar-app-name">Ops Control</span>
        </div>
        {/* Collapse toggle — IBM Carbon chevron pattern. Sits at the
            right edge of the header when expanded; moves below the logo
            when collapsed. Persisted via App.jsx → localStorage. */}
        {onToggleCollapsed && (
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span aria-hidden="true">{collapsed ? '⏵' : '⏴'}</span>
          </button>
        )}
      </div>

      {/* Module Switcher */}
      <div className="module-switcher">
        {hasModule('cost') && (
          <button
            className={`module-btn ${activeModule === 'cost' ? 'active' : ''}`}
            onClick={() => handleModuleSwitch('cost')}
          >
            {t('nav.module_cost')}
          </button>
        )}
        {hasModule('planning') && (
          <button
            className={`module-btn ${activeModule === 'planning' ? 'active' : ''}`}
            onClick={() => handleModuleSwitch('planning')}
          >
            {t('nav.module_planning')}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {sections.map((section) => {
          const visibleTabs = section.tabs.filter(tab => {
            // Legacy role-based gate (e.g. metrics → sys only).
            if (tab.minRole) {
              if ((ROLE_LEVELS[user?.role] || 0) < (ROLE_LEVELS[tab.minRole] || 0)) return false;
            }
            // Sprint S2 — permission-group 'hidden' filter.
            if (access(tab.id) === 'hidden') return false;
            return true;
          });
          if (visibleTabs.length === 0) return null;

          // Section label comes from labelKey (i18n) with fallback to
          // the old `label` prop for PLANNING_SECTIONS which hasn't
          // been migrated yet — planning is a secondary module.
          const sectionLabel = section.labelKey ? t(section.labelKey) : section.label;
          const sectionId = section.id || section.labelKey || section.label;
          const isCollapsed = !collapsed && collapsedSections.has(sectionId);
          const hasActive = visibleTabs.some(tb => tb.id === activeTab);
          return (
            <div key={sectionId} className="nav-section">
              {collapsed ? (
                <div className="nav-section-divider" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={`nav-section-header ${isCollapsed ? 'is-collapsed' : ''} ${hasActive ? 'has-active' : ''}`}
                  onClick={() => toggleSection(sectionId)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="nav-section-label">{sectionLabel}</span>
                  <svg
                    className="nav-section-chevron"
                    viewBox="0 0 12 12"
                    width="10"
                    height="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3,5 6,8 9,5" />
                  </svg>
                </button>
              )}
              {!isCollapsed && visibleTabs.map(tab => {
                const badge = tab.id === 'approvals-inbox' && approvalCount > 0
                  ? approvalCount
                  : null;
                const tabLabel = tab.labelKey ? t(tab.labelKey) : tab.label;
                const badgeTitle = badge != null
                  ? t('nav.badge_pending_tooltip', { n: badge })
                  : null;
                // Phase 9I.4 — preload the tab's JS chunk on hover so
                // the click-to-render transition doesn't flash the
                // Suspense fallback. `preloadTab` is idempotent and
                // no-ops when the chunk is already cached.
                const preload = () => {
                  try {
                    if (activeModule === 'cost') preloadCostTab(tab.id);
                    else preloadPlanningTab(tab.id);
                  } catch { /* ignore preload errors */ }
                };
                return (
                  <button
                    key={tab.id}
                    className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => onTabChange(tab.id)}
                    onMouseEnter={preload}
                    onFocus={preload}
                    title={collapsed ? tabLabel : undefined}
                  >
                    <span className="nav-icon"><SidebarIcon name={tab.icon} /></span>
                    <span className="nav-label">{tabLabel}</span>
                    {badge != null && (
                      <span className="nav-badge" title={badgeTitle}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Team Online — only shows online users */}
      {onlineUsers.length > 0 && (
        <div className="sb-team-online">
          <div className="sb-team-header">
            <span className="sb-team-title">{t('nav.team_online_title')}</span>
            <span className="sb-team-count">{t('nav.team_online_count', { n: onlineUsers.length })}</span>
          </div>
          <div className="sb-team-list">
            {onlineUsers.map(u => {
              const isMe = user && u.id === user.id;
              const name = u.full_name || u.username;
              const initial = (name || '?')[0].toUpperCase();
              const isAdmin = u.role === 'admin' || u.role === 'sys';
              return (
                <div key={u.id} className={`sb-user-row ${isMe ? 'me' : ''}`}>
                  <div className="sb-user-avatar-wrap">
                    <div className={`sb-user-avatar ${isMe ? 'me' : ''}`}>{initial}</div>
                    <span className="sb-online-dot" />
                  </div>
                  <div className="sb-user-info">
                    <div className="sb-user-name">
                      {name}
                      {isAdmin && <span className="sb-admin-star"> ★</span>}
                      {isMe && <span className="sb-me-tag"> (me)</span>}
                    </div>
                    <div className="sb-user-status">Active now</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">
            {(user?.full_name || user?.username || '?')[0].toUpperCase()}
          </div>
          <div className="user-details">
            <span className="user-name">{user?.full_name || user?.username}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
      </div>
    </aside>
  );
}
