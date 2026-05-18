// @ts-check
/**
 * Sheet 01 — RFQ identification + MOQ tier table.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';
import { enumerateTiers } from '../tierUtils.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {object} ctx
 * @param {object} ctx.quote
 * @param {'en'|'vi'|'bilingual'} ctx.lang
 */
export function buildRfqMoqSheet(wb, ctx) {
  const { quote, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '01 RFQ MOQ',
    bannerText: L('rfq.section_id', lang),
    orientation: 'portrait',
    bannerSpan: 8,
  });

  sheet.getColumn('A').width = 24;
  sheet.getColumn('B').width = 28;
  ['C', 'D', 'E', 'F', 'G', 'H'].forEach((c) => (sheet.getColumn(c).width = 14));

  const state = quote.state || {};

  // Identification block
  const idRows = [
    ['rfq.rfq_number', state.rfq_number || state.label || '—'],
    ['rfq.end_customer', state.end_cu || '—'],
    ['rfq.direct_cu', state.direct_cu || '—'],
    ['rfq.project', state.project_name || state.project || '—'],
    ['rfq.quote_date', state.quote_date || quote.saved_at || '—'],
    ['rfq.trade_mode', state.trade_mode || '—'],
    ['rfq.site', state.site || '—'],
    ['rfq.salesperson', state.salesperson || '—'],
    ['rfq.npi_owner', state.npi_owner || '—'],
  ];
  let r = 3;
  for (const [key, value] of idRows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    a.value = L(key, lang);
    b.value = String(value);
    applyStyle(a, 'label');
    applyStyle(b, 'body');
    r += 1;
  }

  // ── MOQ tier table ─────────────────────────────────────────
  r += 1;
  sheet.mergeCells(`A${r}:H${r}`);
  sheet.getCell(`A${r}`).value = L('rfq.section_moq', lang);
  applyStyle(sheet.getCell(`A${r}`), 'section');
  r += 1;

  const headerRow = r;
  const headers = [
    L('rfq.tier', lang),
    L('rfq.moq', lang),
    L('rfq.eau', lang),
    L('cover.sell_price', lang),
    L('cover.target_gm', lang),
    L('cover.va_pct', lang),
    L('cover.contr_pct', lang),
    L('cover.gm_pct', lang),
  ];
  headers.forEach((h, i) => {
    const c = sheet.getCell(headerRow, i + 1);
    c.value = h;
    applyStyle(c, 'th');
  });
  sheet.getRow(headerRow).height = 32;
  r += 1;

  // Tier rows — pulled from extra_moqs + base
  const tiers = enumerateTiers(state);
  for (const t of tiers) {
    const row = sheet.getRow(r);
    row.getCell(1).value = t.label;
    applyStyle(row.getCell(1), 'body');
    row.getCell(2).value = numOrDash(t.moq);
    applyStyle(row.getCell(2), 'num');
    row.getCell(3).value = numOrDash(t.eau);
    applyStyle(row.getCell(3), 'num');
    row.getCell(4).value = numOrDash(t.sellingPrice);
    applyStyle(row.getCell(4), 'num');
    row.getCell(5).value = numOrDash(state.target_margin, 0.25);
    applyStyle(row.getCell(5), 'num');
    // VA / CONTR / GM left blank for non-active tiers (we only persist
    // top-level result for the active tier); active row gets stamped
    // from the snapshot during export.
    ['F', 'G', 'H'].forEach((col) => {
      const cell = sheet.getCell(`${col}${r}`);
      cell.value = '—';
      applyStyle(cell, 'num');
    });
    r += 1;
  }

  freezeTop(sheet, 1);
}

function numOrDash(v, fallback = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback ?? '—';
  return n;
}
