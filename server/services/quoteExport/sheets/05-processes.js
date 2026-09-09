// @ts-check
/**
 * Sheet 05 — Processes. Per spec, customer variant hides Tool Cost +
 * Tool Life (reveals competitive die info).
 */

import { createSheet, freezeTop, hideColumns } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L, biLabel } from '../i18n.js';
import { pickStdTierRows, pickCpxTierRows, getActiveIdx, getTierMoq } from '../tierRows.js';

// Column order matches the app Processes table (CalcProcesses.jsx). Inputs
// come from state.processes[i] / rate lookup; `computedOnly` columns come from
// the persisted per-row breakdown (result.rows.processes[i]) — the derived
// MC UPH / MAN UPH / PROD TIME + the setup/run mach·labor split + tooling that
// operators see live. `internalOnly` trailing columns keep data the current
// export renders (rates / extra) without cluttering the customer copy.
const PROC_COLS = [
  { key: 'process_type', label: 'proc.process_type', width: 14 },
  { key: 'workcenter', label: 'proc.workcenter', width: 14 },
  { key: 'repeat', label: 'proc.repeat', width: 6, numeric: true },
  { key: 'crew', label: 'proc.crew', width: 8, numeric: true, computedOnly: true },
  { key: 'speed', label: 'proc.speed', width: 10, numeric: true },
  { key: 'speed_uom', label: 'proc.speed_uom', width: 10 },
  { key: 'layout', label: 'proc.layout', width: 9, numeric: true },
  { key: 'efficiency', label: 'proc.efficiency', width: 11, numeric: true },
  { key: 'setup_h', label: 'proc.setup_h', width: 9, numeric: true },
  { key: 'scrap_pct', label: 'proc.scrap_pct', width: 10, numeric: true },
  { key: 'uph', label: 'proc.uph_derived', width: 9, numeric: true, computedOnly: true },
  { key: 'manual_uph', label: 'proc.manual_uph', width: 11, numeric: true, computedOnly: true },
  { key: 'tool_cost', label: 'proc.tool_cost', width: 11, numeric: true, customerHidden: true },
  { key: 'tool_type', label: 'proc.tool_type', width: 12 },
  { key: 'tool_life', label: 'proc.tool_life', width: 11, numeric: true, customerHidden: true },
  { key: 'prod_time', label: 'proc.prod_time', width: 10, numeric: true, computedOnly: true },
  { key: 'setup_mach', label: 'proc.s_mach', width: 10, numeric: true, computedOnly: true },
  { key: 'setup_labor', label: 'proc.s_labor', width: 10, numeric: true, computedOnly: true },
  { key: 'run_mach', label: 'proc.r_mach', width: 10, numeric: true, computedOnly: true },
  { key: 'run_labor', label: 'proc.r_labor', width: 10, numeric: true, computedOnly: true },
  { key: 'tooling', label: 'proc.tooling', width: 10, numeric: true, computedOnly: true },
];

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx?: number, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual', rateLookup?: (wc:string) => any }} ctx
 */
