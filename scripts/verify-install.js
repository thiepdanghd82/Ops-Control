#!/usr/bin/env node
/**
 * verify-install.js — sanity-check the package is ready to serve.
 *
 * Run via `npm run verify-install` before starting the server in a new
 * environment, or as a pre-start hook in deploy automation. Exits
 * non-zero with a human-readable reason if any check fails — wire it
 * into systemd's ExecStartPre or Docker HEALTHCHECK so a half-copied
 * deploy can't start and render a white screen to users.
 *
 * Checks:
 *  1. Node version ≥ 18 (Express 4 + better-sqlite3 12 minimum).
 *  2. Required server files exist.
 *  3. client/dist/ has the expected shape (index.html + assets/).
 *  4. index.html references at least one .js + .css asset that exists.
 *  5. package.json dependencies match what's in node_modules.
 *  6. DATA_DIR (if set) is writable.
 *
 * Intentionally zero external deps — runs on a minimal Node install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ROOT normally = script dir / .. (the package root). Tests override via
// OPS_VERIFY_ROOT to run the checks against a fake/empty tree without
// touching the real repo.
const ROOT = process.env.OPS_VERIFY_ROOT
  ? path.resolve(process.env.OPS_VERIFY_ROOT)
  : path.resolve(__dirname, '..');

const MIN_NODE_MAJOR = 18;

const failures = [];
const checks = [];
function pass(label) {
  checks.push({ ok: true, label });
}
function fail(label, reason) {
  checks.push({ ok: false, label, reason });
  failures.push(`${label}: ${reason}`);
}

// 1. Node version
{
  const m = process.version.match(/^v(\d+)/);
  const major = m ? Number(m[1]) : 0;
  if (major >= MIN_NODE_MAJOR) pass(`node ≥ ${MIN_NODE_MAJOR} (${process.version})`);
  else fail(`node version`, `expected ≥ ${MIN_NODE_MAJOR}, got ${process.version}`);
}

// 2. Required server files
const REQUIRED_SERVER_FILES = [
  'server/index.js',
  'server/services/authService.js',
  'server/routes/costApi.js',
  'server/routes/shared.js',
  'server/utils/safeError.js',
  'server/db/schema.sql',
  'package.json',
];
for (const rel of REQUIRED_SERVER_FILES) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) pass(`file ${rel}`);
  else fail(`file ${rel}`, 'missing');
}

// 3. client/dist shape
const DIST = path.join(ROOT, 'client', 'dist');
if (!fs.existsSync(DIST)) {
  fail('client/dist', 'missing — run `npm run build` before deploying');
} else {
  pass('client/dist exists');
  const indexHtml = path.join(DIST, 'index.html');
  const assetsDir = path.join(DIST, 'assets');
  if (!fs.existsSync(indexHtml)) fail('client/dist/index.html', 'missing');
  else pass('client/dist/index.html');
  if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
    fail('client/dist/assets', 'missing or not a directory');
  } else {
    pass('client/dist/assets');

    // 4. index.html references must resolve
    if (fs.existsSync(indexHtml)) {
      const html = fs.readFileSync(indexHtml, 'utf-8');
      // Match both /assets/*.js and /assets/*.css in href/src attrs
      const refs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      const missing = [];
      for (const ref of refs) {
        const diskPath = path.join(DIST, ref.replace(/^\//, ''));
        if (!fs.existsSync(diskPath)) missing.push(ref);
      }
      if (refs.length === 0)
        fail('index.html asset refs', 'no /assets/* references found (unexpected build output)');
      else if (missing.length)
        fail(
          'asset references',
          `broken refs in index.html: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}`
        );
      else pass(`asset references (${refs.length} refs, all resolve)`);
    }
  }
}

// 5. dependencies vs node_modules
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const deps = Object.keys(pkg.dependencies || {});
  const missing = [];
  for (const d of deps) {
    // Alias entries (e.g. "xlsx": "npm:@e965/xlsx") still create a
    // node_modules/xlsx directory — the key is what we look up.
    const modPath = path.join(ROOT, 'node_modules', d);
    if (!fs.existsSync(modPath)) missing.push(d);
  }
  if (missing.length) fail('node_modules', `missing: ${missing.join(', ')} — run \`npm install\``);
  else pass(`node_modules (${deps.length} deps installed)`);
} catch (err) {
  fail('package.json', err?.message || 'parse failed');
}

// 6. DATA_DIR writable (best-effort — only if configured)
if (process.env.DATA_DIR) {
  const dir = process.env.DATA_DIR;
  const probe = path.join(dir, `.verify-install-${process.pid}.tmp`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    pass(`DATA_DIR writable (${dir})`);
  } catch (err) {
    fail('DATA_DIR', `not writable: ${err?.message || err}`);
  }
}

// ── Report ──
const width = process.stdout.columns || 80;
console.log('═'.repeat(Math.min(width, 60)));
console.log('Ops Control — install verification');
console.log('═'.repeat(Math.min(width, 60)));
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'}  ${c.label}${c.reason ? ` — ${c.reason}` : ''}`);
}
console.log('═'.repeat(Math.min(width, 60)));
if (failures.length) {
  console.error(`FAILED: ${failures.length} check${failures.length === 1 ? '' : 's'}`);
  process.exit(1);
} else {
  console.log(`OK: ${checks.length} checks passed`);
  process.exit(0);
}
