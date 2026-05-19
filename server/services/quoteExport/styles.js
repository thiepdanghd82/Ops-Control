// @ts-check
/**
 * Carbon-aligned cell styles for quote export. Colors mirror
 * client/src/styles/tokens.css so xlsx output reads like the in-app UI.
 *
 * ExcelJS expects ARGB hex (8 chars) — alpha first. All constants are
 * pre-padded for cell.style consumption.
 */

export const COLORS = {
  white: 'FFFFFFFF',
  primary: 'FF0F62FE', // Carbon blue 60 — banners
  primarySoft: 'FFD0E2FF', // Carbon blue 20 — banner backdrop
  bodyText: 'FF161616', // Carbon gray 100
  mutedText: 'FF525252', // Carbon gray 70
  border: 'FFE0E0E0', // Carbon gray 20
  fillAlt: 'FFF4F4F4', // Zebra stripe
  good: 'FF24A148', // Carbon green 50 (GM > target)
  warn: 'FFF1C21B', // Carbon yellow 30 (GM in band)
  bad: 'FFDA1E28', // Carbon red 60 (GM below)
  inkAccent: 'FF8A3FFC', // Carbon purple — violet overrides
  banner: 'FF393939', // Carbon gray 80 — section bar
};

/** Thin all-side border in Carbon gray 20. */
export const BORDER_THIN = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } },
};

/** Centered + wrapped — used for cells with multi-line bilingual labels. */
export const ALIGN_HEADER_WRAP = {
  vertical: 'middle',
  horizontal: 'center',
  wrapText: true,
};

/** Style presets — apply via cell.font / cell.fill / cell.border / cell.alignment. */
export const STYLES = {
  // Page banner — first row of each sheet, merged A:F
  banner: {
    font: { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.white } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.banner } },
  },
  // Section sub-header — bold + soft blue strip
  section: {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primarySoft } },
    border: BORDER_THIN,
  },
  // Table column header
  th: {
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.white } },
    alignment: ALIGN_HEADER_WRAP,
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } },
    border: BORDER_THIN,
  },
  // Field label (key column in two-col fact sheets)
  label: {
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 },
    border: BORDER_THIN,
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fillAlt } },
  },
  // Plain body cell
  body: {
    font: { name: 'Calibri', size: 10, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
    border: BORDER_THIN,
  },
  // Numeric body cell — right-align, mono digits via Tabular numbers
  num: {
    font: { name: 'Calibri', size: 10, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'top', horizontal: 'right' },
    border: BORDER_THIN,
    numFmt: '#,##0.00;-#,##0.00;—',
  },
  // KPI cell on Cover sheet — big bold value
  kpi: {
    font: { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: BORDER_THIN,
    numFmt: '#,##0.0000',
  },
  kpiPct: {
    font: { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: BORDER_THIN,
    numFmt: '0.0%;[Red]-0.0%',
  },
  // Body percent — right-aligned, smaller. Cost Breakdown pct-of-total col.
  numPct: {
    font: { name: 'Calibri', size: 10, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'top', horizontal: 'right' },
    border: BORDER_THIN,
    numFmt: '0.0%;-0.0%;—',
  },
  // Cost-per-unit ($) — higher precision than `num` because aggregates
  // routinely sit at sub-cent magnitudes (e.g. $0.00239/unit).
  numCost: {
    font: { name: 'Calibri', size: 10, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'top', horizontal: 'right' },
    border: BORDER_THIN,
    numFmt: '#,##0.00000;-#,##0.00000;—',
  },
  // Subtotal row — bold, slight background tint. Higher precision than
  // body `num` because $/unit aggregates routinely sit below $0.01.
  subtotal: {
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.bodyText } },
    alignment: { vertical: 'middle', horizontal: 'right' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fillAlt } },
    border: BORDER_THIN,
    numFmt: '#,##0.00000;-#,##0.00000;—',
  },
  // Footnote — small muted text below tables
  footnote: {
    font: { name: 'Calibri', size: 9, italic: true, color: { argb: COLORS.mutedText } },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
  },
};

/**
 * Apply a STYLES preset to one cell. ExcelJS doesn't merge font/border
 * patches, so we clone the preset and merge any per-call overrides.
 *
 * @param {import('exceljs').Cell} cell
 * @param {keyof typeof STYLES} preset
 * @param {Partial<import('exceljs').Style>} [overrides]
 */
export function applyStyle(cell, preset, overrides) {
  const base = STYLES[preset];
  if (!base) {
    throw new Error(`Unknown style preset: ${preset}`);
  }
  // Always shallow-clone the preset. ExcelJS mutates `cell.style.numFmt`
  // in place when callers do `cell.numFmt = x` later, so a shared
  // reference would leak the override into every other cell that
  // used the same preset earlier — see __tests__/numFmt.regression.test.js
  cell.style = { ...base, ...(overrides || {}) };
}

/**
 * Apply a STYLES preset to every cell in a row range.
 *
 * @param {import('exceljs').Row} row
 * @param {keyof typeof STYLES} preset
 * @param {number} [from=1]
 * @param {number} [to]
 */
export function styleRow(row, preset, from = 1, to) {
  const last = to ?? row.cellCount;
  for (let c = from; c <= last; c++) {
    applyStyle(row.getCell(c), preset);
  }
}

/**
 * Conditional-format helper for GM%-style cells.
 * @param {import('exceljs').Worksheet} sheet
 * @param {string} ref e.g. 'D5:D5'
 * @param {number} target  e.g. 0.25
 */
export function addGmConditionalFormat(sheet, ref, target = 0.25) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'cellIs',
        operator: 'lessThan',
        formulae: [String(target)],
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.bad } } },
      },
      {
        type: 'cellIs',
        operator: 'between',
        formulae: [String(target), String(target + 0.05)],
        priority: 2,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.warn } } },
      },
      {
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: [String(target + 0.05)],
        priority: 3,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.good } } },
      },
    ],
  });
}
