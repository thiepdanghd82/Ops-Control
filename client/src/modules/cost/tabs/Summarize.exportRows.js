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
