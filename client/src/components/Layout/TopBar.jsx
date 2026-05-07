import './TopBar.css';
import ActiveUsersIndicator from './ActiveUsersIndicator';
import SyncStatusBadge from './SyncStatusBadge';
import { useI18n } from '../../utils/useI18n';
import {
  COST_SECTIONS,
  PLANNING_SECTIONS,
  findSectionForTab,
  isLanding,
  landingSectionId,
} from './sectionDefs.js';

// Per-tab label override for the breadcrumb tail. Falls back to the
// section's tab.labelKey when missing here.
const TAB_LABELS = {
  standard: { labelKey: 'nav.tab.standard' },
  complex: { labelKey: 'nav.tab.complex' },
  'lib-mat': { labelKey: 'nav.tab.material_cost' },
  'ink-calc': { labelKey: 'nav.tab.inks_calc' },
  'print-area': { labelKey: 'nav.tab.print_area' },
  'design-tools': { label: 'Design Tools' },
  messages: { labelKey: 'nav.tab.messages' },
  summarize: { labelKey: 'nav.tab.cost_breakdown' },
  'formal-quote': { labelKey: 'nav.tab.formal_quotation' },
  'quote-history': { labelKey: 'nav.tab.quote_history' },
  'approvals-inbox': { labelKey: 'nav.tab.pending_approvals' },
  'lib-mfg': { labelKey: 'nav.tab.mfg_structures' },
  'lib-rop': { labelKey: 'nav.tab.routing_ops' },
  'lib-inventory': { labelKey: 'nav.tab.ifs_inventory' },
  'rfq-tracker': { labelKey: 'nav.tab.rfq_tracker' },
  'sample-tracking': { labelKey: 'nav.tab.sample_tracking' },
  dashboard: { labelKey: 'nav.tab.dashboard' },
  'quote-analysis': { labelKey: 'nav.tab.quote_analysis' },
  'lib-rate': { labelKey: 'nav.tab.rate_table' },
  'lib-ddl': { labelKey: 'nav.tab.ddl' },
  'lib-finance': { labelKey: 'nav.tab.finance_data' },
  'lib-machine-tech': { label: 'Machine Technical' },
  settings: { labelKey: 'nav.tab.settings' },
  metrics: { labelKey: 'nav.tab.metrics' },
  'audit-log': { labelKey: 'nav.tab.audit_log' },
  'kiosk-admin': { labelKey: 'nav.tab.kiosk_admin' },
  help: { labelKey: 'nav.tab.help' },
};

const MODULE_LABEL_KEYS = {
  cost: 'nav.module_cost',
  planning: 'nav.module_planning',
};

function getSections(activeModule) {
  if (activeModule === 'planning') return PLANNING_SECTIONS;
  return COST_SECTIONS;
}

/**
 * TopBar header — section title takes the lead position.
 *
 * 2026-05-03: Reordered so the section name (PRICING WORKSHEET / REPORTS
 * / etc.) is the primary heading instead of the module name. Module name
 * stays as a small kicker above so the user still knows whether they're
 * in Cost or Planning. Layout:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ Ops Cost                                    │  ← kicker (tiny)
 *   │ PRICING WORKSHEET › Standard                │  ← bold section + tab
 *   └─────────────────────────────────────────────┘
 */
export default function TopBar({ activeModule, activeTab }) {
  const { t } = useI18n();
  const moduleLabel = MODULE_LABEL_KEYS[activeModule] ? t(MODULE_LABEL_KEYS[activeModule]) : activeModule;
  const sections = getSections(activeModule);

  // Resolve the active section + tab labels.
  let sectionLabel = null;
  let tabLabel = null;

  if (activeTab === 'home') {
    sectionLabel = t('nav.tab.home') || 'Home';
  } else if (isLanding(activeTab)) {
    const sid = landingSectionId(activeTab);
    const section = sections.find(s => s.id === sid);
    if (section) sectionLabel = section.labelKey ? t(section.labelKey) : section.label;
  } else {
    const section = findSectionForTab(sections, activeTab);
    if (section) {
      sectionLabel = section.labelKey ? t(section.labelKey) : section.label;
      const tabDef = section.tabs.find(tt => tt.id === activeTab);
      const meta = TAB_LABELS[activeTab] || tabDef || {};
      tabLabel = meta.labelKey ? t(meta.labelKey) : (meta.label || tabDef?.label || null);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
          <span className="topbar-module-kicker">{moduleLabel}</span>
          <span className="topbar-bc-row">
            <span className="topbar-bc-root">{sectionLabel || moduleLabel}</span>
            {tabLabel && (
              <>
                <span className="topbar-bc-sep">&rsaquo;</span>
                <span className="topbar-bc-current">{tabLabel}</span>
              </>
            )}
          </span>
        </nav>
      </div>
      <div className="topbar-right">
        <SyncStatusBadge />
        <ActiveUsersIndicator />
      </div>
    </header>
  );
}
