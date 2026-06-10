// @ts-check
/**
 * Sheet 10 — Pricing Snapshot. Operator-facing audit metadata showing
 * when the quote was frozen, by whom, under which site, plus rollup
 * counts of frozen library entries.
 *
 * Distinct from the hidden `_Audit` sheet (MVP-2 forensic / HMAC
 * metadata read by the MVP-3 importer + auditors). This visible sheet
 * is for the operator + customer + finance reviewer who wants to know
 * "is this quote pinned to old rates or computed against today's
 * library?" without opening a hidden sheet via Excel right-click.
 *
 * Layout (2-column field / value, rows 3 onwards):
 *   3  Quote ID
 *   4  Quote saved at
 *   5  Pricing captured at
 *   6  Pricing captured by
 *   7  Site
 *   8  Library version
 *   9  Snapshot status
 *  10  Materials frozen
 *  11  Workcenters frozen
 *  12  Coverage rows
 *  13  Warnings
 */

import { createSheet } from '../workbook.js';
import { applyStyle } from '../styles.js';

const SHEET_NAME = '10 Pricing Snapshot';

/**
 * Compact ISO → human-readable formatter mirroring the client-side
 * formatSnapshotDateTime helper. Kept inline so the server sheet
 * builder stays zero-dep.
 */
function formatTimestamp(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function resolveSnapshotStatus(snap) {
  if (!snap || typeof snap !== 'object') return 'empty';
  if (snap._synthesized === true) return 'synthesized';
  if (typeof snap._captured_at === 'string' && snap._captured_at.length > 0) {
    return 'persisted';
  }
  return 'empty';
}

function statusLabel(status) {
  if (status === 'persisted') return 'Frozen at save time';
  if (status === 'synthesized') return 'Live rates (no snapshot persisted)';
  return 'No snapshot';
}

function countDictKeys(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{
 *   quote: any,
 *   tierIdx: number,
 *   tierKpis: any,
 *   variant: 'customer'|'internal',
 *   lang: 'en'|'vi'|'bilingual'
 * }} ctx
 */
export function buildPricingSnapshotSheet(wb, ctx) {
  const { quote } = ctx;
  const sheet = createSheet(wb, {
    name: SHEET_NAME,
    bannerText: 'Pricing Snapshot',
    orientation: 'portrait',
    bannerSpan: 2,
  });

  // Column widths — operator label vs value column. Value column wide
  // enough for ISO timestamps + sentence-form warnings.
  sheet.getColumn('A').width = 28;
  sheet.getColumn('B').width = 72;

  // Header row 2: "Field" / "Value" — reuse the standard `th` preset
  // (white-on-primary, bold) shared by every other sheet's column
  // headers so the visual matches existing surfaces.
  const header = sheet.getRow(2);
  header.getCell('A').value = 'Field';
  header.getCell('B').value = 'Value';
  applyStyle(header.getCell('A'), 'th');
  applyStyle(header.getCell('B'), 'th');

  const snap = (quote && quote.state && quote.state.pricing_snapshot) || null;
  const status = resolveSnapshotStatus(snap);
  const warnings = (quote && quote.result && quote.result._warnings) || [];
  const warningText = Array.isArray(warnings) && warnings.length > 0
    ? warnings.map((w) => (w && w.message) || String(w)).join('\n')
    : '—';

  const rows = [
    ['Quote ID', String(quote?.id ?? '—')],
    ['Quote saved at', formatTimestamp(quote?.saved_at)],
    ['Pricing captured at', formatTimestamp(snap?._captured_at)],
    ['Pricing captured by', snap?._captured_by ? String(snap._captured_by) : '—'],
    ['Site', snap?._site || '—'],
    ['Library version', snap?._lib_version || '—'],
    ['Snapshot status', statusLabel(status)],
    ['Materials frozen', countDictKeys(snap?.materials)],
    ['Workcenters frozen', countDictKeys(snap?.rates)],
    ['Coverage rows', Array.isArray(snap?.coverage) ? snap.coverage.length : 0],
    ['Warnings', warningText],
  ];

  rows.forEach(([label, value], i) => {
    const r = sheet.getRow(3 + i);
    r.getCell('A').value = label;
    r.getCell('B').value = value;
    applyStyle(r.getCell('A'), 'label');
    applyStyle(r.getCell('B'), 'body');
    // Multi-line warning cell — turn on wrap so newline-separated
    // entries display vertically.
    if (label === 'Warnings') {
      r.getCell('B').alignment = { vertical: 'top', wrapText: true };
      r.height = Math.max(20, Array.isArray(warnings) ? warnings.length * 16 : 20);
    }
  });
}
