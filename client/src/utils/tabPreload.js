/**
 * Tab chunk preloaders — Phase 9I.4.
 *
 * Dedicated module so the lazy() factory references live outside the
 * component files (Vite's react-refresh plugin rejects mixed exports
 * in a component file). Each preloader is a plain function that
 * triggers the dynamic-import promise; calling it twice is cached by
 * the browser's module system so "hover-preload then click" avoids
 * the Suspense fallback flash entirely.
 *
 * The imports here are the SAME specifiers used in CostModule /
 * PlanningModule, so Vite deduplicates the chunk — no duplicated code
 * in the bundle.
 */

const COST_LOADERS = {
  'lib-inventory':   () => import('../modules/cost/tabs/IFSInventory'),
  'quote-history':   () => import('../modules/cost/tabs/QuoteHistory'),
  'approvals-inbox': () => import('../modules/cost/tabs/PendingApprovalsInbox'),
  'lib-mat':         () => import('../modules/cost/tabs/MaterialLibrary'),
  'settings':        () => import('../modules/cost/tabs/Settings'),
  'lib-rate':        () => import('../modules/cost/tabs/LibRate'),
  'lib-ddl':         () => import('../modules/cost/tabs/LibDDL'),
  'lib-finance':     () => import('../modules/cost/tabs/LibFinance'),
  'lib-mfg':         () => import('../modules/cost/tabs/LibMfg'),
  'lib-rop':         () => import('../modules/cost/tabs/LibRop'),
  'rfq-tracker':     () => import('../modules/cost/tabs/RFQTracker'),
  'sample-tracking': () => import('../modules/cost/tabs/SampleTracking'),
  'quote-analysis':  () => import('../modules/cost/tabs/QuoteAnalysis'),
  'dashboard':       () => import('../modules/cost/tabs/Dashboard'),
  'ink-calc':        () => import('../modules/cost/tabs/InkCalculator'),
  'print-area':      () => import('../modules/cost/tabs/PrintAreaCalc'),
  'messages':        () => import('../modules/cost/tabs/Messages/MessagesTab'),
  'standard':        () => import('../modules/cost/tabs/StandardCalc/StandardCalc'),
  'complex':         () => import('../modules/cost/tabs/ComplexCalc/ComplexCalc'),
  'summarize':       () => import('../modules/cost/tabs/Summarize'),
  'formal-quote':    () => import('../modules/cost/tabs/FormalQuotation'),
  'audit-log':       () => import('../modules/cost/tabs/AuditLog'),
  'help':            () => import('../modules/help/HelpTab'),
};

const PLANNING_LOADERS = {
  'order-entry':    () => import('../modules/planning/tabs/OrderEntry'),
  'bom-explosion':  () => import('../modules/planning/tabs/BOMExplosion'),
  'material-check': () => import('../modules/planning/tabs/MaterialCheck'),
  'capacity':       () => import('../modules/planning/tabs/CapacityPlanning'),
  'work-orders':    () => import('../modules/planning/tabs/WorkOrders'),
  'wip-tracker':    () => import('../modules/planning/tabs/WIPTracker'),
};

/** Kick off the import for a cost tab's chunk. Cached after first call. */
export function preloadCostTab(tabId) {
  const loader = COST_LOADERS[tabId];
  if (typeof loader === 'function') {
    // Swallow rejections — a failed preload should not poison the
    // event handler; the click-time load will show the real error.
    try { loader().catch(() => {}); } catch { /* ignore */ }
  }
}

/** Kick off the import for a planning tab's chunk. Cached after first call. */
export function preloadPlanningTab(tabId) {
  const loader = PLANNING_LOADERS[tabId];
  if (typeof loader === 'function') {
    try { loader().catch(() => {}); } catch { /* ignore */ }
  }
}
