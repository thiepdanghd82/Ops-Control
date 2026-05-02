import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOpHours } from './routingHours.js';

test('UPH mode (factor_unit !== "h"): runHrs = quantity / runFactor', () => {
  const r = computeOpHours({ setupTime: 0.5, runFactor: 1000, factorUnit: 'u', quantity: 5000 });
  assert.equal(r.setupHrs, 0.5);
  assert.equal(r.runHrs, 5);
  assert.equal(r.totalHrs, 5.5);
  assert.equal(r.isFixedHours, false);
});

test('fixed-hours mode (factor_unit === "h"): runHrs = runFactor regardless of qty', () => {
  const r = computeOpHours({ setupTime: 1, runFactor: 2.5, factorUnit: 'h', quantity: 99999 });
  assert.equal(r.setupHrs, 1);
  assert.equal(r.runHrs, 2.5);
  assert.equal(r.totalHrs, 3.5);
  assert.equal(r.isFixedHours, true);
});

test('zero runFactor: runHrs = 0 (no divide-by-zero)', () => {
  const r = computeOpHours({ setupTime: 0.5, runFactor: 0, factorUnit: 'u', quantity: 1000 });
  assert.equal(r.runHrs, 0);
  assert.equal(r.totalHrs, 0.5);
});

test('factor_unit null/undefined: defaults to UPH mode', () => {
  const r = computeOpHours({ setupTime: 0, runFactor: 100, factorUnit: null, quantity: 200 });
  assert.equal(r.runHrs, 2);
  assert.equal(r.isFixedHours, false);
});

test('negative or NaN inputs clamp to 0 (no NaN bleed)', () => {
  const r = computeOpHours({ setupTime: -1, runFactor: NaN, factorUnit: 'u', quantity: -5 });
  assert.equal(r.setupHrs, 0);
  assert.equal(r.runHrs, 0);
  assert.equal(r.totalHrs, 0);
});
