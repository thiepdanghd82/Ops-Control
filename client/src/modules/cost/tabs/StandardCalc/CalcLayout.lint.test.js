/**
 * CalcLayout must not borrow CSS classes from CalcLegend.css.
 *
 * CalcLayout renders inside StandardCalc, which imports StandardCalc.css;
 * it never imports CalcLegend.css. Its MD · TD glossary nonetheless used
 * the Legend's `.cl-bi-vi`, which only worked because both stylesheets
 * happened to be in the same bundle. i18n wave 7 renamed that class AND
 * made the Legend a lazy chunk, so the glossary lost its italic grey
 * styling. Assert the coupling stays gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

const jsx = read('CalcLayout.jsx');
const ownCss = read('StandardCalc.css');
const legendCss = read('CalcLegend.css');

// Class names appearing in className="..." literals.
function classesUsed(src) {
  const out = new Set();
  for (const m of src.matchAll(/className="([^"{}]+)"/g))
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return out;
}
const defined = (css, cls) => new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}[\\s,{:.]`).test(css);

test('the MD · TD glossary is styled by StandardCalc.css', () => {
  // These are the classes the glossary lost when the Legend's `.cl-bi-vi`
  // was renamed. `cl-mdtd-vi` must carry the full look on its own — the
  // italic grey run-on that distinguishes the Vietnamese line from the
  // English one above it.
  const used = [...classesUsed(jsx)].filter((c) => c.startsWith('cl-mdtd-'));
  assert.ok(used.length >= 4, `expected the glossary markup, found ${used.join(', ')}`);
  const missing = used.filter((c) => !defined(ownCss, c));
  assert.deepEqual(missing, []);
  const base = ownCss.slice(
    ownCss.indexOf('.cl-mdtd-vi {'),
    ownCss.indexOf('}', ownCss.indexOf('.cl-mdtd-vi {'))
  );
  for (const decl of ['display: block', 'font-style: italic', 'color: #6b7280', 'font-size: 12px'])
    assert.ok(base.includes(decl), `.cl-mdtd-vi lost "${decl}"`);
});

test('CalcLayout does not depend on the lazily-loaded Legend stylesheet', () => {
  assert.ok(!jsx.includes('CalcLegend.css'), 'CalcLayout imports CalcLegend.css');
  const borrowed = [...classesUsed(jsx)]
    .filter((c) => c.startsWith('cl-'))
    .filter((c) => !defined(ownCss, c) && defined(legendCss, c));
  assert.deepEqual(borrowed, []);
});
