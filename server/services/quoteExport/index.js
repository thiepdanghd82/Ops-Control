// @ts-check
/**
 * Quote-export public entry. `exportQuote(quote, opts)` returns one of:
 *   - { kind: 'xlsx', filename, buffer, auditMeta } — single tier
 *   - { kind: 'zip',  filename, buffer, auditMeta } — multi-tier
 *
 * `auditMeta` is `{wbPasswordHash, schemaSha256, hmac}[]` (one entry
 * per tier) so the route layer can stamp every workbook's forensic
 * trace into the audit log without re-cracking the xlsx bytes.
 *
 * Per locked decision #1: NO calcEngine on server.
 * Per locked decision #4: NO layout diagram embed.
 *
 * MVP-2 (this PR): adds _Audit + _Schema hidden sheets, HMAC, per-sheet
 * password protection, customer watermark.
 * MVP-3 (not yet): re-import + diff + apply flow.
 */

import crypto from 'node:crypto';
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
import { buildPricingSnapshotSheet } from './sheets/10-pricing-snapshot.js';
// MVP-2 tamper-resistance pipeline
import { buildAuditSheet } from './audit.js';
import { encodeSchemaPayload, buildSchemaSheet } from './schema.js';
import { assertHmacKey, stampHmac } from './hmac.js';
import { generateWorkbookPassword, protectAllSheets } from './protect.js';
import { applyWatermark } from './watermark.js';

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
 * @property {string} [hmacKey]  Override env-derived key (tests).
 * @property {object} [lib]      Optional library for fingerprint stamp.
 */

/**
 * @typedef {object} TierAudit
 * @property {string} wbPasswordHash  sha256(password) — forensic trace
 * @property {string} schemaSha256    sha256 of decoded payload bytes
 * @property {string} hmac            HMAC-SHA256 stamp (matches _Schema!A2)
 * @property {number} tierIdx
 * @property {string} filename
 */

/**
 * @param {object} quote
 * @param {ExportOpts} opts
 * @returns {Promise<{ kind:'xlsx'|'zip', filename:string, buffer:Buffer, auditMeta: TierAudit[] }>}
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

  // MVP-2: HMAC key is REQUIRED. Tests pass an override; route gets it
  // via deps wiring; preflight rejects boot if env missing.
  const hmacKey = opts?.hmacKey || process.env.OPS_EXPORT_HMAC_KEY;
  try {
    assertHmacKey(hmacKey);
  } catch (err) {
    throw new QuoteExportError(
      'missing_hmac_key',
      err instanceof Error ? err.message : String(err),
      500
    );
  }

  const tiers = enumerateTiers(quote.state || {});
  const requestedIdxs = resolveTierIdxs(opts?.tiers, tiers.length);

  // Build one workbook per tier
  const builtPerTier = [];
  for (const idx of requestedIdxs) {
    const tier = tiers[idx];
    const kpis = pickKpisForTier(quote, idx, tier);
    const { buffer, audit } = await buildOneXlsx({
      quote,
      tier,
      tierIdx: idx,
      tierKpis: kpis,
      variant,
      lang,
      exportedBy: opts?.exportedBy || '-',
      engineSha: opts?.engineSha,
      rateLookup: opts?.rateLookup,
      hmacKey,
      lib: opts?.lib,
      now: opts?.now,
      // dev-only escape hatch — see buildOneXlsx return shape
      includePassword: opts?.includePassword === true,
    });
    const filename = build1TierName({
      rfq: quote.state?.rfq_number || quote.label,
      customer: quote.state?.end_cu || quote.state?.direct_cu,
      tierLabel: tier.moq ?? idx + 1,
      variant,
      version: quote._version ?? 1,
      now: opts?.now,
    });
    builtPerTier.push({ idx, filename, buffer, audit: { ...audit, tierIdx: idx, filename } });
  }

  if (builtPerTier.length === 1) {
    const only = builtPerTier[0];
    return {
      kind: 'xlsx',
      filename: only.filename,
      buffer: only.buffer,
      auditMeta: [only.audit],
    };
  }

  const zipName = buildZipName({
    rfq: quote.state?.rfq_number || quote.label,
    customer: quote.state?.end_cu || quote.state?.direct_cu,
    version: quote._version ?? 1,
    now: opts?.now,
  });
  const zipBuf = await buildZip(
    builtPerTier.map((e) => ({ filename: e.filename, buffer: e.buffer }))
  );
  return {
    kind: 'zip',
    filename: zipName,
    buffer: zipBuf,
    auditMeta: builtPerTier.map((e) => e.audit),
  };
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

/**
 * Compute a stable fingerprint for the library snapshot so MVP-3 can
 * detect "exported against a different library version" without
 * embedding the whole lib (200KB+) in the xlsx.
 */
