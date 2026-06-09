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
import { pickStdTierRows, pickCpxTierRows, sumRowCosts, getActiveIdx } from '../tierRows.js';

/** @typedef {{en:string,vi:string}} ColMeta */

// Column order locked to spec §5 Sheet 03. Customer variant hides
// `ref_price` (col K).
const MAT_COLS = [
  { key: 'row_type', label: 'mat.row_type', width: 14 },
  { key: 'ifs_code', label: 'mat.ifs_code', width: 14 },
  { key: 'drw_material', label: 'mat.drw_material', width: 18 },
  { key: 'desc', label: 'mat.quote_materials', width: 22 },
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
 * @param {{ quote: any, tierIdx?: number, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildMaterialsSheet(wb, ctx) {
  const { quote, variant, lang } = ctx;
  const tierIdx = Number.isInteger(ctx.tierIdx) ? ctx.tierIdx : getActiveIdx(quote);
  const activeIdx = getActiveIdx(quote);
  const isActive = tierIdx === activeIdx;
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
  const result = quote.result || {};
  const isCpx = quote.type === 'complex';

  let r = 3;

  // Track per-tier row arrays so we can derive a subtotal that matches
  // the cells actually rendered (the result.bd_mat_* aggregates are
  // active-tier only and would mis-state non-active tiers).
  const renderedMainArrays = [];
  const renderedAltArrays = [];

  if (isCpx && Array.isArray(state.subproducts) && state.subproducts.length > 0) {
    // Complex: one section pair (main + alt) per subproduct.
    state.subproducts.forEach((sp, spi) => {
      const mainRows = pickCpxTierRows(result, spi, tierIdx, 'materials_main');
      const altRows = pickCpxTierRows(result, spi, tierIdx, 'materials_alt');
      const spLabel = `${L('mat.section_main', lang)} — ${sp.code || `SP${spi + 1}`}`;
      r = writeMaterialSection(
        sheet,
        r,
        spLabel,
        sp.materials_main || sp.materials || [],
        lang,
        mainRows
      );
      renderedMainArrays.push(mainRows);
      if (Array.isArray(sp.materials_alt) && sp.materials_alt.length > 0) {
        r += 1;
        r = writeMaterialSection(
          sheet,
          r,
          `${L('mat.section_alt', lang)} — ${sp.code || `SP${spi + 1}`}`,
          sp.materials_alt,
          lang,
          altRows
        );
        renderedAltArrays.push(altRows);
      }
      r += 1;
    });
  } else {
    // Standard: top-level main + alt arrays.
    const main = Array.isArray(state.materials_main) ? state.materials_main : state.materials || [];
    const alt = Array.isArray(state.materials_alt) ? state.materials_alt : [];
    const mainRows = pickStdTierRows(result, tierIdx, 'materials_main');
    r = writeMaterialSection(sheet, r, L('mat.section_main', lang), main, lang, mainRows);
    renderedMainArrays.push(mainRows);
    if (alt.length > 0) {
      const altRows = pickStdTierRows(result, tierIdx, 'materials_alt');
      r += 1;
      r = writeMaterialSection(sheet, r, L('mat.section_alt', lang), alt, lang, altRows);
      renderedAltArrays.push(altRows);
    }
  }

  // Subtotal row. For the active tier we keep the legacy behaviour —
  // `result.bd_mat_*` is the rounding-free tier-level aggregate. For
  // non-active tiers those aggregates are stale, so we derive setup/run
  // from the rendered row arrays (matches the cells above).
  let setupTotal;
  let runTotal;
  if (isActive) {
    const setup = Number(result.bd_mat_setup);
    const run = Number(result.bd_mat_run);
    setupTotal = Number.isFinite(setup) ? setup : null;
    runTotal = Number.isFinite(run) ? run : null;
  } else {
    const combined = [...renderedMainArrays, ...renderedAltArrays]
      .filter((arr) => Array.isArray(arr))
      .reduce(
        (acc, arr) => {
          const t = sumRowCosts(arr);
          acc.setup += t.setup;
          acc.run += t.run;
          acc.any = acc.any || t.hasAny;
          return acc;
        },
        { setup: 0, run: 0, any: false }
      );
    setupTotal = combined.any ? combined.setup : null;
    runTotal = combined.any ? combined.run : null;
  }
  if (setupTotal != null || runTotal != null) {
    r += 1;
    writeSubtotalRow(sheet, r, MAT_COLS, L('common.subtotal', lang), {
      setup_cost: setupTotal,
      run_cost: runTotal,
      total: (setupTotal ?? 0) + (runTotal ?? 0),
    });
    r += 1;
  }

  // Footnote
  r += 1;
  sheet.mergeCells(`A${r}:Q${r}`);
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

function writeMaterialSection(sheet, startRow, title, rows, lang, rowBreakdown) {
  let r = startRow;

  // Section banner
  sheet.mergeCells(`A${r}:Q${r}`);
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
    sheet.mergeCells(`A${r}:Q${r}`);
    sheet.getCell(`A${r}`).value = '—';
    applyStyle(sheet.getCell(`A${r}`), 'body');
    return r + 1;
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const mat = rows[ri];
    if (!mat || mat.hidden) continue;
    const rowCost = Array.isArray(rowBreakdown) ? rowBreakdown[ri] : null;
    MAT_COLS.forEach((c, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.value = extractCellValue(c, mat, rowCost);
      // Computed cells use 5-decimal precision when hydrated; em-dash
      // when no rowCost (legacy quote).
      applyStyle(cell, c.numeric ? (c.computedOnly ? 'numCost' : 'num') : 'body');
      if (c.computedOnly && !rowCost) {
        cell.note = 'Computed at calc time, not persisted (legacy quote — re-save to refresh).';
      }
    });
    r += 1;
  }

  return r;
}

function extractCellValue(col, mat, rowCost) {
  if (col.computedOnly) {
    if (!rowCost) return '—';
    if (col.key === 'setup_cost') return rowCost.setup_cost ?? '—';
    if (col.key === 'run_cost') return rowCost.run_cost ?? '—';
    if (col.key === 'total') return rowCost.total ?? '—';
    return '—';
  }
  switch (col.key) {
    case 'row_type':
      return mat.row_type || 'Main.Mat';
    case 'ifs_code':
      return mat.ifs_code || mat.code || '';
    case 'drw_material':
      return mat.drw_material || '';
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

function writeSubtotalRow(sheet, r, cols, label, values) {
  // Label spans the first 4 non-numeric cols (row_type, ifs_code,
  // drw_material, quote_materials/desc), then aggregate values land in
  // their matching columns (setup_cost / run_cost / total).
  sheet.mergeCells(`A${r}:D${r}`);
  const labelCell = sheet.getCell(`A${r}`);
  labelCell.value = label;
  applyStyle(labelCell, 'subtotal');
  cols.forEach((c, i) => {
    if (i < 4) return; // skipped, merged into label
    const cell = sheet.getCell(r, i + 1);
    if (Object.prototype.hasOwnProperty.call(values, c.key)) {
      const v = values[c.key];
      cell.value = v == null ? '—' : v;
    } else {
      cell.value = '';
    }
    applyStyle(cell, 'subtotal');
  });
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
