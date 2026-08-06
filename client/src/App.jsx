import { useState, useEffect, useDeferredValue, useRef, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccessProvider } from './context/AccessContext';
import { AppConfigProvider } from './context/AppConfigContext';
import { useFeatureFlag } from './context/useAppConfig';
import { CalcProvider } from './context/CalcContext';
import { WindowManagerProvider, useWindowManager } from './window/WindowManagerContext';
import LoginPage from './components/Auth/LoginPage';
import AppBootstrap from './components/Auth/AppBootstrap';
import { LibraryPickerProvider } from './components/LibraryPicker/LibraryPicker';
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import WarningBar from './components/Layout/WarningBar';
import PwdAgeBanner from './components/Layout/PwdAgeBanner';
import CostModule from './modules/cost/CostModule';
import ImportDialog from './components/Shared/ImportDialog';
import ChatDrawer from './components/Chat/ChatDrawer';
import UnreadLoginPopup from './components/Chat/UnreadLoginPopup';
import ErrorBoundary from './components/Shared/ErrorBoundary';
import ConnectionBanner from './components/Layout/ConnectionBanner';
import ClientUpdateIndicator from './components/Layout/ClientUpdateIndicator';
import { startConnectionMonitor } from './services/connectionHealth';
import { startDataEventStream } from './services/dataEventBus';
import './App.css';

// Window manager desktop — lazy so react-rnd + all window chrome stay
// out of the classic (flag-OFF) bundle. Only fetched when the flag is on.
const WindowLayer = lazy(() => import('./window/WindowLayer.jsx'));

// v1.3 P0 — Start connection health monitor at module load time.
// Singleton pattern; calling more than once is no-op. Uses /health
// (or /api/health alias). Banner subscribes via context-free pub-sub.
// v1.3 Đợt 2 — also boot the SSE data-event subscriber. Server pushes
// quote.saved / rfq.updated / sample.updated / approval.transition;
// tabs subscribe via subscribeDataEvents() to refetch instantly.
if (typeof window !== 'undefined') {
  startConnectionMonitor({ endpoint: '/api/health' });
  startDataEventStream();
}

