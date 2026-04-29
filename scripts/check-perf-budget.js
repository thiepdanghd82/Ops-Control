#!/usr/bin/env node
/**
 * Performance budget gate. Reads `client/dist/assets/*.js`, matches
 * each chunk against the per-chunk budget below, and exits non-zero
 * if any chunk exceeds its budget. Intended to run AFTER `npm run build`
 * in CI — prevents silent bundle-size drift that degrades first-paint.
 *
 * Budgets are in uncompressed bytes. gzip ratios drift by compression
 * settings; raw bytes are the stable contract.
 *
 * When a chunk grows close to the budget (>= warn threshold) the script
 * prints a warning but does not fail — gives committers notice before
 * the hard gate trips.
 *
 * Usage:
 *   node scripts/check-perf-budget.js               # check
 *   node scripts/check-perf-budget.js --json        # machine output
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// OPS_DIST_DIR escape hatch lets smoke tests point the CLI at a tmp
// directory without touching the real client/dist tree. Falls back to
// the canonical path when unset (prod behavior unchanged).
const DIST_DIR = process.env.OPS_DIST_DIR || path.join(__dirname, '..', 'client', 'dist', 'assets');

/**
 * Per-chunk budgets in raw bytes. Match by prefix of the filename
 * BEFORE Vite's content hash, e.g. `ComplexCalc-AbCd123.js` →
 * prefix `ComplexCalc`. Numbers picked with ~20% headroom over the
 * Sprint 24 build so routine refactors don't trip the gate but a
 * new heavy dependency pull-in will.
 */
export const CHUNK_BUDGETS = [
  // Core shell + vendored React runtime; everything downstream lazy-loads.
  // v1.3 raised: bundle marker + 6 i18n domain side-effect imports add ~12 kB.
  { prefix: 'index', budget: 320_000, label: 'App shell (critical path)' },
  // Quoting tabs — the two most loaded surfaces in day-to-day work.
  // v1.3 raised: design-tools handoff + complex header redesign add ~80 kB.
  { prefix: 'ComplexCalc', budget: 100_000, label: 'ComplexCalc tab' },
  { prefix: 'StandardCalc', budget: 200_000, label: 'StandardCalc tab' },
  { prefix: 'InkCalculator', budget: 50_000, label: 'InkCalculator tab' },
  { prefix: 'MaterialLibrary', budget: 40_000, label: 'MaterialLibrary tab' },
  // Settings includes admin tables + audit log viewer + new connection-mode wizard.
  // v1.3 raised: AccountControl + PermissionGroups admin UI growth.
  { prefix: 'Settings', budget: 120_000, label: 'Settings tab' },
  // Context bundles the calcEngine + migrations.
  { prefix: 'CalcContext', budget: 50_000, label: 'Calc context + engine' },
  // PDF.js worker — vendor library, fixed footprint.
  { prefix: 'pdf', budget: 350_000, label: 'PDF viewer (vendor)' },
  // HelpTab embeds Word-doc generators + bilingual help content.
  { prefix: 'HelpTab', budget: 260_000, label: 'In-app help system' },
];

/**
 * Global fallback cap. Any chunk without an explicit budget must stay
 * under this. Catches accidental "whole library imported into a tab"
 * mistakes.
 */
export const GLOBAL_CHUNK_CAP = 200_000;

/** Warn when a budget usage exceeds this fraction (still passes). */
export const WARN_THRESHOLD = 0.9;

/**
 * Split filename → prefix (alnum/lowercase up to first '-' + digit).
 * Vite hash format: `Name-AbCd1234.js`. Prefix stops at the hash-
 * separator dash. "calcEngine.sga-Hash.js" → "calcEngine.sga".
 */
export function extractPrefix(filename) {
  const base = filename.replace(/\.js$/, '');
  // Vite hashes are 6-12 alphanumeric-or-underscore chars (no dashes).
  // Restricting the class prevents "no-hash-here.js" from being treated
  // as "no" + "-hash-here" (legit prefix shouldn't be truncated).
  const m = base.match(/^(.+)-[A-Za-z0-9_]{6,12}$/);
  return m ? m[1] : base;
}

/**
 * Compute the report against a set of chunks + the declared budgets.
 * Pure — extracted so tests can cover the decision logic without
 * touching disk.
 *
 * @param {{name: string, bytes: number}[]} chunks
 * @param {{prefix: string, budget: number, label: string}[]} budgets
 * @param {number} globalCap
 */
export function checkBudgets(chunks, budgets = CHUNK_BUDGETS, globalCap = GLOBAL_CHUNK_CAP) {
  const report = {
    total_bytes: 0,
    chunk_count: chunks.length,
    failures: /** @type {any[]} */ ([]),
    warnings: /** @type {any[]} */ ([]),
    ok: /** @type {any[]} */ ([]),
  };
  for (const c of chunks) {
    report.total_bytes += c.bytes;
    const prefix = extractPrefix(c.name);
    // Match by exact prefix first, then fall back to "prefix starts with
    // rule.prefix + '-'". This handles Vite occasionally emitting a
    // hash that contains a dash (e.g. `index-C-GsyK1I.js` → extracted
    // prefix `index-C`), which otherwise cascades to the global cap
    // and false-positive fails the gate.
    const rule =
      budgets.find((b) => b.prefix === prefix) ||
      budgets.find((b) => prefix.startsWith(b.prefix + '-'));
    const budget = rule ? rule.budget : globalCap;
    const label = rule ? rule.label : '(global cap)';
    const entry = { name: c.name, prefix, bytes: c.bytes, budget, label };
    if (c.bytes > budget) {
      report.failures.push({ ...entry, over_by: c.bytes - budget, pct: c.bytes / budget });
    } else if (c.bytes >= budget * WARN_THRESHOLD) {
      report.warnings.push({ ...entry, pct: c.bytes / budget });
    } else {
      report.ok.push(entry);
    }
  }
  return report;
}

function formatKb(bytes) {
  return (bytes / 1024).toFixed(1) + ' kB';
}

function printReport(report, json) {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(
    `Perf budget check — ${report.chunk_count} chunks, total ${formatKb(report.total_bytes)}`
  );
  if (report.failures.length) {
    console.log('\nFAILED budgets:');
    for (const f of report.failures) {
      console.log(
        `  ❌  ${f.name}  ${formatKb(f.bytes)} / ${formatKb(f.budget)}  (+${formatKb(f.over_by)}, ${(f.pct * 100).toFixed(1)}%)`
      );
      console.log(`      → ${f.label}`);
    }
  }
  if (report.warnings.length) {
    console.log('\nNear budget (passing but flagged):');
    for (const w of report.warnings) {
      console.log(
        `  ⚠️   ${w.name}  ${formatKb(w.bytes)} / ${formatKb(w.budget)}  (${(w.pct * 100).toFixed(1)}%)`
      );
    }
  }
  if (!report.failures.length && !report.warnings.length) {
    console.log('\n✅ All chunks within budget.');
  } else if (!report.failures.length) {
    console.log(`\n✅ All chunks under hard budget (${report.warnings.length} near threshold).`);
  }
}

function loadChunks() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`Missing ${DIST_DIR}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  return fs
    .readdirSync(DIST_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((name) => ({
      name,
      bytes: fs.statSync(path.join(DIST_DIR, name)).size,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const chunks = loadChunks();
  const report = checkBudgets(chunks);
  printReport(report, args.has('--json'));
  if (report.failures.length) process.exit(1);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) main();
