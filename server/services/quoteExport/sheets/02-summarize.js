// @ts-check
/**
 * Sheet 02 — Summarize.
 *
 * One sheet carrying what used to be six: RFQ/MOQ, Materials, Inks,
 * Processes, Pack & Ship and Cost Breakdown. The operator asked for this
 * shape on 2026-09-14 and supplied a hand-built target workbook; its _Audit
 * sheet is byte-identical to a current export's, which is how we know it was
 * that export restructured in Excel rather than output from another version.
 *
 * The six builders under sheets/ became SECTION builders for this — each takes
 * (sheet, startRow, ctx) and returns the next free row, so the tables are the
 * same tables at a different offset rather than reimplemented.
 *
 * TWO THINGS CONSOLIDATION BROKE, and how they are handled:
 *
 *   1. Column widths. Six builders used to own a sheet each and set widths on
 *      it. Here the widest section wins, so widths are set ONCE below rather
 *      than fought over.
 *
 *   2. Customer-variant column hiding. Materials, Inks and Processes each
 *      hid their own `customerHidden` columns by letter. On a shared sheet
 *      that is wrong: column O is tool_life in Processes (hidden) but qpa_m2
 *      in Materials and setup_cost in Inks, both of which customers are meant
 *      to see. The three builders now blank those cells at write time instead.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { buildRfqMoqSection } from './01-rfq-moq.js';
import { buildMaterialsSection } from './03-materials.js';
import { buildInksSection } from './04-inks.js';
import { buildProcessesSection } from './05-processes.js';
import { buildPackShipSection } from './07-pack-ship.js';
import { buildCostBreakdownSection } from './08-cost-breakdown.js';

/** Widest section decides. Materials is 22 columns; nothing else comes close. */
const COL_WIDTHS = [
  26, 22, 22, 22, 10, 10, 10, 10, 10, 10, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
];

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx?: number, variant: 'customer'|'internal',
 *           lang: 'en'|'vi'|'bilingual', rateLookup?: any }} ctx
 */
export function buildSummarizeSheet(wb, ctx) {
  const sheet = createSheet(wb, {
    name: '02 Summarize',
    bannerText: null,
    orientation: 'landscape',
    bannerSpan: COL_WIDTHS.length,
  });
  COL_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // Every section places its own banner, the first one on row 1 — which is
  // why createSheet is told not to write a sheet-level banner above.
  let r = buildRfqMoqSection(sheet, 1, ctx);
  r = buildMaterialsSection(sheet, r + 1, ctx);
  r = buildInksSection(sheet, r + 1, ctx);
  r = buildProcessesSection(sheet, r + 1, ctx);
  r = buildPackShipSection(sheet, r + 1, ctx);
  buildCostBreakdownSection(sheet, r + 1, ctx);

  freezeTop(sheet, 1);
  return sheet;
}