// Persist the active module+tab to localStorage so a browser reload
// (F5 / Cmd+R) returns the user to the screen they were working on
// instead of snapping back to Cost > Standard. Lazy-init reads the
// stored values on mount; a useEffect mirrors subsequent changes back
// to storage. Wrapped in try/catch because localStorage can throw in
// private-mode browsers.
const LS_MODULE_KEY = 'ops_active_module';
const LS_TAB_KEY = 'ops_active_tab';
const LS_SIDEBAR_COLLAPSED = 'ops_sidebar_collapsed';
function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function AppShell() {
  const { isAuthenticated, loading, hasRole, sessionExpired } = useAuth();
  const wm = useWindowManager();
  const wmEnabled = wm.enabled;
  const [activeModule, setActiveModule] = useState(() => readLS(LS_MODULE_KEY, 'cost'));
  // Sprint S-HOME — first-time login lands on the Home dashboard.
  // Returning users keep their last activeTab (LS persists); only the
  // initial empty-LS fallback changed from 'standard' → 'home'.
  const [activeTab, setActiveTab] = useState(() => readLS(LS_TAB_KEY, 'home'));
  // Sprint 1.7i — UI lag fix when switching to a heavy tab (Mfg Structures
  // 6 MB, Routing Ops 16 MB, IFS Inventory 2.8 MB).
  // The previous behaviour batched the sidebar's "active tab highlight"
  // update WITH the heavy CostModule remount/lazy-import/JSON.parse into
  // one synchronous render commit → browser couldn't paint until the
  // 200–3000ms heavy work finished. Sidebar appeared frozen on the old
  // tab even though state had changed.
  // useDeferredValue marks the tab swap inside CostModule as low-priority:
  //   - Sidebar reads `activeTab` directly → highlight flips IMMEDIATELY
  //   - CostModule reads `deferredActiveTab` → mounts the new tab in a
  //     deferred render that doesn't block the high-priority sidebar paint
  // The Suspense boundary inside CostModule still shows its fallback while
  // the new lazy chunk loads — but the sidebar visual update lands first.
  const deferredActiveTab = useDeferredValue(activeTab);
  const [showImport, setShowImport] = useState(false);
  // Sidebar collapse — responsive UX. Persists across reloads so the
  // user isn't surprised by sidebar re-expanding. Collapsed defaults
  // to true on narrow viewports (laptop screens) for out-of-the-box fit.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = readLS(LS_SIDEBAR_COLLAPSED, null);
    if (stored === '1') return true;
    if (stored === '0') return false;
    // Auto-collapse on first visit when viewport < 1400 px.
    return typeof window !== 'undefined' && window.innerWidth < 1400;
  });

  // Mirror module/tab back to localStorage so subsequent reloads land
  // on the same screen.
  useEffect(() => {
    writeLS(LS_MODULE_KEY, activeModule);
  }, [activeModule]);
  useEffect(() => {
    writeLS(LS_TAB_KEY, activeTab);
  }, [activeTab]);
  useEffect(() => {
    writeLS(LS_SIDEBAR_COLLAPSED, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // Sprint S-HOME — every fresh login lands on the Home dashboard.
  // Detect the false → true transition of `isAuthenticated` (don't fire
  // on every render where the user is already logged in, so a page
  // reload still preserves the operator's last tab via LS).
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      setActiveTab('home');
      // Window-manager mode: seed-if-missing + raise Home to the front so
      // a returning user with a saved layout starts on Home (not their
      // last highest-z window). openWindow('home') creates Home if the
      // hydrated layout somehow lacks it (safety net).
      if (wmEnabled) wm.openWindow('home');
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, wmEnabled, wm]);

  // Listen for tab switch events from native components (e.g., Quote History -> Open quote).
  // With the window manager on, route the target through openWindow (the
  // singleton rule handles the QuoteHistory → open-quote focus handoff).
  useEffect(() => {
    function handleSwitchTab(e) {
      const tab = e.detail;
      if (tab) {
        setActiveModule('cost');
        if (wmEnabled) wm.openWindow(tab);
        else setActiveTab(tab);
      }
    }
    window.addEventListener('ops-switch-tab', handleSwitchTab);
    return () => window.removeEventListener('ops-switch-tab', handleSwitchTab);
  }, [wmEnabled, wm]);

  // Sprint 9 — F1 opens Help, context-sensitive when the current tab
  // has a matching help entry. window.__helpTarget is consumed by
  // HelpTab on mount and cleared; re-pressing F1 from a different tab
  // deep-links to the new entry.
  //
  // Guard: native F1 is bound to browser help in most browsers; we
  // preventDefault so our in-app help wins. Ignore the event if the
  // user is typing in an input (feels wrong to hijack help during typing).
  useEffect(() => {
    function handleF1(e) {
      if (e.key !== 'F1') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      e.preventDefault();
      // Help targets whatever is focused: the focused window's tab when
      // the WM is on, else the classic active tab.
      window.__helpTarget = (wmEnabled ? wm.focusedTabId : activeTab) || 'home';
      if (wmEnabled) wm.openWindow('help');
      else setActiveTab('help');
    }
    window.addEventListener('keydown', handleF1);
    return () => window.removeEventListener('keydown', handleF1);
  }, [activeTab, wmEnabled, wm]);

  // Đợt 5 — admins receive security.alert SSE events as a top-of-app
  // toast so suspicious logins surface even when they're working in
  // another tab. Non-admins ignore (event has audience='admins' on
  // the server but the SSE filter is best-effort; double-gate here).
  useEffect(() => {
    if (!isAuthenticated || !hasRole('admin')) return undefined;
    let unsub = null;
    (async () => {
      const { subscribeDataEvents } = await import('./services/dataEventBus');
      const { showToast } = await import('./utils/toast');
      unsub = subscribeDataEvents(['security.alert'], (evt) => {
        const p = evt?.payload || evt || {};
        const reasons = (p.reasons || []).join(', ');
        const ips = (p.concurrentIps || []).join(', ');
        showToast(
          `🛡 Security: ${p.username || '?'} — ${reasons}${ips ? ` (IPs: ${ips})` : ''}`,
          'warn'
        );
      });
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [isAuthenticated, hasRole]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Phase 9L.3 — pass an in-place flag so LoginPage can skip its
    // full-screen background/branding and render a compact
    // re-login dialog while keeping the user's recent state
    // visible behind. Plain first-login still uses full layout.
    return <LoginPage compact={sessionExpired} reason={sessionExpired ? 'expired' : null} />;
  }

  // Window-manager couplings: when the WM is on, the FOCUSED window's
  // tab drives the sidebar highlight, WarningBar, and doc title; a
  // sidebar click opens/focuses a window instead of swapping activeTab.
  // When off, everything reads activeTab exactly as before.
  const effectiveTab = wmEnabled ? wm.focusedTabId : activeTab;
  const handleSidebarTab = (tabId) => {
    setActiveModule('cost');
    if (wmEnabled) wm.openWindow(tabId);
    else setActiveTab(tabId);
  };

  // Phase 10K — post-login data preload gate. Wraps the whole app
  // shell in AppBootstrap which mounts CostLibProvider + fires
  // auxiliary fetches (chat, approvals) and shows a Loading overlay
  // until every dataset is in. Once ready, children render normally.
  return (
    <AppBootstrap>
      <LibraryPickerProvider>
        <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          {/* Shell widgets each wrapped so a crash in one (e.g. Sidebar
          context desync, TopBar notification poll, WarningBar selector)
          doesn't blank the whole app. Fallback renders null — losing a
          chrome widget is better than losing the module content. */}
          <ErrorBoundary label="Sidebar" fallback={() => null}>
            <Sidebar
              activeModule={activeModule}
              activeTab={effectiveTab}
              onModuleChange={setActiveModule}
              onTabChange={handleSidebarTab}
              collapsed={sidebarCollapsed}
              onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            />
          </ErrorBoundary>
          <div className="app-main">
            <ErrorBoundary label="TopBar" fallback={() => null}>
              <TopBar
                activeModule={activeModule}
                activeTab={effectiveTab}
                onImportClick={hasRole('admin') ? () => setShowImport(true) : null}
              />
            </ErrorBoundary>
            <ErrorBoundary label="PwdAgeBanner" fallback={() => null}>
              <PwdAgeBanner
                onOpenSettings={() => {
                  setActiveModule('cost');
                  if (wmEnabled) wm.openWindow('settings');
                  else setActiveTab('settings');
                }}
              />
            </ErrorBoundary>
            <div className="app-content">
              {/* Window manager ON → the desktop of floating windows
              (lazy chunk, react-rnd). OFF → classic single-tab render.
              deferredActiveTab keeps the heavy tab remount AFTER the
              sidebar paint on the classic path (Sprint 1.7i). */}
              {wmEnabled ? (
                <ErrorBoundary label="WindowLayer" resetKey="wm">
                  <Suspense fallback={null}>
                    <WindowLayer />
                  </Suspense>
                </ErrorBoundary>
              ) : (
                activeModule === 'cost' && (
                  <CostModule activeTab={deferredActiveTab} onTabChange={setActiveTab} />
                )
              )}
            </div>
            {/* Bottom-of-screen validation status bar — renders null unless
            the active tab is Standard or Complex AND warnings > 0. Sits
            here (as a sibling of .app-content) so it's horizontally
            aligned with the sidebar's Sign Out button. Follows the focused
            window when the WM is on. */}
            <ErrorBoundary label="WarningBar" fallback={() => null}>
              <WarningBar activeModule={activeModule} activeTab={effectiveTab} />
            </ErrorBoundary>
          </div>
          <ImportDialog
            isOpen={showImport}
            onClose={() => setShowImport(false)}
            onImportComplete={() => {
              // no-op: ImportDialog handles its own success UI
            }}
          />
          {/* Phase 10A — floating chat. Self-contained; renders nothing
          if the server returns 503 (chat_disabled) so users on a
          pre-chat deploy see the app unchanged. Wrapped in its own
          boundary so a chat crash (e.g. bad payload from the poller)
          doesn't take down the quoting UI. */}
          <ErrorBoundary label="Chat" fallback={() => null}>
            <ChatDrawer />
          </ErrorBoundary>
          {/* Phase 11 — one-shot unread-on-login popup. Self-contained:
          renders null unless the user has just logged in AND has at
          least one unread conversation. A crash here must not blank
          the shell, hence the dedicated boundary. */}
          <ErrorBoundary label="UnreadLoginPopup" fallback={() => null}>
            <UnreadLoginPopup />
          </ErrorBoundary>
        </div>
      </LibraryPickerProvider>
    </AppBootstrap>
  );
}

// Thin wrapper: reads the window_manager flag and mounts the (inert when
// off) WindowManagerProvider around the shell. Kept separate from
// AppShell so AppShell can consume useWindowManager(). Sits inside
// AppConfigProvider (for useFeatureFlag) + CalcProvider.
function AppContent() {
  const wmEnabled = useFeatureFlag('window_manager');
  return (
    // key remounts the provider when the flag resolves false → true so
    // the reducer re-inits (hydrates) with the settled `enabled` value.
    <WindowManagerProvider key={wmEnabled ? 'wm-on' : 'wm-off'} enabled={wmEnabled}>
      <AppShell />
    </WindowManagerProvider>
  );
}

export default function App() {
  return (
    // Top-level boundary — catches crashes in the app shell (Sidebar,
    // TopBar, WarningBar, Providers) that would otherwise render the
    // browser's blank page. The Cost / Planning module trees each have
    // their own inner boundaries for tab-level isolation; this one is
    // the last-resort net for anything above the modules.
    <ErrorBoundary label="Ops Control">
      {/* Top-of-app connection status (overlay; doesn't push content) */}
      <ConnectionBanner />
      {/* P0 client version nudge. Polls /api/version every 5 min; renders
          null when client matches server. Wrapped in its own boundary so
          a crash here can't blank the shell. */}
      <ErrorBoundary label="ClientUpdateIndicator" fallback={() => null}>
        <ClientUpdateIndicator />
      </ErrorBoundary>
      <AuthProvider>
        {/* AccessProvider (Sprint S2) must live INSIDE AuthProvider so
            it can read the logged-in user's permission_group_id, but
            OUTSIDE CalcProvider so useAccess() is available to the
            shell chrome (Sidebar, TopBar) as well as tab content. */}
        <AccessProvider>
          {/* AppConfigProvider (Sprint S-ALT-MAT, PR #A) — exposes
              server-driven feature flags to descendants via useFeatureFlag().
              Sits inside AccessProvider so flag-gated UI can also use
              useAccess() for permission gating. No network side effects
              beyond a single /api/runtime-config fetch at mount. */}
          <AppConfigProvider>
            {/* CalcProvider lives at the App level (rather than scoped to
                CostModule) so the WarningBar in the layout chrome can read
                the calculator state. It holds only in-memory state — no
                network side effects — so widening its scope is cheap. */}
            <CalcProvider>
              <AppContent />
            </CalcProvider>
          </AppConfigProvider>
        </AccessProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
