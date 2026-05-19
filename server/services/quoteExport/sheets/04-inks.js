// @ts-check
/**
 * Sheet 04 — Inks. Cov Ovr cell carries an Excel comment showing the
 * synced coverage value (or operator override).
 *
 * Coverage table is per-site under quote.state.site → `lib.ddl.coverage`;
 * the engine ships it with the quote when calcAll runs, but the
 * persisted quote stores only ink rows, not the library snapshot. We
 * fall back to a per-row note that reads the operator's override or
 * labels the print_type so the reader can cross-check against the
 * library themselves. Better than silent emptiness.
 */

import { createSheet, freezeTop, hideColumns } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

const INK_COLS = [
  { key: 'label', label: 'common.label', width: 9 },
  { key: 'ifs_code', label: 'mat.ifs_code', width: 12 },
  { key: 'desc', label: 'mat.desc', width: 18 },
  { key: 'print_type', label: 'ink.print_type', width: 14 },
  { key: 'mesh_spec', label: 'ink.mesh_spec', width: 10 },
  { key: 'pitch_mm', label: 'ink.pitch_mm', width: 10, numeric: true },
  { key: 'width', label: 'ink.width', width: 9, numeric: true },
  { key: 'setup_kg', label: 'ink.setup_kg', width: 10, numeric: true },
  { key: 'area_pct', label: 'ink.area_pct', width: 9, numeric: true },
  { key: 'cov_ovr', label: 'ink.cov_ovr', width: 10, numeric: true },
  { key: 'clicks', label: 'ink.clicks', width: 8, numeric: true },
  { key: 'ref_price', label: 'mat.ref_price', width: 11, numeric: true, customerHidden: true },
  { key: 'ink_price', label: 'ink.ink_price', width: 11, numeric: true },
  { key: 'setup_cost', label: 'mat.setup_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'run_cost', label: 'mat.run_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'total', label: 'common.total', width: 12, numeric: true, computedOnly: true },
];

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildInksSheet(wb, ctx) {
  const { quote, variant, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '04 Inks',
    bannerText: L('ink.section', lang),
    orientation: 'landscape',
    bannerSpan: INK_COLS.length,
  });
  INK_COLS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  const state = quote.state || {};
  const result = quote.result || {};
  const isCpx = quote.type === 'complex';

  // For Cpx: render one block per SP, each with its own ink rows.
  // For Std: single inks array at top level.
  const inkGroups =
    isCpx && Array.isArray(state.subproducts) && state.subproducts.length > 0
      ? state.subproducts.map((sp, spi) => ({
          label: `${L('ink.section', lang)} — ${sp.code || `SP${spi + 1}`}`,
          inks: Array.isArray(sp.inks) ? sp.inks : [],
          rowBreakdown: result.subproducts?.[spi]?.rows?.inks ?? null,
        }))
      : [
          {
            label: null,
            inks: Array.isArray(state.inks) ? state.inks : [],
            rowBreakdown: result.rows?.inks ?? null,
          },
        ];

  // Header row
  let r = 3;
  INK_COLS.forEach((c, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = L(c.label, lang);
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 36;
  r += 1;

  for (const group of inkGroups) {
    if (group.label) {
      sheet.mergeCells(`A${r}:P${r}`);
      sheet.getCell(`A${r}`).value = group.label;
      applyStyle(sheet.getCell(`A${r}`), 'section');
      r += 1;
    }
    if (group.inks.length === 0) {
      sheet.mergeCells(`A${r}:P${r}`);
      sheet.getCell(`A${r}`).value = '—';
      applyStyle(sheet.getCell(`A${r}`), 'body');
      r += 1;
      continue;
    }
    for (let i = 0; i < group.inks.length; i++) {
      const ink = group.inks[i];
      if (!ink || ink.hidden) continue;
      const rowCost = Array.isArray(group.rowBreakdown) ? group.rowBreakdown[i] : null;
      INK_COLS.forEach((c, ci) => {
        const cell = sheet.getCell(r, ci + 1);
        cell.value = extractCellValue(c, ink, i, rowCost);
        applyStyle(cell, c.numeric ? (c.computedOnly ? 'numCost' : 'num') : 'body');
        if (c.computedOnly && !rowCost) {
          cell.note = 'Computed at calc time, not persisted (legacy quote — re-save to refresh).';
        }
        if (c.key === 'cov_ovr') {
          cell.note = buildCovNote(ink, lang);
        }
      });
      r += 1;
    }
  }

  // Aggregate subtotal — tier-level total from snapshot aggregates.
  const setupTotal = Number(result.bd_ink_setup);
  const runTotal = Number(result.bd_ink_run);
  if (Number.isFinite(setupTotal) || Number.isFinite(runTotal)) {
    r += 1;
    writeSubtotalRow(sheet, r, INK_COLS, L('common.subtotal', lang), {
      setup_cost: Number.isFinite(setupTotal) ? setupTotal : null,
      run_cost: Number.isFinite(runTotal) ? runTotal : null,
      total:
        (Number.isFinite(setupTotal) ? setupTotal : 0) + (Number.isFinite(runTotal) ? runTotal : 0),
    });
    r += 1;
  }

  // Footnote
  r += 1;
  sheet.mergeCells(`A${r}:P${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = L('common.computed_at_calc', lang);
  applyStyle(note, 'footnote');

  if (variant === 'customer') {
    const letters = INK_COLS.map((c, i) => (c.customerHidden ? letterFor(i + 1) : null)).filter(
      Boolean
    );
    hideColumns(sheet, letters);
  }

  freezeTop(sheet, 1);
}

function extractCellValue(col, ink, idx, rowCost) {
  if (col.computedOnly) {
    if (!rowCost) return '—';
    if (col.key === 'setup_cost') return rowCost.setup_cost ?? '—';
    if (col.key === 'run_cost') return rowCost.run_cost ?? '—';
    if (col.key === 'total') return rowCost.total ?? '—';
    return '—';
  }
  switch (col.key) {
    case 'label':
      return ink.label || `Ink ${idx + 1}`;
    case 'ifs_code':
      return ink.ifs_code || '';
    case 'desc':
      return ink.color || '';
    case 'print_type':
      return ink.print_type || '';
    case 'mesh_spec':
      return ink.mesh_spec || '';
    case 'pitch_mm':
      return numCell(ink.pitch_mm);
    case 'width':
      return numCell(ink.width);
    case 'setup_kg':
      return numCell(ink.setup_kg);
    case 'area_pct':
      return numCell(ink.area_pct);
    case 'cov_ovr':
      return numCell(ink.coverage_override);
    case 'clicks':
      // Indigo subtypes — calcRowBreakdown only attaches clicks when
      // print_type starts with 'Indigo'. Fall back to ink.clicks for
      // legacy quotes (pre-FIX-41) where rowCost is absent.
      if (rowCost && Object.prototype.hasOwnProperty.call(rowCost, 'clicks')) {
        return rowCost.clicks ?? '—';
      }
      return numCell(ink.clicks);
    case 'ref_price':
      return numCell(ink.s_price ?? ink.g_price);
    case 'ink_price':
      return numCell(ink.latest);
    default:
      return '';
  }
}

function buildCovNote(ink, lang) {
  if (ink.coverage_override && Number(ink.coverage_override) > 0) {
    return `Override: ${ink.coverage_override}`;
  }
  if (ink.print_type) {
    return `${L('ink.cov_synced_note', lang)}: ${ink.print_type}`;
  }
  return '';
}

function numCell(v) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : '—';
}

function writeSubtotalRow(sheet, r, cols, label, values) {
  sheet.mergeCells(`A${r}:C${r}`);
  const labelCell = sheet.getCell(`A${r}`);
  labelCell.value = label;
  applyStyle(labelCell, 'subtotal');
  cols.forEach((c, i) => {
    if (i < 3) return;
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

function letterFor(idx) {
  let s = '',
    n = idx;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
