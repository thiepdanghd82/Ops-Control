// @ts-check
/**
 * Locate a section inside the consolidated "02 Summarize" sheet.
 *
 * Until 2026-09-14 each of RFQ/MOQ, Materials, Inks, Processes, Pack & Ship
 * and Cost Breakdown owned a sheet, so a test could say `mat.getCell('T5')`
 * and mean "the Materials sheet, row 5". They now share one sheet at varying
 * offsets, and those offsets move with the fixture — more MOQ tiers push
 * Materials down, more materials push Inks down, and so on.
 *
 * Rather than recompute every absolute row in every test, this keeps the OLD
 * numbering as the thing tests express: `section(wb, 'Main materials').cell('T', 5)`
 * still means row 5 counting the section banner as row 1. The arithmetic lives
 * here, once.
 *
 * Finding the section by its banner text rather than by a hard-coded row is
 * deliberate: a test that breaks when an unrelated section grows is a test
 * that will be "fixed" by pasting in a new number, which teaches nobody
 * anything.
 */

/**
 * Section banners, in the order buildSummarizeSheet writes them, with the
 * Vietnamese each carries under lang: 'vi'. Both are listed because a test may
 * ask for a section by its English name while exporting in Vietnamese — and an
 * exact-match lookup would then report a workbook with no sections at all.
 */
export const BANNERS = {
  rfq: ['RFQ Information', 'Thông tin RFQ'],
  materials: ['Main materials', 'Vật tư chính'],
  inks: ['Inks', 'Mực in'],
  processes: ['Processes', 'Công đoạn'],
  packaging: ['Packaging', 'Đóng gói'],
  costBreakdown: ['Cost Breakdown', 'Phân tích chi phí'],
};

/** Every spelling of the banner a caller named, in either language. */
function aliasesOf(bannerText) {
  for (const pair of Object.values(BANNERS)) {
    if (pair.includes(bannerText)) return pair;
  }
  return [bannerText];
}

/** Sheet names after consolidation. Kept here so a rename lands in one place. */
export const SHEETS = {
  cover: '00 Cover',
  layout: '01 Layout',
  summarize: '02 Summarize',
  balancing: '03 Balancing',
  pricingSnapshot: '04 Pricing Snapshot',
};

/**
 * @param {import('exceljs').Workbook} wb
 * @param {string} bannerText  the section banner, e.g. 'Main materials'
 * @returns {{ sheet: any, bannerRow: number, cell: (col: string, oldRow: number) => any,
 *             row: (oldRow: number) => number }}
 */
export function section(wb, bannerText) {
  const sheet = wb.getWorksheet(SHEETS.summarize);
  if (!sheet) throw new Error(`no "${SHEETS.summarize}" sheet in this workbook`);

  const wanted = aliasesOf(bannerText);
  let bannerRow = 0;
  sheet.eachRow({ includeEmpty: false }, (r, n) => {
    if (bannerRow) return;
    // lang: 'bilingual' stacks both languages in one cell separated by a
    // newline ("Cost Breakdown\nPhân tích chi phí"), so match any line rather
    // than the whole value — otherwise every bilingual export looks like a
    // workbook with no sections at all.
    const v = String(r.getCell(1).value ?? '');
    const lines = v.split('\n').map((line) => line.trim());
    if (wanted.some((w) => lines.includes(w))) bannerRow = n;
  });
  if (!bannerRow) {
    const seen = [];
    sheet.eachRow({ includeEmpty: false }, (r, n) => {
      const v = String(r.getCell(1).value ?? '').trim();
      if (v) seen.push(`${n}:${v.slice(0, 40)}`);
    });
    throw new Error(
      `section banner "${bannerText}" not found on ${SHEETS.summarize}.\n` +
        `Column A held: ${seen.slice(0, 40).join(' | ')}`
    );
  }

  // Where this section stops — the row before the next section's banner, or
  // the end of the sheet. Tests that SCAN (rather than pin a cell) need this:
  // on one shared sheet an unbounded scan happily reports Inks numbers as
  // Materials numbers, which is a green test asserting the wrong thing.
  let endRow = sheet.rowCount;
  for (const pair of Object.values(BANNERS)) {
    if (pair.includes(bannerText)) continue;
    sheet.eachRow({ includeEmpty: false }, (r, n) => {
      if (n <= bannerRow || n >= endRow) return;
      const v = String(r.getCell(1).value ?? '');
      const lines = v.split('\n').map((line) => line.trim());
      if (pair.some((b) => lines.includes(b))) endRow = n - 1;
    });
  }

  // Old numbering counted the section's own banner as row 1.
  const row = (oldRow) => bannerRow + oldRow - 1;
  const own = {
    sheet,
    bannerRow,
    endRow,
    row,
    /**
     * eachRow bounded to THIS section. Shadows the worksheet's own eachRow on
     * purpose: an unbounded scan of the consolidated sheet silently reads the
     * neighbouring sections, so a test asking "how many cost buckets are
     * there" counted 52.
     */
    eachRow: (cb) => {
      for (let n = bannerRow; n <= endRow; n++) {
        const r = sheet.getRow(n);
        // Second argument is the OLD row number (banner = 1), not the absolute
        // sheet row, so callers written as `if (rowIdx < 4) return` keep
        // meaning "skip banner, blank and header".
        if (r && r.actualCellCount > 0) cb(r, n - bannerRow + 1);
      }
    },
    /** Absolute rows belonging to this section, banner included. */
    rows: () => {
      const out = [];
      for (let n = bannerRow; n <= endRow; n++) out.push(n);
      return out;
    },
    cell: (col, oldRow) => sheet.getCell(`${col}${row(oldRow)}`),
  };

  // Anything this wrapper does not define falls through to the worksheet, so a
  // section can still be handed to a helper that expects a sheet (eachRow,
  // getColumn, model, …). Without this every such call site would need its own
  // `.sheet` suffix, which is churn that teaches nothing.
  return new Proxy(own, {
    get(target, prop) {
      if (prop in target) return target[prop];
      const v = sheet[prop];
      return typeof v === 'function' ? v.bind(sheet) : v;
    },
  });
}
