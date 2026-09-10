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
import { pickStdTierRows, pickCpxTierRows, getActiveIdx } from '../tierRows.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx: number, lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildBalancingSheet(wb, ctx) {
  const { quote, lang } = ctx;
  const tierIdx = Number.isInteger(ctx.tierIdx) ? ctx.tierIdx : getActiveIdx(quote);
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
  const result = quote.result || {};
  const isCpx = quote.type === 'complex';

  // Process groups + persisted per-row breakdown (carries total_time now).
  const groups =
    isCpx && Array.isArray(state.subproducts) && state.subproducts.length > 0
      ? state.subproducts.map((sp, spi) => ({
          label: sp.code || `SP${spi + 1}`,
          procs: Array.isArray(sp.processes) ? sp.processes : [],
          rows: pickCpxTierRows(result, spi, tierIdx, 'processes'),
        }))
      : [
          {
            label: null,
            procs: Array.isArray(state.processes) ? state.processes : [],
            rows: pickStdTierRows(result, tierIdx, 'processes'),
          },
        ];

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

  const moq = Number(tier.moq) || 0;
  const eau = Number(tier.eau) || 0;
  const anyProc = groups.some((g) => g.procs.some((p) => p && !p.hidden));
  if (!anyProc) {
    sheet.mergeCells(`A${r}:H${r}`);
    sheet.getCell(`A${r}`).value = '—';
    applyStyle(sheet.getCell(`A${r}`), 'body');
  } else {
    // First pass — collect MOQ run time (hrs) per row so we can flag the
    // slowest (bottleneck). MOQ run time = persisted total_time / 60.
    const rowData = [];
    for (const g of groups) {
      for (let i = 0; i < g.procs.length; i++) {
        const proc = g.procs[i];
        if (!proc || proc.hidden) continue;
        const rc = Array.isArray(g.rows) ? g.rows[i] : null;
        const moqTime = rc && rc.total_time != null ? Number(rc.total_time) / 60 : null;
        rowData.push({ g, proc, moqTime });
      }
    }
    const maxMoqTime = rowData.reduce((m, x) => (x.moqTime > m ? x.moqTime : m), 0);

    let lastLabel = null;
    for (const { g, proc, moqTime } of rowData) {
      if (g.label && g.label !== lastLabel) {
        sheet.mergeCells(`A${r}:H${r}`);
        sheet.getCell(`A${r}`).value = g.label;
        applyStyle(sheet.getCell(`A${r}`), 'section');
        lastLabel = g.label;
        r += 1;
      }
      // EAU run time scales the MOQ run time to annual volume; shifts assume
      // an 8-hour shift. Both '—' when the process has no run time.
      const eauTime = moqTime != null && moq > 0 && eau > 0 ? moqTime * (eau / moq) : null;
      const shifts = eauTime != null ? eauTime / 8 : null;
      const isBottleneck = moqTime != null && moqTime > 0 && moqTime === maxMoqTime;
      const row = sheet.getRow(r);
      row.getCell(1).value = proc.workcenter || '—';
      row.getCell(2).value = numCell(proc.speed);
      row.getCell(3).value = numCell(proc.layout);
      row.getCell(4).value = numCell(proc.setup_h);
      row.getCell(5).value = moqTime != null ? round4(moqTime) : '—';
      row.getCell(6).value = eauTime != null ? round4(eauTime) : '—';
      row.getCell(7).value = shifts != null ? round4(shifts) : '—';
      row.getCell(8).value = isBottleneck ? '◄ BN' : '';
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

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function numCell(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : '—';
}
