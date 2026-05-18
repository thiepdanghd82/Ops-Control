// @ts-check
/**
 * Sheet 02 — Layout dims (Common + Print + Cut sections).
 * No diagram embed per locked decision #4.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildLayoutSheet(wb, ctx) {
  const { quote, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '02 Layout',
    bannerText: L('layout.section_common', lang),
    orientation: 'landscape',
    bannerSpan: 7,
  });
  sheet.getColumn('A').width = 28;
  sheet.getColumn('B').width = 18;
  ['C', 'D', 'E', 'F', 'G'].forEach((c) => (sheet.getColumn(c).width = 14));

  const state = quote.state || {};
  let r = 3;

  // SHARED
  r = writeKVSection(
    sheet,
    r,
    L('layout.section_common', lang),
    [
      ['layout.web_width_td', state.web_width_td, 'mm'],
      ['layout.sheet_length_md', state.sheet_length, 'mm'],
      ['layout.num_webs', state.num_webs, ''],
      ['layout.rotary_cols', state.rotary_cols, ''],
      ['layout.pcs_per_roll', state.pcs_per_roll, ''],
    ],
    lang
  );

  // PRINT
  r = writeKVSection(
    sheet,
    r,
    L('layout.section_print', lang),
    [
      ['layout.product_size_w', state.print_part_width || state.part_width, 'mm'],
      ['layout.product_size_l', state.print_part_length_md || state.part_length_md, 'mm'],
      ['layout.bleed_td', state.bleed_td_mm, 'mm'],
      ['layout.bleed_md', state.bleed_md_mm, 'mm'],
      [
        'layout.pitch',
        state.sheet_length && state.min_gap_md
          ? Number(state.sheet_length) + Number(state.min_gap_md)
          : null,
        'mm',
      ],
      ['layout.print_cav', state.parts_web_across, ''],
      [
        'layout.print_total_shot',
        (Number(state.parts_web_across) || 0) * (Number(state.parts_in_md) || 0) || null,
        '',
      ],
    ],
    lang
  );

  // CUT
  writeKVSection(
    sheet,
    r,
    L('layout.section_cut', lang),
    [
      ['layout.part_width', state.part_width, 'mm'],
      ['layout.part_length_md', state.part_length_md, 'mm'],
      ['layout.cut_cav', state.parts_in_md, ''],
    ],
    lang
  );

  freezeTop(sheet, 1);
}

function writeKVSection(sheet, startRow, sectionTitle, rows, lang) {
  let r = startRow;
  sheet.mergeCells(`A${r}:G${r}`);
  sheet.getCell(`A${r}`).value = sectionTitle;
  applyStyle(sheet.getCell(`A${r}`), 'section');
  r += 1;
  for (const [key, value, unit] of rows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    const c = sheet.getCell(`C${r}`);
    a.value = L(key, lang);
    const n = Number(value);
    b.value = Number.isFinite(n) ? n : '—';
    c.value = unit || '';
    applyStyle(a, 'label');
    applyStyle(b, 'num');
    applyStyle(c, 'body');
    r += 1;
  }
  return r + 1;
}
