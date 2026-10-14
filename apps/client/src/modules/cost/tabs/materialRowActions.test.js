import test from 'node:test';
import assert from 'node:assert/strict';
import { copySeed } from './materialRowActions.js';

const NPI = {
  name: '3M 9628B t0.05',
  date: '2024-09-23',
  currency: 'USD',
  price: 9.041,
  supplier: 'Cao Son',
  thickness: 0.05,
};

test('carries every field of the source row', () => {
  const out = copySeed(NPI, 'name', {});
  for (const k of ['price', 'supplier', 'thickness', 'currency']) {
    assert.equal(out[k], NPI[k], `${k} must come along`);
  }
});

test('the name is suffixed, never identical to the source', () => {
  const out = copySeed(NPI, 'name', {});
  assert.equal(out.name, '3M 9628B t0.05 (copy)');
  assert.notEqual(
    out.name,
    NPI.name,
    'an identical name makes the library join ambiguous, and resolveLibRow then ' +
      'blanks the columns for every quote using that material rather than picking one'
  );
});

test('the fresh seed overrides the source, so a copy is not dated by its original', () => {
  // NPI's blank-row seed. Inheriting 2024-09-23 would date a row created
  // today as 2024 — the shape that left three 2029 dates in the live library.
  const out = copySeed(NPI, 'name', { date: '2026-09-22', currency: 'USD' });
  assert.equal(out.date, '2026-09-22');
});

test('each tab keeps its own idea of a new row', () => {
  // Sourcing stamps a month and has no date; IFS stamps neither. Passing the
  // tab's own seed is what keeps one helper correct for all three.
  const src = copySeed({ material: 'PET', month: '2024-06' }, 'material', { month: '2026-09' });
  assert.equal(src.month, '2026-09');
  assert.equal(src.material, 'PET (copy)');

  const ifs = copySeed({ part_no: 'ABC-1', desc: 'x' }, 'part_no', {});
  assert.equal(ifs.part_no, 'ABC-1 (copy)');
  assert.equal(ifs.desc, 'x');
  assert.ok(!('date' in ifs), 'IFS has no date field and must not grow one');
});

test('a blank name stays blank rather than becoming "(copy)"', () => {
  // " (copy)" on its own is a name that looks real enough to save, and it
  // would then be the library key for a row nobody can identify.
  for (const bad of [{}, { name: '' }, { name: '   ' }, { name: null }]) {
    assert.equal(copySeed(bad, 'name', {}).name, '');
  }
});

test('copying a copy does not collide with the first copy', () => {
  const once = copySeed(NPI, 'name', {});
  const twice = copySeed(once, 'name', {});
  assert.equal(twice.name, '3M 9628B t0.05 (copy) (copy)');
  assert.notEqual(twice.name, once.name);
});

test('the source row is not mutated', () => {
  const before = { ...NPI };
  copySeed(NPI, 'name', { date: '2026-09-22' });
  assert.deepEqual(NPI, before, 'the row on screen must not change when it is copied');
});

test('a missing or malformed row yields a usable empty seed', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    const out = copySeed(bad, 'name', { date: '2026-09-22' });
    assert.equal(out.name, '');
    assert.equal(out.date, '2026-09-22');
  }
});
