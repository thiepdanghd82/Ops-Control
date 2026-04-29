/**
 * apiTry — wraps an async API call with consistent user-visible error
 * handling. Replaces the common pattern:
 *
 *   try {
 *     await costApi.saveQuote(data);
 *   } catch (e) {
 *     console.error('Save failed:', e);   // silent for user!
 *   }
 *
 * ...which the Sprint 10 audit flagged as a P2 gap — operators saw a
 * blank screen when a save failed. The correct pattern is:
 *
 *   await apiTry(() => costApi.saveQuote(data), 'Save quote');
 *
 * On failure:
 *   - The error is logged via the production-safe logger.err().
 *   - A red toast surfaces the failure to the user with the label
 *     + server message when available.
 *   - The original error is re-thrown so callers can still chain
 *     .then/.catch if they need local recovery.
 *
 * On success the value is passed through unchanged.
 *
 * Kept zero-dependency (just toast + logger) so it can be dropped into
 * any tab without a context wrapper.
 */
import { showToast } from './toast';
import { err } from './logger';

export async function apiTry(fn, actionLabel = 'Action') {
  try {
    return await fn();
  } catch (e) {
    err(`${actionLabel} failed:`, e);
    const msg = e?.response?.data?.message || e?.message || 'Network error';
    showToast(`${actionLabel} failed: ${msg}`, 'err');
    throw e;
  }
}

export default apiTry;
