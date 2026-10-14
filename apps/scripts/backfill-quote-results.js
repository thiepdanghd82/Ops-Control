#!/usr/bin/env node
/**
 * backfill-quote-results.js — one-time repair for quote_history.json rows
 * whose stored `result` is null or minimal ({gm, va, s_ttl} only). These
 * rows can't be migrated by scripts/migrate-quote-va.js because that
 * migration only recomputes from already-stored breakdown fields.
 *
 * Strategy: import the client's pure calcEngine, load lib JSONs directly
 * from disk, and run calcAll() / aggregateComplex() against each quote's
 * persisted `state`. Write the full breakdown back via
 * `serializeResultForPersist`.
 *
 * Rationale: Sprint 14 expanded the save path so new + edited quotes get
 * the full breakdown, but historical rows that were saved before that
 * sprint keep their thin schema forever unless an admin opens + saves
 * them. For portfolio-level reporting (Summarize, QuoteAnalysis,
 * QuoteHistory filters/sorts) this backfill makes every historical row
 * queryable without the render-time fallback.
 *
 * Safety:
 *   - --dry-run prints diff + exits. Default behavior.
 *   - Apply with --apply. Creates a backup sibling file first.
 *   - Idempotent: re-running after a successful apply produces zero diffs.
 *   - Skips quotes whose state is empty or whose calcAll throws
 *     (e.g. corrupt state schema). Never overwrites a good result with
 *     a null.
 *
 * Usage:
 *   node scripts/backfill-quote-results.js              # dry-run
 *   node scripts/backfill-quote-results.js --apply      # write
 *   node scripts/backfill-quote-results.js --apply --file custom.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  calcAll,
  aggregateComplex,
  getActiveTierState,
  serializeResultForPersist,
} from '../client/src/services/calcEngine.js';
import { upgradeCplxState } from '../client/src/services/cplxMigration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'server', 'data', 'Library');
const DEFAULT_QUOTES = path.join(DATA_DIR, 'QuoteHistory', 'quote_history.json');

function parseArgs(argv) {
  const args = { apply: false, file: DEFAULT_QUOTES };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: backfill-quote-results.js [--apply] [--file path.json]');
      process.exit(0);
    }
  }
  return args;
}

function readJsonSafe(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return fallback;
  }
}

/**
 * Load the library shape calcEngine expects. calcEngine reads
 * `lib.rate`, `lib.mat`, `lib.ddl`, `lib.finance.summary`. We mirror
 * the client load-all shape so calcAll sees the same thing users see.
 */
export function loadLib(dataDir = DATA_DIR) {
  return {
    rate: readJsonSafe(path.join(dataDir, 'Rate', 'rate.json'), []),
    mat: readJsonSafe(path.join(dataDir, 'MaterialCost', 'materials.json'), []),
    ddl: readJsonSafe(path.join(dataDir, 'DDL', 'ddl.json'), {}),
    finance: { summary: readJsonSafe(path.join(dataDir, 'Finance', 'finance_sum.json'), {}) },
    inkCalc: readJsonSafe(path.join(dataDir, 'InkCalc', 'ink_calc.json'), {}),
  };
}

/** True when a result is missing the Sprint-14 expanded breakdown. */
export function isThinResult(result) {
  if (!result || typeof result !== 'object') return true;
  return typeof result.s_mat_cost !== 'number';
}

/**
 * Recompute one quote against the loaded lib. Returns the new result,
 * or null if we couldn't produce one (state missing / calc threw).
 * Never throws — callers just log + skip.
 */
