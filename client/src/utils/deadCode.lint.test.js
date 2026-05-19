/**
 * Sprint AZ — dead-code inventory guard.
 *
 * Flags orphaned modules (exported but never imported) so they don't
 * accumulate silently. Unlike a destructive knip --fix, this test
 * just REPORTS — ops decides whether each orphan is:
 *   - truly dead (delete),
 *   - aspirational / planned-feature (move to an explicit KNOWN_ORPHANS
 *     list here),
 *   - missed import (fix the caller, not the lib).
 *
 * Why not `knip`: no config to maintain, zero deps, runs in the same
 * node --test pipeline as everything else. The trade-off is a
 * simpler AST-free grep — false positives for dynamic imports are
 * documented below.
 *
 * KNOWN_ORPHANS intentionally keeps aspirational primitives (e.g.
 * the design-system <Button/> that docs recommend new code use).
 * When a new orphan appears, the test fails and forces an explicit
 * decision rather than letting dead code sprawl.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..');

// Paths (relative to src/) that are known-orphan and intentional.
// Anything outside this set failing the scan signals dead code.
const KNOWN_ORPHANS = new Set([
  // Design-system primitive referenced in tokens.css / App.css comments
  // as the "new components should use this" standard. No consumer yet
  // because the existing codebase predates it; kept as a north star.
  'components/Shared/Button.jsx',
  // Quote-version diff panel — backend endpoints exist + tested in
  // http.integration.test.js, but the UI-side viewer has no caller
  // yet. Planned for the Quote History "diff vs current" button.
  'components/Shared/QuoteVersionDiff.jsx',
  // Sprint 10 audit remediation primitives. Wired into new catch blocks
  // as they're added during the error-toast hardening pass. Kept as
  // aspirational-standard library utilities.
  'utils/apiTry.js',
  'utils/logger.js',
  // Sprint 14n — press profile CRUD modal. Originally accessed from
  // the "Manage" button in Pricing (Std/Cpx) Layout, removed when we
  // recognised CRUD-in-worksheet as anti-pattern (Carbon/SAP guidance).
  // Source kept so a future Press Library tab (or re-introducing the
  // button if operators ask) can wire it back without rebuilding.
  'modules/cost/tabs/StandardCalc/MachineProfileModal.jsx',
  // Sprint 14n-3 — Cut Layout Suggestion card. Removed at operator
  // request ("không meaningful" — duplicated work that lives in the
  // Design Tools Gallus calculator). Source kept because the optimizer
  // it drives (services/layoutOptimizer.js) is non-trivial pure-math
  // code with full test coverage, and the card can be re-mounted in a
  // future tab if a re-optimizer flow is wanted.
  'modules/cost/tabs/StandardCalc/LayoutSuggestionCard.jsx',
]);

// Files the scan skips entirely (entry points, tests, style sheets).
const IGNORE_DIRS = new Set(['node_modules', 'dist', '__tests__']);
const SKIP_EXT = /\.(test|spec)\.(js|jsx)$|\.lint\.test\.js$/;
const ENTRY_FILES = new Set(['src/main.jsx', 'src/App.jsx']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walk(p));
    } else if (/\.(js|jsx)$/.test(entry.name) && !SKIP_EXT.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

test('no un-listed orphan modules in client source', () => {
  const files = walk(SRC_ROOT);
  // Build a concordance: every `from '…/Name'` import path used
  // somewhere in the codebase. Relative paths are resolved against
  // their importing file so we match the canonical src-relative form.
  const importedAbs = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');
    // Three forms: static `from '…'`, dynamic `import('…')` (React
    // lazy() uses the latter for tab chunks), and side-effect static
    // `import '…'` (i18n domain registration, polyfills). All count
    // as a real reference for dead-code purposes.
    const staticRe = /from\s+['"]([^'"]+)['"]/g;
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
    const specs = [
      ...[...src.matchAll(staticRe)].map((m) => m[1]),
      ...[...src.matchAll(dynamicRe)].map((m) => m[1]),
      ...[...src.matchAll(sideEffectRe)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue; // external dep, skip
      const resolved = path.resolve(path.dirname(file), spec);
      // Vite resolves extension automatically — try .js / .jsx / index
      const candidates = [
        resolved,
        resolved + '.js',
        resolved + '.jsx',
        path.join(resolved, 'index.js'),
        path.join(resolved, 'index.jsx'),
      ];
      for (const c of candidates) importedAbs.add(c);
    }
  }

  const orphans = [];
  for (const file of files) {
    const rel = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
    // Skip entry points (Vite loads them, no import points AT them).
    if (ENTRY_FILES.has(`src/${rel}`)) continue;
    // Skip anything with NO exports — those are probably side-effect
    // entries (polyfills, globals) imported for their effect.
    const src = fs.readFileSync(file, 'utf-8');
    if (!/\bexport\b/.test(src)) continue;
    // Orphan = nothing imports this file's path.
    if (importedAbs.has(file)) continue;
    // Intentional orphan? Skip.
    if (KNOWN_ORPHANS.has(rel)) continue;
    orphans.push(rel);
  }

  assert.deepEqual(
    orphans,
    [],
    `Found orphan modules (nothing imports them). Either delete, wire them up, or add to KNOWN_ORPHANS in deadCode.lint.test.js:\n  ${orphans.join('\n  ')}`
  );
});

test('KNOWN_ORPHANS entries still exist (no rot)', () => {
  const stale = [];
  for (const rel of KNOWN_ORPHANS) {
    const abs = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(abs)) stale.push(rel);
  }
  assert.deepEqual(
    stale,
    [],
    `KNOWN_ORPHANS contains paths that no longer exist — remove them:\n  ${stale.join('\n  ')}`
  );
});
