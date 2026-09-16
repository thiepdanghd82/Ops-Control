// @ts-check
/**
 * LibraryPicker normalizers — pure, framework-free so node:test can import
 * them without a JSX/CSS loader (the component file cannot be imported by
 * the vanilla test runner). Same helper-in-.js pattern as the rest of the
 * cost module.
 *
 * Each function takes a raw row from a library and returns the shared
 * picker row shape:
 *   { code, ifs_code, desc, g_price, supplier, extra, date }
 * where `date` feeds the picker table's DATE column (ahead of CODE):
 *   NPI → row.date ("Update Date") · Sourcing → row.month (Req.Date) ·
 *   IFS → '' (no date).
 * The `extra` string appears as a muted suffix on the DESCRIPTION column.
 */

// Display coercion: a missing field must render as an empty cell, never
// "undefined". 0 and false are real values and survive.
function blank(v) {
  return v === undefined || v === null ? '' : v;
}

export function normNPI(row) {
  // npiDB rows carry all 12 NPI_DATASET canonical headers:
  // { date, name, price, type, thick, color, surface, adhesive, moq, lt,
  //   supplier, note }.
  return {
    code: row.name || '',
    ifs_code: '',
    desc: [row.type, row.thick, row.color].filter(Boolean).join(' · ') || row.name || '',
    g_price: Number(row.price) || 0,
    // Raw, uncoerced — the consumer converts VND with the quote's own rate and
    // needs to tell "no price" from "$0". `g_price` above stays numeric for
    // every existing caller.
    price_raw: row.price,
    currency: row.currency,
    supplier: row.supplier || '',
    extra: row.note || '',
    date: row.date || '', // "Update Date" in the NPI library.
    // Display-only — the picker table shows the same columns the NPI
    // Materials screen does. `desc`/`g_price` above stay the pick-shape.
    type: blank(row.type),
    thick: blank(row.thick),
    color: blank(row.color),
    surface: blank(row.surface),
    adhesive: blank(row.adhesive),
    moq: blank(row.moq),
    lt: blank(row.lt),
    note: blank(row.note),
    price: Number(row.price) || 0,
  };
}

export function normSourcing(row) {
  // sourcingDB rows: { material, size, exw, dap, moq, lt, supplier, status, month }
  return {
    code: row.material || '',
    ifs_code: '',
    desc: [row.material, row.size].filter(Boolean).join(' · '),
    // Prefer DAP price (landed) — same cost basis as NPI. exw fallback.
    g_price: Number(row.dap) || Number(row.exw) || 0,
    supplier: row.supplier || '',
    extra: row.status || '',
    date: row.month || '', // Sourcing DB's Req.Date field.
    // Display-only, mirroring the Sourcing DB screen.
    material: blank(row.material),
    size: blank(row.size),
    exw: blank(row.exw),
    dap: blank(row.dap),
    moq: blank(row.moq),
    lt: blank(row.lt),
    status: blank(row.status),
    req: blank(row.req),
    cust: blank(row.cust),
    price: Number(row.dap) || Number(row.exw) || 0,
  };
}

export function normIfsMaterial(row) {
  // IFS Materials (Material Cost) canonical rows: { part_no, desc,
  // supplier_id, supplier, conv, price, currency, uom, ... }. Tolerates
  // the legacy IFS-Inventory Title-Case keys for any in-flight cache.
  const partNo = row.part_no || row['Part No'] || '';
  return {
    code: partNo,
    ifs_code: partNo, // For IFS materials the Part No IS the IFS code.
    desc: row.desc || row['Part Description'] || '',
    g_price: Number(row.price ?? row.Price) || 0,
    supplier: row.supplier || row.supplier_id || row['Supplier ID'] || '',
    extra: row.uom || row['Price Unit Measure'] || '',
    date: '', // IFS materials have no date — renders as —.
    // Display-only.
    uom: blank(row.uom || row['Price Unit Measure']),
    currency: blank(row.currency || row.Currency),
    conv: blank(row.conv),
    price: Number(row.price ?? row.Price) || 0,
  };
}

