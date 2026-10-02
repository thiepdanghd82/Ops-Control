/**
 * "Quoted by": the username of whoever created the quote.
 *
 * The server stamps it on the quote row when the quote is first saved
 * (2026-10-02) and fills it, for older quotes, from the audit record of their
 * creation — kept since 2026-05-26, so anything older has none. It is not in
 * the quote's state, which a copy carries over: a copy is a new quote, made
 * by whoever copied it. Quote History and Cost Breakdown both read it here.
 *
 * @param {object|null|undefined} quote a row as GET /shared/quotes returns it
 * @returns {string} the username, or '' when no creator is known
 */
export function quotedBy(quote) {
  return (quote && quote.created_by) || '';
}
