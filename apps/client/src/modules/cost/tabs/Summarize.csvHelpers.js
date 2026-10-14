/**
 * Summarize CSV cell formatter — apply a column's `fmt` function (if
 * present) so CSV export values match the on-screen UI rendering.
 *
 * Sprint MES-3-FIX-60 (2026-06-19). Before this helper, the CSV
 * builder iterated `cols` as bare keys and read `r[c]` raw — bypassing
 * the per-column `fmt: (v) => fmtN(v)` / `fmt: (v) => pct(v)` /
 * `fmt: (v) => fmtVnd(v)` formatters that the on-screen table uses.
 * Operators opening summarize_*.csv saw raw floats
 * `0.13627072986281700` instead of UI-formatted `0.13627`, and raw
 * fractions `0.241034350685914` instead of `24.1%`.
 *
 * Contract:
 *   - If `colDef.fmt` is a function → return `colDef.fmt(value)`
 *     (pct → 'NN.N%', fmtN → 'N.NNNNN', fmtUsd / fmtVnd → locale-
 *     formatted; all return '—' for null/zero/NaN per format.js).
 *   - Otherwise return `value` unchanged. Raw stays raw for:
 *       (a) audit-prefix fields (quote_id / tier / type / sale_owner)
 *           that have no SUMMARIZE_COLUMNS entry, OR
 *       (b) columns with `render` but no `fmt` (drw_materials /
 *           quote_materials / remark / process / type_of_material /
 *           update_date — each renders JSX in the UI; we DO NOT call
 *           render in the CSV path because JSX is not serializable),
 *           OR
 *       (c) plain text columns (rfq_no / direct_cu / project /
 *           project_name / end_cu_pn / description / production_size /
 *           trade_mode / npi_owner) that ship as-is.
 *
 * Render is intentionally NOT invoked — render returns React JSX
 * (e.g. `<MultilineCell value={r.drw_materials} />`) which would
 * serialize as '[object Object]' in CSV. The row builder already
 * pre-formats those fields as plain bullet strings (`'- foo\n- bar'`)
 * so emitting `r[key]` raw gives the correct text content.
 */
export function formatCsvCell(value, colDef) {
  if (colDef && typeof colDef.fmt === 'function') return colDef.fmt(value);
  return value;
}

/**
 * Apply formatters to every cell of every row, returning a new array
 * of {key → formatted-value} objects suitable for `buildCsv`. Keeps
 * the existing key-based shape so `buildCsv(rows, cols, opts)`
 * (which reads `r[col]`) doesn't need to know about formatters.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} cols                   the keys to emit (already
 *                                          deduped / csvExclude-filtered)
 * @param {Map<string, { fmt?: Function }>} colByKey
 *                                          column-definition lookup
 * @returns {Array<Record<string, unknown>>}
 */
export function formatCsvRows(rows, cols, colByKey) {
  return rows.map((r) => {
    const out = {};
    for (const k of cols) {
      out[k] = formatCsvCell(r?.[k], colByKey.get(k));
    }
    return out;
  });
}
