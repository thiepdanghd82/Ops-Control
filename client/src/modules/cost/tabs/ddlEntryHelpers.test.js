// @ts-check
/**
 * ddlEntryHelpers — pure add/delete regression for the Drop-Down Lists
 * editor. Runner: node --test src/modules/cost/tabs/ddlEntryHelpers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addObjectKey,
  deleteObjectKey,
  deleteArrayIndex,
  normToolKey,
  reconcileToolLife,
  renameToolLifeKey,
} from './ddlEntryHelpers.js';

// Mirror of calcEngine.getToolLife for the money-path assertions.
const getToolLife = (toolLife, tt) => toolLife[tt] || 0;

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

// ── Tool Life ↔ Tool Type ──
test('normToolKey normalizes trim/case/space + part before slash', () => {
  assert.equal(normToolKey('Etching/ Pinnacle Die'), 'etching');
  assert.equal(normToolKey('  Etching '), 'etching');
  assert.equal(normToolKey('CNC'), 'cnc');
  assert.equal(normToolKey('Knife  Blade'), 'knife blade');
});

test('reconcileToolLife: exact + normalized carry-over; getToolLife resolves', () => {
  const toolType = ['Etching/ Pinnacle Die', 'Carving'];
  const legacy = { Etching: 20000, Carving: 40000 };
  const { toolLife, changed } = reconcileToolLife(toolType, legacy);
  assert.equal(changed, true);
  assert.deepEqual(
    Object.keys(toolLife),
    ['Etching/ Pinnacle Die', 'Carving'],
    'keyed exactly by tool_type'
  );
  assert.equal(toolLife['Etching/ Pinnacle Die'], 20000, 'normalized carry-over');
  assert.equal(toolLife['Carving'], 40000);
  assert.equal(getToolLife(toolLife, 'Etching/ Pinnacle Die'), 20000);
  assert.equal(getToolLife(toolLife, 'Carving'), 40000);
});

test('reconcileToolLife: already-consistent → no change (not dirty)', () => {
  const toolType = ['Knife', 'Carving'];
  const tl = { Knife: 20000, Carving: 40000 };
  const { toolLife, changed } = reconcileToolLife(toolType, tl);
  assert.equal(changed, false);
  assert.deepEqual(toolLife, tl);
});

test('reconcileToolLife: new tool_type with no match → blank; getToolLife 0', () => {
  const { toolLife } = reconcileToolLife(['Knife', 'BrandNew'], { Knife: 20000 });
  assert.equal(toolLife['BrandNew'], '');
  assert.equal(
    getToolLife(toolLife, 'BrandNew'),
    0,
    'blank seed → 0 (per-row still wins upstream)'
  );
});

test('reconcileToolLife: keys exactly by tool_type, drops orphans after carry-over', () => {
  // 'Etching' orphan value carries onto 'Etching/ Pinnacle Die', then only
  // the tool_type keys remain.
  const { toolLife } = reconcileToolLife(['Etching/ Pinnacle Die'], { Etching: 20000, Ghost: 999 });
  assert.deepEqual(Object.keys(toolLife), ['Etching/ Pinnacle Die']);
  assert.equal(toolLife['Etching/ Pinnacle Die'], 20000);
});

test('renameToolLifeKey moves the value; add seeds blank; delete via deleteObjectKey', () => {
  // rename Knife → Knife2 carries the value
  assert.deepEqual(renameToolLifeKey({ Knife: 20000, Carving: 40000 }, 'Knife', 'Knife2'), {
    Knife2: 20000,
    Carving: 40000,
  });
  // naming a fresh "+ Add" entry ('' → Name) seeds '' (blank)
  assert.deepEqual(renameToolLifeKey({ Carving: 40000 }, '', 'NewTool'), {
    Carving: 40000,
    NewTool: '',
  });
  // no-op rename returns a clone
  assert.deepEqual(renameToolLifeKey({ Knife: 1 }, 'Knife', 'Knife'), { Knife: 1 });
  // delete a tool_type's key
  assert.deepEqual(deleteObjectKey({ Knife: 20000, Carving: 40000 }, 'Knife'), { Carving: 40000 });
});
