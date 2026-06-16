// @ts-check
/**
 * Sheet 07 — Packaging spec + shipping terms.
 *
 * Sprint S-PACK-SHIP-PER-TIER (2026-06-16) — accepts `tierIdx` and
 * field-merges `state.extra_moqs[tierIdx-1].packing` over the base
 * `state` before rendering. Pre-sprint every xlsx in a multi-tier
 * zip showed identical pack/ship cells regardless of tier; mirrors
 * the tierIdx threading sheets 03/04/05/08 received in PR #58.
 *
 * Override merge is field-level (`Object.assign`): keys present in
 * `em.packing` win (including explicit 0); keys absent fall back
 * to `state[key]`. Same semantic as calcEngine's getActiveTierState
 * + buildTierState (Step 1 of the sprint).
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, lang: 'en'|'vi'|'bilingual', tierIdx?: number }} ctx
 */
export function buildPackShipSheet(wb, ctx) {
  const { quote, lang, tierIdx = 0 } = ctx;
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
  // Per-tier merge — when rendering a non-base tier, the override
  // object (if any) field-merges over the base pack/ship state. Legacy
  // quotes without `packing` key short-circuit via the `&& em.packing`
  // guard, so the rest of the sheet sees `state` unchanged.
  const em = tierIdx > 0 ? state.extra_moqs?.[tierIdx - 1] : null;
  const ps = em && em.packing ? { ...state, ...em.packing } : state;
  let r = 3;

  // Packaging
  r = writeKV(
    sheet,
    r,
    L('pack.section_packaging', lang),
    [
      ['pack.method', ps.packing_method, ''],
      ['pack.units_per_carton', ps.units_per_carton ?? ps.bags_per_box, 'pcs'],
      ['pack.bags_per_box', ps.bags_per_box, ''],
      ['pack.cartons_per_pallet', ps.cartons_per_pallet, ''],
      ['pack.pallet_dims', ps.pallet_dims, ''],
      ['pack.pallet_weight', ps.pallet_weight, 'kg'],
      ['pack.box_cost', ps.box_cost, 'USD'],
      ['pack.other_packing', ps.other_packing, 'USD'],
    ],
    lang
  );

  // Shipping
  writeKV(
    sheet,
    r,
    L('pack.section_shipping', lang),
    [
      ['pack.incoterm', ps.incoterm, ''],
      ['pack.delivery_term', ps.delivery_term, ''],
      ['pack.container_cost', ps.container_cost, 'USD'],
      ['pack.other_ship', ps.other_ship, 'USD'],
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
