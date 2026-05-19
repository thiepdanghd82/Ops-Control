#!/usr/bin/env node
// @ts-check
/**
 * Sample xlsx generator — picks the latest quote from the dev
 * quote_history.json and produces both customer + internal variants
 * (single tier) into the repo's `4. CLAUDE OUTPUT/` dir for manual
 * inspection.
 *
 * Usage:
 *   node server/services/quoteExport/__tests__/sample.gen.js
 *
 * NOT run as part of `npm test` — manual deliverable per task spec.
 */

// MVP-2: exporter requires OPS_EXPORT_HMAC_KEY at call time. The sample
// generator runs ad-hoc by a developer (not under preflight), so seed
// a deterministic dev key if the env doesn't already provide one. The
// resulting xlsx is signed against THIS key — verify.js round-trip
// works as long as the same key is used to verify.
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportQuote } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const HISTORY = path.join(ROOT, 'server/data/Library/QuoteHistory/quote_history.json');
const OUT_DIR = path.resolve(ROOT, '../../4. CLAUDE OUTPUT');

/**
 * MES-3-FIX-41 helper: legacy quotes saved before per-row breakdown
 * landed throw `legacy_no_rows`. For sample generation, synthesize a
 * `rows` block from the aggregate `bd_*` keys (1 row per Material/Ink/
 * Process in state) so the manual deliverable still produces an xlsx
 * — operators get a representative output without re-saving the quote
 * through the UI.
 */
function backfillSyntheticRows(quote) {
  if (quote?.result?.rows) return quote;
  const state = quote.state || {};
  const r = quote.result || {};
  const splitEvenly = (total, n) => (n > 0 && Number.isFinite(total) ? total / n : 0);
  const mats = state.materials_main || state.materials || [];
  const inks = state.inks || [];
  const procs = state.processes || [];
  const matSetup = splitEvenly(r.bd_mat_setup, mats.length);
  const matRun = splitEvenly(r.bd_mat_run, mats.length);
  const inkSetup = splitEvenly(r.bd_ink_setup, inks.length);
  const inkRun = splitEvenly(r.bd_ink_run, inks.length);
  const procSetup = splitEvenly((r.bd_setup_mach || 0) + (r.bd_setup_labor || 0), procs.length);
  const procTotal = splitEvenly(
    (r.bd_overhead || 0) + (r.bd_labor || 0) + (r.tooling || 0),
    procs.length
  );
  const procRun = procTotal - procSetup;
  return {
    ...quote,
    result: {
      ...r,
      rows: {
        materials_main: mats.map(() => ({
          setup_cost: matSetup,
          run_cost: matRun,
          total: matSetup + matRun,
        })),
        materials_alt: (state.materials_alt || []).map(() => ({
          setup_cost: 0,
          run_cost: 0,
          total: 0,
        })),
        inks: inks.map((ink) => {
          const row = { setup_cost: inkSetup, run_cost: inkRun, total: inkSetup + inkRun };
          if (String(ink.print_type || '').startsWith('Indigo')) {
            row.clicks = Number(ink.clicks) || 0;
          }
          return row;
        }),
        processes: procs.map(() => ({
          setup_cost: procSetup,
          run_cost: procRun,
          total: procTotal,
        })),
      },
    },
  };
}

async function main() {
  const all = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  // Pick the most recent quote that has a non-empty `result` snapshot.
  const eligible = all.filter((q) => q && q.result && q.state).reverse();
  if (eligible.length === 0) {
    console.error('No quote with result snapshot found in', HISTORY);
    process.exit(1);
  }
  let quote = eligible[0];
  console.log(`Using quote id=${quote.id} label=${quote.label} type=${quote.type}`);
  if (!quote.result.rows) {
    console.log('  → no result.rows (legacy quote); synthesizing from bd_* aggregates for sample.');
    quote = backfillSyntheticRows(quote);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const variant of ['customer', 'internal']) {
    const out = await exportQuote(quote, {
      variant,
      lang: 'bilingual',
      tiers: 'all',
      exportedBy: 'sample-gen',
      // Dev-only: surface the per-export password so the operator can
      // unlock sheets in Excel for inspection. Prod routes MUST NOT set
      // this flag — production audit trail stores only the password hash.
      includePassword: true,
    });
    if (out.kind !== 'xlsx') {
      console.log(`Quote has ${out.kind} — would be ${out.filename}, len=${out.buffer.length}`);
      const p = path.join(OUT_DIR, out.filename);
      fs.writeFileSync(p, out.buffer);
      console.log(`Wrote ${p} (${out.buffer.length} bytes)`);
      // Multi-tier: one password per tier file.
      for (const m of out.auditMeta || []) {
        console.log(`  🔑  ${m.filename} → password: ${m._devPassword}`);
      }
      continue;
    }
    const p = path.join(OUT_DIR, out.filename);
    fs.writeFileSync(p, out.buffer);
    console.log(`Wrote ${p} (${out.buffer.length} bytes)`);
    const pwd = out.auditMeta?.[0]?._devPassword;
    if (pwd) {
      console.log(`  🔑  Sheet-unprotect password: ${pwd}`);
      console.log(`     (Excel → Review → Unprotect Sheet → paste this value)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
