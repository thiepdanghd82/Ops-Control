/**
 * Section definitions — shared between Sidebar (section-only nav) and
 * ModuleLanding (grid of feature cards).
 *
 * Sprint S-LANDING (2026-05-03) — extracted from Sidebar.jsx so the
 * landing page can render the same icon + label list without duplication.
 *
 * Each tab carries: id (matches CostModule.TAB_COMPONENTS / Planning
 * routing), icon (SidebarIcon name), label or labelKey (i18n), and
 * optional minRole gate. Adding a new tab here is the only place
 * needed — Sidebar + Landing both pick it up automatically.
 */

export const COST_SECTIONS = [
  {
    id: 'calculators',
    labelKey: 'nav.section.calculators',
    label: 'Pricing Worksheet',
    icon: 'calc_std',
    tabs: [
      { id: 'standard', icon: 'calc_std', labelKey: 'nav.tab.standard' },
      { id: 'complex', icon: 'calc_cplx', labelKey: 'nav.tab.complex' },
      { id: 'lib-mat', icon: 'material', labelKey: 'nav.tab.material_cost' },
      { id: 'ink-calc', icon: 'ink', labelKey: 'nav.tab.inks_calc' },
    ],
  },
  {
    id: 'quoting',
    labelKey: 'nav.section.quoting',
    label: 'Quoting & Pricing',
    icon: 'summarize',
    tabs: [
      { id: 'summarize', icon: 'summarize', labelKey: 'nav.tab.cost_breakdown' },
      { id: 'quote-history', icon: 'history', labelKey: 'nav.tab.quote_history' },
      { id: 'npi-parts-list', icon: 'parts_list', labelKey: 'nav.tab.npi_parts_list' },
      { id: 'approvals-inbox', icon: 'approvals', labelKey: 'nav.tab.pending_approvals' },
    ],
  },
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    label: 'Reports',
    icon: 'dashboard',
    tabs: [
      { id: 'dashboard', icon: 'dashboard', labelKey: 'nav.tab.dashboard', minRole: 'user' },
      { id: 'quote-analysis', icon: 'analysis', labelKey: 'nav.tab.quote_analysis' },
    ],
  },
  {
    id: 'libraries',
    labelKey: 'nav.section.libraries',
    label: 'Libraries',
    icon: 'rates',
    tabs: [
      { id: 'lib-rate', icon: 'rates', labelKey: 'nav.tab.rate_table' },
      // Pre-go-live: DDL editing is admin/sys only (mirror of Sidebar nav).
      { id: 'lib-ddl', icon: 'ddl', labelKey: 'nav.tab.ddl', minRole: 'admin' },
      { id: 'lib-finance', icon: 'finance', labelKey: 'nav.tab.finance_data' },
      { id: 'lib-machine-tech', icon: 'machine', label: 'Machine Technical' },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.section.system',
    label: 'System',
    icon: 'settings',
    tabs: [
      { id: 'settings', icon: 'settings', labelKey: 'nav.tab.settings' },
      { id: 'metrics', icon: 'metrics', labelKey: 'nav.tab.metrics', minRole: 'sys' },
      { id: 'audit-log', icon: 'audit', labelKey: 'nav.tab.audit_log', minRole: 'sys' },
      { id: 'help', icon: 'help', labelKey: 'nav.tab.help' },
    ],
  },
];

/**
 * Landing-page virtual tab id pattern. Sidebar emits these on section
 * click; CostModule detects the prefix and renders
 * <ModuleLanding> for the matching section.
 */
export const LANDING_PREFIX = 'landing:';

export function isLanding(tabId) {
  return typeof tabId === 'string' && tabId.startsWith(LANDING_PREFIX);
}

export function landingSectionId(tabId) {
  return isLanding(tabId) ? tabId.slice(LANDING_PREFIX.length) : null;
}

export function landingTabFor(sectionId) {
  return `${LANDING_PREFIX}${sectionId}`;
}
