// @ts-check
/**
 * Quote-export public entry. `exportQuote(quote, opts)` returns one of:
 *   - { kind: 'xlsx', filename, buffer } when opts.tiers resolves to 1
 *   - { kind: 'zip',  filename, buffer } when 2+ tiers (or 'all' with N>1)
 *
 * The caller (route handler) maps kind → Content-Type and dispatches.
 *
 * Per task decision #1: NO calcEngine on server. We rely on the quote
 * row's persisted `result` (== task's `derived`). If absent, the route
 * layer is expected to fail-fast with 422; we throw an error here too
 * as a defense-in-depth.
 *
 * Per task decision #4: NO layout diagram embed.
 *
 * MVP-2 scope (NOT shipped here): _Audit hidden sheet, _Schema gzip
 * payload, workbook protection, watermark, re-import.
 */

import { createWorkbook } from './workbook.js';
import { buildZip } from './zip.js';
import { build1TierName, buildZipName } from './filenames.js';
import { enumerateTiers } from './tierUtils.js';
import { buildCoverSheet } from './sheets/00-cover.js';
import { buildRfqMoqSheet } from './sheets/01-rfq-moq.js';
import { buildLayoutSheet } from './sheets/02-layout.js';
import { buildMaterialsSheet } from './sheets/03-materials.js';
import { buildInksSheet } from './sheets/04-inks.js';
import { buildProcessesSheet } from './sheets/05-processes.js';
import { buildBalancingSheet } from './sheets/06-balancing.js';
import { buildPackShipSheet } from './sheets/07-pack-ship.js';
import { buildCostBreakdownSheet } from './sheets/08-cost-breakdown.js';
import { buildSummarySheet } from './sheets/09-summary.js';

export class QuoteExportError extends Error {
  /**
   * @param {string} code  short machine code (e.g. 'no-snapshot')
   * @param {string} message  human-readable detail
   * @param {number} [status=400] HTTP status the route should surface
   */
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'QuoteExportError';
  }
}

/**
 * @typedef {object} ExportOpts
 * @property {'customer'|'internal'} variant
 * @property {'en'|'vi'|'bilingual'} [lang='bilingual']
 * @property {number[]|'all'} [tiers='all']
 * @property {string} [exportedBy]
 * @property {string} [engineSha]
 * @property {Date|string} [now]
 * @property {(wc:string) => any} [rateLookup]
 */

/**
 * @param {object} quote
 * @param {ExportOpts} opts
 * @returns {Promise<{ kind:'xlsx'|'zip', filename:string, buffer:Buffer }>}
 */
export async function exportQuote(quote, opts) {
  if (!quote || typeof quote !== 'object') {
    throw new QuoteExportError('bad-quote', 'quote must be an object', 400);
  }
  if (!quote.result || typeof quote.result !== 'object') {
    throw new QuoteExportError(
      'no-snapshot',
      'Quote has no result snapshot (pre-v1.5 quote); re-save before export.',
      422
    );
  }
  // MES-3-FIX-41: distinct error code for quotes saved BEFORE per-row
  // breakdown landed. UI catches this code separately + prompts re-save.
  // Std: result.rows is the top-level shape. Cpx: result.subproducts is.
  const isCpx = quote.type === 'complex';
  const hasRows = isCpx
    ? Array.isArray(quote.result.subproducts) && quote.result.subproducts.length > 0
    : quote.result.rows && typeof quote.result.rows === 'object';
  if (!hasRows) {
    throw new QuoteExportError(
      'legacy_no_rows',
      'This quote was saved before per-row tracking was added. Open the calculator and re-save to refresh export data.',
      422
    );
  }
  const variant = opts?.variant;
  if (variant !== 'customer' && variant !== 'internal') {
    throw new QuoteExportError('missing-variant', 'variant must be "customer" or "internal"', 400);
  }
  const lang = opts?.lang || 'bilingual';
  if (!['en', 'vi', 'bilingual'].includes(lang)) {
    throw new QuoteExportError('bad-lang', `lang must be 'en'|'vi'|'bilingual', got ${lang}`, 400);
  }

  const tiers = enumerateTiers(quote.state || {});
  const requestedIdxs = resolveTierIdxs(opts?.tiers, tiers.length);

  // Build one workbook per tier
  const builtPerTier = [];
  for (const idx of requestedIdxs) {
    const tier = tiers[idx];
    const kpis = pickKpisForTier(quote, idx, tier);
    const buf = await buildOneXlsx({
      quote,
      tier,
      tierIdx: idx,
      tierKpis: kpis,
      variant,
      lang,
      exportedBy: opts?.exportedBy || '-',
      engineSha: opts?.engineSha,
      rateLookup: opts?.rateLookup,
    });
    const filename = build1TierName({
      rfq: quote.state?.rfq_number || quote.label,
      customer: quote.state?.end_cu || quote.state?.direct_cu,
      tierLabel: tier.moq ?? idx + 1,
      variant,
      version: quote._version ?? 1,
      now: opts?.now,
    });
    builtPerTier.push({ idx, filename, buffer: buf });
  }

  if (builtPerTier.length === 1) {
    const only = builtPerTier[0];
    return { kind: 'xlsx', filename: only.filename, buffer: only.buffer };
  }

  // ZIP for 2+ tiers
  const zipName = buildZipName({
    rfq: quote.state?.rfq_number || quote.label,
    customer: quote.state?.end_cu || quote.state?.direct_cu,
    version: quote._version ?? 1,
    now: opts?.now,
  });
  const zipBuf = await buildZip(
    builtPerTier.map((e) => ({ filename: e.filename, buffer: e.buffer }))
  );
  return { kind: 'zip', filename: zipName, buffer: zipBuf };
}

