/**
 * Source-level guard: a TEXTAREA must keep Enter.
 *
 * `useGridKeyboardNav` binds on the CAPTURE phase, so it sees the key before
 * the focused control does, and it maps Enter → move-down / Shift+Enter →
 * move-up. It also lists TEXTAREA among the controls it drives — so every
 * multi-line box inside a calculator sub-tab could not take a line break at
 * all. Reported 2026-09-24 against the Lead time & Notice Remark field; the
 * same tab has five such boxes, and Shift+Enter was taken too, so the
 * obvious workaround was also dead.
 *
 * There is no jsdom in this repo, so the hook cannot be driven. What CAN be
 * asserted is that the exemption is still there — and that is the whole risk,
 * because removing it reintroduces a bug with nothing red and no error.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'useGridKeyboardNav.js'),
  'utf8'
);

// Code lines only: a guard that forbids an identifier otherwise matches the
// COMMENT explaining why it is forbidden, and the better the reason is
// written the more certainly it fires (Lesson 46).
const CODE = SRC.split('\n')
  .filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('useGridKeyboardNav — textarea keeps Enter', () => {
  test('Enter inside a TEXTAREA returns before any preventDefault', () => {
    assert.match(
      CODE,
      /if \(isEnter && tag === 'TEXTAREA'\) return;/,
      'without this the Remark / Process / Type-of-material boxes cannot take a newline'
    );
  });

  test('the exemption sits AFTER tag is read and BEFORE the key is consumed', () => {
    const tagAt = CODE.indexOf('const tag = active.tagName');
    const exemptAt = CODE.indexOf("if (isEnter && tag === 'TEXTAREA') return;");
    const preventAt = CODE.indexOf('e.preventDefault()');
    assert.ok(tagAt > -1 && exemptAt > -1 && preventAt > -1, 'all three landmarks present');
    assert.ok(exemptAt > tagAt, 'must come after `tag` exists, or it reads undefined');
    assert.ok(
      exemptAt < preventAt,
      'must come before the key is swallowed — returning afterwards is too late'
    );
  });

  test('Enter is still bound to navigation for the OTHER control types', () => {
    // The exemption must be narrow. If Enter stopped navigating everywhere,
    // every single-line cell in these grids would lose row-stepping and
    // nobody would notice until an operator complained.
    assert.match(CODE, /if \(isEnter\) dir = e\.shiftKey \? 'up' : 'down';/);
    assert.match(CODE, /tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA'/);
  });

  test('still registered on the capture phase — that is why it wins at all', () => {
    assert.match(CODE, /addEventListener\('keydown', onKeyDown, true\)/);
  });
});
