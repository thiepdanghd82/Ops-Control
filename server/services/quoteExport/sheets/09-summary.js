// @ts-check
/**
 * Sheet 09 — Summary. Sell price + GM/VA/CONTR + target compare with
 * conditional format on GM%. Includes Customer feedback block (left
 * intentionally blank for the customer to fill in on Customer variant).
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle, addGmConditionalFormat } from '../styles.js';
import { L } from '../i18n.js';

const APPROVAL_STATUS_KEYS = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
  draft: 'status.draft',
};

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx: number, tierKpis: any, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildSummarySheet(wb, ctx) {
  const { quote, tierIdx, tierKpis, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '09 Summary',
    bannerText: L('summary.section', lang),
    orientation: 'portrait',
    bannerSpan: 6,
  });
  sheet.getColumn('A').width = 26;
  sheet.getColumn('B').width = 20;
  sheet.getColumn('C').width = 4;
  ['D', 'E', 'F'].forEach((c) => (sheet.getColumn(c).width = 14));

  const state = quote.state || {};
  const targetGm = Number(state.target_margin) || 0.25;

  let r = 3;
  // Status banner
  const approval = state.approval || {};
  const status = approval.status || 'draft';
  const statusKey = APPROVAL_STATUS_KEYS[status] || 'status.draft';
  sheet.getCell(`A${r}`).value = L('summary.approval_status', lang);
  sheet.getCell(`B${r}`).value = L(statusKey, lang);
  applyStyle(sheet.getCell(`A${r}`), 'label');
  applyStyle(sheet.getCell(`B${r}`), 'body');
  r += 2;

  const pairs = [
    [L('cover.quote_id', lang), String(quote.label || quote.id || '—'), 'body'],
    [L('cover.tier_exported', lang), `MOQ ${tierIdx + 1}`, 'body'],
    [L('rfq.moq', lang), tierKpis.moq, 'num'],
    [L('rfq.eau', lang), tierKpis.eau, 'num'],
    [L('cover.sell_price', lang), tierKpis.sp, 'kpi'],
    [L('cover.gm_pct', lang), tierKpis.gm, 'kpiPct'],
    [L('cover.va_pct', lang), tierKpis.va, 'kpiPct'],
    [L('cover.contr_pct', lang), tierKpis.contribution, 'kpiPct'],
    [L('cover.target_gm', lang), targetGm, 'kpiPct'],
  ];
  let gmRow = null;
  for (const [label, value, kind] of pairs) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    a.value = label;
    b.value = value != null ? value : '—';
    applyStyle(a, 'label');
    applyStyle(b, kind);
    if (label === L('cover.gm_pct', lang)) gmRow = r;
    r += 1;
  }

  if (gmRow) {
    addGmConditionalFormat(sheet, `B${gmRow}:B${gmRow}`, targetGm);
  }

  // Customer feedback block
  r += 2;
  sheet.mergeCells(`A${r}:F${r}`);
  sheet.getCell(`A${r}`).value = L('summary.feedback', lang);
  applyStyle(sheet.getCell(`A${r}`), 'section');
  r += 1;
  for (let i = 0; i < 6; i++) {
    sheet.mergeCells(`A${r + i}:F${r + i}`);
    const cell = sheet.getCell(`A${r + i}`);
    cell.value = '';
    applyStyle(cell, 'body');
    sheet.getRow(r + i).height = 22;
  }

  freezeTop(sheet, 1);
}
