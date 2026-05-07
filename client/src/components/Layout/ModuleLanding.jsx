/**
 * ModuleLanding — ERPAG-style landing page for a section.
 *
 * Sidebar now lists section names only (PRICING WORKSHEET, QUOTING &
 * PRICING, ...). When the operator clicks a section, App.jsx routes to
 * `landing:<sectionId>` which CostModule / PlanningModule renders via
 * this component: a grid of icon + label cards, one per visible tab
 * inside the section.
 *
 * Click a card → `onTabChange(realTabId)` → normal lazy-tab render
 * takes over. The tab list, role gates, access checks come from
 * sectionDefs.js (single source of truth shared with Sidebar).
 */
import { useI18n } from '../../utils/useI18n';
import { useAccess } from '../../context/useAccess';
import { useAuth } from '../../context/AuthContext';
import { useMyApprovalCount } from '../../utils/useMyApprovalCount';
import { SidebarIcon } from './SidebarIcon.jsx';
import './ModuleLanding.css';

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

// Per-tab live counter map. The card looks up its tab id here and renders
// a pill badge if the count is > 0. Reuses the same data sources the
// sidebar badges read from so the two stay in sync (Sprint S-LANDING-BADGE
// 2026-05-03 — operators were puzzled why the sidebar showed "7" but the
// landing card looked empty).
function useLandingBadges(visibleTabs) {
  const wantsApprovals = visibleTabs.some((t) => t.id === 'approvals-inbox');
  const { count: approvalCount } = useMyApprovalCount({ enabled: wantsApprovals });
  return {
    'approvals-inbox': approvalCount,
  };
}

export default function ModuleLanding({ section, onTabChange }) {
  const { t } = useI18n();
  const { access } = useAccess();
  const { user } = useAuth();

  // Section label is now shown in the TopBar (REPORTS / PRICING WORKSHEET …)
  // so the in-page title was duplicate chrome. Removed 2026-05-03.
  const visibleTabs = section.tabs.filter((tab) => {
    if (tab.minRole) {
      if ((ROLE_LEVELS[user?.role] || 0) < (ROLE_LEVELS[tab.minRole] || 0)) return false;
    }
    if (access(tab.id) === 'hidden') return false;
    return true;
  });

  const badges = useLandingBadges(visibleTabs);

  return (
    <div className="module-landing">
      <div className="module-landing-grid">
        {visibleTabs.map((tab) => {
          const tabLabel = tab.labelKey ? t(tab.labelKey) : tab.label;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              type="button"
              className="module-landing-card"
              onClick={() => onTabChange(tab.id)}
            >
              <span className="module-landing-card-icon">
                <SidebarIcon name={tab.icon} />
              </span>
              <span className="module-landing-card-label">{tabLabel}</span>
              {badge > 0 && (
                <span className="module-landing-card-badge" aria-label={`${badge} pending`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
