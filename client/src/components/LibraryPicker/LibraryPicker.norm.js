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

export function normNPI(row) {
  // npiDB rows: { name, type, price (DAP), thick, color, supplier, note, date }
  return {
    code: row.name || '',
    ifs_code: '',
    desc: [row.type, row.thick, row.color].filter(Boolean).join(' · ') || row.name || '',
    g_price: Number(row.price) || 0,
    supplier: row.supplier || '',
    extra: row.note || '',
    date: row.date || '', // "Update Date" in the NPI library.
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
  };
}
