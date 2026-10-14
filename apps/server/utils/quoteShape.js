/**
 * quoteShape — Phase 9M.1 shape validation for quoteHistory entries.
 *
 * /save-all accepts an array of quotes. Before this module, the server
 * blindly persisted whatever shape the client sent. A misbehaving
 * (or malicious) client could save `quoteHistory: [{ state: "string" }]`
 * and the approval workflow's `state?.approval?.status` lookup would
 * crash at read time on the NEXT quote load — a boobytrap for the
 * whole team.
 *
 * Approach: lenient gate, not a schema. We check ONLY the fields that
 * downstream code assumes exist + have a specific type. Everything else
 * (tier-specific fields, calc result shape, custom metadata) is left
 * untouched because it evolves rapidly and a strict schema would have
 * to be updated every sprint.
 *
 * Invalid entries are DROPPED with a warning, not a 400. Rationale: a
 * 10k-quote save should succeed with 9999 if one has a bad shape, not
 * fail the whole batch. The dropped-ids list is returned so the client
 * can surface "1 quote skipped: invalid state".
 */

const MAX_QUOTES = 50_000; // per-request cap; more than any realistic client save
const MAX_STRING_FIELD = 512; // string fields shouldn't exceed this; mega-strings are junk
const MAX_STATE_JSON_BYTES = 2 * 1024 * 1024; // 2 MB per quote state — big but finite

export function validateQuote(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    return { ok: false, reason: 'quote_not_object' };
  }
  // id: must be a finite number when present. Null/undefined = draft.
  if (q.id != null && !Number.isFinite(Number(q.id))) {
    return { ok: false, reason: 'id_not_number' };
  }
  // type: 'standard' | 'complex' | undefined (old data)
  if (q.type != null && q.type !== 'standard' && q.type !== 'complex') {
    return { ok: false, reason: 'type_unknown' };
  }
  // state: if present, must be an object (calc engine reads
  // state.materials, state.approval, etc. — a string would crash).
  if (q.state != null && (typeof q.state !== 'object' || Array.isArray(q.state))) {
    return { ok: false, reason: 'state_not_object' };
  }
  // approval within state: same story.
  if (
    q.state &&
    q.state.approval != null &&
    (typeof q.state.approval !== 'object' || Array.isArray(q.state.approval))
  ) {
    return { ok: false, reason: 'approval_not_object' };
  }
  // Rough size guard — if one quote's serialized state is > 2 MB
  // something is wrong (legitimate quotes are 5-50 KB).
  try {
    const approxBytes = JSON.stringify(q.state || {}).length;
    if (approxBytes > MAX_STATE_JSON_BYTES) {
      return { ok: false, reason: 'state_too_large' };
    }
  } catch {
    return { ok: false, reason: 'state_not_serializable' };
  }
  // String-typed identifying fields — cap length to stop garbage.
  for (const key of ['rfq_number', 'ccl_pn', 'direct_cu', 'end_cu', 'npi_owner', 'sale_owner']) {
    const v = q[key];
    if (v != null && (typeof v !== 'string' || v.length > MAX_STRING_FIELD)) {
      return { ok: false, reason: `${key}_invalid` };
    }
  }
  return { ok: true };
}

/**
 * Filter a quoteHistory array. Returns `{ valid, dropped }` — `valid`
 * is the sanitized array safe to persist, `dropped` is a list of
 * `{ index, id, reason }` the caller can log / surface.
 */
export function filterQuoteHistory(arr) {
  if (!Array.isArray(arr)) return { valid: [], dropped: [{ index: -1, reason: 'not_an_array' }] };
  if (arr.length > MAX_QUOTES) {
    return { valid: [], dropped: [{ index: -1, reason: 'too_many_quotes', count: arr.length }] };
  }
  const valid = [];
  const dropped = [];
  for (let i = 0; i < arr.length; i++) {
    const r = validateQuote(arr[i]);
    if (r.ok) valid.push(arr[i]);
    else dropped.push({ index: i, id: arr[i]?.id ?? null, reason: r.reason });
  }
  return { valid, dropped };
}
