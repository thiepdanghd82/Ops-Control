/**
 * Sprint AX — accessibility guard for icon-only buttons.
 *
 * Icon-only buttons (×, ✕, ⟲, ↑, ↓, etc.) with no visible text must
 * have an `aria-label` or `title` so screen readers announce their
 * purpose. WCAG 4.1.2 "Name, Role, Value". This test scans JSX for
 * `<button>…emoji/icon only…</button>` and fails the build on any
 * new button lacking an accessible name.
 *
 * Why build-time vs linter plugin: no extra ESLint deps, trivially
 * maintained, catches 95% of real offenders. Buttons with text
 * children ("Cancel", "Save") pass because the text itself is the
 * accessible name.
 *
 * Limitations (documented false-negatives):
 *   - Buttons whose child is a variable expression `{icon}` can't be
 *     statically classified; we skip them. Caller is responsible.
 *   - <IconButton> wrappers from an external library would need
 *     their own rule — we don't have any in this codebase.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(p));
    } else if (entry.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

// Icon glyphs + HTML entities we treat as "needs a name". The set is
// small and focused — only matches characters a human can't read
// aloud as a word. Emoji with intrinsic meaning (⚠️, 🚨) are excluded
// because they double as a visual + semantic cue.
const ICON_CHARS = /^[\s]*(?:✕|✖|×|&times;|&#215;|⟲|↑|↓|◀|▶|◁|▷|⇦|⇨|‹|›|«|»|⊞|⊟|⊕|⊖|→|←|•|·|…|⟳|⟴|↻)[\s]*$/;
// Match <button ...>INNER</button>. Greedy-safe for single-button
// tags because INNER regex excludes `<` so nesting can't confuse us.
const BUTTON_RE = /<button\b([^>]*)>([^<]*)<\/button>/g;
// Classify an open-tag's attr string as "has accessible name". A
// button passes if ANY of: aria-label, aria-labelledby, title.
const ACCESSIBLE_NAME = /\b(aria-label|aria-labelledby|title)\b\s*=/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

test('all icon-only <button> elements have an accessible name', () => {
  const files = walk(SRC_ROOT);
  const offenders = [];
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf-8'));
    for (const m of src.matchAll(BUTTON_RE)) {
      const attrs = m[1] || '';
      const inner = m[2] || '';
      if (!ICON_CHARS.test(inner)) continue;       // text/expression child — OK
      if (ACCESSIBLE_NAME.test(attrs)) continue;   // has aria-label/title — OK
      const rel = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
      // Include the matched glyph in the report so the maintainer can
      // grep the exact offender quickly.
      offenders.push(`${rel}: <button>${inner.trim()}</button>`);
    }
  }
  assert.deepEqual(offenders, [],
    `Icon-only <button> elements need aria-label or title:\n  ${offenders.join('\n  ')}`);
});
