// @ts-check
/**
 * Sheet 08 — Cost Breakdown by category.
 *
 * Customer variant: rolls up to 5 buckets (Material, Manufacturing,
 * Tooling, Packaging, Margin).
 * Internal variant: shows all ~15 bd_* buckets from result.
 *
 * Multi-tier behaviour (Sprint S-EXPORT-MT-FIX):
 *   - Active tier: numbers come from `quote.result.bd_*` snapshot
 *     directly (full calcEngine pass produced these on save).
 *   - Non-active tier: material / ink / process Setup+Run cells are
 *     derived from `result.tiers[tierIdx].rows.*` (or Cpx subproducts)
 *     so they match what the operator sees on sheets 03/04/05.
 *     Labor / overhead / tooling stay active-tier with the [active-tier]
 *     footnote — calcEngine is locked client-side so we can't recompute
 *     those buckets per tier server-side.
 */

import { createSheet, freezeTop } from '../workbook.js';
import { applyStyle } from '../styles.js';
import { L } from '../i18n.js';
import { pickStdTierRows, pickCpxTierRows, sumRowCosts, getActiveIdx } from '../tierRows.js';
import { renderActiveTierFootnote } from './05-processes.js';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {{ quote: any, tierIdx?: number, variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual' }} ctx
 */
export function buildCostBreakdownSheet(wb, ctx) {
  const { quote, variant, lang } = ctx;
  const tierIdx = Number.isInteger(ctx.tierIdx) ? ctx.tierIdx : getActiveIdx(quote);
  const activeIdx = getActiveIdx(quote);
  const isActive = tierIdx === activeIdx;
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
  const tierBuckets = computeTierBuckets(quote, tierIdx, isActive);
  const rows =
    variant === 'customer'
      ? buildCustomerRows(result, tierBuckets, lang)
      : buildInternalRows(result, tierBuckets, lang);

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
  r += 1;

  // Non-active tier disclosure — labor/overhead/tooling come from the
  // active tier; material/ink/process are this tier's per-row sums.
  if (!isActive) {
    r += 1;
    sheet.mergeCells(`A${r}:F${r}`);
    const fn = sheet.getCell(`A${r}`);
    fn.value = renderActiveTierFootnote(quote, activeIdx, tierIdx, lang);
    fn.alignment = { wrapText: true, vertical: 'top' };
    applyStyle(fn, 'footnote');
    sheet.getRow(r).height = lang === 'bilingual' ? 60 : 36;
  }

  freezeTop(sheet, 1);
}

/**
 * Compute the per-tier material/ink/process setup + run aggregates that
 * the cost-breakdown rows consume. Returns `null` buckets for active
 * tier so the existing `result.bd_*` path stays the source of truth.
 *
 * @param {object} quote
 * @param {number} tierIdx
 * @param {boolean} isActive
 * @returns {{
 *   matSetup: number|null, matRun: number|null,
 *   inkSetup: number|null, inkRun: number|null,
 *   procSetup: number|null, procRun: number|null,
 * }}
 */
function computeTierBuckets(quote, tierIdx, isActive) {
  if (isActive) {
    return {
      matSetup: null,
      matRun: null,
      inkSetup: null,
      inkRun: null,
      procSetup: null,
      procRun: null,
    };
  }
  const result = quote.result || {};
  const isCpx = quote.type === 'complex';
  const acc = {
    matSetup: 0,
    matRun: 0,
    inkSetup: 0,
    inkRun: 0,
    procSetup: 0,
    procRun: 0,
    any: false,
  };

  function fold(rows, setupKey, runKey) {
    const t = sumRowCosts(rows);
    acc[setupKey] += t.setup;
    acc[runKey] += t.run;
    acc.any = acc.any || t.hasAny;
  }

  if (isCpx && Array.isArray(quote.state?.subproducts)) {
    quote.state.subproducts.forEach((_sp, spi) => {
      fold(pickCpxTierRows(result, spi, tierIdx, 'materials_main'), 'matSetup', 'matRun');
      fold(pickCpxTierRows(result, spi, tierIdx, 'materials_alt'), 'matSetup', 'matRun');
      fold(pickCpxTierRows(result, spi, tierIdx, 'inks'), 'inkSetup', 'inkRun');
      fold(pickCpxTierRows(result, spi, tierIdx, 'processes'), 'procSetup', 'procRun');
    });
  } else {
    fold(pickStdTierRows(result, tierIdx, 'materials_main'), 'matSetup', 'matRun');
    fold(pickStdTierRows(result, tierIdx, 'materials_alt'), 'matSetup', 'matRun');
    fold(pickStdTierRows(result, tierIdx, 'inks'), 'inkSetup', 'inkRun');
    fold(pickStdTierRows(result, tierIdx, 'processes'), 'procSetup', 'procRun');
  }
  return {
    matSetup: acc.any ? acc.matSetup : null,
    matRun: acc.any ? acc.matRun : null,
    inkSetup: acc.any ? acc.inkSetup : null,
    inkRun: acc.any ? acc.inkRun : null,
    procSetup: acc.any ? acc.procSetup : null,
    procRun: acc.any ? acc.procRun : null,
  };
}

function buildCustomerRows(result, tier, lang) {
  // 5-bucket roll-up — material + ink consume per-tier values when
  // present, fall through to active-tier `bd_*` aggregates otherwise.
  const matSetup = tier.matSetup ?? num(result.bd_mat_setup) ?? 0;
  const matRun = tier.matRun ?? num(result.bd_mat_run) ?? 0;
  const inkSetup = tier.inkSetup ?? num(result.bd_ink_setup) ?? 0;
  const inkRun = tier.inkRun ?? num(result.bd_ink_run) ?? 0;
  const mat = matSetup + matRun + inkSetup + inkRun;
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

function buildInternalRows(result, tier, lang) {
  return [
    [L('cb.material_setup', lang), tier.matSetup ?? num(result.bd_mat_setup)],
    [L('cb.material_run', lang), tier.matRun ?? num(result.bd_mat_run)],
    [L('cb.ink_setup', lang), tier.inkSetup ?? num(result.bd_ink_setup)],
    [L('cb.ink_run', lang), tier.inkRun ?? num(result.bd_ink_run)],
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
