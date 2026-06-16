/**
 * packingTierField helpers — pure resolver for the per-MOQ pack/ship
 * UI binding. Sprint S-PACK-SHIP-PER-TIER step 3.
 *
 *   node --test src/services/packingTierField.test.js
 *
 * Critical contract: presence-based binding (not truthiness). A key
 * present in em.packing with value 0 MUST resolve to 0, not fall back
 * to base — that's Henry's dễ-vỡ case.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTierField, blurEmptyValue } from './packingTierField.js';

test('resolveTierField: tier 0 (em null) returns base + isOverride false', () => {
  const st = { pcs_per_bag: 100, other_ship: 50 };
  const r = resolveTierField(null, st, 'pcs_per_bag');
  assert.equal(r.value, 100);
  assert.equal(r.isOverride, false);
});

test('resolveTierField: em without packing key → base, not override', () => {
  const st = { pcs_per_bag: 100 };
  const em = { moq: 2000 }; // legacy tier shape — no `packing` key
  const r = resolveTierField(em, st, 'pcs_per_bag');
  assert.equal(r.value, 100);
  assert.equal(r.isOverride, false);
});

test('resolveTierField: em.packing has key with positive value → override wins', () => {
  const st = { pcs_per_bag: 100 };
  const em = { packing: { pcs_per_bag: 200 } };
  const r = resolveTierField(em, st, 'pcs_per_bag');
  assert.equal(r.value, 200);
  assert.equal(r.isOverride, true);
});

test('resolveTierField: em.packing has key with value 0 → override 0 (NOT silent fallback)', () => {
  // The dễ-vỡ case at the UI binding layer. Operator with a 0-cost
  // tier (customer covers shipping) MUST see 0 in the field; the
  // resolver must not use `??` or `||` which would fall back to base.
  const st = { other_ship: 50 };
  const em = { packing: { other_ship: 0 } };
  const r = resolveTierField(em, st, 'other_ship');
  assert.equal(r.value, 0, 'explicit 0 override must surface as 0');
  assert.equal(r.isOverride, true, 'override flag must be true so violet badge + ↻ render');
});

test('resolveTierField: em.packing has key with empty string → override "" (operator hasn\'t finished typing)', () => {
  // Edge case for mid-typing in raw <input>. Not Henry's spec but
  // matches the input contract — pass through whatever is present.
  const st = { delivery_term: 'DAP' };
  const em = { packing: { delivery_term: '' } };
  const r = resolveTierField(em, st, 'delivery_term');
  assert.equal(r.value, '');
  assert.equal(r.isOverride, true);
});

test('resolveTierField: em.packing has partial keys → mixed override + fallback', () => {
  const st = { pcs_per_bag: 100, bags_per_box: 10, shipping_cost: 200 };
  const em = { packing: { pcs_per_bag: 500 } }; // only one key overridden
  assert.deepEqual(resolveTierField(em, st, 'pcs_per_bag'), { value: 500, isOverride: true });
  assert.deepEqual(resolveTierField(em, st, 'bags_per_box'), { value: 10, isOverride: false });
  assert.deepEqual(resolveTierField(em, st, 'shipping_cost'), { value: 200, isOverride: false });
});

test('resolveTierField: st undefined / null → returns undefined cleanly (no crash)', () => {
  const r = resolveTierField(null, undefined, 'pcs_per_bag');
  assert.equal(r.value, undefined);
  assert.equal(r.isOverride, false);
});

// ── blurEmptyValue (DecimalInput preserveEmpty wiring) ──

test('blurEmptyValue: default (no arg) returns 0 — back-compat with existing callsites', () => {
  assert.equal(blurEmptyValue(), 0);
});

test('blurEmptyValue: preserveEmpty=false returns 0 — explicit opt-out matches default', () => {
  assert.equal(blurEmptyValue(false), 0);
});

test('blurEmptyValue: preserveEmpty=true returns empty string — opt-in for tier-override fields', () => {
  assert.equal(blurEmptyValue(true), '');
});
