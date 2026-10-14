/**
 * Logger — thin wrapper that silences verbose console output in
 * production builds while keeping errors visible for ops.
 *
 * Use pattern:
 *   import { log, warn, err } from '../utils/logger';
 *   log('hydrated job %s', sku);   // DEV only
 *   warn('price missing, using fallback');  // DEV only
 *   err('save failed', e);          // always visible
 *
 * Why: the Sprint 10 audit flagged 28 console.log/warn statements in
 * production bundles. Raw console.* spam:
 *   - leaks internal state names to customers / competitors
 *   - slows down mobile devices (every call round-trips to devtools)
 *   - clutters browser DevTools for ops trying to triage real errors
 *
 * `err` stays on in production because silent failures are worse than
 * chatty ones — ops MUST see "Session expired" or "Save failed" in the
 * console when debugging a customer report. `log` and `warn` go quiet.
 */

// import.meta.env.DEV is set by Vite at build time. In production it's
// the literal `false`, so the whole function body dead-code-eliminates
// when minified. Falsy fallback covers non-Vite environments (tests).
const DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export function log(...args) {
  if (DEV) console.log(...args);
}

export function warn(...args) {
  if (DEV) console.warn(...args);
}

// Errors always go to the console. They're how ops know something broke.
// Never wrap critical errors in a DEV gate.
export function err(...args) {
  console.error(...args);
}

export default { log, warn, err };
