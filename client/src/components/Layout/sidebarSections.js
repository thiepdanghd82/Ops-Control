// @ts-check
/**
 * sidebarSections — single source of truth for the main-sidebar catalog.
 *
 * React-free so BOTH `Sidebar.jsx` (the real render) and the SYS-only
 * "System Control" panel (the global show/hide toggles) import the SAME
 * arrays — the toggle list can never drift from the actual sidebar. Also
 * imported by node:test for the pure-helper + server drift tests.
 *
 * The `system` section (Settings / Metrics / Audit / Help …) is marked
 * ALWAYS-ON: it is never globally hideable, so SYS can always reach
 * Settings → System Control to toggle things back. `allToggleableTabs()` /
 * `toggleableSections()` exclude it; `applySidebarVisibility()` refuses to
 * hide it even if an id sneaks into the hidden set.
 *
 * `icon` carries an icon-name string that maps to a path in SidebarIcon.jsx.
 */

export const COST_SECTIONS = [
  {
    id: 'calculators',
    labelKey: 'nav.section.calculators',
    tabs: [
      { id: 'standard', icon: 'calc_std', labelKey: 'nav.tab.standard' },
      { id: 'complex', icon: 'calc_cplx', labelKey: 'nav.tab.complex' },
      { id: 'lib-mat', icon: 'material', labelKey: 'nav.tab.material_cost' },
      { id: 'ink-calc', icon: 'ink', labelKey: 'nav.tab.inks_calc' },
      { id: 'print-area', icon: 'print_area', labelKey: 'nav.tab.print_area' },
      { id: 'design-tools', icon: 'design', labelKey: 'nav.tab.design_tools' },
      { id: 'messages', icon: 'messages', labelKey: 'nav.tab.messages' },
    ],
  },
  {
    id: 'quoting',
    labelKey: 'nav.section.quoting',
    tabs: [
      { id: 'summarize', icon: 'summarize', labelKey: 'nav.tab.cost_breakdown' },
      { id: 'formal-quote', icon: 'formal_quote', labelKey: 'nav.tab.formal_quotation' },
      { id: 'quote-history', icon: 'history', labelKey: 'nav.tab.quote_history' },
      { id: 'npi-parts-list', icon: 'parts_list', labelKey: 'nav.tab.npi_parts_list' },
      { id: 'rfq-tracking', icon: 'rfq_tracking', labelKey: 'nav.tab.rfq_tracking' },
      { id: 'approvals-inbox', icon: 'approvals', labelKey: 'nav.tab.pending_approvals' },
    ],
  },
  {
    id: 'manufacturing',
    labelKey: 'nav.section.manufacturing',
    tabs: [
      { id: 'lib-mfg', icon: 'mfg', labelKey: 'nav.tab.mfg_structures' },
      { id: 'lib-rop', icon: 'routing', labelKey: 'nav.tab.routing_ops' },
      { id: 'lib-inventory', icon: 'ifs', labelKey: 'nav.tab.ifs_inventory' },
    ],
  },
  {
    id: 'tracking',
    labelKey: 'nav.section.tracking',
    tabs: [
      { id: 'rfq-tracker', icon: 'rfq_tracker', labelKey: 'nav.tab.rfq_tracker' },
      { id: 'sample-tracking', icon: 'samples', labelKey: 'nav.tab.sample_tracking' },
    ],
  },
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    tabs: [
      { id: 'dashboard', icon: 'dashboard', labelKey: 'nav.tab.dashboard', minRole: 'user' },
      { id: 'quote-analysis', icon: 'analysis', labelKey: 'nav.tab.quote_analysis' },
    ],
  },
  {
    id: 'libraries',
    labelKey: 'nav.section.libraries',
    tabs: [
      { id: 'lib-rate', icon: 'rates', labelKey: 'nav.tab.rate_table' },
      // Pre-go-live lockdown: DDL drives pricing dropdowns — editing is
      // admin/sys only. Non-admins still SEE the values in the calculator
      // (lib.ddl loads via /shared/ddl for everyone); the editor tab is
      // hidden + the server enforces it (/save-all ddlSitesDB gate).
      { id: 'lib-ddl', icon: 'ddl', labelKey: 'nav.tab.ddl', minRole: 'admin' },
      { id: 'lib-finance', icon: 'finance', labelKey: 'nav.tab.finance_data' },
      { id: 'lib-machine-tech', icon: 'machine', labelKey: 'nav.tab.machine_technical' },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.section.system',
    // ALWAYS-ON — Settings (+ System Control) must stay reachable. Excluded
    // from the toggleable catalog + never hidden by applySidebarVisibility.
    alwaysOn: true,
    tabs: [
      { id: 'settings', icon: 'settings', labelKey: 'nav.tab.settings' },
      { id: 'metrics', icon: 'metrics', labelKey: 'nav.tab.metrics', minRole: 'sys' },
      // Sprint S-AUDIT (2026-04-29) — append-only event stream viewer
      // ported from v1.3 (apps/client/src/AuditLog.jsx). Sys-only.
      { id: 'audit-log', icon: 'audit', labelKey: 'nav.tab.audit_log', minRole: 'sys' },
      { id: 'help', icon: 'help', labelKey: 'nav.tab.help' },
    ],
  },
];

