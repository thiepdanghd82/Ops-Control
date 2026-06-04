import test from 'node:test';
import assert from 'node:assert/strict';
import {
  partitionWarnings,
  addIgnore,
  removeIgnore,
  pruneIgnore,
  summarizeBadge,
} from './validationIgnore.js';

const W = (id, severity = 'error') => ({ id, severity, scope: 'X', message: 'm' });

test('partitionWarnings: splits by id, not by message', () => {
  const warnings = [W('lay-width-sp2'), W('mat-price-0-sp2'), W('hdr-moq')];
  const { active, ignored } = partitionWarnings(warnings, ['mat-price-0-sp2']);
  assert.deepEqual(
    active.map((w) => w.id),
    ['lay-width-sp2', 'hdr-moq']
  );
  assert.deepEqual(
    ignored.map((w) => w.id),
    ['mat-price-0-sp2']
  );
});

test('partitionWarnings: empty ignore-list → all active', () => {
  const warnings = [W('a'), W('b')];
  assert.equal(partitionWarnings(warnings, []).active.length, 2);
  assert.equal(partitionWarnings(warnings, []).ignored.length, 0);
});

test('partitionWarnings: null inputs are safe', () => {
  assert.deepEqual(partitionWarnings(null, null), { active: [], ignored: [] });
  assert.deepEqual(partitionWarnings(undefined, undefined), { active: [], ignored: [] });
});

test('partitionWarnings: all ignored → active empty, ignored full (never pretends clean)', () => {
  const warnings = [W('a'), W('b'), W('c')];
  const { active, ignored } = partitionWarnings(warnings, ['a', 'b', 'c']);
  assert.equal(active.length, 0);
  assert.equal(ignored.length, 3);
});

test('addIgnore: adds + dedupes + returns a NEW array', () => {
  const base = ['a'];
  const next = addIgnore(base, 'b');
  assert.deepEqual(next, ['a', 'b']);
  assert.notEqual(next, base, 'must not mutate input');
  assert.deepEqual(addIgnore(['a', 'b'], 'a'), ['a', 'b'], 'dedupe existing');
});

test('addIgnore: null list / null id are safe', () => {
  assert.deepEqual(addIgnore(null, 'x'), ['x']);
  assert.deepEqual(addIgnore(['a'], null), ['a']);
  assert.deepEqual(addIgnore(undefined, undefined), []);
});

test('removeIgnore: removes the id, leaves the rest', () => {
  assert.deepEqual(removeIgnore(['a', 'b', 'c'], 'b'), ['a', 'c']);
  assert.deepEqual(removeIgnore(['a'], 'zzz'), ['a'], 'missing id is a no-op');
  assert.deepEqual(removeIgnore(null, 'a'), []);
});

test('addIgnore then removeIgnore round-trips back to original', () => {
  const base = ['x'];
  assert.deepEqual(removeIgnore(addIgnore(base, 'y'), 'y'), ['x']);
});

test('pruneIgnore: drops ignore IDs with no matching live warning', () => {
  const warnings = [W('a'), W('b')];
  assert.deepEqual(pruneIgnore(['a', 'gone'], warnings), ['a']);
  assert.deepEqual(pruneIgnore(['a', 'b'], warnings), ['a', 'b']);
});

test('summarizeBadge: discloses ignored count — never hides errors', () => {
  assert.equal(summarizeBadge({ errors: 3, warns: 0 }, 10), '3 errors (10 ignored)');
  assert.equal(summarizeBadge({ errors: 1, warns: 0 }, 0), '1 error');
  assert.equal(summarizeBadge({ errors: 0, warns: 2 }, 1), '2 warnings (1 ignored)');
  assert.equal(summarizeBadge({ errors: 0, warns: 0 }, 5), 'No active issues (5 ignored)');
  assert.equal(summarizeBadge({ errors: 1, warns: 2 }, 0), '1 error + 2 warnings');
  assert.equal(summarizeBadge({ errors: 0, warns: 0 }, 0), 'No active issues');
});