function libraryFingerprint(lib) {
  if (!lib) return '-';
  try {
    const json = JSON.stringify(lib);
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  } catch {
    return '-';
  }
}

async function buildOneXlsx(ctx) {
  const {
    quote,
    tierIdx,
    tierKpis,
    variant,
    lang,
    exportedBy,
    engineSha,
    rateLookup,
    hmacKey,
    lib,
    now,
  } = ctx;
  const wb = createWorkbook({
    title: `Quote ${quote.label || quote.id} · MOQ ${tierIdx + 1}`,
    exportedBy,
  });

  // 1. Visible sheets (existing MVP-1 + MVP-1.5 pipeline).
  //    Sheets that render per-tier data (Materials / Inks / Processes /
  //    Cost Breakdown) MUST receive `tierIdx` so the multi-tier zip
  //    contains genuinely different numbers per file. Without it the
  //    sheets fall through to `result.rows.*` which is the active-tier
  //    mirror — every xlsx in the zip ends up identical (P0 data bug
  //    surfaced 2026-05-20).
  buildCoverSheet(wb, { quote, tierIdx, tierKpis, variant, lang, exportedBy, engineSha });
  buildRfqMoqSheet(wb, { quote, lang });
  buildLayoutSheet(wb, { quote, lang });
  buildMaterialsSheet(wb, { quote, tierIdx, variant, lang });
  buildInksSheet(wb, { quote, tierIdx, variant, lang });
  buildProcessesSheet(wb, { quote, tierIdx, variant, lang, rateLookup });
  buildBalancingSheet(wb, { quote, tierIdx, lang });
  buildPackShipSheet(wb, { quote, lang });
  buildCostBreakdownSheet(wb, { quote, tierIdx, variant, lang });
  buildSummarySheet(wb, { quote, tierIdx, tierKpis, variant, lang });
  // Phase 4 (Sprint S-D20-PRICING-SNAPSHOT) — operator-facing audit
  // metadata for the pricing snapshot (frozen rates / captured at /
  // captured by / site / warnings). Distinct from the hidden _Audit
  // sheet below which carries HMAC + payload sha256.
  buildPricingSnapshotSheet(wb, { quote, tierIdx, tierKpis, variant, lang });

  // 2. MVP-2 Item E — customer watermark BEFORE _Audit/_Schema so the
  //    watermark style is applied to visible sheets only (the items
  //    check sheet.state internally but defense in depth).
  applyWatermark(wb, variant);

  // 3. MVP-2 Item B — _Schema payload sheet. Encode + build before
  //    Item A so Item A can stamp the same sha256 into _Audit.
  const encoded = encodeSchemaPayload(quote.state || {});
  buildSchemaSheet(wb, encoded);

  // 4. MVP-2 Item A — _Audit metadata sheet (reads payload_sha256 from
  //    Item B's manifest).
  buildAuditSheet(wb, {
    quote,
    variant,
    exportedBy,
    engineSha,
    libraryFingerprint: libraryFingerprint(lib),
    payloadSha256: encoded.sha256,
    now,
  });

  // 5. MVP-2 Item C — HMAC sign the payload bytes (stamps _Schema!A2)
  const hmac = stampHmac(wb, encoded.payload, hmacKey);

  // 6. MVP-2 Item D — per-sheet password protection. MUST run last so
  //    no later mutation is silently rejected. Sheet protection is
  //    cosmetic; the real defense is HMAC above.
  const password = generateWorkbookPassword();
  const { passwordHash } = await protectAllSheets(wb, password);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    audit: {
      wbPasswordHash: passwordHash,
      schemaSha256: encoded.sha256,
      hmac,
      // Dev-only: sample.gen.js sets includePassword=true so the
      // generator can print the password for manual Excel inspection.
      // Prod route MUST NOT set this flag — the audit log only stores
      // the hash; raw passwords are not retrievable post-export.
      ...(ctx.includePassword ? { _devPassword: password } : {}),
    },
  };
}

// Test surface
export { resolveTierIdxs, pickKpisForTier, libraryFingerprint };
