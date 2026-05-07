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
      { id: 'print-area', icon: 'print_area', labelKey: 'nav.tab.print_area' },
      { id: 'design-tools', icon: 'design', label: 'Design Tools' },
      { id: 'messages', icon: 'messages', labelKey: 'nav.tab.messages' },
    ],
  },
  {
    id: 'quoting',
    labelKey: 'nav.section.quoting',
    label: 'Quoting & Pricing',
    icon: 'summarize',
    tabs: [
      { id: 'summarize', icon: 'summarize', labelKey: 'nav.tab.cost_breakdown' },
      { id: 'formal-quote', icon: 'formal_quote', labelKey: 'nav.tab.formal_quotation' },
      { id: 'quote-history', icon: 'history', labelKey: 'nav.tab.quote_history' },
      { id: 'approvals-inbox', icon: 'approvals', labelKey: 'nav.tab.pending_approvals' },
    ],
  },
  {
    id: 'manufacturing',
    labelKey: 'nav.section.manufacturing',
    label: 'Manufacturing',
    icon: 'mfg',
    tabs: [
      { id: 'lib-mfg', icon: 'mfg', labelKey: 'nav.tab.mfg_structures' },
      { id: 'lib-rop', icon: 'routing', labelKey: 'nav.tab.routing_ops' },
      { id: 'lib-inventory', icon: 'ifs', labelKey: 'nav.tab.ifs_inventory' },
    ],
  },
  {
    id: 'tracking',
    labelKey: 'nav.section.tracking',
    label: 'Tracking',
    icon: 'rfq_tracker',
    tabs: [
      { id: 'rfq-tracker', icon: 'rfq_tracker', labelKey: 'nav.tab.rfq_tracker' },
      { id: 'sample-tracking', icon: 'samples', labelKey: 'nav.tab.sample_tracking' },
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
      { id: 'lib-ddl', icon: 'ddl', labelKey: 'nav.tab.ddl' },
      { id: 'lib-finance', icon: 'finance', labelKey: 'nav.tab.finance_data' },
      { id: 'lib-machine-tech', icon: 'machine', label: 'Machine Technical' },
      // MES-3-V2 (KIOSK-002) — kiosk reason codes admin CRUD.
      { id: 'reason-codes', icon: 'rates', labelKey: 'nav.tab.reason_codes', minRole: 'admin' },
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
      { id: 'kiosk-admin', icon: 'settings', labelKey: 'nav.tab.kiosk_admin', minRole: 'admin' },
      { id: 'help', icon: 'help', labelKey: 'nav.tab.help' },
    ],
  },
];

export const PLANNING_SECTIONS = [
  {
    id: 'production',
    label: 'Production',
    icon: 'orders',
    tabs: [
      { id: 'order-entry', icon: 'orders', label: 'Order Entry' },
      { id: 'bom-explosion', icon: 'bom', label: 'BOM Explosion' },
      { id: 'material-check', icon: 'materials_chk', label: 'Material Check' },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: 'capacity',
    tabs: [
      { id: 'capacity', icon: 'capacity', label: 'Capacity Planning' },
      { id: 'work-orders', icon: 'settings', label: 'Work Orders' },
    ],
  },
  {
    id: 'planning-tracking',
    label: 'Tracking',
    icon: 'wip',
    tabs: [{ id: 'wip-tracker', icon: 'wip', label: 'WIP Tracker' }],
  },
];

/**
 * Find the section containing a given tab id. Used by Sidebar to
 * highlight the parent section when a real tab is active.
 */
export function findSectionForTab(sections, tabId) {
  for (const section of sections) {
    if (section.tabs.some((t) => t.id === tabId)) return section;
  }
  return null;
}

/**
 * Landing-page virtual tab id pattern. Sidebar emits these on section
 * click; CostModule + PlanningModule detect the prefix and render
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
