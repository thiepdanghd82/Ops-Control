#!/usr/bin/env node
/**
 * check-runtime-deps.js — runtime dependency audit.
 *
 * Closes: #60 (regression guard for the exceljs/jszip class of bug from PR #58).
 *
 * Scans every runtime file (server/, domains/, scripts/, excluding tests and
 * legacy code) for bare-name imports and verifies each one is declared in
 * the root `package.json` `dependencies` block (not `devDependencies`).
 *
 * Why this matters:
 *   `scripts/build-desktop.sh` runs `npm install --omit=dev` to populate the
 *   DMG's node_modules. Any runtime import resolved via devDependencies (or
 *   undeclared but reachable in dev because npm hoisted it) will be MISSING
 *   from the packaged app and crash the embedded server at module-load time.
 *
 *   PR #58 incident: `exceljs` was in devDependencies, `jszip` was undeclared
 *   (transitive of docx + exceljs). Quote Export shipped 2026-05-18, broke
 *   in DMG, discovered 2026-05-22 — 4 days latent.
 *
 * Usage:
 *   node scripts/check-runtime-deps.js              # exit 0 if clean, 1 if findings
 *   node scripts/check-runtime-deps.js --verbose    # list every import + file
 *
 * Wire into CI:
 *   Add `"check:deps": "node scripts/check-runtime-deps.js"` to package.json
 *   scripts, then add `npm run check:deps` to the pre-merge workflow.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

/* ───────────────────────────────────────────────────────────────────────────
 * Config — surfaces audited + filename filters
 * ──────────────────────────────────────────────────────────────────────── */

// Directories that ship into the DMG (matches build-desktop.sh extraResources).
const RUNTIME_DIRS = ['server', 'domains', 'scripts'];

// Patterns excluded from runtime — tests, legacy, dev-only worktrees.
const EXCLUDE_PATTERNS = [
  /\.test\.(js|mjs|cjs)$/,
  /\.integration\.test\./,
  /[\\/]tests[\\/]/,
  /[\\/]legacy[\\/]/,
  /[\\/]_legacy[\\/]/,
  /[\\/]node_modules[\\/]/,
];

// scripts/ filter mirrors build-desktop.sh: only `.js` ships (not `.mjs`).
// Anything imported by a `.mjs` script in `scripts/` is dev-only because the
// build filter strips them. This makes puppeteer-core in scripts/help/*.mjs
// safe even though it's in devDeps.
const SCRIPT_EXT_IN_DMG = /\.js$/;

// Imports the audit ignores — Node built-ins.
const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

/* ───────────────────────────────────────────────────────────────────────────
 * File enumeration
 * ──────────────────────────────────────────────────────────────────────── */

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(js|mjs|cjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isExcluded(path, dirRoot) {
  if (EXCLUDE_PATTERNS.some((re) => re.test(path))) return true;
  // scripts/ has a stricter filter — .mjs files never ship in DMG.
  if (dirRoot === 'scripts' && !SCRIPT_EXT_IN_DMG.test(path)) return true;
  return false;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Import extraction — handles static + dynamic + require
 * ──────────────────────────────────────────────────────────────────────── */

// Matches `from 'pkg'`, `from "pkg"`, `require('pkg')`, `import('pkg')`.
// Captures the quoted spec. Ignores type-only `import('pkg').T` JSDoc
// because we strip those by skipping JSDoc + comment blocks first.
const IMPORT_RE = /(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function extractImports(source) {
  // Strip block + line comments first to avoid matching JSDoc
  // `@param {import('express').X}` patterns.
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const specs = new Set();
  let m;
  while ((m = IMPORT_RE.exec(cleaned))) {
    const spec = m[1];
    // Skip relative + absolute + protocol + node: builtins.
    if (/^(\.|\/|node:|file:|https?:)/.test(spec)) continue;
    // Skip the spec if it's purely a template literal context (no static name).
    if (spec.includes('${') || spec.includes('`')) continue;
    // Package name = first segment for unscoped, or @scope/name for scoped.
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (NODE_BUILTINS.has(pkg)) continue;
    specs.add(pkg);
  }
  return specs;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Main
 * ──────────────────────────────────────────────────────────────────────── */

function main() {
  const pkgJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys(pkgJson.dependencies || {}));
  const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

  // {pkg: [file, file, ...]}
  const usage = new Map();

  for (const dir of RUNTIME_DIRS) {
    const root = join(ROOT, dir);
    const files = walk(root).filter((f) => !isExcluded(f, dir));
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const imports = extractImports(src);
      for (const pkg of imports) {
        if (!usage.has(pkg)) usage.set(pkg, []);
        usage.get(pkg).push(relative(ROOT, file));
      }
    }
  }

  // Classify findings
  const missing = []; // not in deps OR devDeps — P0
  const devOnly = []; // in devDeps only — P1 (the exceljs class)
  const ok = [];

  for (const [pkg, files] of [...usage.entries()].sort()) {
    if (deps.has(pkg)) {
      ok.push({ pkg, files });
    } else if (devDeps.has(pkg)) {
      devOnly.push({ pkg, files });
    } else {
      missing.push({ pkg, files });
    }
  }

  // Report
  console.log(`Runtime dependency audit — ${new Date().toISOString().slice(0, 10)}`);
  console.log(
    `Scanned ${usage.size} unique non-builtin packages across ${RUNTIME_DIRS.join(', ')}.\n`
  );

  if (VERBOSE) {
    console.log('OK (in root dependencies):');
    for (const { pkg, files } of ok) {
      console.log(`  ✓ ${pkg.padEnd(28)} (${files.length} file${files.length !== 1 ? 's' : ''})`);
    }
    console.log('');
  }

  let exitCode = 0;

  if (devOnly.length) {
    exitCode = 1;
    console.error('P1 — imported by runtime code but only in devDependencies:');
    console.error('     (DMG built with --omit=dev will not include these → server crash)');
    for (const { pkg, files } of devOnly) {
      console.error(`  ✗ ${pkg}`);
      for (const f of files.slice(0, 3)) console.error(`      ${f}`);
      if (files.length > 3) console.error(`      ... and ${files.length - 3} more`);
    }
    console.error('');
  }

  if (missing.length) {
    exitCode = 1;
    console.error('P0 — imported by runtime code but NOT declared anywhere:');
    console.error('     (resolves locally via npm hoisting; will be absent in DMG)');
    for (const { pkg, files } of missing) {
      console.error(`  ✗ ${pkg}`);
      for (const f of files.slice(0, 3)) console.error(`      ${f}`);
      if (files.length > 3) console.error(`      ... and ${files.length - 3} more`);
    }
    console.error('');
  }

  if (exitCode === 0) {
    console.log(`✓ All ${ok.length} runtime imports declared in root dependencies. Clean.`);
  } else {
    console.error(`Fix: move each P1 package from devDependencies → dependencies,`);
    console.error(`     and add each P0 package to dependencies. Then re-run.`);
  }

  process.exit(exitCode);
}

main();
