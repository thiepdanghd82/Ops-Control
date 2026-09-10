// @ts-check
/**
 * Internal types + Context object for AppConfigContext.
 *
 * Why a separate file: react-refresh requires .jsx files to export
 * ONLY React components. Both the Provider component AND the bare
 * Context object can't live next to each other. Splitting the Context
 * here keeps Fast Refresh working when the Provider body or hooks
 * (useFeatureFlag) get edited.
 */
import { createContext } from 'react';

export const DEFAULT_FEATURES = Object.freeze({
  // Planning module + Kiosk PWA removed 2026-07-22 (code-only cleanup).
  alt_materials: false,
  // In-app window manager (MDI) — default OFF; classic single-tab shell
  // renders until the server flag turns it on. Guarantees OFF pre-fetch
  // and on a failed runtime-config fetch.
  window_manager: false,
});

// Sprint S-SYSCTRL — global SYS-controlled sidebar show/hide. Default = nothing
// hidden, so a failed/absent config fetch shows the FULL sidebar (fail-open is
// correct here: this layer only ever HIDES on top of the real access gates, so
// "show everything" can't leak access the user didn't already have).
export const DEFAULT_SIDEBAR = Object.freeze({ hiddenTabs: [], hiddenSections: [] });

export const AppConfigContext = createContext({
  features: DEFAULT_FEATURES,
  sidebar: DEFAULT_SIDEBAR,
  ready: false,
  setSidebarVisibility: () => {},
});
