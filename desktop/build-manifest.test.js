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
    if (!fs.existsSync(path.join(__dirname, entry))) stale.push(entry);
  }
  assert.deepEqual(
    stale,
    [],
    `build.files references missing file(s): ${stale.join(', ')}. Remove the entry or restore the file.`
  );
});
