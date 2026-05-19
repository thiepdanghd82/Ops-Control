// @ts-check
/**
 * Workbook scaffold + variant-aware utilities.
 *
 * createWorkbook() returns a fresh ExcelJS Workbook with metadata
 * stamped. createSheet() applies the standard scaffolding (banner row,
 * frozen header, print setup, default column width). Sheet builders
 * (00-09 under sheets/) call into these helpers so the look stays
 * uniform without copy-pasting boilerplate.
 *
 * No tamper protection / hidden audit sheet — those are MVP-2.
 */

import ExcelJS from 'exceljs';
import { applyStyle } from './styles.js';

/**
 * @param {object} meta
 * @param {string} meta.title         e.g. quote label
 * @param {string} meta.exportedBy
 * @returns {ExcelJS.Workbook}
 */
export function createWorkbook({ title, exportedBy }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = exportedBy || 'Ops Control';
  wb.lastModifiedBy = exportedBy || 'Ops Control';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = title || 'Quote Export';
  wb.company = 'CCL Vietnam';
  wb.views = [
    {
      x: 0,
      y: 0,
      width: 14_000,
      height: 9_000,
      firstSheet: 0,
      activeTab: 0,
      visibility: 'visible',
    },
  ];
  return wb;
}

/**
 * Standard sheet scaffold:
 *   - Row 1: merged banner across cols A..F (or further if widerBanner)
 *   - Row 2 onwards available to builders
 *   - Page setup: A4, orientation per options, fitTo 1 page wide
 *   - Default font + row height
 *
 * @param {ExcelJS.Workbook} wb
 * @param {object} opts
 * @param {string} opts.name           Tab name (with NN prefix per spec)
 * @param {string} opts.bannerText
 * @param {'portrait'|'landscape'} [opts.orientation='portrait']
 * @param {number} [opts.bannerSpan=6] Cols to merge in banner row
 * @returns {ExcelJS.Worksheet}
 */
export function createSheet(wb, opts) {
  const { name, bannerText, orientation = 'portrait', bannerSpan = 6 } = opts;
  const sheet = wb.addWorksheet(name, {
    pageSetup: {
      paperSize: 9, // A4
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.6,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    },
    properties: { defaultColWidth: 14, defaultRowHeight: 18 },
    headerFooter: { oddFooter: `&L${name} &C&P / &N &R&D` },
  });

  // Banner row
  const lastCol = String.fromCharCode(64 + bannerSpan); // A=65 → +span
  sheet.mergeCells(`A1:${lastCol}1`);
  const banner = sheet.getCell('A1');
  banner.value = bannerText;
  applyStyle(banner, 'banner');
  sheet.getRow(1).height = 28;

  return sheet;
}

/**
 * Hide a column in customer variant. ExcelJS supports hiding via
 * column.hidden = true. Looking up by letter avoids fragile index math.
 *
 * @param {ExcelJS.Worksheet} sheet
 * @param {string[]} columnLetters  e.g. ['L', 'M']
 */
export function hideColumns(sheet, columnLetters) {
  for (const letter of columnLetters) {
    const col = sheet.getColumn(letter);
    if (col) col.hidden = true;
  }
}

/**
 * Add a watermark to the worksheet's first-page header using
 * Excel header/footer codes. Customer variant only.
 *
 * @param {ExcelJS.Worksheet} sheet
 * @param {string} text  e.g. 'CUSTOMER COPY'
 */
export function setWatermark(sheet, text) {
  sheet.headerFooter.differentFirst = false;
  // &C = center · &"font,Bold" · &14 = 14pt · &K + ARGB hex (no FF prefix)
  sheet.headerFooter.oddHeader = `&C&"Calibri,Bold"&14&KDA1E28${text}`;
  sheet.headerFooter.evenHeader = sheet.headerFooter.oddHeader;
}

/**
 * Set freeze pane via the worksheet's `views` array. Common case: freeze
 * the top N rows (banner + header).
 *
 * @param {ExcelJS.Worksheet} sheet
 * @param {number} rows
 * @param {number} [cols=0]
 */
export function freezeTop(sheet, rows, cols = 0) {
  sheet.views = [
    {
      state: 'frozen',
      xSplit: cols,
      ySplit: rows,
      topLeftCell: `${String.fromCharCode(65 + cols)}${rows + 1}`,
    },
  ];
}
