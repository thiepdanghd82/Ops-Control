import { lazy, Suspense } from 'react';
// CostLibProvider is hoisted to AppBootstrap (Phase 10K) so library
// data is preloaded once before the shell renders. No nested provider
// here — it'd re-mount + re-fetch every time the user leaves and
// returns to the Cost module.
import SkeletonTable from '../../components/Shared/SkeletonTable';
import ErrorBoundary from '../../components/Shared/ErrorBoundary';
import AccessGate from '../../components/Shared/AccessGate';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// CalcProvider is now hoisted to App.jsx so the layout-level WarningBar
// can subscribe to calc state. Don't re-wrap here or the two providers
// would step on each other.

// Phase 9I — every tab is a lazy chunk. Vite splits each import() into
// its own JS file; the initial page load no longer ships the full
// calc engine + all 19 tab modules. First-paint of the login page drops
// from ~690 kB single chunk to ~200 kB shell + per-tab chunks that
// load on demand.
//
// Rationale for splitting per tab (not per module):
//   - Users only visit a handful of tabs per session. Paying the cost
//     of parsing StandardCalc's JSX (the biggest tab) when they're in
//     Dashboard is pure waste.
//   - Calc engine is already a single importable service — it's
//     fetched lazily along with whichever calc tab touches it first,
//     then cached by the browser for the rest of the session.
//   - A tab chunk is small enough (~30-80 kB) that the fallback
//     flashes for < 100 ms on a normal connection; SkeletonTable is
//     there to absorb that window gracefully.
const IFSInventory = lazy(() => import('./tabs/IFSInventory'));
const QuoteHistory = lazy(() => import('./tabs/QuoteHistory'));
const PendingApprovalsInbox = lazy(() => import('./tabs/PendingApprovalsInbox'));
const MaterialLibrary = lazy(() => import('./tabs/MaterialLibrary'));
const Settings = lazy(() => import('./tabs/Settings'));
const LibRate = lazy(() => import('./tabs/LibRate'));
const LibDDL = lazy(() => import('./tabs/LibDDL'));
const LibFinance = lazy(() => import('./tabs/LibFinance'));
const MachineTechnicalTab = lazy(() => import('./tabs/MachineTechnicalTab'));
const LibMfg = lazy(() => import('./tabs/LibMfg'));
const LibRop = lazy(() => import('./tabs/LibRop'));
const RFQTracker = lazy(() => import('./tabs/RFQTracker'));
const SampleTracking = lazy(() => import('./tabs/SampleTracking'));
const QuoteAnalysis = lazy(() => import('./tabs/QuoteAnalysis'));
const Dashboard = lazy(() => import('./tabs/Dashboard'));
const InkCalculator = lazy(() => import('./tabs/InkCalculator'));
const PrintAreaCalc = lazy(() => import('./tabs/PrintAreaCalc'));
const DesignTools = lazy(() => import('./tabs/DesignTools/DesignTools'));
const MessagesTab = lazy(() => import('./tabs/Messages/MessagesTab'));
const StandardCalc = lazy(() => import('./tabs/StandardCalc/StandardCalc'));
const ComplexCalc = lazy(() => import('./tabs/ComplexCalc/ComplexCalc'));
const Summarize = lazy(() => import('./tabs/Summarize'));
const FormalQuotation = lazy(() => import('./tabs/FormalQuotation'));
const AdminMetrics = lazy(() => import('./tabs/AdminMetrics'));
const AuditLog = lazy(() => import('./tabs/AuditLog'));
const KioskAdmin = lazy(() => import('./tabs/KioskAdmin.jsx'));
// Help lives at the app level (not cost-specific) but routes through
// the Cost sidebar since that's where users spend most of their time.
// Planning module reuses the same HelpTab lazily when needed.
const HelpTab = lazy(() => import('../help/HelpTab'));

import './CostModule.css';

// TabErrorBoundary was extracted to components/Shared/ErrorBoundary so
// Planning + Chat + the app shell can reuse it. The `resetKey={activeTab}`
// prop below makes the boundary auto-recover when the user switches
// tabs — no manual Retry click needed in the happy navigation path.

