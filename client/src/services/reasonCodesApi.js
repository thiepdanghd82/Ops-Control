/**
 * Reason-codes admin API wrapper — Sprint MES-3-V2 (KIOSK-002).
 *
 * Thin wrapper over `services/api.js` for the planner-side admin tab.
 * The kiosk PWA uses its own `apps/kiosk/src/lib/api.js` against the
 * public GET endpoint — this module is for the planner SPA only.
 *
 * Errors propagate as the project's standard `err.body` envelope
 * (RFC-7807). The Library tab UI reads:
 *   - err.body.type             — error class
 *   - err.body.errors           — field-level validation errors
 *   - err.body.forbidden_fields — patch-rejection list
 *   - err.body.code             — duplicate-collision payload
 */
import { api } from './api.js';

const BASE = '/planning/v2/reason-codes';

export function listReasonCodes({ includeDisabled = false } = {}) {
  return api.get(`${BASE}${includeDisabled ? '?include_disabled=1' : ''}`);
}

export function createReasonCode(payload) {
  return api.post(BASE, payload);
}

export function updateReasonCode(code, patch) {
  return api.patch(`${BASE}/${encodeURIComponent(code)}`, patch);
}

export function disableReasonCode(code) {
  return api.post(`${BASE}/${encodeURIComponent(code)}/disable`, {});
}

export function enableReasonCode(code) {
  return api.post(`${BASE}/${encodeURIComponent(code)}/enable`, {});
}
