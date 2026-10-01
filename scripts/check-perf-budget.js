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
 * prefix `ComplexCalc`. Headroom ~15% over the current build so routine
 * refactors don't trip the gate but a new heavy dependency pull-in will.
 *
 * RE-BASELINED 2026-07-21 (Sprint CI-TRUST, MES-3-FIX-62): the v1.3.0-GA
 * budgets below (`index`/`HelpTab`/`StandardCalc`) had gone stale — the app
 * grew v1.3 → v1.6 (alt-materials, snapshot, design tools, RFQ tracking,
 * multi-drawing, lead-time) and the overage stayed HIDDEN because chronic-red
 * lint kept the `build` job skipped. Re-baselined to the honest v1.6 size +
 * ~15% so the gate is ENFORCED again (future growth fails). MES-3-FIX-62
 * tracks the real reduction (code-split the shell; PlanningModule, which this
 * line used to name, was removed in #245) — LOWER these back down as that lands.
 */
/**
 * Budget for everything the browser loads before first paint (2026-10-01):
 * index.html's scripts and modulepreloads plus every chunk they import
 * statically. The `index` rule above used to stand in for this and could
 * not: when lazy-loading chat cut that path by 29,977 bytes on 2026-09-30,
 * `index` moved 2,321, because the i18n chunk (useI18n + strings.js, 27.6 kB)
 * that had been a separate file bundled into it. A file-level gate both
 * misses growth that lands in a split-off chunk and misses reductions.
 * Measured 566,110 bytes after #461; 585,000 leaves ~19 kB (3.3%).
 */
export const FIRST_PAINT_BUDGET = 585_000;

export const CHUNK_BUDGETS = [
  // Core shell + vendored React runtime + the eagerly-loaded Cost module,
  // calcEngine, and every i18n domain's EN+VI copy. (Planning, which this line
  // used to name, was removed in #245.) v1.6 re-baseline 2026-07-21 was
  // 458.8 kB + ~15% (was 320k @ v1.3). Two months of ordinary growth, the
  // i18n waves among it, used all of that: on 2026-09-25 main measured
  // 539,910 bytes against 540,000, and a 248-byte money-path fix (the
  // tool-only process row) could not land. Raised to 550,000, +1.9% over
  // main, so ordinary fixes fit while a new eager import still trips it.
  // The real reduction is MES-3-FIX-62 — code-split the shell.
  // 2026-10-01: the shell FILE is no longer the measure — FIRST_PAINT_BUDGET
  // below covers it together with every chunk it loads statically. A single
  // file on that path can never exceed the path, so it shares the budget.
  {
    prefix: 'index',
    budget: FIRST_PAINT_BUDGET,
    label: 'App shell file (on the first-paint path)',
  },
  // Quoting tabs — the two most loaded surfaces in day-to-day work.
  // v1.3 raised: design-tools handoff + complex header redesign add ~80 kB.
  { prefix: 'ComplexCalc', budget: 100_000, label: 'ComplexCalc tab' },
  // v1.6 re-baseline (was 200k @ v1.3), then LOWERED 2026-09-14 once the
  // Legend became its own lazy chunk: the tab itself is 88 kB again.
  { prefix: 'StandardCalc', budget: 100_000, label: 'StandardCalc tab' },
  // Lazy training manual — bilingual copy for all 55 formulas (i18n wave 7).
  { prefix: 'CalcLegend', budget: 175_000, label: 'StandardCalc → Legend (lazy)' },
  { prefix: 'InkCalculator', budget: 50_000, label: 'InkCalculator tab' },
  { prefix: 'MaterialLibrary', budget: 40_000, label: 'MaterialLibrary tab' },
  // Settings includes admin tables + audit log viewer + new connection-mode wizard.
  // v1.3 raised: AccountControl + PermissionGroups admin UI growth.
  { prefix: 'Settings', budget: 120_000, label: 'Settings tab' },
  // Context bundles the calcEngine + migrations.
  { prefix: 'CalcContext', budget: 50_000, label: 'Calc context + engine' },
  // PDF.js worker — vendor library, fixed footprint.
  { prefix: 'pdf', budget: 350_000, label: 'PDF viewer (vendor)' },
  // HelpTab embeds Word-doc generators + bilingual help content (6.8k-LOC
  // content.js). v1.6 re-baseline (was 260k @ v1.3).
  { prefix: 'HelpTab', budget: 360_000, label: 'In-app help system' },
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

/**
 * Chunk files a built chunk imports STATICALLY (`from"./x.js"`, `import"./x.js"`).
 * Dynamic `import("./x.js")` is a lazy chunk and not on the first-paint path.
 * @param {string} code
 * @returns {string[]} basenames
 */
export function staticImportsOf(code) {
  const out = new Set();
  for (const m of code.matchAll(/\bfrom\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) out.add(m[1]);
  for (const m of code.matchAll(/\bimport\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) out.add(m[1]);
  return [...out];
}

/**
 * The scripts index.html loads up front: every `<script src>` and every
 * `<link rel="modulepreload" href>`, as paths relative to the dist root.
 * @param {string} html
 */
export function entryFilesOf(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="\/?([^"]+\.js)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*\bhref="\/?([^"]+\.js)"/g))
    out.push(m[1]);
  return out;
}

