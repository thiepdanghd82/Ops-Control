#!/usr/bin/env node
/**
 * migrate-quote-va.js — one-time fix for stored result.va / result.gm /
 * result.contribution that diverged from the canonical kpiDefinitions
 * formula. Prior builds of ComplexCalc.jsx and Summarize.jsx overwrote
 * aggregate.va with `(sp - material) / sp` instead of
 * `(sp - material - tooling - packing_ship) / sp`, so any quote saved
 * during that window shows an inflated VA% on QuoteAnalysis +
 * QuoteHistory portfolios.
 *
 * Scope:
 *   - Only quotes whose stored `result` carries the full breakdown
 *     (s_mat_cost, tooling, packing_ship, labor_cost, s_ttl, sp).
 *     Quotes with `result: null` or minimal `{gm, va, s_ttl}` are
 *     skipped — we can't recompute without the lib + state (would need
 *     a full calcAll() re-run with libraries loaded).
 *   - Divergence threshold: 0.0005 (0.05pp) so FP rounding doesn't
 *     trigger rewrites.
 *   - Idempotent: re-running the script on an already-migrated file
 *     produces zero changes.
 *
 * Safety:
 *   - --dry-run prints diff and exits without writing.
 *   - When writing, makes a .pre-migration backup alongside the json.
 *   - Atomic rename via fs.renameSync.
 *
 * Usage:
 *   node scripts/migrate-quote-va.js --dry-run        # preview
 *   node scripts/migrate-quote-va.js                  # apply
 *   node scripts/migrate-quote-va.js --file path.json # custom path
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(
  __dirname,
  '..',
  'server',
  'data',
  'Library',
  'QuoteHistory',
  'quote_history.json'
);
const DELTA = 0.0005;

function parseArgs(argv) {
  const args = { dryRun: false, file: DEFAULT_PATH };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: migrate-quote-va.js [--dry-run] [--file path.json]');
      process.exit(0);
    }
  }
  return args;
}

/**
 * Recompute canonical va / gm / contribution from a full-schema result.
 * Returns null if the result doesn't carry enough fields.
 */
export function recomputeFromResult(result, fallbackSp) {
  if (!result || typeof result !== 'object') return null;
  const sp =
    typeof result.sp === 'number' && result.sp > 0
      ? result.sp
      : typeof fallbackSp === 'number' && fallbackSp > 0
        ? fallbackSp
        : 0;
  if (sp <= 0) return null;
  const mat = typeof result.s_mat_cost === 'number' ? result.s_mat_cost : null;
  const tooling = typeof result.tooling === 'number' ? result.tooling : null;
  const pack = typeof result.packing_ship === 'number' ? result.packing_ship : null;
  const labor = typeof result.labor_cost === 'number' ? result.labor_cost : null;
  const sTtl = typeof result.s_ttl === 'number' ? result.s_ttl : null;
  // Require the fields that feed VA + Contribution. GM needs s_ttl.
  if (mat == null || tooling == null || pack == null) return null;
  const va = 1 - (mat + tooling + pack) / sp;
  const contribution = labor != null ? 1 - (mat + tooling + pack + labor) / sp : null;
  const gm = sTtl != null ? 1 - sTtl / sp : null;
  return { va, contribution, gm };
}

export function migrateQuotes(quotes) {
  const report = {
    total: quotes.length,
    eligible: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    changes: [],
  };
  const next = quotes.map((q) => {
    const r = q?.result;
    if (!r || typeof r.s_mat_cost !== 'number') {
      report.skipped++;
      return q;
    }
    report.eligible++;
    const fresh = recomputeFromResult(r, q.state?.selling_price);
    if (!fresh) {
      report.skipped++;
      return q;
    }
    const diffs = {};
    for (const key of ['va', 'contribution', 'gm']) {
      const old = r[key];
      const nw = fresh[key];
      if (nw == null) continue;
      if (old == null || Math.abs(nw - old) > DELTA) {
        diffs[key] = { from: old, to: nw, delta: nw - (old ?? 0) };
      }
    }
    if (Object.keys(diffs).length === 0) {
      report.unchanged++;
      return q;
    }
    report.updated++;
    report.changes.push({ id: q.id, type: q.type, sp: r.sp ?? q.state?.selling_price, diffs });
    return {
      ...q,
      result: { ...r, ...Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, v.to])) },
    };
  });
  return { next, report };
}

function pctStr(v) {
  if (v == null) return '—';
  return (v * 100).toFixed(2) + '%';
}

function printReport(report, dryRun) {
  console.log(`${dryRun ? '[DRY-RUN] ' : ''}Quote VA migration report`);
  console.log(`  Total quotes:    ${report.total}`);
  console.log(`  Eligible (full): ${report.eligible}`);
  console.log(`  Updated:         ${report.updated}`);
  console.log(`  Unchanged:       ${report.unchanged}`);
  console.log(`  Skipped (thin):  ${report.skipped}`);
  if (report.changes.length) {
    console.log('\n  Divergent quotes:');
    for (const c of report.changes) {
      console.log(`    #${c.id} (${c.type}) sp=${c.sp}`);
      for (const [k, v] of Object.entries(c.diffs)) {
        console.log(
          `      ${k.padEnd(12)} ${pctStr(v.from)} → ${pctStr(v.to)}  (Δ ${(v.delta * 100).toFixed(2)}pp)`
        );
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = fs.readFileSync(args.file, 'utf-8');
  const quotes = JSON.parse(raw);
  if (!Array.isArray(quotes)) {
    console.error(`Expected an array in ${args.file}`);
    process.exit(1);
  }
  const { next, report } = migrateQuotes(quotes);
  printReport(report, args.dryRun);
  if (args.dryRun) {
    console.log('\n[DRY-RUN] no file written.');
    return;
  }
  if (report.updated === 0) {
    console.log('\nNothing to migrate — already canonical. Exit.');
    return;
  }
  const backup = args.file + '.pre-va-migration-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(args.file, backup);
  console.log(`\nBackup: ${backup}`);
  // Preserve original indent (2 spaces) + trailing newline so diffs stay clean.
  fs.writeFileSync(args.file + '.tmp', JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(args.file + '.tmp', args.file);
  console.log(`Wrote: ${args.file}`);
}

// Run as CLI unless imported by a test. argv[1] may be relative and
// contain spaces — pathToFileURL resolves + url-encodes correctly.
const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
