import test from 'node:test';
import assert from 'node:assert/strict';
import { eauTooltipKey } from './eauTooltip.js';

test('EAU filled → no tooltip, whatever the tooling', () => {
  assert.equal(eauTooltipKey({ annualQty: 20000, hasTooling: true }), null);
  assert.equal(eauTooltipKey({ annualQty: 20000, hasTooling: false }), null);
  assert.equal(eauTooltipKey({ annualQty: '20000', hasTooling: true }), null);
});

test('EAU blank WITH tooling → the message that names the consequence', () => {
  // The branch that could never run before. Deleting the hasTooling check
  // turns this red and nothing else, which is the evidence it is reachable.
  assert.equal(eauTooltipKey({ annualQty: 0, hasTooling: true }), 'moqcard.eau_required');
});

test('EAU blank without tooling → the generic gate tip', () => {
  assert.equal(eauTooltipKey({ annualQty: 0, hasTooling: false }), 'gate.required_tip');
});

test('every shape a blank cell actually takes counts as blank', () => {
  // DecimalInput hands back '' on clear and the factories seed 0; a quote
  // saved before the field existed reads undefined.
  for (const blank of [0, '', null, undefined, NaN, '0', -1]) {
    assert.equal(
      eauTooltipKey({ annualQty: blank, hasTooling: true }),
      'moqcard.eau_required',
      `${String(blank)} should read as blank`
    );
  }
});
