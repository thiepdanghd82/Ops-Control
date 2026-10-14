// @ts-check
/**
 * Regression guard — every desktop runtime file MUST be listed in
 * `package.json` build.files so electron-builder packs it into app.asar.
 *
 * Why this exists (v1.3.0 GA incident):
 *   `setupWizard.js` was added in phase F but never registered in
 *   build.files. The DMG packed `main.js` without its dependency, and
 *   the SERVER edition crashed silently on first launch with
 *   `Cannot find module './setupWizard'`. Operator saw the dock icon
 *   bounce once then disappear — no UI, no log surfaced to the wizard.
 *
 *   This test would have failed at PR-time. Adding it now means the
 *   next net-new desktop module either lands in build.files or breaks
 *   CI before it ships.
 *
 * What's in scope:
 *   - All `.js` files at the desktop/ top level (CommonJS modules
 *     consumed by main.js or preload.js).
 *
 * What's exempt (whitelist below):
 *   - `*.test.js` — never packed; built artefact would inflate.
 *   - cache.test.js / license.test.js — Electron-runtime fixtures.
 *   - build-manifest.test.js — this file itself.
 *
 * desktop/ is CommonJS (see package.json `type: "commonjs"`) so this
 * test is CJS-style.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG_PATH = path.join(__dirname, 'package.json');

// Patterns of file basenames that are intentionally NOT packed.
const EXEMPT_PATTERNS = [
  /\.test\.js$/, // unit tests — never ship
];

// build.files entries that are GENERATED AT BUILD TIME and therefore do
// NOT exist in a clean checkout. They are legitimately listed in
// build.files (so electron-builder packs them when present) but must be
// skipped by the "entries point to real files" existence check below.
//
//   build-role.json — scripts/build-mac-installers.mjs (+ the Windows
//   counterpart) writeFileSync({ role }) before packaging each per-role
//   installer, then fs.unlinkSync() it afterwards to restore a clean
//   tree (see build-mac-installers.mjs lines 58 + 112/134). It is never
//   committed, so a clean repo / fresh CI run has no file on disk.
const GENERATED_AT_BUILD = new Set([
  'build-role.json', //
]);

function listTopLevelJs() {
  return fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name);
}

function isExempt(name) {
  return EXEMPT_PATTERNS.some((re) => re.test(name));
}

test('every desktop top-level .js file is listed in build.files', () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
  const declared = new Set(pkg.build?.files || []);
  const missing = [];
  for (const name of listTopLevelJs()) {
    if (isExempt(name)) continue;
    if (!declared.has(name)) missing.push(name);
  }
  assert.deepEqual(
    missing,
    [],
    `desktop/${missing.join(', ')} present on disk but missing from package.json build.files. ` +
      `Either add the file(s) to build.files OR add an entry to EXEMPT_PATTERNS in this test ` +
      `with a one-line rationale.`
  );
});

test('build.files entries all point to real files (no rotted entries)', () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
  const declared = pkg.build?.files || [];
  const stale = [];
  for (const entry of declared) {
    // Only check plain filename entries — skip globs (`**/*`), negations (`!`),
    // and directory patterns. Those are validated by electron-builder itself.
    if (/[*!]/.test(entry) || entry.endsWith('/')) continue;
    // Skip files generated at build time (written then unlinked by the
    // installer scripts) — they're intentionally absent in a clean tree.
    if (GENERATED_AT_BUILD.has(entry)) continue;
    if (!fs.existsSync(path.join(__dirname, entry))) stale.push(entry);
  }
  assert.deepEqual(
    stale,
    [],
    `build.files references missing file(s): ${stale.join(', ')}. Remove the entry or restore the file.`
  );
});

// Phase A.6 regression guard: utils/ subdirectory.
//
// Caught during Phase A.6.1 headless verify: utils/netProbe.js was
// added in Phase A.3a but never registered in build.files (only
// utils/serverIdentity.js was). The earlier top-level-only assertion
// missed it because subdirectory files were out of scope. Without
// this test, a fresh desktop build would crash at runtime with
// `Cannot find module './utils/netProbe.js'` when setupWizard.js or
// main.js calls `require('./utils/netProbe.js')` — same failure mode
// as the v1.3.0 setupWizard.js incident this whole test file exists
// to prevent.
//
// Subdirectories are covered by glob entries (utils/**/*, native/**/*).
// This test asserts that EVERY non-test runtime file under utils/
// is reachable via at least one of the declared entries — explicit
// path OR matching glob.
function listUtilsRuntime() {
  const utilsDir = path.join(__dirname, 'utils');
  if (!fs.existsSync(utilsDir)) return [];
  return fs
    .readdirSync(utilsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js') && !isExempt(e.name))
    .map((e) => `utils/${e.name}`);
}

function entryMatches(entry, relPath) {
  if (entry === relPath) return true;
  // Minimal glob support — covers `utils/**/*` and `native/**/*`.
  if (entry.endsWith('/**/*')) {
    const dir = entry.slice(0, -'/**/*'.length);
    return relPath.startsWith(dir + '/');
  }
  if (entry.endsWith('/*')) {
    const dir = entry.slice(0, -'/*'.length);
    return path.dirname(relPath) === dir;
  }
  return false;
}

test('every desktop utils/ runtime file is covered by build.files', () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
  const positive = (pkg.build?.files || []).filter((e) => !e.startsWith('!'));
  const missing = [];
  for (const rel of listUtilsRuntime()) {
    if (!positive.some((entry) => entryMatches(entry, rel))) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    `desktop runtime file(s) not covered by any build.files entry: ${missing.join(', ')}. ` +
      `Add an explicit path OR widen an existing glob (e.g. "utils/**/*").`
  );
});
