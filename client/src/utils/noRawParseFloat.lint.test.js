/**
 * Lint-style regression gate: no NEW `parseFloat(e.target.value)` may
 * land in client code. Sprint 28 added `parseLocaleNumber` to handle
 * VN user input ("8,5" → 8.5, not 8). Sprint 29 replaced every raw
 * call site. This test walks src/** and fails if the anti-pattern
 * reappears — e.g. a future PR copy-pastes from external code.
 *
 * Sprint AS cleanup: the scanner strips comments + strings before
 * regex-testing, so files that only MENTION the pattern in docs
 * (format.js, format.test.js, DecimalInput.jsx) no longer need to
 * be allowlisted. Only this file itself is allowlisted — its regex
 * literal is the one place where the raw pattern still appears in
 * executable source.
 *
 * Runner: node --test src/utils/noRawParseFloat.lint.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..');

const ALLOWLIST = new Set([
  // Self-allowlist: the regex literal on line ~85 contains the raw
  // pattern as an inline regex (not strippable as a comment/string),
  // so it would self-match. No other file still needs to be allowed.
  'utils/noRawParseFloat.lint.test.js',
]);

/** Recursively walk a directory, collecting `.js` + `.jsx` files. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(p));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip comments + string literals from JS source so the pattern scan
 * only hits real code. Not a full parser — a best-effort regex pass
 * that handles line comments, block comments, and the three string
 * literal forms (double quotes, single quotes, backtick templates).
 */
function stripCommentsAndStrings(src) {
  return src
    // Block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments
    .replace(/\/\/[^\n]*/g, '')
    // Triple-backtick / template literals — simple pass, may eat JSX-adjacent backticks
    .replace(/`(?:\\.|[^\\`])*`/g, '')
    // Double / single quoted strings
    .replace(/"(?:\\.|[^\\"])*"/g, '')
    .replace(/'(?:\\.|[^\\'])*'/g, '');
}

test('no raw parseFloat(e.target.value) in client source (use parseLocaleNumber)', () => {
  const files = walk(SRC_ROOT);
  const offenders = [];
  for (const file of files) {
    const relFromUtils = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
    if (ALLOWLIST.has(relFromUtils)) continue;
    const src = fs.readFileSync(file, 'utf-8');
    const code = stripCommentsAndStrings(src);
    if (/parseFloat\s*\(\s*e\.target\.value/.test(code)) {
      offenders.push(relFromUtils);
    }
  }
  assert.deepEqual(offenders, [],
    `Found raw parseFloat(e.target.value) — use parseLocaleNumber from utils/format instead:\n  ${offenders.join('\n  ')}`);
});

test('allowlist entries all point to real files (no rot)', () => {
  // If a file is renamed or deleted, its leftover allowlist entry
  // rots silently. This test keeps ALLOWLIST honest — rename-drift
  // surfaces as a visible test failure.
  const stale = [];
  for (const rel of ALLOWLIST) {
    const abs = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(abs)) stale.push(rel);
  }
  assert.deepEqual(stale, [],
    `ALLOWLIST contains paths that no longer exist — remove them:\n  ${stale.join('\n  ')}`);
});

test('allowlist entries actually NEED allowlisting (no redundant entries)', () => {
  // Every allowlisted file should produce a pattern match when the
  // allowlist is disabled. If it doesn't, the entry is redundant and
  // clutters the list. Sprint AS removed 3 such entries; this test
  // prevents them from sneaking back in.
  const redundant = [];
  for (const rel of ALLOWLIST) {
    const abs = path.join(SRC_ROOT, rel);
    if (!fs.existsSync(abs)) continue; // handled by the previous test
    const src = fs.readFileSync(abs, 'utf-8');
    const code = stripCommentsAndStrings(src);
    if (!/parseFloat\s*\(\s*e\.target\.value/.test(code)) {
      redundant.push(rel);
    }
  }
  assert.deepEqual(redundant, [],
    `ALLOWLIST has entries whose files no longer contain the pattern — remove them:\n  ${redundant.join('\n  ')}`);
});
