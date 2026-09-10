// @ts-check
/**
 * useAppConfig / useFeatureFlag — hooks for the runtime-config layer.
 *
 * Split out from AppConfigContext.jsx so the .jsx file only exports a
 * React component (Provider) — required by react-refresh / Fast Refresh
 * to avoid forcing a full page reload on every hook edit. The Context
 * object itself is imported here to wire useContext.
 */
import { useContext } from 'react';
import { AppConfigContext } from './appConfigInternal.js';

export function useAppConfig() {
  return useContext(AppConfigContext);
}

export function useFeatureFlag(name) {
  const { features } = useContext(AppConfigContext);
  return Boolean(features?.[name]);
}

/**
 * Global SYS-controlled sidebar show/hide (Sprint S-SYSCTRL). Returns the
 * hidden id sets + an optimistic setter. HIDE-ONLY at the render layer — the
 * Sidebar ANDs these AFTER the real access gates, so this never widens access.
 */
export function useSidebarVisibility() {
  const ctx = useContext(AppConfigContext);
  return {
    hiddenTabs: ctx.sidebar?.hiddenTabs || [],
    hiddenSections: ctx.sidebar?.hiddenSections || [],
    setSidebarVisibility: ctx.setSidebarVisibility || (() => {}),
  };
}