/** Every sidebar section (Cost only — Planning module removed 2026-07-22). */
export function allSections() {
  return [...COST_SECTIONS];
}

/** Whether a section may be globally hidden (System is always-on). */
export function isSectionToggleable(section) {
  return !section.alwaysOn;
}

/** Sections the System Control panel renders as toggleable. */
export function toggleableSections() {
  return allSections().filter(isSectionToggleable);
}

/** Flat list of toggleable tabs (each annotated with its `sectionId`). */
export function allToggleableTabs() {
  return toggleableSections().flatMap((s) => s.tabs.map((tab) => ({ ...tab, sectionId: s.id })));
}

/** Canonical id sets — the server validates PUT payloads against these
 *  (mirrored server-side with a drift test). */
export const TOGGLEABLE_SECTION_IDS = toggleableSections().map((s) => s.id);
export const TOGGLEABLE_TAB_IDS = allToggleableTabs().map((tab) => tab.id);

/**
 * HIDE-ONLY global visibility layer. Returns a NEW section list with the
 * globally-hidden tabs/sections removed for non-SYS users.
 *
 * Contract (all enforced here so the Sidebar + tests share one truth):
 *   - NEVER WIDENS: `baseAllows(tab)` is the existing gate (minRole +
 *     permission-group access + feature flag). A tab it rejects is dropped
 *     regardless of hidden state — un-hiding can't grant access.
 *   - SYS BYPASS: role 'sys' sees every allowed item (so they can reach
 *     System Control to toggle back); hidden items are kept but annotated
 *     `_globallyHidden` / the section `_globallyHidden` for a muted badge.
 *   - ALWAYS-ON: `alwaysOn` sections (System) are never hidden.
 *
 * @param {Array} sections
 * @param {{hiddenTabs?: string[], hiddenSections?: string[], role?: string|null,
 *          baseAllows?: (tab: any) => boolean}} [opts]
 */
export function applySidebarVisibility(
  sections,
  { hiddenTabs = [], hiddenSections = [], role = null, baseAllows = () => true } = {}
) {
  const hTabs = new Set(hiddenTabs);
  const hSecs = new Set(hiddenSections);
  const isSys = role === 'sys';
  const out = [];
  for (const section of sections || []) {
    const sectionHidden = !section.alwaysOn && hSecs.has(section.id);
    if (sectionHidden && !isSys) continue;
    const tabs = [];
    for (const tab of section.tabs || []) {
      if (!baseAllows(tab)) continue; // existing minRole/access/feature gate — ANDed, never widened
      const tabHidden = sectionHidden || (!section.alwaysOn && hTabs.has(tab.id));
      if (tabHidden && !isSys) continue;
      tabs.push({ ...tab, _globallyHidden: tabHidden });
    }
    if (tabs.length === 0) continue;
    out.push({ ...section, tabs, _globallyHidden: sectionHidden });
  }
  return out;
}
