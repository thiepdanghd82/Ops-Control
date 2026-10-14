/**
 * No callback parameter may shadow the i18n `t`.
 *
 * `const { t } = useI18n()` puts a FUNCTION in scope. A callback written
 * `rows.map((t, i) => …)` silently rebinds that name to a data row, so every
 * `t('some.key')` inside the callback calls the row as a function and the
 * whole screen dies with `t is not a function` — minified to the
 * uninformative `e is not a function`.
 *
 * Found on 2026-09-18 by a crashed Drop-Down Lists tab. It had been dead
 * since the i18n wave of 2026-09-10 (#303) that substituted the literals for
 * `t(...)` calls inside a `tiers.map((t, i) => …)` written long before, and
 * NOTHING reported it: every test stayed green, the build was clean, lint was
 * silent (`t` is genuinely used, just as the wrong thing), and the tab is an
 * admin screen nobody opens daily. Sweeping for it turned up a SECOND dead
 * screen — the Permission Groups matrix — that no one had reported at all.
 *
 * Scope-aware on purpose: a bare regex flags eleven sites here, nine of them
 * false, because `t(` appearing anywhere after the arrow is not the same as
 * `t(` inside the callback's body. A check that cries wolf gets ignored,
 * which is how the real one would slip through (Lesson 0).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}

/** Span of the callback body that starts right after an `=>`. */
function bodySpan(src, from) {
  let j = from;
  while (j < src.length && ' \n\t'.includes(src[j])) j++;
  if (!'({'.includes(src[j])) return null;
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if ('({['.includes(src[k])) depth++;
    else if (')}]'.includes(src[k]) && --depth === 0) return [j, k];
  }
  return null;
}

test('no callback parameter named `t` shadows the i18n t', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('useI18n')) continue;
    for (const m of src.matchAll(/\(\s*t\s*(?:,\s*\w+\s*)?\)\s*=>/g)) {
      const span = bodySpan(src, m.index + m[0].length);
      if (!span) continue;
      const body = src.slice(span[0], span[1]);
      const calls = body.match(/\bt\(\s*['"`][^'"`]+/g);
      if (calls) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(SRC, file)}:${line} → ${calls[0]}…`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a callback param named \`t\` is shadowing the translation function, so these ` +
      `t('…') calls invoke a data row and crash the screen:\n  ${offenders.join('\n  ')}`
  );
});
