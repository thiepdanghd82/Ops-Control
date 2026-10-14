/**
 * build-native-overlay-check.mjs — preflight check for native-module
 * extraResources overlay coverage. Codifies the Lesson 28 fix from
 * PR #16 (better-sqlite3 ABI trap) as a reusable build-time guard.
 *
 * What it checks
 * --------------
 * For every package mentioned in `desktop/package.json` build.asarUnpack,
 * verify that build.extraResources contains an explicit overlay entry:
 *
 *     { from: "node_modules/<pkg>", to: "app/node_modules/<pkg>" }
 *
 * Without that overlay, electron-builder copies the root ../node_modules
 * tree wholesale into app/node_modules — including the host-CLI-rebuilt
 * native binary (wrong NODE_MODULE_VERSION). The Electron-rebuilt copy
 * sits at app.asar.unpacked/node_modules/<pkg>/, only reachable from
 * code INSIDE the asar bundle. Outside-asar code (e.g. the embedded
 * server at app/server/) walks the resolver upward, finds the wrong
 * binary first, and crashes with ERR_DLOPEN_FAILED on first launch.
 * See CLAUDE.md "Lesson 28" for the full incident write-up.
 *
 * Usage
 * -----
 * Manual:        node scripts/build-native-overlay-check.mjs
 * Build preflight: invoked by build-mac-installers.mjs +
 *                  build-windows-installers.mjs before electron-builder.
 *
 * Bypass (escape hatch for emergency builds when overlays are pending):
 *   OPS_SKIP_NATIVE_OVERLAY_CHECK=1 node scripts/build-mac-installers.mjs
 *
 * Exit code 0 = all asar-unpacked native packages have overlays.
 * Exit code 1 = at least one is missing; build should abort.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop');
const PKG_JSON_PATH = path.join(DESKTOP, 'package.json');

const pkgJson = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf8'));
const asarUnpack = pkgJson.build?.asarUnpack || [];
const extraResources = pkgJson.build?.extraResources || [];

// Parse "**/node_modules/<pkg>/**" patterns. Scoped patterns
// ("**/node_modules/@scope/**") expand by enumerating the scope dir.
const PATTERN_RE = /^\*\*\/node_modules\/([^/]+(?:\/[^/]+)?)\/\*\*$/;
const candidates = new Set();
for (const pattern of asarUnpack) {
  const m = pattern.match(PATTERN_RE);
  if (!m) continue;
  const seg = m[1];
  if (seg.startsWith('@') && !seg.includes('/')) {
    const scopeDir = path.join(DESKTOP, 'node_modules', seg);
    if (!fs.existsSync(scopeDir)) continue;
    for (const sub of fs.readdirSync(scopeDir)) {
      if (sub.startsWith('.')) continue;
      const subDir = path.join(scopeDir, sub);
      if (!fs.statSync(subDir).isDirectory()) continue;
      candidates.add(`${seg}/${sub}`);
    }
  } else {
    candidates.add(seg);
  }
}

// Filter to actually-native packages — ones that ship at least one .node
// binary. A pattern like "**/node_modules/@serialport/**" matches 16 sub-
// packages but only @serialport/bindings-cpp is actually native; the rest
// are pure-JS parsers and don't need an overlay.
function hasNodeBinary(dir) {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue; // skip nested deps
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.node')) return true;
    if (entry.isDirectory() && hasNodeBinary(full)) return true;
  }
  return false;
}

const required = new Set();
for (const pkg of candidates) {
  if (hasNodeBinary(path.join(DESKTOP, 'node_modules', pkg))) required.add(pkg);
}

const missing = [];
for (const pkg of required) {
  // A scoped package (e.g. @serialport/bindings-cpp) is also covered when
  // the WHOLE scope is overlaid (from: node_modules/@serialport). That
  // shape is needed when shipping the full serialport stack — the meta
  // package pulls many @serialport/* siblings, so we overlay the scope
  // rather than enumerate each one.
  const scope = pkg.startsWith('@') ? pkg.split('/')[0] : null;
  const overlay = extraResources.find(
    (r) =>
      r &&
      ((r.from === `node_modules/${pkg}` && r.to === `app/node_modules/${pkg}`) ||
        (scope && r.from === `node_modules/${scope}` && r.to === `app/node_modules/${scope}`))
  );
  if (!overlay) missing.push(pkg);
}

if (missing.length > 0) {
  console.error(
    '[build-native-overlay-check] ✘ MISSING extraResources overlay for asar-unpacked native package(s):'
  );
  console.error('');
  for (const pkg of missing) {
    console.error(`  - ${pkg}`);
    console.error(`    Add to desktop/package.json build.extraResources:`);
    console.error(`      { "from": "node_modules/${pkg}", "to": "app/node_modules/${pkg}" }`);
    console.error(`    AND add "!**/${pkg}/**" to the filter on the root ../node_modules entry.`);
    console.error('');
  }
  console.error('See CLAUDE.md "Lesson 28" — outside-asar code (server/) resolves');
  console.error('node_modules at app/node_modules/<pkg> first. Without overlay, that copy');
  console.error('comes from the host CLI rebuild (wrong NODE_MODULE_VERSION) — runtime');
  console.error('ABI mismatch (ERR_DLOPEN_FAILED) follows on first launch.');
  console.error('');
  console.error('Bypass for emergency builds (NOT recommended for shipped artifacts):');
  console.error('  OPS_SKIP_NATIVE_OVERLAY_CHECK=1 node scripts/build-mac-installers.mjs');
  process.exit(1);
}

console.log(
  `[build-native-overlay-check] ✓ ${required.size} asar-unpacked native package(s) all have overlays:`
);
for (const pkg of required) console.log(`  - ${pkg}`);
