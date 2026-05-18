// @ts-check
/**
 * Sheet 03 — Materials. Main + Alt sections (stacked).
 *
 * Sprint S-ALT-MAT shape: state.materials_main + state.materials_alt
 * (arrays); state.materials_active is informational. Per spec we render
 * BOTH sets if Alt is non-empty, regardless of which is active.
 *
 * Per-row Setup/Run/Total cells are NOT computed here (no calcEngine on
 * server). Cells show '—' with a comment pointing to the snapshot's
 * aggregate row + a footnote on the sheet.
 */

import { createSheet, freezeTop, hideColumns } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/** @typedef {{en:string,vi:string}} ColMeta */

// Column order locked to spec §5 Sheet 03. Customer variant hides
// `ref_price` (col K).
const MAT_COLS = [
  { key: 'row_type', label: 'mat.row_type', width: 14 },
  { key: 'ifs_code', label: 'mat.ifs_code', width: 14 },
  { key: 'desc', label: 'mat.desc', width: 22 },
  { key: 'usage', label: 'mat.usage', width: 8, numeric: true },
  { key: 'setup_lm', label: 'mat.setup_lm', width: 10, numeric: true },
  { key: 'pitch', label: 'mat.pitch', width: 10, numeric: true },
  { key: 'width', label: 'mat.width', width: 9, numeric: true },
  { key: 'cav', label: 'mat.cav', width: 8, numeric: true },
  { key: 'offcut', label: 'mat.offcut', width: 8 },
  { key: 'offcut_pct', label: 'mat.offcut_pct', width: 10, numeric: true },
  { key: 'slit', label: 'mat.slit', width: 8 },
  { key: 'ref_price', label: 'mat.ref_price', width: 11, numeric: true, customerHidden: true },
  { key: 'mat_price', label: 'mat.mat_price', width: 11, numeric: true },
  { key: 'setup_cost', label: 'mat.setup_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'run_cost', label: 'mat.run_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'total', label: 'common.total', width: 12, numeric: true, computedOnly: true },
];

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildMaterialsSheet(wb, ctx) {
  const { quote, variant, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '03 Materials',
    bannerText: L('mat.section_main', lang),
    orientation: 'landscape',
    bannerSpan: MAT_COLS.length,
  });

  MAT_COLS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  const state = quote.state || {};
  const main = Array.isArray(state.materials_main) ? state.materials_main : state.materials || [];
  const alt = Array.isArray(state.materials_alt) ? state.materials_alt : [];

  let r = 3;
  r = writeMaterialSection(sheet, r, L('mat.section_main', lang), main, lang);

  if (alt.length > 0) {
    r += 1;
    r = writeMaterialSection(sheet, r, L('mat.section_alt', lang), alt, lang);
  }

  // Footnote
  r += 1;
  sheet.mergeCells(`A${r}:P${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = L('common.computed_at_calc', lang);
  applyStyle(note, 'footnote');
  sheet.getRow(r).height = 24;

  // Hide customer-restricted cols
  if (variant === 'customer') {
    const letters = MAT_COLS.map((c, i) => (c.customerHidden ? colLetter(i + 1) : null)).filter(
      Boolean
    );
    hideColumns(sheet, letters);
  }

  freezeTop(sheet, 1);
}

function writeMaterialSection(sheet, startRow, title, rows, lang) {
  let r = startRow;

  // Section banner
  sheet.mergeCells(`A${r}:P${r}`);
  sheet.getCell(`A${r}`).value = title;
  applyStyle(sheet.getCell(`A${r}`), 'section');
  r += 1;

  // Header row
  MAT_COLS.forEach((c, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = L(c.label, lang);
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 36;
  r += 1;

  // Body rows
  if (rows.length === 0) {
    sheet.mergeCells(`A${r}:P${r}`);
    sheet.getCell(`A${r}`).value = '—';
    applyStyle(sheet.getCell(`A${r}`), 'body');
    return r + 1;
  }

  for (const mat of rows) {
    if (!mat || mat.hidden) continue;
    MAT_COLS.forEach((c, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.value = extractCellValue(c, mat);
      applyStyle(cell, c.numeric ? 'num' : 'body');
      if (c.computedOnly) {
        cell.note = 'Computed at calc time, not persisted.';
      }
    });
    r += 1;
  }

  return r;
}

function extractCellValue(col, mat) {
  if (col.computedOnly) return '—';
  switch (col.key) {
    case 'row_type':
      return mat.row_type || 'Main.Mat';
    case 'ifs_code':
      return mat.ifs_code || mat.code || '';
    case 'desc':
      return mat.desc || mat.code || '';
    case 'usage':
      return numCell(mat.usage);
    case 'setup_lm':
      return numCell(mat.setup_lm);
    case 'pitch':
      return numCell(mat.pitch_ovr);
    case 'width':
      return numCell(mat.width);
    case 'cav':
      return numCell(mat.cavities);
    case 'offcut':
      return mat.offcut_yn ?? '';
    case 'offcut_pct':
      return numCell(mat.offcut_pct);
    case 'slit':
      return mat.slitting_yn ?? '';
    case 'ref_price':
      return numCell(mat.s_price ?? mat.g_price);
    case 'mat_price':
      return numCell(mat.latest);
    default:
      return '';
  }
}

function numCell(v) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : '—';
}

function colLetter(idx) {
  // 1 → A, 26 → Z, 27 → AA. We only need up to ~22.
  if (idx < 1) return 'A';
  let s = '';
  let n = idx;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Export for tests
export const _internal = { MAT_COLS, colLetter };