export function recomputeQuote(quote, lib) {
  if (!quote || !quote.state || typeof quote.state !== 'object') return null;
  try {
    if (quote.type === 'complex') {
      const cs = upgradeCplxState(quote.state);
      const sps = cs.subproducts || [];
      if (!sps.length) return null;
      const tierIdx = cs.active_moq_idx || 0;
      const { aggregate } = aggregateComplex(cs, sps, lib, tierIdx);
      if (!aggregate) return null;
      // Compute canonical KPIs the same way ComplexCalc.jsx does.
      const sp = cs.selling_price || 0;
      if (sp > 0) {
        aggregate.sp = sp;
        aggregate.gm = (sp - (aggregate.s_ttl || 0)) / sp;
        aggregate.va =
          (sp -
            (aggregate.s_mat_cost || 0) -
            (aggregate.tooling || 0) -
            (aggregate.packing_ship || 0)) /
          sp;
        aggregate.contribution =
          1 -
          ((aggregate.s_mat_cost || 0) +
            (aggregate.tooling || 0) +
            (aggregate.packing_ship || 0) +
            (aggregate.labor_cost || 0)) /
            sp;
      }
      return serializeResultForPersist(aggregate);
    }
    // Standard (or missing type — treat as std).
    const tierSt = getActiveTierState(quote.state);
    const result = calcAll(tierSt, null, lib, null);
    return serializeResultForPersist(result);
  } catch (err) {
    return { __error: err?.message || String(err) };
  }
}

export function backfillQuotes(quotes, lib) {
  const report = {
    total: quotes.length,
    already_full: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    changes: [],
  };
  const next = quotes.map((q) => {
    if (!q) {
      report.skipped++;
      return q;
    }
    if (!isThinResult(q.result)) {
      report.already_full++;
      return q;
    }
    const fresh = recomputeQuote(q, lib);
    if (!fresh) {
      report.skipped++;
      return q;
    }
    if (fresh.__error) {
      report.errors.push({ id: q.id, type: q.type, error: fresh.__error });
      report.skipped++;
      return q;
    }
    report.updated++;
    const before = q.result || {};
    report.changes.push({
      id: q.id,
      type: q.type,
      before: { gm: before.gm ?? null, va: before.va ?? null, s_ttl: before.s_ttl ?? null },
      after: { gm: fresh.gm ?? null, va: fresh.va ?? null, s_ttl: fresh.s_ttl ?? null },
    });
    return { ...q, result: fresh };
  });
  return { next, report };
}

function pctStr(v) {
  return v == null ? '—' : (v * 100).toFixed(2) + '%';
}
function moneyStr(v) {
  return v == null ? '—' : '$' + Number(v).toFixed(5);
}

function printReport(report, apply) {
  console.log(`${apply ? '' : '[DRY-RUN] '}Quote result backfill report`);
  console.log(`  Total quotes:           ${report.total}`);
  console.log(`  Already full-schema:    ${report.already_full}`);
  console.log(`  Updated:                ${report.updated}`);
  console.log(`  Skipped (bad state):    ${report.skipped}`);
  console.log(`  Calc errors:            ${report.errors.length}`);
  if (report.errors.length) {
    console.log('\n  Errors:');
    for (const e of report.errors) console.log(`    #${e.id} (${e.type}): ${e.error}`);
  }
  if (report.changes.length) {
    console.log('\n  Backfilled quotes:');
    for (const c of report.changes.slice(0, 20)) {
      console.log(
        `    #${c.id} (${c.type})  gm ${pctStr(c.before.gm)}→${pctStr(c.after.gm)}  va ${pctStr(c.before.va)}→${pctStr(c.after.va)}  sTtl ${moneyStr(c.before.s_ttl)}→${moneyStr(c.after.s_ttl)}`
      );
    }
    if (report.changes.length > 20) console.log(`    … and ${report.changes.length - 20} more`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const lib = loadLib();
  if (!Array.isArray(lib.rate) || lib.rate.length === 0) {
    console.error('rate.json missing or empty — cannot recompute without work-center rates.');
    process.exit(1);
  }
  const raw = fs.readFileSync(args.file, 'utf-8');
  const quotes = JSON.parse(raw);
  if (!Array.isArray(quotes)) {
    console.error(`Expected an array in ${args.file}`);
    process.exit(1);
  }
  const { next, report } = backfillQuotes(quotes, lib);
  printReport(report, args.apply);
  if (!args.apply) {
    console.log('\n[DRY-RUN] no file written. Re-run with --apply to persist.');
    return;
  }
  if (report.updated === 0) {
    console.log('\nNothing to backfill. Exit.');
    return;
  }
  const backup = args.file + '.pre-backfill-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(args.file, backup);
  console.log(`\nBackup: ${backup}`);
  fs.writeFileSync(args.file + '.tmp', JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(args.file + '.tmp', args.file);
  console.log(`Wrote: ${args.file}`);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
