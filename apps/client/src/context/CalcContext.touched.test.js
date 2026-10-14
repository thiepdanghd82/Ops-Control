import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTouched } from './touchedState.js';

test('adding a field records it', () => {
  assert.deepEqual(addTouched([], 'ccl_pn'), ['ccl_pn']);
});

test('adding the same field twice returns the identical array reference', () => {
  const before = ['ccl_pn'];
  const after = addTouched(before, 'ccl_pn');
  assert.equal(after, before, 'must return the same reference so React skips the re-render');
});

test('adding a second field appends without dropping the first', () => {
  assert.deepEqual(addTouched(['ccl_pn'], 'moq'), ['ccl_pn', 'moq']);
});

test('blank or missing field names are ignored', () => {
  const before = ['ccl_pn'];
  assert.equal(addTouched(before, ''), before);
  assert.equal(addTouched(before, undefined), before);
});
