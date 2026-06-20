/**
 * Pure column-shape constants for Summarize (Cost Breakdown sidebar).
 *
 * Lives in `.js` so node:test can pin the SUMMARIZE_COLUMNS contract
 * without pulling the React-heavy Summarize.jsx (which carries JSX
 * `render:` cell renderers for materials/lead-time/snapshot columns).
 *
 * Same split pattern as `QuoteHistory.columns.js` ↔ `QuoteHistory.jsx`.
 * The full SUMMARIZE_COLUMNS array (with renders) still lives in
 * Summarize.jsx; THIS module exports the read-only shape pieces that
 * a regression test can lock down without booting React.
 *
 * Sprint B3b / A3-03 (2026-06-19).
 */

/**
 * Column-key order. Drives BOTH the visible <thead>/<tbody> render
 * AND the ColumnsToggle popover order. Pinning this list lets the
 * regression test catch silent column-add / -reorder drift.
 *
 * Phase 2 (Sprint S-PRICING-COMBINED-P2) retired the standalone
 * Materials / Inks / Processes sub-tabs but DID NOT remove any
 * column from this table — Summarize aggregates across all of them.
 *
 * Sprint S-SUMMARIZE-DATE-COL (#164, 2026-06-18) added 'update_date'
 * (label 'DATE') between 'row_idx' and 'rfq_no'.
 *
 * Sprint S-SUMMARIZE-EAU-COL (2026-06-19) added 'annual_qty' (label
 * 'EAU') between 'quote_materials' and 'moq' so operators see "per
 * year vs per shipment" volumes side by side. Source `r.annual_qty`
 * was already in the row builder; this is a UI gap closure.
 */
export const SUMMARIZE_COLUMN_KEYS = [
  'row_idx',
  'update_date',
  'rfq_no',
  'sale_owner',
  'direct_cu',
  'project',
  'project_name',
  'end_cu_pn',
  'description',
  'production_size',
  'drw_materials',
  'quote_materials',
  'annual_qty',
  'moq',
  'yield_pct',
  's_mat_cost',
  'overhead',
  'labor_cost',
  'tooling',
  'pack_ship',
  'g_ttl_cost',
  'target',
  'usd_price',
  'vnd_price',
  'tooling_cost_usd',
  'material_lt',
  'sample_lt',
  'po_lt',
  'remark',
  'process',
  'type_of_material',
  'va_pct',
  'contr_pct',
  'gm_pct',
  'trade_mode',
  'npi_owner',
  'snapshot_status',
];

/**
 * Required (always-visible) columns — can't be hidden via ColumnsToggle.
 * row_idx + update_date + rfq_no are the anchor identity triad after
 * Sprint S-SUMMARIZE-DATE-COL (#164) flagged 'update_date' as required.
 */
export const SUMMARIZE_REQUIRED_KEYS = new Set(['row_idx', 'update_date', 'rfq_no']);

/**
 * Default-hidden columns — operator can re-show via the popover.
 * Henry's Phase-Q6 confirm: respect-visibility in CSV (NOT force-
 * included), so hiding these keeps the export lean too.
 */
export const SUMMARIZE_DEFAULT_HIDDEN_KEYS = [
  'material_lt',
  'sample_lt',
  'po_lt',
  'remark',
  'process',
  'type_of_material',
  'snapshot_status',
];

/**
 * CSV builder always prepends these audit-prefix keys regardless of
 * column-toggle state. Operator workflows (audit cross-ref Quote
 * History, multi-tier MOQ diff, timestamp forensic) rely on these.
 *
 * Sprint S-SUMMARIZE-DATE-COL (#164): with 'update_date' now also in
 * SUMMARIZE_COLUMN_KEYS, the CSV builder dedupes via a `seen` Set so
 * the prefix slot wins (raw ISO value) and the header label flips to
 * the friendly 'DATE' via `colByKey.get(k).label` lookup.
 */
export const CSV_ALWAYS_INCLUDE_KEYS = ['quote_id', 'tier', 'update_date', 'type', 'sale_owner'];

export const SUMMARIZE_COLUMNS_STORAGE_KEY = 'ops-cost-summarize-cols';
