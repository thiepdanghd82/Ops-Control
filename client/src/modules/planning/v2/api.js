/**
 * MES-1.5 client API — fetch helpers for /api/planning/v2/work-orders/*.
 *
 * All fetchers accept an AbortSignal so callers can wire them into
 * useAbortableFetch (the project's established cancellation pattern).
 * Errors are normalized into Error subclasses with the RFC-7807 body
 * attached on `.body` + `.type` + `.status` for inline display.
 */

async function parseRfcError(r) {
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* not JSON — leave body null */
  }
  const msg = body?.detail || body?.title || body?.type || `HTTP ${r.status}`;
  const err = new Error(msg);
  err.status = r.status;
  err.type = body?.type || null;
  err.body = body;
  return err;
}

export async function fetchWorkOrderList(filters, signal) {
  const sp = new URLSearchParams();
  if (filters.status) sp.set('status', filters.status);
  if (filters.q) sp.set('q', filters.q);
  if (filters.from) sp.set('from', filters.from);
  if (filters.to) sp.set('to', filters.to);
  const limit = filters.pageSize || 50;
  const offset = ((filters.page || 1) - 1) * limit;
  sp.set('limit', String(limit));
  sp.set('offset', String(offset));
  const r = await fetch(`/api/planning/v2/work-orders?${sp.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

export async function fetchWorkOrderDetail(id, signal) {
  const r = await fetch(`/api/planning/v2/work-orders/${id}`, {
    credentials: 'include',
    signal,
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

export async function fetchAuditTimeline(woId, signal) {
  const r = await fetch(`/api/planning/v2/work-orders/${woId}/audit`, {
    credentials: 'include',
    signal,
  });
  if (!r.ok) throw await parseRfcError(r);
  const body = await r.json();
  return Array.isArray(body?.rows) ? body.rows : [];
}

// MES-1.6 mutations. Both return the updated WO on success; on RFC-7807
// failure they throw an Error with `.type` / `.status` / `.body` so the
// caller can render inline (allowed_from, forbidden_fields, etc.).

export async function releaseWorkOrder(id, { notes } = {}) {
  const r = await fetch(`/api/planning/v2/work-orders/${id}/release`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes ? { notes } : {}),
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

export async function cancelWorkOrder(id, { reason }) {
  const r = await fetch(`/api/planning/v2/work-orders/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

export async function createWorkOrder(payload) {
  const r = await fetch('/api/planning/v2/work-orders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

export async function addOperation(woId, payload) {
  const r = await fetch(`/api/planning/v2/work-orders/${woId}/operations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}

// Planner sign-off on a DONE op. Idempotency-Key is required by the
// MES-2.5 mutation gate; we mint a fresh UUID per click — collisions are
// astronomically unlikely and a retry naturally generates a new key.
export async function acceptOperation(opId) {
  const idemKey =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `accept-${opId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const r = await fetch(`/api/planning/v2/operations/${opId}/accept`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: '{}',
  });
  if (!r.ok) throw await parseRfcError(r);
  return r.json();
}
