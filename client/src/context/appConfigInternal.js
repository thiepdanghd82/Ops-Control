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
  alt_materials: false,
});

export const AppConfigContext = createContext({
  features: DEFAULT_FEATURES,
  ready: false,
});