/**
 * @param {number[]|'all'|undefined} requested
 * @param {number} totalTiers
 * @returns {number[]}
 */
function resolveTierIdxs(requested, totalTiers) {
  if (totalTiers === 0) {
    throw new QuoteExportError('no-tiers', 'Quote has no MOQ tiers to export', 400);
  }
  if (requested == null || requested === 'all') {
    return Array.from({ length: totalTiers }, (_, i) => i);
  }
  if (!Array.isArray(requested)) {
    throw new QuoteExportError('bad-tiers', 'tiers must be an array or "all"', 400);
  }
  if (requested.length === 0) {
    throw new QuoteExportError('bad-tiers', 'tiers array is empty', 400);
  }
  const seen = new Set();
  const out = [];
  for (const t of requested) {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n >= totalTiers) {
      throw new QuoteExportError(
        'bad-tier-index',
        `tier index ${t} out of range [0, ${totalTiers - 1}]`,
        400
      );
    }
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Map quote.result (active tier) + state fields to a stable KPI object
 * for the cover + summary sheets.
 *
 * If the requested tierIdx is NOT the active tier, we can only fill the
 * input fields (moq/eau/sp from state.extra_moqs[idx-1]); GM/VA/CONTR
 * will stay null (snapshot only covers the active tier). The Cover
 * sheet renders `—` for null KPIs.
 */
function pickKpisForTier(quote, tierIdx, tier) {
  const result = quote.result || {};
  const state = quote.state || {};
  const activeIdx = Number(state.active_moq_idx) || 0;
  const isActive = tierIdx === activeIdx;
  return {
    moq: tier.moq,
    eau: tier.eau,
    sp: isActive ? num(result.sp) : tier.sellingPrice,
    gm: isActive ? num(result.gm) : null,
    va: isActive ? num(result.va) : null,
    contribution: isActive ? num(result.contribution) : null,
    targetGm: num(state.target_margin, 0.25),
  };
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function buildOneXlsx(ctx) {
  const { quote, tierIdx, tierKpis, variant, lang, exportedBy, engineSha, rateLookup } = ctx;
  const wb = createWorkbook({
    title: `Quote ${quote.label || quote.id} · MOQ ${tierIdx + 1}`,
    exportedBy,
  });

  buildCoverSheet(wb, { quote, tierIdx, tierKpis, variant, lang, exportedBy, engineSha });
  buildRfqMoqSheet(wb, { quote, lang });
  buildLayoutSheet(wb, { quote, lang });
  buildMaterialsSheet(wb, { quote, variant, lang });
  buildInksSheet(wb, { quote, variant, lang });
  buildProcessesSheet(wb, { quote, variant, lang, rateLookup });
  buildBalancingSheet(wb, { quote, tierIdx, lang });
  buildPackShipSheet(wb, { quote, lang });
  buildCostBreakdownSheet(wb, { quote, variant, lang });
  buildSummarySheet(wb, { quote, tierIdx, tierKpis, variant, lang });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Test surface
export { resolveTierIdxs, pickKpisForTier };
