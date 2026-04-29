/**
 * Sprint AY — i18n integrity guard.
 *
 * Locks 2 invariants the translation pipeline depends on:
 *
 *   1. Every STRINGS entry has BOTH `en` and `vi` values.
 *      → Prevents a half-translated key silently falling back to
 *        the English text for a Vietnamese user. CCL translator
 *        sees a fail here when a new key lands without the vi
 *        value filled in.
 *
 *   2. Every `t('...')` call in client source references a key
 *      that exists in STRINGS.
 *      → Typos ('nav.tab.settigns') silently render the raw key
 *        to the user. This test catches them at build time.
 *
 * Limitations documented:
 *   - Only matches `t('literal')` — dynamic `t(keyFromVar)` calls
 *     can't be statically verified and are skipped.
 *   - Template interpolation `t('x.${y}')` is skipped for the same
 *     reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from './strings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(p));
    } else if (/\.(js|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

test('every STRINGS entry has both en and vi values', () => {
  const missing = [];
  for (const [key, entry] of Object.entries(STRINGS)) {
    if (!entry || typeof entry !== 'object') {
      missing.push(`${key}: entry not an object`);
      continue;
    }
    if (typeof entry.en !== 'string' || entry.en.length === 0) missing.push(`${key}: missing en`);
    if (typeof entry.vi !== 'string' || entry.vi.length === 0) missing.push(`${key}: missing vi`);
  }
  assert.deepEqual(missing, [],
    `i18n STRINGS has incomplete entries:\n  ${missing.join('\n  ')}`);
});

test('every t(\'literal\') call in client source hits a known STRINGS key', () => {
  const files = walk(SRC_ROOT);
  const unknown = new Map(); // key → file where first seen
  // Match both single and double-quoted literal args. Skip template
  // literals and variable-ref calls — those are developer-visible
  // and can't be statically validated.
  const RE = /\bt\s*\(\s*(['"])([a-zA-Z0-9_.-]+)\1\s*[,)]/g;
  for (const file of files) {
    // Skip the strings table itself — it doesn't CALL t(), it defines
    // the table; a "t('x')" inside a doc comment would be stripped
    // by stripComments above.
    if (file.endsWith(path.join('i18n', 'strings.js'))) continue;
    if (file.endsWith(path.join('i18n', 'strings.lint.test.js'))) continue;
    const src = stripComments(fs.readFileSync(file, 'utf-8'));
    for (const m of src.matchAll(RE)) {
      const key = m[2];
      if (!(key in STRINGS) && !unknown.has(key)) {
        unknown.set(key, path.relative(SRC_ROOT, file).replace(/\\/g, '/'));
      }
    }
  }
  const list = [...unknown.entries()].map(([k, f]) => `'${k}' (first seen in ${f})`);
  assert.deepEqual(list, [],
    `t('...') calls reference keys not in STRINGS (typo or missing entry?):\n  ${list.join('\n  ')}`);
});

test('STRINGS has no duplicate keys (sanity — Object literal would coerce, but catch regression in exports)', () => {
  // Object literal auto-dedupes, but we still want a count test so
  // a sudden drop in key count (e.g. a bulk-edit typo collapsing
  // entries) surfaces rather than silently losing translations.
  const keys = Object.keys(STRINGS);
  assert.ok(keys.length >= 50,
    `STRINGS unexpectedly small (${keys.length} keys) — did a refactor drop entries?`);
});
