/**
 * Picker table CSS contract.
 *
 * Three regressions this file pins, all found by the operator after the
 * first cut of the wide-column picker:
 *   1. the header scrolled away — a new `.libp-table-cols th` rule set
 *      `position: relative`, silently overriding the `sticky` above it;
 *   2. cells were `white-space: nowrap` + ellipsis, so twelve columns
 *      needed a long horizontal scroll instead of wrapping;
 *   3. the table was `width: max-content`, so it never fit its card.
 *
 * Asserted against the source stylesheet — a `position` on the header
 * cells anywhere after the sticky rule un-sticks them again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Comments are stripped first: a `/* … */` block sits between rules and
// would otherwise be captured as part of the next selector.
const css = fs
  .readFileSync(path.join(here, 'LibraryPicker.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** [{selectors, body}] for every rule whose selector list matches `pred`. */
function rulesFor(pred) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map((s) => s.trim());
    const hit = sels.filter(pred);
    if (hit.length) out.push({ selectors: hit, body: m[2] });
  }
  return out;
}
const declOf = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};

test('the picker header stays sticky — nothing re-positions it later', () => {
  const thRules = rulesFor((s) => s.includes('libp') && /\bth\b/.test(s));
  const positioned = thRules.filter((r) => declOf(r.body, 'position'));
  assert.ok(positioned.length > 0, 'no rule positions the header at all');
  const last = positioned[positioned.length - 1];
  assert.equal(
    declOf(last.body, 'position'),
    'sticky',
    `"${last.selectors.join(', ')}" wins and is not sticky — the header will scroll away`
  );
});

test('the table wrap — not the modal body — is the scroll container', () => {
  // This is what actually makes the sticky header work. `.op-modal-body`
  // is `overflow-y: auto`; if the wrap is not itself a bounded scroller,
  // the body scrolls and the header, stuck to the top of the wrap, goes
  // with it. Two halves: the body must be a non-scrolling flex column,
  // and the wrap must be allowed to shrink (min-height: 0 — without it
  // flex's default `min-height: auto` pins it to content height).
  const body = rulesFor((s) => s === '.op-modal-body.libp-body')[0];
  assert.ok(body, 'the picker body needs its own class to stop scrolling');
  assert.equal(declOf(body.body, 'display'), 'flex');
  assert.equal(declOf(body.body, 'flex-direction'), 'column');
  assert.equal(declOf(body.body, 'overflow'), 'hidden', 'the body must not scroll');

  const wrap = rulesFor((s) => s === '.libp-card-tablewrap')[0];
  assert.ok(wrap, '.libp-card-tablewrap rule missing');
  assert.equal(declOf(wrap.body, 'overflow'), 'auto', 'the wrap must be the scroller');
  assert.equal(declOf(wrap.body, 'min-height'), '0', 'without min-height:0 the wrap never shrinks');
});

test('cells wrap instead of forcing a horizontal scroll', () => {
  const tdRules = rulesFor((s) => s.includes('libp-table-cols') && /\btd\b/.test(s));
  assert.ok(tdRules.length > 0, 'no cell rule found');
  const ws = tdRules.map((r) => declOf(r.body, 'white-space')).filter(Boolean);
  assert.ok(ws.includes('normal'), 'cells must wrap (white-space: normal)');
  assert.ok(!ws.includes('nowrap'), 'a nowrap cell rule is back');
});

test('the table fits its card rather than growing past it', () => {
  const tableRules = rulesFor((s) => s === '.libp-table-cols');
  assert.ok(tableRules.length > 0, '.libp-table-cols rule missing');
  const widths = tableRules.map((r) => declOf(r.body, 'width')).filter(Boolean);
  assert.ok(widths.includes('100%'), 'table should be width: 100%');
  assert.ok(!widths.some((w) => w.includes('max-content')), 'max-content re-introduces the scroll');
  assert.equal(declOf(tableRules[0].body, 'table-layout'), 'fixed');
});

test('the resize grip is still grabbable', () => {
  const grip = rulesFor((s) => s === '.libp-col-grip')[0];
  assert.ok(grip, '.libp-col-grip rule missing');
  assert.equal(declOf(grip.body, 'position'), 'absolute');
  assert.equal(declOf(grip.body, 'cursor'), 'col-resize');
  assert.equal(declOf(grip.body, 'touch-action'), 'none', 'a pointer drag must own the gesture');
  assert.ok(parseInt(declOf(grip.body, 'width'), 10) >= 8, 'hit area too thin to grab');
});
