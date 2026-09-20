/**
 * Source-level guard that the Tool Life column keeps naming its UNIT, on BOTH
 * grids.
 *
 * Henry had to ask what the denominator was (2026-09-20) because nothing on
 * screen said whether `tool_life` counts SHOTS or PIECES. It counts shots; EAU
 * counts pieces; the engine bridges them with `× layout`. Enter a piece count
 * in that column and the tooling is understated by exactly the layout factor —
 * 10× on a typical job — with no error, no warning, and a perfectly plausible
 * number on the screen.
 *
 * The twins are the reason this is a test rather than a comment. The Cpx
 * header was a HARDCODED English literal while Std read an i18n key, so the
 * two could never have moved together: adding the unit to Std alone would have
 * left Cpx silently unlabelled. Both now read the SAME key, and that is what is
 * pinned here (MES-3-FIX-40 / MES-3-FIX-56 — Std and Cpx drift the moment they
 * stop sharing a definition).
 *
 * No React test infrastructure in this repo, so source inspection is the only
 * way to assert it — same approach as useMarginHold.lint and remarkBuilder.lint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, p), 'utf8');

const GRIDS = [
  ['Standard', 'StandardCalc/CalcProcesses.jsx'],
  ['Complex', 'ComplexCalc/SubProductRow.jsx'],
];

test('both process grids label Tool Life from the one shared key', () => {
  for (const [name, file] of GRIDS) {
    const src = read(file);
    assert.match(
      src,
      /t\('cgrid\.proc\.tool_life'\)/,
      `${name} grid must render the header via t('cgrid.proc.tool_life')`
    );
  }
});

test('neither grid re-grows a hardcoded "Tool Life" header literal', () => {
  // The Cpx header used to be `<th ...>Tool Life</th>`. A literal here cannot
  // carry the unit into the other language and cannot move with its twin.
  for (const [name, file] of GRIDS) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /<th[^>]*>\s*Tool Life\s*</,
      `${name} grid must not hardcode the Tool Life header — use the shared key`
    );
  }
});

test('both grids explain the unit on hover', () => {
  for (const [name, file] of GRIDS) {
    const src = read(file);
    assert.match(
      src,
      /title=\{t\('cgrid\.proc\.tip_tool_life'\)\}/,
      `${name} grid must carry the unit tooltip on the Tool Life header`
    );
  }
});

test('the label and its tooltip actually name the unit, in both languages', () => {
  const src = readFileSync(path.join(here, '..', '..', '..', 'i18n/domains/costing.js'), 'utf8');
  const entry = (key) => {
    const esc = key.replace(/\./g, '\\.');
    // label is a one-liner, tooltip is a block — match either shape.
    const m = src.match(new RegExp(`'${esc}':\\s*\\{[\\s\\S]*?\\}`));
    return m ? m[0] : '';
  };

  const label = entry('cgrid.proc.tool_life');
  assert.ok(label, 'cgrid.proc.tool_life must exist');
  // "shot" is the whole point of the header — losing it is the regression.
  assert.match(label, /en: '[^']*\bshot\b[^']*'/i, 'EN label must name the shot unit');
  assert.match(label, /vi: '[^']*\bshot\b[^']*'/i, 'VI label must name the shot unit');

  const tip = entry('cgrid.proc.tip_tool_life');
  assert.ok(tip, 'cgrid.proc.tip_tool_life must exist');
  // The tooltip has to carry the bridge, not just the unit: shots become
  // pieces only after × layout, and that is the step nobody can infer.
  for (const lang of ['en', 'vi']) {
    const m = tip.match(new RegExp(`${lang}: '([^']*)'`));
    assert.ok(m, `${lang} tooltip must exist`);
    assert.match(m[1], /shot/i, `${lang} tooltip must name SHOT`);
    assert.match(m[1], /layout/i, `${lang} tooltip must name the × layout bridge`);
  }
});
