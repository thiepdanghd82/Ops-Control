import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotedBy } from './quoteCreator.js';

test('reads the creator the server keeps on the quote row', () => {
  assert.equal(quotedBy({ id: 140, created_by: 'Jet', state: {} }), 'Jet');
});

test('does not look in the quote state, which a copy carries over', () => {
  assert.equal(quotedBy({ id: 140, state: { created_by: 'Jet' } }), '');
});

test('is blank when no creator is known', () => {
  // Quotes created before 2026-05-26 have no record of who made them.
  assert.equal(quotedBy({ id: 27, state: {} }), '');
  assert.equal(quotedBy({ id: 27, created_by: null }), '');
  assert.equal(quotedBy(null), '');
  assert.equal(quotedBy(undefined), '');
});
