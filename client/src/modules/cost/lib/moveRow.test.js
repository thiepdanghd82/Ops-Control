import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { moveRowAmongVisible, canMoveRow } from './moveRow.js';

const rows = (...names) =>
  names.map((n) => (n.startsWith('!') ? { n: n.slice(1), hidden: true } : { n }));
const names = (arr) => arr.map((r) => (r.hidden ? '!' + r.n : r.n)).join(',');

describe('moveRowAmongVisible', () => {
  test('down swaps with the next row', () => {
    assert.equal(names(moveRowAmongVisible(rows('a', 'b', 'c'), 0, 'down')), 'b,a,c');
  });

  test('up swaps with the previous row', () => {
    assert.equal(names(moveRowAmongVisible(rows('a', 'b', 'c'), 2, 'up')), 'a,c,b');
  });

  test('SKIPS a hidden neighbour — the visible order moves by exactly one', () => {
    // Without this the array changes and the screen does not: the operator
    // clicks down and nothing appears to happen (Lesson 41).
    const out = moveRowAmongVisible(rows('a', '!h', 'b'), 0, 'down');
    assert.equal(names(out), 'b,!h,a', 'a and b swap; the hidden row keeps its slot');
  });

  test('skips a RUN of hidden neighbours', () => {
    assert.equal(names(moveRowAmongVisible(rows('a', '!x', '!y', 'b'), 0, 'down')), 'b,!x,!y,a');
  });

  test('at the visible edge returns the SAME reference — no re-render, no no-op write', () => {
    const r = rows('a', 'b');
    assert.equal(moveRowAmongVisible(r, 0, 'up'), r);
    assert.equal(moveRowAmongVisible(r, 1, 'down'), r);
  });

  test('trailing hidden rows do not make a bottom row look movable', () => {
    const r = rows('a', 'b', '!z');
    assert.equal(moveRowAmongVisible(r, 1, 'down'), r, 'b is the last VISIBLE row');
  });

  test('a hidden row is not itself movable', () => {
    const r = rows('a', '!h', 'b');
    assert.equal(moveRowAmongVisible(r, 1, 'down'), r);
  });

  test('does not mutate the input', () => {
    const r = rows('a', 'b');
    const before = names(r);
    moveRowAmongVisible(r, 0, 'down');
    assert.equal(names(r), before);
  });

  test('junk input is returned untouched rather than throwing', () => {
    assert.equal(moveRowAmongVisible(null, 0, 'up'), null);
    const r = rows('a');
    assert.equal(moveRowAmongVisible(r, 9, 'up'), r);
    assert.equal(moveRowAmongVisible(r, -1, 'up'), r);
    assert.equal(moveRowAmongVisible(r, 0, 'sideways'), r);
  });
});

describe('canMoveRow', () => {
  test('agrees with the mover by construction — one condition, never two', () => {
    // The button's enabled state and the action MUST share a rule, or the
    // cue and the remedy drift apart (S-PIN-ACTIONABLE).
    const r = rows('a', '!h', 'b');
    for (const [i, d] of [
      [0, 'up'],
      [0, 'down'],
      [2, 'up'],
      [2, 'down'],
      [1, 'up'],
    ]) {
      assert.equal(canMoveRow(r, i, d), moveRowAmongVisible(r, i, d) !== r, `${i}/${d}`);
    }
  });
});
