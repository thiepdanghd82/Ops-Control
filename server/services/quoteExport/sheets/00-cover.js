// @ts-check
/**
 * Sheet 00 — Cover page. 1-page portrait with banner, identification
 * block, KPI block, and signoff. Per spec §5 Sheet 00.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle, addGmConditionalFormat } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {object} ctx
 * @param {object} ctx.quote
 * @param {number} ctx.tierIdx
 * @param {object} ctx.tierKpis   { sp, gm, va, contribution, targetGm }
 * @param {'customer'|'internal'} ctx.variant
 * @param {'en'|'vi'|'bilingual'} ctx.lang
 * @param {string} ctx.exportedBy
 * @param {string} [ctx.engineSha]
 */
export function buildCoverSheet(wb, ctx) {
  const { quote, tierIdx, tierKpis, variant, lang, exportedBy, engineSha } = ctx;
  const sheet = createSheet(wb, {
    name: '00 Cover',
    bannerText: L('cover.title', lang),
    orientation: 'portrait',
    bannerSpan: 6,
  });

  // Column widths — A: label (28) B: value (32) C: spacer D-F (12 each)
  sheet.getColumn('A').width = 28;
  sheet.getColumn('B').width = 32;
  sheet.getColumn('C').width = 4;
  sheet.getColumn('D').width = 14;
  sheet.getColumn('E').width = 14;
  sheet.getColumn('F').width = 14;

  // ── Identification block ──────────────────────────────────
  const idRows = [
    [L('cover.quote_id', lang), String(quote.label ?? quote.id ?? '—')],
    [L('cover.version', lang), Number(quote._version ?? 1)],
    [
      L('cover.variant', lang),
      variant === 'customer'
        ? L('cover.variant_customer', lang)
        : L('cover.variant_internal', lang),
    ],
    [L('cover.generated', lang), new Date().toISOString()],
    [L('cover.exported_by', lang), exportedBy || '—'],
  ];
  if (variant === 'internal' && engineSha) {
    idRows.push([L('cover.engine_sha', lang), String(engineSha).slice(0, 8)]);
  }

  let r = 3;
  for (const [label, value] of idRows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    a.value = label;
    b.value = value;
    applyStyle(a, 'label');
    applyStyle(b, 'body');
    r += 1;
  }

  // Spacer
  r += 1;

  // ── Customer + part info ─────────────────────────────────
  const state = quote.state || {};
  const custRows = [
    [L('cover.customer', lang), state.end_cu || state.direct_cu || '—'],
    [L('cover.ccl_pn', lang), state.ccl_pn || '—'],
    [L('cover.end_cu_pn', lang), state.end_cu_pn || '—'],
    [L('cover.tier_exported', lang), `MOQ ${tierIdx + 1}`],
  ];
  for (const [label, value] of custRows) {
    const a = sheet.getCell(`A${r}`);
    const b = sheet.getCell(`B${r}`);
    a.value = label;
    b.value = value;
    applyStyle(a, 'label');
    applyStyle(b, 'body');
    r += 1;
  }

  // ── KPI block ─────────────────────────────────────────────
  r += 1;
  const kpiHeaderRow = r;
  const kpiHeaders = [
    L('cover.sell_price', lang),
    L('cover.gm_pct', lang),
    L('cover.va_pct', lang),
    L('cover.contr_pct', lang),
    L('cover.target_gm', lang),
    L('cover.delta_to_target', lang),
  ];
  kpiHeaders.forEach((h, i) => {
    const cell = sheet.getCell(kpiHeaderRow, i + 1);
    cell.value = h;
    applyStyle(cell, 'th');
  });
  sheet.getRow(kpiHeaderRow).height = 32;

  const sp = num(tierKpis.sp);
  const gm = num(tierKpis.gm);
  const va = num(tierKpis.va);
  const contr = num(tierKpis.contribution);
  const targetGm = num(tierKpis.targetGm, 0.25);
  const delta = gm == null ? null : gm - targetGm;

  const kpiValueRow = r + 1;
  setKpi(sheet.getCell(kpiValueRow, 1), sp, 'kpi');
  setKpi(sheet.getCell(kpiValueRow, 2), gm, 'kpiPct');
  setKpi(sheet.getCell(kpiValueRow, 3), va, 'kpiPct');
  setKpi(sheet.getCell(kpiValueRow, 4), contr, 'kpiPct');
  setKpi(sheet.getCell(kpiValueRow, 5), targetGm, 'kpiPct');
  setKpi(sheet.getCell(kpiValueRow, 6), delta, 'kpiPct');
  sheet.getRow(kpiValueRow).height = 32;

  // GM conditional format (col B = GM%)
  addGmConditionalFormat(sheet, `B${kpiValueRow}:B${kpiValueRow}`, targetGm);

  // ── Signoff block ──────────────────────────────────────────
  r = kpiValueRow + 3;
  sheet.getCell(`A${r}`).value = L('cover.authorized_signatory', lang);
  applyStyle(sheet.getCell(`A${r}`), 'label');
  sheet.getCell(`B${r}`).value = '';
  applyStyle(sheet.getCell(`B${r}`), 'body');
  r += 1;
  sheet.getCell(`A${r}`).value = L('cover.date', lang);
  applyStyle(sheet.getCell(`A${r}`), 'label');
  applyStyle(sheet.getCell(`B${r}`), 'body');

  // ── Customer notes block (unlocked even when sheet protected) ─
  r += 2;
  sheet.getCell(`A${r}`).value = L('cover.customer_notes', lang);
  applyStyle(sheet.getCell(`A${r}`), 'section');
  sheet.mergeCells(`A${r}:F${r}`);
  for (let i = 1; i <= 5; i++) {
    const cell = sheet.getCell(`A${r + i}`);
    cell.value = '';
    applyStyle(cell, 'body');
    sheet.mergeCells(`A${r + i}:F${r + i}`);
    sheet.getRow(r + i).height = 20;
  }

  freezeTop(sheet, 1);
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function setKpi(cell, value, preset) {
  cell.value = value == null ? '—' : value;
  applyStyle(cell, preset);
}
