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
    { key: 'date', labelKey: 'picker.col.date', w: 110 },
    { key: 'code', labelKey: 'picker.col.code', w: 170, mono: true },
    { key: 'type', labelKey: 'matlib.type_desc', w: 190 },
    { key: 'thick', labelKey: 'matlib.thickness', w: 80, num: true },
    { key: 'color', labelKey: 'matlib.color', w: 95 },
    { key: 'surface', labelKey: 'matlib.surface', w: 95 },
    { key: 'adhesive', labelKey: 'matlib.adhesive', w: 95 },
    { key: 'moq', labelKey: 'matlib.moq', w: 85, num: true },
    { key: 'lt', labelKey: 'matlib.lead_time', w: 90, num: true },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 140 },
    { key: 'price', labelKey: 'picker.col.price', w: 95, num: true },
    { key: 'note', labelKey: 'matlib.notes_remarks', w: 220 },
  ],
  sourcing: [
    { key: 'date', labelKey: 'picker.col.date', w: 110 },
    { key: 'material', labelKey: 'picker.col.code', w: 190, mono: true },
    { key: 'size', labelKey: 'matlib.size_spec', w: 160 },
    { key: 'exw', labelKey: 'matlib.exw_price', w: 100, num: true },
    { key: 'dap', labelKey: 'matlib.dap_price', w: 100, num: true },
    { key: 'moq', labelKey: 'matlib.moq', w: 85, num: true },
    { key: 'lt', labelKey: 'matlib.lead_time', w: 90, num: true },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 140 },
    { key: 'status', labelKey: 'matlib.status_remark', w: 180 },
  ],
  ifs: [
    { key: 'code', labelKey: 'picker.col.code', w: 170, mono: true },
    { key: 'desc', labelKey: 'picker.col.desc', w: 280 },
    { key: 'supplier', labelKey: 'picker.col.supplier', w: 160 },
    { key: 'uom', labelKey: 'matlib.price_uom', w: 100 },
    { key: 'price', labelKey: 'picker.col.price', w: 110, num: true },
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