/**
 * Walk the first-paint path from `entries`, following static imports.
 * @param {string[]} entries  paths relative to the dist root
 * @param {(rel: string) => string | null} read  file contents, or null if absent
 */
export function firstPaintPath(entries, read) {
  const seen = new Set();
  const files = [];
  const missing = [];
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const code = read(rel);
    if (code == null) {
      missing.push(rel);
      continue;
    }
    files.push({ name: rel, bytes: Buffer.byteLength(code) });
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    for (const f of staticImportsOf(code)) queue.push(dir + f);
  }
  return { files, total: files.reduce((a, f) => a + f.bytes, 0), missing };
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

/**
 * Measure the first-paint path of the build. Smoke tests point OPS_DIST_DIR
 * at a bare assets directory with no index.html; there it is skipped. On the
 * real build a missing index.html fails, so the check cannot switch itself off.
 */
function checkFirstPaint() {
  const root = path.dirname(DIST_DIR);
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    if (process.env.OPS_DIST_DIR) return { skipped: true };
    return { error: `Missing ${htmlPath}` };
  }
  const read = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  const r = firstPaintPath(entryFilesOf(fs.readFileSync(htmlPath, 'utf8')), read);
  return { ...r, budget: FIRST_PAINT_BUDGET, pct: r.total / FIRST_PAINT_BUDGET };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const chunks = loadChunks();
  const report = checkBudgets(chunks);
  const fp = checkFirstPaint();
  report.first_paint = fp;
  printReport(report, args.has('--json'));
  let failed = report.failures.length > 0;
  if (!args.has('--json') && !fp.skipped) {
    if (fp.error) {
      console.log(`\n❌  First-paint path: ${fp.error}`);
    } else {
      const mark =
        fp.total > fp.budget || fp.missing.length ? '❌' : fp.pct >= WARN_THRESHOLD ? '⚠️ ' : '✅';
      console.log(
        `\n${mark}  First-paint path: ${formatKb(fp.total)} / ${formatKb(fp.budget)} (${(fp.pct * 100).toFixed(1)}%) in ${fp.files.length} files`
      );
      for (const f of [...fp.files].sort((a, b) => b.bytes - a.bytes))
        console.log(`      ${formatKb(f.bytes).padStart(9)}  ${f.name}`);
      for (const m of fp.missing) console.log(`      missing: ${m}`);
    }
  }
  if (fp.error || (!fp.skipped && (fp.total > fp.budget || fp.missing.length))) failed = true;
  if (failed) process.exit(1);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) main();
