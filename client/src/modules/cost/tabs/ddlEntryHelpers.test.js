// @ts-check
/**
 * ddlEntryHelpers — pure add/delete regression for the Drop-Down Lists
 * editor. Runner: node --test src/modules/cost/tabs/ddlEntryHelpers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObjectKey, deleteObjectKey, deleteArrayIndex } from './ddlEntryHelpers.js';

test('addObjectKey: appends a new key (tool_life name)', () => {
  const res = addObjectKey({ Blade: '2' }, 'Knife', '5');
  assert.equal(res.ok, true);
  assert.deepEqual(res.obj, { Blade: '2', Knife: '5' });
});

test('addObjectKey: numeric string key (click_charges)', () => {
  const res = addObjectKey({ 1: '10' }, '2', '20');
  assert.equal(res.ok, true);
  assert.deepEqual(res.obj, { 1: '10', 2: '20' });
});

test('addObjectKey: default value is empty string', () => {
  const res = addObjectKey({}, 'Knife');
  assert.equal(res.ok, true);
  assert.deepEqual(res.obj, { Knife: '' });
});

test('addObjectKey: trims the key', () => {
  const res = addObjectKey({}, '  Knife  ', 'x');
  assert.deepEqual(res.obj, { Knife: 'x' });
});

test('addObjectKey: empty key rejected', () => {
  assert.deepEqual(addObjectKey({}, '   '), { ok: false, error: 'empty' });
  assert.deepEqual(addObjectKey({}, ''), { ok: false, error: 'empty' });
});

test('addObjectKey: duplicate rejected, existing value NOT overwritten', () => {
  const res = addObjectKey({ Knife: 'keep' }, 'Knife', 'new');
  assert.deepEqual(res, { ok: false, error: 'duplicate' });
});

test('addObjectKey: does not mutate the input', () => {
  const input = { A: '1' };
  addObjectKey(input, 'B', '2');
  assert.deepEqual(input, { A: '1' });
});

test('deleteObjectKey removes exactly the key (new object)', () => {
  const input = { A: '1', B: '2' };
  const out = deleteObjectKey(input, 'A');
  assert.deepEqual(out, { B: '2' });
  assert.deepEqual(input, { A: '1', B: '2' }, 'input untouched');
});

test('deleteObjectKey: missing key is a no-op clone', () => {
  assert.deepEqual(deleteObjectKey({ A: '1' }, 'Z'), { A: '1' });
});

test('deleteArrayIndex removes exactly that row (coverage array)', () => {
  const rows = [{ pt: 'SS' }, { pt: 'Flexo' }, { pt: 'Indigo' }];
  assert.deepEqual(deleteArrayIndex(rows, 1), [{ pt: 'SS' }, { pt: 'Indigo' }]);
  assert.equal(rows.length, 3, 'input untouched');
});
