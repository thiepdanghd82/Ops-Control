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
