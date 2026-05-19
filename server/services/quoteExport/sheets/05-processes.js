// @ts-check
/**
 * Sheet 05 — Processes. Per spec, customer variant hides Tool Cost +
 * Tool Life (reveals competitive die info).
 */

import { createSheet, freezeTop, hideColumns } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

const PROC_COLS = [
  { key: 'process_type', label: 'proc.process_type', width: 14 },
  { key: 'workcenter', label: 'proc.workcenter', width: 14 },
  { key: 'speed', label: 'proc.speed', width: 10, numeric: true },
  { key: 'speed_uom', label: 'proc.speed_uom', width: 10 },
  { key: 'layout', label: 'proc.layout', width: 9, numeric: true },
  { key: 'efficiency', label: 'proc.efficiency', width: 11, numeric: true },
  { key: 'setup_h', label: 'proc.setup_h', width: 9, numeric: true },
  { key: 'scrap_pct', label: 'proc.scrap_pct', width: 10, numeric: true },
  { key: 'manual_uph', label: 'proc.manual_uph', width: 11, numeric: true },
  { key: 'tool_cost', label: 'proc.tool_cost', width: 11, numeric: true, customerHidden: true },
  { key: 'tool_type', label: 'proc.tool_type', width: 12 },
  { key: 'tool_life', label: 'proc.tool_life', width: 11, numeric: true, customerHidden: true },
  { key: 'extra_cost', label: 'proc.extra_cost', width: 11, numeric: true },
  { key: 'mach_rate', label: 'proc.mach_rate', width: 11, numeric: true },
  { key: 'labor_rate', label: 'proc.labor_rate', width: 11, numeric: true },
  { key: 'crew', label: 'proc.crew', width: 8, numeric: true },
  { key: 'setup_cost', label: 'mat.setup_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'run_cost', label: 'mat.run_cost', width: 12, numeric: true, computedOnly: true },
  { key: 'total', label: 'common.total', width: 12, numeric: true, computedOnly: true },
];

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual', rateLookup?: (wc:string) => any }} ctx
 */
export function buildProcessesSheet(wb, ctx) {
  const { quote, variant, lang, rateLookup } = ctx;
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
  const procs = Array.isArray(state.processes) ? state.processes : [];

  let r = 3;
  PROC_COLS.forEach((c, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = L(c.label, lang);
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 36;
  r += 1;

  if (procs.length === 0) {
    sheet.mergeCells(`A${r}:S${r}`);
    sheet.getCell(`A${r}`).value = '—';
    applyStyle(sheet.getCell(`A${r}`), 'body');
    r += 1;
  } else {
    for (const proc of procs) {
      if (!proc || proc.hidden) continue;
      const rate = rateLookup ? rateLookup(proc.workcenter) : null;
      PROC_COLS.forEach((c, ci) => {
        const cell = sheet.getCell(r, ci + 1);
        cell.value = extractCellValue(c, proc, rate);
        applyStyle(cell, c.numeric ? 'num' : 'body');
        if (c.computedOnly) cell.note = 'Computed at calc time, not persisted.';
      });
      r += 1;
    }
  }

  // Aggregate subtotal — per-row breakdown not persisted (MES-3-FIX-41).
  // Setup = setup_mach + setup_labor; Run = (overhead + labor + tooling)
  // minus the setup portion that's folded into bd_labor/bd_overhead per
  // calcEngine.js:856 comment. Total = setup + run.
  const result = quote.result || {};
  const setupMach = Number(result.bd_setup_mach) || 0;
  const setupLabor = Number(result.bd_setup_labor) || 0;
  const overhead = Number(result.bd_overhead) || 0;
  const labor = Number(result.bd_labor) || 0;
  const tooling = Number(result.tooling) || 0;
  const procSetup = setupMach + setupLabor;
  const procTotal = overhead + labor + tooling;
  const procRun = procTotal - procSetup;
  if (procSetup > 0 || procTotal > 0) {
    r += 1;
    writeSubtotalRow(sheet, r, PROC_COLS, L('common.subtotal', lang), {
      setup_cost: procSetup,
      run_cost: procRun >= 0 ? procRun : null,
      total: procTotal,
    });
    r += 1;
  }

  r += 1;
  sheet.mergeCells(`A${r}:S${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = L('common.computed_at_calc', lang);
  applyStyle(note, 'footnote');

  if (variant === 'customer') {
    const letters = PROC_COLS.map((c, i) => (c.customerHidden ? letterFor(i + 1) : null)).filter(
      Boolean
    );
    hideColumns(sheet, letters);
  }

  freezeTop(sheet, 1);
}

function extractCellValue(col, proc, rate) {
  if (col.computedOnly) return '—';
  switch (col.key) {
    case 'process_type':
      return proc.process_type || '';
    case 'workcenter':
      return proc.workcenter || '';
    case 'speed':
      return numCell(proc.speed);
    case 'speed_uom':
      return (rate && rate.speed_uom) || '';
    case 'layout':
      return numCell(proc.layout);
    case 'efficiency':
      return numCell(proc.efficiency);
    case 'setup_h':
      return numCell(proc.setup_h);
    case 'scrap_pct':
      return numCell(proc.scrap_pct);
    case 'manual_uph':
      return numCell(proc.manual_uph);
    case 'tool_cost':
      return numCell(proc.tool_cost);
    case 'tool_type':
      return proc.tool_type || '';
    case 'tool_life':
      return numCell(proc.tool_life);
    case 'extra_cost':
      return numCell(proc.extra_cost);
    case 'mach_rate':
      return rate && rate.machine_rate != null ? Number(rate.machine_rate) : '—';
    case 'labor_rate':
      return rate && rate.labor_rate != null ? Number(rate.labor_rate) : '—';
    case 'crew':
      return rate && rate.crew != null ? Number(rate.crew) : '—';
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