// Tab → lazy component map. Also exported as a preload helper: hovering
// a sidebar tab can call preloadTab(id) so the chunk is warm by the
// time the user clicks. Saves the Suspense flash for expected
// navigation patterns.
const TAB_COMPONENTS = {
  'lib-inventory': IFSInventory,
  'quote-history': QuoteHistory,
  'approvals-inbox': PendingApprovalsInbox,
  'lib-mat': MaterialLibrary,
  settings: Settings,
  'lib-rate': LibRate,
  'lib-ddl': LibDDL,
  'lib-finance': LibFinance,
  'lib-machine-tech': MachineTechnicalTab,
  'lib-mfg': LibMfg,
  'lib-rop': LibRop,
  'rfq-tracker': RFQTracker,
  'sample-tracking': SampleTracking,
  'quote-analysis': QuoteAnalysis,
  dashboard: Dashboard,
  'ink-calc': InkCalculator,
  'print-area': PrintAreaCalc,
  'design-tools': DesignTools,
  messages: MessagesTab,
  standard: StandardCalc,
  complex: ComplexCalc,
  summarize: Summarize,
  'formal-quote': FormalQuotation,
  metrics: AdminMetrics,
  'audit-log': AuditLog,
  'kiosk-admin': KioskAdmin,
  help: HelpTab,
};

// Preload helper lives in utils/tabPreload.js so this file stays a
// pure component module (Fast Refresh requirement).

function TabLoadingFallback() {
  return (
    <div style={{ padding: 24 }}>
      <SkeletonTable rows={6} cols={4} />
    </div>
  );
}

// Pretty title for browser tab + history entries. Maps the tab id (used
// in routing + lazy chunks) to a human label. Keeping this here, next to
// TAB_COMPONENTS, makes the two stay in sync — if you add a tab without a
// label the fallback is a humanised version of the id.
const TAB_TITLES = {
  'lib-inventory': 'IFS Inventory',
  'quote-history': 'Quote History',
  'approvals-inbox': 'Approvals Inbox',
  'lib-mat': 'Materials Library',
  settings: 'Settings',
  'lib-rate': 'Rate Library',
  'lib-ddl': 'Drop-down Lists',
  'lib-finance': 'Finance Library',
  'lib-machine-tech': 'Machine Technical',
  'lib-mfg': 'Mfg Structure',
  'lib-rop': 'Routing Operations',
  'rfq-tracker': 'RFQ Tracker',
  'sample-tracking': 'Sample Tracking',
  'quote-analysis': 'Quote Analysis',
  dashboard: 'Dashboard',
  'ink-calc': 'Ink Calculator',
  'print-area': 'Print Area Calc',
  'design-tools': 'Design Tools',
  messages: 'Messages',
  standard: 'Standard Calc',
  complex: 'Complex Calc',
  summarize: 'Summarize',
  'formal-quote': 'Formal Quotation',
  metrics: 'Admin Metrics',
  'audit-log': 'Audit Log',
  'kiosk-admin': 'Kiosk Admin',
  help: 'Help',
};

function humanise(id) {
  return String(id || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function CostModuleInner({ activeTab }) {
  useDocumentTitle(TAB_TITLES[activeTab] || humanise(activeTab), 'Cost');
  const Component = TAB_COMPONENTS[activeTab];

  if (!Component) {
    return (
      <div className="cost-module cost-module-empty">
        <p>
          Unknown tab: <b>{activeTab}</b>
        </p>
        <p>Select a tab from the sidebar to get started.</p>
      </div>
    );
  }

  // Suspense wraps the lazy component so the fallback renders while
  // the chunk downloads. `key={activeTab}` makes sure switching tabs
  // unmounts cleanly (useEffect cleanups fire, etc.) rather than
  // React attempting to reconcile across tab boundaries.
  return (
    <div className="cost-module">
      <ErrorBoundary label={`Cost → ${activeTab}`} resetKey={activeTab}>
        <Suspense fallback={<TabLoadingFallback />}>
          <AccessGate tabId={activeTab}>
            <Component />
          </AccessGate>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default function CostModule(props) {
  return <CostModuleInner {...props} />;
}
