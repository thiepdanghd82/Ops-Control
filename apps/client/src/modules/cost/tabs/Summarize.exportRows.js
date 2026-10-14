// @ts-check
/**
 * Which Summarize rows a CSV export writes.
 *
 * Summarize flattens each saved quote into one row per MOQ tier. Selecting
 * a row therefore selects ONE tier, and the export wrote only that tier —
 * an operator asking for "the RFQ" got a single MOQ and had to repeat the
 * export per tier, then stitch the files.
 *
 * Selecting any tier of a quote now exports every tier of that quote, in
 * tier order, one row each in the same file and the same sheet. Rows the
 * current filter hides are still excluded: the export never writes
 * something the operator cannot see on screen.
 */

/**
 * @param {Array<{id: string, quote_id?: unknown, tier?: unknown}>} visibleRows
 *   the rows currently shown, already sorted+filtered
 * @param {Set<string>|Array<string>} selectedIds row ids the operator ticked
 * @returns {Array<object>} rows to write, in the on-screen order
 */
export function rowsForExport(visibleRows, selectedIds) {
  const rows = Array.isArray(visibleRows) ? visibleRows : [];
  if (rows.length === 0) return [];
  const picked = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (picked.size === 0) return rows.slice();

  // Every quote with at least one tier ticked.
  const quotes = new Set();
  for (const r of rows) {
    if (r && picked.has(r.id)) quotes.add(quoteKeyOf(r));
  }
  if (quotes.size === 0) return rows.slice();
  return rows.filter((r) => r && quotes.has(quoteKeyOf(r)));
}

/**
 * Tick or un-tick a row — and with it every other tier of the same quote.
 *
 * `rowsForExport` has always expanded a ticked tier to the whole quote
 * (#317), so a per-row checkbox told the operator something the file did not
 * do: tick one tier of a 2-tier quote and five ticks became seven exported
 * rows, with two of them sitting un-ticked in the middle of the selection.
 * Ticking the quote makes that rule visible in the checkboxes instead of
 * hidden in the export, and the counter finally equals the row count of the
 * file.
 *
 * Works off ALL rows, not the visible ones, so a tier currently hidden by the
 * search box is ticked too — otherwise clearing the filter would reveal an
 * un-ticked sibling of a quote the operator believes is fully selected.
 *
 * @param {Array<object>} allRows every row, pre-filter
 * @param {Set<string>} selectedIds current selection
 * @param {string} rowId the row whose checkbox was clicked
 * @returns {Set<string>} the new selection
 */
export function toggleQuoteSelection(allRows, selectedIds, rowId) {
  const rows = Array.isArray(allRows) ? allRows : [];
  const next = new Set(selectedIds instanceof Set ? selectedIds : selectedIds || []);
  const clicked = rows.find((r) => r && r.id === rowId);
  // A row we cannot resolve to a quote still toggles itself — never a no-op
  // checkbox.
  if (!clicked) {
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    return next;
  }
  const key = quoteKeyOf(clicked);
  const siblings = rows.filter((r) => r && quoteKeyOf(r) === key).map((r) => r.id);
  const turningOff = next.has(rowId);
  for (const id of siblings) {
    if (turningOff) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * Keep ticked rows on screen even when the current search excludes them.
 *
 * An operator builds an export by searching for one RFQ, ticking it,
 * searching for the next, ticking that — so the previous picks must survive
 * the next search or there is no way to see the basket being assembled. They
 * used to vanish, leaving the header reading "NO ROWS SELECTED" over a table
 * whose selection was still very much alive in memory.
 *
 * Pinned rows are prepended; `orderBySelection` then puts every ticked quote
 * in tick order, so the caller composes the two.
 *
 * @param {Array<object>} allRows every row, pre-filter
 * @param {Array<object>} visibleRows the rows the current filter kept
 * @param {Set<string>|Array<string>} selectedIds
 * @returns {Array<object>} visible rows plus any ticked row the filter dropped
 */
export function pinSelected(allRows, visibleRows, selectedIds) {
  const visible = Array.isArray(visibleRows) ? visibleRows : [];
  const picked = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (picked.size === 0) return visible;
  const shown = new Set(visible.map((r) => r && r.id));
  const missing = (Array.isArray(allRows) ? allRows : []).filter(
    (r) => r && picked.has(r.id) && !shown.has(r.id)
  );
  return missing.length === 0 ? visible : [...missing, ...visible];
}

/**
 * Float the quotes the operator ticked to the top of the table, in the order
 * they were ticked.
 *
 * Selecting is how an operator builds an export, and the table runs to 138
 * rows — so a tick three screens down is invisible and there is no way to
 * check the set is right before writing the file. The counter says "3 rows
 * selected" while only two are on screen.
 *
 * Grouped by QUOTE, not by row, because `rowsForExport` above already
 * expands a ticked tier to every tier of its quote. Floating the single
 * ticked row would show the operator two of a quote's three tiers at the
 * top and the third somewhere below, while the file gets all three — the
 * screen would be lying about what is being exported.
 *
 * Selection order comes from the Set's own iteration order, so un-ticking
 * and re-ticking moves a quote to the END of the queue. That is the
 * behaviour the operator sees: the newest pick joins the back.
 *
 * Rows whose quote was not ticked keep the order they arrived in, and an
 * empty selection returns the SAME array reference — no selection, no
 * reshuffle, no re-render.
 *
 * @param {Array<{id: string, quote_id?: unknown, tier?: unknown}>} visibleRows
 * @param {Set<string>|Array<string>} selectedIds
 * @returns {Array<object>}
 */
export function orderBySelection(visibleRows, selectedIds) {
  const rows = Array.isArray(visibleRows) ? visibleRows : [];
  const picked = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  if (rows.length === 0 || picked.size === 0) return rows;

  // Quote keys in the order their first row was ticked. A ticked id that is
  // not on screen (hidden by the filter) names no visible quote and is
  // skipped — it cannot float what is not there.
  const byId = new Map();
  for (const r of rows) if (r && r.id != null) byId.set(r.id, r);
  const order = [];
  const seen = new Set();
  for (const id of picked) {
    const row = byId.get(id);
    if (!row) continue;
    const key = quoteKeyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  if (order.length === 0) return rows;

  const rank = new Map(order.map((key, i) => [key, i]));
  const top = order.map(() => []);
  const rest = [];
  for (const r of rows) {
    const i = r ? rank.get(quoteKeyOf(r)) : undefined;
    if (i === undefined) rest.push(r);
    else top[i].push(r);
  }
  return [...top.flat(), ...rest];
}

/**
 * The quote a row belongs to. `quote_id` is the real key; the fallback
 * strips the "-<tier>" suffix from the row id for any row shape that
 * predates the quote_id field.
 */
export function quoteKeyOf(row) {
  if (row && row.quote_id !== undefined && row.quote_id !== null && row.quote_id !== '') {
    return `q:${row.quote_id}`;
  }
  const id = row && row.id != null ? String(row.id) : '';
  return `id:${id.replace(/-\d+$/, '')}`;
}
