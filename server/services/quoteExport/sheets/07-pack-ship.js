// @ts-check
/**
 * Sheet 07 — Packaging spec + shipping terms.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildPackShipSheet(wb, ctx) {
  const { quote, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '07 Pack Ship',
    bannerText: L('pack.section_packaging', lang),
    orientation: 'portrait',
    bannerSpan: 6,
  });
  sheet.getColumn('A').width = 24;
  sheet.getColumn('B').width = 22;
  sheet.getColumn('C').width = 10;
  ['D', 'E', 'F'].forEach((c) => (sheet.getColumn(c).width = 14));

  const state = quote.state || {};
  let r = 3;

  // Packaging
  r = writeKV(
    sheet,
    r,
    L('pack.section_packaging', lang),
    [
      ['pack.method', state.packing_method, ''],
      ['pack.units_per_carton', state.units_per_carton ?? state.bags_per_box, 'pcs'],
      ['pack.bags_per_box', state.bags_per_box, ''],
      ['pack.cartons_per_pallet', state.cartons_per_pallet, ''],
      ['pack.pallet_dims', state.pallet_dims, ''],
      ['pack.pallet_weight', state.pallet_weight, 'kg'],
      ['pack.box_cost', state.box_cost, 'USD'],
      ['pack.other_packing', state.other_packing, 'USD'],
    ],
    lang
  );

  // Shipping
  writeKV(
    sheet,
    r,
    L('pack.section_shipping', lang),
    [
      ['pack.incoterm', state.incoterm, ''],
      ['pack.delivery_term', state.delivery_term, ''],
      ['pack.container_cost', state.container_cost, 'USD'],
      ['pack.other_ship', state.other_ship, 'USD'],
    ],
    lang
  );

  freezeTop(sheet, 1);
}

function writeKV(sheet, startRow, title, rows, lang) {
  let r = startRow;
  sheet.mergeCells(`A${r}:F${r}`);
  sheet.getCell(`A${r}`).value = title;
  applyStyle(sheet.getCell(`A${r}`), 'section');
  r += 1;
  for (const [key, value, unit] of rows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    const c = sheet.getCell(`C${r}`);
    a.value = L(key, lang);
    if (
      typeof value === 'number' ||
      (value != null && !isNaN(Number(value)) && String(value).trim() !== '')
    ) {
      b.value = Number(value);
      applyStyle(b, 'num');
    } else {
      b.value = value || '—';
      applyStyle(b, 'body');
    }
    c.value = unit || '';
    applyStyle(a, 'label');
    applyStyle(c, 'body');
    r += 1;
  }
  return r + 1;
}
