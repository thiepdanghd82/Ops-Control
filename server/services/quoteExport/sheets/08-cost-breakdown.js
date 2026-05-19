// @ts-check
/**
 * Sheet 08 — Cost Breakdown by category.
 *
 * Customer variant: rolls up to 5 buckets (Material, Manufacturing,
 * Tooling, Packaging, Margin).
 * Internal variant: shows all ~15 bd_* buckets from result.
 *
 * All numbers come from `quote.result` (calcAll snapshot) — no recompute.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildCostBreakdownSheet(wb, ctx) {
  const { quote, variant, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '08 Cost Breakdown',
    bannerText: L('cb.section', lang),
    orientation: 'landscape',
    bannerSpan: 8,
  });
  sheet.getColumn('A').width = 26;
  sheet.getColumn('B').width = 14;
  sheet.getColumn('C').width = 12;
  sheet.getColumn('D').width = 4;
  sheet.getColumn('E').width = 26;
  sheet.getColumn('F').width = 14;

  const result = quote.result || {};
  const rows =
    variant === 'customer' ? buildCustomerRows(result, lang) : buildInternalRows(result, lang);

  const sTotal = num(result.s_ttl);
  const gTotal = num(result.g_ttl);

  let r = 3;
  // Header
  ['cb.category', 'cb.cost_per_unit', 'cb.pct_of_total'].forEach((k, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = L(k, lang);
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 32;
  r += 1;

  for (const [label, value] of rows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    const c = sheet.getCell(`C${r}`);
    a.value = label;
    b.value = value;
    c.value = sTotal && Number.isFinite(value) ? value / sTotal : '—';
    applyStyle(a, 'body');
    applyStyle(b, 'numCost');
    applyStyle(c, 'numPct');
    r += 1;
  }

  // Subtotal block
  r += 1;
  writePair(sheet, r, L('cb.s_total', lang), sTotal);
  r += 1;
  if (variant === 'internal') {
    writePair(sheet, r, L('cb.g_total', lang), gTotal);
    r += 1;
    const margin = num(result.sp) != null && sTotal != null ? Number(result.sp) - sTotal : null;
    writePair(sheet, r, L('cb.margin_usd', lang), margin);
    r += 1;
  }
  writePair(sheet, r, L('cover.sell_price', lang), num(result.sp));

  freezeTop(sheet, 1);
}

function buildCustomerRows(result, lang) {
  // 5-bucket roll-up
  const mat = sum(result.bd_mat_setup, result.bd_mat_run, result.bd_ink_setup, result.bd_ink_run);
  const mfg = sum(result.bd_setup_mach, result.bd_setup_labor, result.overhead, result.labor_cost);
  const tooling = num(result.tooling);
  const packing = num(result.packing_ship);
  const sp = num(result.sp);
  const sTotal = num(result.s_ttl);
  const margin = sp != null && sTotal != null ? sp - sTotal : null;
  return [
    [L('cb.material', lang), mat],
    [L('cb.manufacturing', lang), mfg],
    [L('cb.tooling', lang), tooling],
    [L('cb.packaging', lang), packing],
    [L('summary.target_compare', lang), margin],
  ];
}

function buildInternalRows(result, lang) {
  return [
    [L('cb.material_setup', lang), num(result.bd_mat_setup)],
    [L('cb.material_run', lang), num(result.bd_mat_run)],
    [L('cb.ink_setup', lang), num(result.bd_ink_setup)],
    [L('cb.ink_run', lang), num(result.bd_ink_run)],
    [L('cb.labor_setup', lang), num(result.bd_setup_labor)],
    [L('cb.labor_run', lang), num(result.labor_cost)],
    [L('cb.overhead_setup', lang), num(result.bd_setup_mach)],
    [L('cb.overhead', lang), num(result.overhead)],
    [L('cb.tooling', lang), num(result.tooling)],
    [L('cb.packing_ship', lang), num(result.packing_ship)],
    [L('cb.vat_loss', lang), num(result.vat_loss)],
    [L('cb.extra', lang), num(result.bd_extra)],
  ];
}

function writePair(sheet, r, label, value) {
  const a = sheet.getCell(`A${r}`);
  const b = sheet.getCell(`B${r}`);
  a.value = label;
  b.value = value;
  applyStyle(a, 'label');
  applyStyle(b, 'subtotal');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sum(...args) {
  let s = 0;
  let any = false;
  for (const a of args) {
    const n = Number(a);
    if (Number.isFinite(n)) {
      s += n;
      any = true;
    }
  }
  return any ? s : null;
}