export function buildProcessesSheet(wb, ctx) {
  const { quote, variant, lang, rateLookup } = ctx;
  const tierIdx = Number.isInteger(ctx.tierIdx) ? ctx.tierIdx : getActiveIdx(quote);
  const activeIdx = getActiveIdx(quote);
  const isActive = tierIdx === activeIdx;
  const LASTCOL = letterFor(PROC_COLS.length); // full-width merge span
  const sheet = createSheet(wb, {
    name: '05 Processes',
    bannerText: L('proc.section', lang),
    orientation: 'landscape',
    bannerSpan: PROC_COLS.length,
  });
  PROC_COLS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  const state = quote.state || {};
  const result = quote.result || {};
  const isCpx = quote.type === 'complex';

  // Cpx: one block per SP; Std: single processes array. Row breakdown
  // resolved per requested tier (active or otherwise).
  const procGroups =
    isCpx && Array.isArray(state.subproducts) && state.subproducts.length > 0
      ? state.subproducts.map((sp, spi) => ({
          label: `${L('proc.section', lang)} — ${sp.code || `SP${spi + 1}`}`,
          procs: Array.isArray(sp.processes) ? sp.processes : [],
          rowBreakdown: pickCpxTierRows(result, spi, tierIdx, 'processes'),
        }))
      : [
          {
            label: null,
            procs: Array.isArray(state.processes) ? state.processes : [],
            rowBreakdown: pickStdTierRows(result, tierIdx, 'processes'),
          },
        ];

  let r = 3;
  PROC_COLS.forEach((c, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = L(c.label, lang);
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 36;
  r += 1;

  for (const group of procGroups) {
    if (group.label) {
      sheet.mergeCells(`A${r}:${LASTCOL}${r}`);
      sheet.getCell(`A${r}`).value = group.label;
      applyStyle(sheet.getCell(`A${r}`), 'section');
      r += 1;
    }
    if (group.procs.length === 0) {
      sheet.mergeCells(`A${r}:${LASTCOL}${r}`);
      sheet.getCell(`A${r}`).value = '—';
      applyStyle(sheet.getCell(`A${r}`), 'body');
      r += 1;
      continue;
    }
    for (let i = 0; i < group.procs.length; i++) {
      const proc = group.procs[i];
      if (!proc || proc.hidden) continue;
      const rate = rateLookup ? rateLookup(proc.workcenter) : null;
      const rowCost = Array.isArray(group.rowBreakdown) ? group.rowBreakdown[i] : null;
      PROC_COLS.forEach((c, ci) => {
        const cell = sheet.getCell(r, ci + 1);
        cell.value = extractCellValue(c, proc, rate, rowCost);
        applyStyle(cell, c.numeric ? (c.computedOnly ? 'numCost' : 'num') : 'body');
        // Note only when a persisted-derived column is genuinely missing
        // (legacy quote / pre-parity rows) — crew falls back to the rate so
        // it never needs it.
        if (c.computedOnly && c.key !== 'crew' && cell.value === '—') {
          cell.note = 'Computed at calc time, not persisted (legacy quote — re-save to refresh).';
        }
      });
      r += 1;
    }
  }

  // Subtotal = column-wise sum of the persisted per-row split, which equals
  // the app's Processes-tab header totals by construction (CalcProcesses sums
  // the same setup_mach/setup_labor/run_mach/run_labor/tooling per row). Works
  // uniformly for the active AND non-active tier — each tier's rowBreakdown
  // carries its own split — with no server-side recompute. Legacy quotes whose
  // rows predate the split contribute 0 (they re-save to populate).
  const split = { setup_mach: 0, setup_labor: 0, run_mach: 0, run_labor: 0, tooling: 0 };
  let hasSplit = false;
  for (const g of procGroups) {
    if (!Array.isArray(g.rowBreakdown)) continue;
    for (const rc of g.rowBreakdown) {
      if (!rc) continue;
      for (const k of Object.keys(split)) {
        if (rc[k] != null) {
          split[k] += Number(rc[k]) || 0;
          hasSplit = true;
        }
      }
    }
  }
  if (hasSplit) {
    r += 1;
    writeSubtotalRow(sheet, r, PROC_COLS, L('common.subtotal', lang), split);
    r += 1;
  }

  r += 1;
  sheet.mergeCells(`A${r}:${LASTCOL}${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = L('common.computed_at_calc', lang);
  applyStyle(note, 'footnote');

  // Non-active tier disclosure — labor + overhead + tooling reflect the
  // active tier's calc result, not this tier's. Material/ink/process
  // setup-run row data IS tier-specific (rendered above). The footnote
  // calls this out so operators don't conflate the row sums with the
  // active-tier aggregates surfaced on the Cost Breakdown sheet.
  if (!isActive) {
    r += 1;
    sheet.mergeCells(`A${r}:${LASTCOL}${r}`);
    const fn = sheet.getCell(`A${r}`);
    fn.value = renderActiveTierFootnote(quote, activeIdx, tierIdx, lang);
    fn.alignment = { wrapText: true, vertical: 'top' };
    applyStyle(fn, 'footnote');
    sheet.getRow(r).height = lang === 'bilingual' ? 60 : 36;
  }

  if (variant === 'customer') {
    const letters = PROC_COLS.map((c, i) => (c.customerHidden ? letterFor(i + 1) : null)).filter(
      Boolean
    );
    hideColumns(sheet, letters);
  }

  freezeTop(sheet, 1);
}

function extractCellValue(col, proc, rate, rowCost) {
  if (col.computedOnly) {
    // Effective crew — persisted derived value, else the rate-table crew.
    if (col.key === 'crew') {
      if (rowCost && rowCost.crew != null) return Number(rowCost.crew);
      return rate && rate.crew != null ? Number(rate.crew) : '—';
    }
    // PROD TIME persisted in minutes; the app displays hours.
    if (col.key === 'prod_time') {
      return rowCost && rowCost.total_time != null ? rowCost.total_time / 60 : '—';
    }
    // uph / manual_uph / setup_mach / setup_labor / run_mach / run_labor / tooling
    return rowCost && rowCost[col.key] != null ? rowCost[col.key] : '—';
  }
  switch (col.key) {
    case 'process_type':
      return proc.process_type || '';
    case 'workcenter':
      return proc.workcenter || '';
    case 'repeat':
      return numCell(proc.repeat != null ? proc.repeat : 1);
    case 'speed':
      return numCell(proc.speed);
    case 'speed_uom':
      // Persisted at calc time (rateLookup isn't wired into the export deps);
      // fall back to a live rate lookup when one is supplied.
      return (rowCost && rowCost.speed_uom) || (rate && rate.speed_uom) || '';
    case 'layout':
      return numCell(proc.layout);
    case 'efficiency':
      return numCell(proc.efficiency);
    case 'setup_h':
      return numCell(proc.setup_h);
    case 'scrap_pct':
      return numCell(proc.scrap_pct);
    case 'tool_cost':
      return numCell(proc.tool_cost);
    case 'tool_type':
      return proc.tool_type || '';
    case 'tool_life':
      return numCell(proc.tool_life);
    default:
      return '';
  }
}

function numCell(v) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : '—';
}

function writeSubtotalRow(sheet, r, cols, label, values) {
  sheet.mergeCells(`A${r}:C${r}`);
  const labelCell = sheet.getCell(`A${r}`);
  labelCell.value = label;
  applyStyle(labelCell, 'subtotal');
  cols.forEach((c, i) => {
    if (i < 3) return;
    const cell = sheet.getCell(r, i + 1);
    if (Object.prototype.hasOwnProperty.call(values, c.key)) {
      const v = values[c.key];
      cell.value = v == null ? '—' : v;
    } else {
      cell.value = '';
    }
    applyStyle(cell, 'subtotal');
  });
}

function letterFor(idx) {
  let s = '',
    n = idx;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Render the [active-tier] footnote with substituted MOQ values. Shared
 * with sheet 08-cost-breakdown via the same i18n key.
 *
 * @param {object} quote
 * @param {number} activeIdx
 * @param {number} tierIdx
 * @param {'en'|'vi'|'bilingual'} lang
 * @returns {string}
 */
export function renderActiveTierFootnote(quote, activeIdx, tierIdx, lang) {
  const activeMoq = getTierMoq(quote, activeIdx);
  const thisMoq = getTierMoq(quote, tierIdx);
  const en = LABEL_ACTIVE_FOOTNOTE.en
    .replace('{active_moq}', formatMoq(activeMoq))
    .replace('{this_tier_moq}', formatMoq(thisMoq));
  const vi = LABEL_ACTIVE_FOOTNOTE.vi
    .replace('{active_moq}', formatMoq(activeMoq))
    .replace('{this_tier_moq}', formatMoq(thisMoq));
  return biLabel(en, vi, lang);
}

// Inlined copy of the i18n LABELS entry so the renderer is self-contained
// (the i18n.js L() helper doesn't support placeholder substitution).
const LABEL_ACTIVE_FOOTNOTE = {
  en: '[active-tier] — Labor, overhead, and tooling costs reflect the active tier (MOQ {active_moq}). Material, ink, and process costs are tier-specific (MOQ {this_tier_moq}).',
  vi: '[tier-hoạt-động] — Chi phí nhân công, overhead, và tooling phản ánh tier đang active (MOQ {active_moq}). Chi phí vật tư, mực, công đoạn được tính theo tier này (MOQ {this_tier_moq}).',
};

function formatMoq(n) {
  if (n == null) return '—';
  if (n >= 1000) return n.toLocaleString('en-US');
  return String(n);
}
