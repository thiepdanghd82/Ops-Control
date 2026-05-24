#!/usr/bin/env node
/**
 * Generates Fallback_Quote_Manual_v1.0.xlsx + Fallback_WorkOrder_Manual_v1.0.xlsx
 * for Rollback Runbook B (operational outage fallback to Excel).
 *
 * Usage: node scripts/build-fallback-templates.mjs
 * Output: docs/cutover/templates/Fallback_*.xlsx
 *
 * Re-run this script if any column/order changes — the xlsx files are
 * the canonical operator templates and SHOULD be committed (small files
 * <10KB each; regenerable but reviewable diffs are useful).
 *
 * Styling note: SheetJS Community Edition (@e965/xlsx) does not write
 * cell styles on save. Headers will be plain text, not bold/filled.
 * Frozen pane + column widths + example row sentinel still work; the
 * import script detects the example row via the "EXAMPLE — DELETE
 * BEFORE USE" sentinel in the Notes column, not via styling.
 */
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../docs/cutover/templates');

// Per Runbook §B.4 — 7 columns
const QUOTE_COLUMNS = [
  { name: 'RFQ-ID', width: 15, example: 'RFQ-2026-S0042' },
  { name: 'Customer', width: 25, example: 'CCL Hai Phong' },
  { name: 'CCL_PN', width: 15, example: 'CCL-12345' },
  { name: 'MOQ', width: 8, example: 1000 },
  { name: 'Quote Date', width: 12, example: '2026-06-09' },
  { name: 'Sales-Rep', width: 15, example: 'Hana' },
  { name: 'Notes', width: 30, example: 'EXAMPLE — DELETE BEFORE USE' },
];

// 10 columns mapped 1:1 with work_order SQL schema (server/db/schema.sql:215)
const WO_COLUMNS = [
  { name: 'WO-ID', width: 15, example: 'WO-2026-001' },
  { name: 'RFQ-ID', width: 15, example: 'RFQ-2026-S0042' },
  { name: 'Customer', width: 25, example: 'CCL Hai Phong' },
  { name: 'CCL_PN', width: 15, example: 'CCL-12345' },
  { name: 'Qty Planned', width: 12, example: 5000 },
  { name: 'UOM', width: 8, example: 'pcs' },
  { name: 'Priority', width: 10, example: 5 },
  { name: 'Due Date', width: 12, example: '2026-06-20' },
  { name: 'Status', width: 14, example: 'CREATED' },
  { name: 'Notes', width: 30, example: 'EXAMPLE — DELETE BEFORE USE' },
];

function buildTemplate(filename, columns) {
  const headers = columns.map((c) => c.name);
  const exampleRow = columns.map((c) => c.example);
  // 98 empty data rows = ~100 row capacity for operator entry; xlsx
  // is sparse so empty rows don't bloat the file.
  const emptyRows = Array.from({ length: 98 }, () => columns.map(() => ''));
  const rows = [headers, exampleRow, ...emptyRows];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = columns.map((c) => ({ wch: c.width }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fallback');

  const outPath = path.join(TEMPLATES_DIR, filename);
  // Use XLSX.write to buffer + fs.writeFileSync — XLSX.writeFile()
  // chokes on paths-with-spaces (this workspace is at "Ops Control v1.2").
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(outPath, buf);
  const bytes = fs.statSync(outPath).size;
  console.log(`  ✓ ${filename}  (${columns.length} cols, ${rows.length} rows, ${bytes} bytes)`);
}

fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
console.log(`Writing fallback templates to ${path.relative(process.cwd(), TEMPLATES_DIR)}/`);
buildTemplate('Fallback_Quote_Manual_v1.0.xlsx', QUOTE_COLUMNS);
buildTemplate('Fallback_WorkOrder_Manual_v1.0.xlsx', WO_COLUMNS);
console.log(
  'Done. Engineer: copy these to \\\\server\\OpsControl\\Fallback\\ as part of D-5 deployment.'
);