// ── Picker table columns, per library ────────────────────────────────
// Until 2026-09-14 the picker rendered a fixed 5 columns for every
// library while NPI carries 12, so an operator choosing a material could
// not see thickness, surface, adhesive, MOQ or lead time — exactly the
// fields they pick between. Each column's `key` must exist on the rows
// that library's normalizer returns (pinned by a test).
//
// `w` is the DEFAULT width in px; the operator can drag a header edge and
// the picker remembers the result per library.
export const PICKER_COLUMNS = {
  npi: [
    { key: 'date', labelKey: 'picker.col.date', w: 110, prio: 2 },
    { key: 'code', labelKey: 'picker.col.code', w: 170, mono: true, prio: 1 },
    { key: 'type', labelKey: 'matlib.type_desc', w: 190, prio: 2 },
    { key: 'thick', labelKey: 'matlib.thickness', w: 80, num: true, prio: 2 },
    { key: 'color', labelKey: 'matlib.color', w: 95, prio: 3 },
    { key: 'surface', labelKey: 'matlib.surface', w: 95, prio: 3 },
    { key: 'adhesive', labelKey: 'matlib.adhesive', w: 95, prio: 3 },
    { key: 'moq', labelKey: 'matlib.moq', w: 85, num: true, prio: 2 },
    { key: 'lt', labelKey: 'matlib.lead_time', w: 90, num: true, prio: 2 },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 140, prio: 2 },
    { key: 'price', labelKey: 'picker.col.price', w: 95, num: true, prio: 1 },
    { key: 'note', labelKey: 'matlib.notes_remarks', w: 220, prio: 3 },
  ],
  sourcing: [
    { key: 'date', labelKey: 'picker.col.date', w: 110, prio: 2 },
    { key: 'material', labelKey: 'picker.col.code', w: 190, mono: true, prio: 1 },
    { key: 'size', labelKey: 'matlib.size_spec', w: 160, prio: 2 },
    { key: 'exw', labelKey: 'matlib.exw_price', w: 100, num: true, prio: 3 },
    { key: 'dap', labelKey: 'matlib.dap_price', w: 100, num: true, prio: 1 },
    { key: 'moq', labelKey: 'matlib.moq', w: 85, num: true, prio: 2 },
    { key: 'lt', labelKey: 'matlib.lead_time', w: 90, num: true, prio: 2 },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 140, prio: 2 },
    { key: 'status', labelKey: 'matlib.status_remark', w: 180, prio: 3 },
  ],
  ifs: [
    { key: 'code', labelKey: 'picker.col.code', w: 170, mono: true, prio: 1 },
    { key: 'desc', labelKey: 'picker.col.desc', w: 280, prio: 2 },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 160, prio: 2 },
    { key: 'uom', labelKey: 'matlib.price_uom', w: 100, prio: 3 },
    { key: 'price', labelKey: 'picker.col.price', w: 110, num: true, prio: 1 },
  ],
};

export const COL_MIN_W = 60;
export const COL_MAX_W = 600;

/** Keep a dragged column between usable bounds; bad input → `fallback`. */
export function clampColWidth(px, fallback = COL_MIN_W) {
  // null / undefined / '' mean "nothing stored", not "zero pixels" —
  // Number(null) is 0, which would silently clamp to the floor.
  if (px === null || px === undefined || px === '') return fallback;
  const n = Number(px);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(COL_MAX_W, Math.max(COL_MIN_W, Math.round(n)));
}

/**
 * Column widths as percentages of the table, so the picker always fits its
 * card and never forces a long horizontal scroll.
 *
 * `w` on each column is a RELATIVE weight (the px defaults read naturally
 * as one), and `widths` holds whatever the operator dragged. Dragging a
 * column wider therefore takes space from the others rather than growing
 * the table — the behaviour you want when the point is comparing a whole
 * row at a glance. Stale keys for columns a later release removed are
 * ignored, and the result always totals 100%.
 */
export function colWidthPercents(columns, widths = {}) {
  const cols = Array.isArray(columns) ? columns : [];
  if (cols.length === 0) return {};
  const weights = cols.map((c) => clampColWidth(widths?.[c.key], c.w));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out = {};
  let used = 0;
  cols.forEach((c, i) => {
    if (i === cols.length - 1) {
      // Last column absorbs the rounding so the row totals exactly 100%.
      out[c.key] = `${Math.round((100 - used) * 100) / 100}%`;
      return;
    }
    const pct = Math.round((weights[i] / total) * 10000) / 100;
    used += pct;
    out[c.key] = `${pct}%`;
  });
  return out;
}

// Breakpoints for the picker card, not the viewport — the modal is
// resizable and maximizable, so what matters is the card's own width.
export const NARROW_PX = 900;
export const VERY_NARROW_PX = 640;

/**
 * The columns that actually render, given the card width and whatever the
 * operator hid by hand.
 *
 * Twelve columns wrap into unreadable slivers on a narrow card, so the
 * `prio: 3` (nice-to-have) columns drop first and `prio: 2` next; `prio: 1`
 * — the code and the price — always survive. Header, body and colgroup all
 * read this one list, so they cannot disagree about the column set.
 */
export function visibleColumns(columns, { hidden, width } = {}) {
  const all = Array.isArray(columns) ? columns : [];
  if (all.length === 0) return [];
  const hide = new Set(Array.isArray(hidden) ? hidden : []);
  let cols = all.filter((c) => !hide.has(c.key));
  const w = Number(width);
  if (Number.isFinite(w)) {
    const maxPrio = w < VERY_NARROW_PX ? 1 : w < NARROW_PX ? 2 : 3;
    cols = cols.filter((c) => (c.prio || 1) <= maxPrio);
  }
  // Never render an empty table — fall back to the first declared column.
  return cols.length > 0 ? cols : all.slice(0, 1);
}
