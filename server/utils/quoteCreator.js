/**
 * Who created a quote: the username of the session that first saved it,
 * shown as "Quoted by" in Quote History and Cost Breakdown (2026-10-02).
 *
 * The POST routes stamp `created_by` from the session. It is never taken
 * from a request body and a later save does not change it, so a quote keeps
 * the name of the person who made it — and a copy, being a new quote, takes
 * the name of whoever copied it.
 *
 * Quotes saved before the field existed do not store it. Since 2026-05-26
 * every POST /api/quotes has written a QUOTE_SAVE audit row marked is_new,
 * naming the user, so those quotes take their creator from that row when
 * they are read (`fillCreatedBy`) and nothing is rewritten to give it to
 * them. A quote older than the audit record has no creator to show.
 */

/** A new quote's payload, with the creator set by the server. */
export function withCreator(body, username) {
  return { ...body, created_by: username };
}

/** An update's payload without any creator in the body, so the stored one stays. */
export function withoutCreator(body) {
  const out = { ...body };
  delete out.created_by;
  return out;
}

/**
 * Quotes as read, with `created_by` filled from `creators` (quote id →
 * username) where the quote stores none. A stored value always wins, and a
 * quote with neither comes back as it was.
 *
 * @param {Array<object>} quotes
 * @param {Map<number, string>} creators
 */
export function fillCreatedBy(quotes, creators) {
  if (!creators || creators.size === 0) return quotes;
  return quotes.map((q) => {
    if (!q || q.created_by) return q;
    const who = creators.get(q.id);
    return who ? { ...q, created_by: who } : q;
  });
}
