import './TopBar.css';
import ActiveUsersIndicator from './ActiveUsersIndicator';
import SyncStatusBadge from './SyncStatusBadge';

// Map tab IDs to their section + label for breadcrumb
const TAB_META = {
  standard: { section: 'Calculators', label: 'Standard' },
  complex: { section: 'Calculators', label: 'Complex' },
  'lib-mat': { section: 'Calculators', label: 'Material Cost' },
  'ink-calc': { section: 'Calculators', label: 'Inks Calculator' },
  summarize: { section: 'Quoting & Pricing', label: 'Cost Breakdown' },
  'formal-quote': { section: 'Quoting & Pricing', label: 'Formal Quotation' },
  'quote-history': { section: 'Quoting & Pricing', label: 'Quote History' },
  'lib-mfg': { section: 'Manufacturing', label: 'Mfg Structures' },
  'lib-rop': { section: 'Manufacturing', label: 'Routing Ops' },
  'lib-inventory': { section: 'Manufacturing', label: 'IFS Inventory' },
  'rfq-tracker': { section: 'Tracking', label: 'RFQ Tracker' },
  'sample-tracking': { section: 'Tracking', label: 'Sample Tracking' },
  'quote-analysis': { section: 'Reports', label: 'Quote Analysis' },
  'lib-rate': { section: 'Libraries', label: 'Rate Table' },
  'lib-ddl': { section: 'Libraries', label: 'Drop-Down Lists' },
  'lib-finance': { section: 'Libraries', label: 'Finance Data' },
  settings: { section: 'System', label: 'Settings' },
};

const MODULE_LABELS = {
  cost: 'Ops Cost',
  planning: 'Planning',
};

export default function TopBar({ activeModule, activeTab }) {
  const moduleName = MODULE_LABELS[activeModule] || activeModule;
  const meta = TAB_META[activeTab];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <nav className="topbar-breadcrumb">
          <span className="topbar-bc-root">{moduleName}</span>
          {meta && (
            <>
              <span className="topbar-bc-sep">&rsaquo;</span>
              <span className="topbar-bc-section">{meta.section}</span>
              <span className="topbar-bc-sep">&rsaquo;</span>
              <span className="topbar-bc-current">{meta.label}</span>
            </>
          )}
        </nav>
      </div>
      <div className="topbar-right">
        <SyncStatusBadge />
        <ActiveUsersIndicator />
      </div>
    </header>
  );
}
