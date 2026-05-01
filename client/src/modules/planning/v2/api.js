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
