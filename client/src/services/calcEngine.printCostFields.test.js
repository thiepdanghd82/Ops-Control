// @ts-check
/**
 * Print-cost block fields (Layout ▸ Print Design Layout) — factory defaults
 * + save/load round-trip. Additive UI/state only; these do NOT feed
 * calcEngine yet (Plate-cost formula pending), so the golden suite is
 * unchanged. Runner:
 *   node --test src/services/calcEngine.printCostFields.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdState, createEmptyStdState, createSubProduct } from './calcEngine.js';

const PL_FIELDS = ['pl_print_type', 'pl_num_colors', 'pl_film_lp_cost', 'pl_plate_cost'];

test('createStdState seeds the 4 print-cost fields empty', () => {
  const s = createStdState();
  for (const f of PL_FIELDS) {
    assert.ok(Object.hasOwn(s, f), `createStdState has ${f}`);
    assert.equal(s[f], '', `${f} defaults to ''`);
  }
});

test('createEmptyStdState seeds the 4 print-cost fields empty', () => {
  const s = createEmptyStdState();
  for (const f of PL_FIELDS) {
    assert.ok(Object.hasOwn(s, f), `createEmptyStdState has ${f}`);
    assert.equal(s[f], '');
  }
});

test('createSubProduct (Cpx) seeds the 4 print-cost fields empty', () => {
  const sp = createSubProduct('SP A');
  for (const f of PL_FIELDS) {
    assert.ok(Object.hasOwn(sp, f), `createSubProduct has ${f}`);
    assert.equal(sp[f], '');
  }
});

test('print-cost fields survive a JSON save/load round-trip (Std)', () => {
  const s = createStdState();
  s.pl_print_type = 'Flexo';
  s.pl_num_colors = 4;
  s.pl_film_lp_cost = 12.5;
  s.pl_plate_cost = ''; // still calculated/read-only — stays empty for now
  const round = JSON.parse(JSON.stringify(s));
  assert.equal(round.pl_print_type, 'Flexo');
  assert.equal(round.pl_num_colors, 4);
  assert.equal(round.pl_film_lp_cost, 12.5);
  assert.equal(round.pl_plate_cost, '');
});

test('print-cost fields survive a JSON round-trip (Cpx subproduct)', () => {
  const sp = createSubProduct('SP A');
  sp.pl_print_type = 'Silkscreen';
  sp.pl_num_colors = 2;
  sp.pl_film_lp_cost = 8;
  const round = JSON.parse(JSON.stringify(sp));
  assert.equal(round.pl_print_type, 'Silkscreen');
  assert.equal(round.pl_num_colors, 2);
  assert.equal(round.pl_film_lp_cost, 8);
});

test('legacy quote without the fields heals to undefined (no crash)', () => {
  // Simulate a pre-feature saved state: fields absent. Reading them is
  // undefined; the UI binds `value ?? ''` so no controlled-input crash.
  const legacy = JSON.parse(JSON.stringify(createStdState()));
  for (const f of PL_FIELDS) delete legacy[f];
  for (const f of PL_FIELDS) assert.equal(legacy[f], undefined);
});
