// API client — Sprint MES-2.6b.
// Wraps fetch with kiosk JWT, idempotency-key generation, RFC-7807
// parsing, X-Kiosk-Session-Refresh handling, and stale-session recovery.
import * as session from './session.js';

export const newIdemKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `kiosk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function rawFetch(method, url, { body, idemKey } = {}) {
  const sess = session.load();
  const headers = { 'Content-Type': 'application/json' };
  if (sess?.session_jwt) headers.Authorization = `Bearer ${sess.session_jwt}`;
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, networkError: true, error: e.message };
  }
  // Transparent JWT rotation when server emits a refresh.
  const refreshed = res.headers.get('X-Kiosk-Session-Refresh');
  if (refreshed && sess) session.save({ ...sess, session_jwt: refreshed });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (res.ok)
    return {
      ok: true,
      status: res.status,
      body: json,
      replayed: res.headers.get('X-Idempotency-Replayed') === 'true',
    };
  // 401 stale-session recovery — clear the session and bounce to /pair so
  // the operator gets a fresh pairing card from a planner.
  if (res.status === 401 && json?.type === 'urn:ops:kiosk-session-invalid') {
    session.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/kiosk/pair')) {
      window.location.replace('/kiosk/pair');
    }
  }
  return {
    ok: false,
    status: res.status,
    problem: json || { type: 'urn:ops:unknown', detail: text },
  };
}

const BASE = '/api/planning/v2';

export const getDispatch = (machineCode) =>
  rawFetch('GET', `${BASE}/operations/dispatch?machine_code=${encodeURIComponent(machineCode)}`);

export const getReasonCodes = () => rawFetch('GET', `${BASE}/reason-codes`);

export const postStart = (opId, idemKey) =>
  rawFetch('POST', `${BASE}/operations/${opId}/start`, { body: {}, idemKey });

export const postPause = (opId, reasonCode, idemKey) =>
  rawFetch('POST', `${BASE}/operations/${opId}/pause`, {
    body: { reason_code: reasonCode },
    idemKey,
  });

export const postResume = (opId, idemKey) =>
  rawFetch('POST', `${BASE}/operations/${opId}/resume`, { body: {}, idemKey });

export const postComplete = (opId, payload, idemKey) =>
  rawFetch('POST', `${BASE}/operations/${opId}/complete`, { body: payload || {}, idemKey });

export const postScan = (opId, barcode, idemKey) =>
  rawFetch('POST', `${BASE}/operations/${opId}/scan`, { body: { barcode }, idemKey });

// Re-exported so queue.js can call back through the same code path.
export { rawFetch };
