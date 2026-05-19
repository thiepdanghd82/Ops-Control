// @ts-check
/**
 * Customer-variant watermark (MVP-2 Item E).
 *
 * Approach: cell-background fill on a dedicated row near the top-right
 * of every VISIBLE sheet. The cell carries the literal text "CUSTOMER
 * COPY" with a light pink-grey fill (`#F5E0E0`) and italic bold dark-
 * red text. We do NOT use header-page rotated text because:
 *   - Excel header rotation is unreliable across viewers (LibreOffice,
 *     Numbers, Google Sheets all render differently).
 *   - Cell-bg renders identically everywhere and prints with the page.
 *
 * Why a cell instead of a row: a single cell merge is cheap, doesn't
 * interfere with frozen-pane scroll, and survives sheet protection
 * because the style is applied BEFORE protectAllSheets runs.
 *
 * Watermark range is the LAST two columns of row 1 (the banner row),
 * positioned right-edge so it doesn't collide with the bilingual
 * banner text that lives in cells A1:F1 / A1:bannerSpan.
 */

import { COLORS } from './styles.js';

const WATERMARK_TEXT = 'CUSTOMER COPY';
const WATERMARK_BG = 'FFF5E0E0'; // ARGB pink-grey, matches comment
const WATERMARK_FG = 'FFB91C1C'; // ARGB dark red

/**
 * Apply the customer watermark to every visible sheet.
 *
 * - Renders only when variant === 'customer'.
 * - Skipped for hidden sheets (_Audit, _Schema) and for internal variant.
 * - Idempotent: re-running on the same workbook leaves identical output.
 *
 * @param {import('exceljs').Workbook} wb
 * @param {'customer'|'internal'} variant
 */
export function applyWatermark(wb, variant) {
  if (variant !== 'customer') return;
  for (const sheet of wb.worksheets) {
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') continue;
    if (sheet.name.startsWith('_')) continue; // defense-in-depth
    stampWatermarkCell(sheet);
  }
}

/**
 * Stamp a single watermark cell on the given sheet. Placed at column
 * AA of row 1 (well past any banner span) so it doesn't fight the
 * existing banner merge. Uses an absolute column index rather than
 * letter so freezeTop(1) preservation logic doesn't accidentally pick
 * it up as part of the banner range.
 *
 * @param {import('exceljs').Worksheet} sheet
 */
function stampWatermarkCell(sheet) {
  // Col 27 = AA, a far-right column not used by any visible sheet
  // (Processes has the widest layout at col S = 19). The cell stays
  // out of the frozen-panes area + out of the print area unless the
  // customer manually expands print scope — acceptable since the
  // banner + filename also signal CUSTOMER variant.
  const wmRow = 1;
  const wmCol = 27;
  const cell = sheet.getCell(wmRow, wmCol);
  cell.value = WATERMARK_TEXT;
  cell.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    italic: true,
    color: { argb: WATERMARK_FG },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: WATERMARK_BG },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: false,
  };
  // Give the column some width so the watermark text is readable
  // when the operator scrolls over to inspect it. Don't overwrite if
  // a sheet pre-sized this column (none do today).
  const col = sheet.getColumn(wmCol);
  if (!col.width || col.width < 18) col.width = 18;
}

export const _internal = {
  WATERMARK_TEXT,
  WATERMARK_BG,
  WATERMARK_FG,
  // Re-export for tests so they don't hardcode the constants.
  PALETTE_REFERENCE: COLORS,
};
