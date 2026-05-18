// @ts-check
/**
 * Sheet 06 — Capacity balancing. Per-workcenter throughput vs MOQ/EAU.
 *
 * Without calcEngine on server we can't compute UPH directly. The
 * snapshot doesn't store per-process UPH either. We emit the input
 * shape (workcenter, speed, layout, setup_h) and let the reader pair
 * it with the Processes sheet — usable for sanity check, not for
 * machine planning. A more useful version requires MVP-2 (persist
 * derived per-process metrics).
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx: number, lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildBalancingSheet(wb, ctx) {
  const { quote, tierIdx, lang } = ctx;
  const sheet = createSheet(wb, {
    name: '06 Balancing',
    bannerText: L('bal.section', lang),
    orientation: 'portrait',
    bannerSpan: 8,
  });
  sheet.getColumn('A').width = 18;
  sheet.getColumn('B').width = 16;
  ['C', 'D', 'E', 'F', 'G', 'H'].forEach((c) => (sheet.getColumn(c).width = 13));

  const state = quote.state || {};
  const procs = Array.isArray(state.processes) ? state.processes : [];

  let r = 3;
  // MOQ + EAU summary
  const tier =
    tierIdx === 0
      ? { moq: state.moq, eau: state.annual_qty }
      : {
          moq: state.extra_moqs?.[tierIdx - 1]?.moq,
          eau: state.extra_moqs?.[tierIdx - 1]?.eau ?? state.annual_qty,
        };
  sheet.getCell(`A${r}`).value = L('rfq.moq', lang);
  sheet.getCell(`B${r}`).value = numCell(tier.moq);
  applyStyle(sheet.getCell(`A${r}`), 'label');
  applyStyle(sheet.getCell(`B${r}`), 'num');
  r += 1;
  sheet.getCell(`A${r}`).value = L('rfq.eau', lang);
  sheet.getCell(`B${r}`).value = numCell(tier.eau);
  applyStyle(sheet.getCell(`A${r}`), 'label');
  applyStyle(sheet.getCell(`B${r}`), 'num');
  r += 2;

  // Header row
  const headers = [
    L('proc.workcenter', lang),
    L('proc.speed', lang),
    L('proc.layout', lang),
    L('proc.setup_h', lang),
    L('bal.moq_time', lang),
    L('bal.eau_time', lang),
    L('bal.shifts', lang),
    L('bal.bottleneck', lang),
  ];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = h;
    applyStyle(cell, 'th');
  });
  sheet.getRow(r).height = 36;
  r += 1;

  if (procs.length === 0) {
    sheet.mergeCells(`A${r}:H${r}`);
    sheet.getCell(`A${r}`).value = '—';
    applyStyle(sheet.getCell(`A${r}`), 'body');
  } else {
    for (const proc of procs) {
      if (!proc || proc.hidden) continue;
      const row = sheet.getRow(r);
      row.getCell(1).value = proc.workcenter || '—';
      row.getCell(2).value = numCell(proc.speed);
      row.getCell(3).value = numCell(proc.layout);
      row.getCell(4).value = numCell(proc.setup_h);
      row.getCell(5).value = '—';
      row.getCell(6).value = '—';
      row.getCell(7).value = '—';
      row.getCell(8).value = '—';
      applyStyle(row.getCell(1), 'body');
      ['B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
        applyStyle(sheet.getCell(`${col}${r}`), 'num');
      });
      r += 1;
    }
  }

  r += 1;
  sheet.mergeCells(`A${r}:H${r}`);
  const note = sheet.getCell(`A${r}`);
  note.value = L('common.computed_at_calc', lang);
  applyStyle(note, 'footnote');

  freezeTop(sheet, 1);
}

function numCell(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : '—';
}
