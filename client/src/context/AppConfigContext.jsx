// @ts-check
/**
 * AppConfigContext — server-driven runtime configuration (Sprint S-ALT-MAT, PR #A).
 *
 * Fetches /api/runtime-config once at provider mount and exposes the
 * server's feature flag map to React. The endpoint reads OPS_FEATURE_*
 * env vars on the server, so dev/prod can differ without rebuilding the
 * client bundle.
 *
 * Default state (before fetch resolves) is all features OFF. That keeps
 * the UI consistent during the brief window before the first response
 * lands: a feature-gated affordance simply doesn't render rather than
 * flicker on then disappear once the real config arrives.
 *
 * Fetch failures are non-fatal — features stay off. A red-bar banner is
 * NOT shown because operators don't need to know about runtime-config;
 * the gated affordance just stays hidden, which is the safe default.
 *
 * Usage:
 *
 *   const { features } = useAppConfig();
 *   if (features.alt_materials) {
 *     return <AltMaterialsToggle ... />;
 *   }
 *
 * Or the focused hook:
 *
 *   const altMaterialsEnabled = useFeatureFlag('alt_materials');
 */
import { useCallback, useEffect, useState } from 'react';
import { AppConfigContext, DEFAULT_FEATURES, DEFAULT_SIDEBAR } from './appConfigInternal.js';

function normSidebar(s) {
  return {
    hiddenTabs: Array.isArray(s?.hiddenTabs) ? s.hiddenTabs : [],
    hiddenSections: Array.isArray(s?.hiddenSections) ? s.hiddenSections : [],
  };
}

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState({
    features: DEFAULT_FEATURES,
    sidebar: DEFAULT_SIDEBAR,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    const ctl = new AbortController();
    fetch('/api/runtime-config', { credentials: 'include', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        // Merge server-provided features over defaults so a new feature
        // added in code but not yet returned by the server defaults to
        // its DEFAULT_FEATURES value (false).
        const features = { ...DEFAULT_FEATURES, ...(j?.features || {}) };
        // Sprint S-SYSCTRL — global sidebar hide map rides this same fetch.
        setConfig({ features, sidebar: normSidebar(j?.sidebar), ready: true });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // Non-fatal — keep defaults (all features off). Log so the
        // unexpected case (dev box mis-deployed) shows up in console.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[AppConfigContext] runtime-config fetch failed; defaults in use', err);
        }
        if (!cancelled)
          setConfig({ features: DEFAULT_FEATURES, sidebar: DEFAULT_SIDEBAR, ready: true });
      });
    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, []);

  // Optimistic local update so System Control changes reflect immediately for
  // the SYS operator who just saved (the persisted map + everyone else's view
  // catch up on their next runtime-config fetch / reload).
  const setSidebarVisibility = useCallback((next) => {
    setConfig((c) => ({ ...c, sidebar: normSidebar(next) }));
  }, []);

  return (
    <AppConfigContext.Provider value={{ ...config, setSidebarVisibility }}>
      {children}
    </AppConfigContext.Provider>
  );
}
