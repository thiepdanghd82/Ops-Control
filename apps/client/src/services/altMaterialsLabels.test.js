// @ts-check
/**
 * Sprint S-ALT-MAT flag-flip — label-branch tests for the row-type
 * dropdown cosmetic fix (FIX-35). Verifies the displayed label flips
 * by `materials_active` while the underlying value would stay 'Main.Mat'.
 *
 * Runner: node --test src/services/altMaterialsLabels.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryRowTypeLabel } from './altMaterialsLabels.js';

test("primaryRowTypeLabel('main') → 'Main.Mat'", () => {
  assert.equal(primaryRowTypeLabel('main'), 'Main.Mat');
});

test("primaryRowTypeLabel('alt') → 'Alt.Mat'", () => {
  assert.equal(primaryRowTypeLabel('alt'), 'Alt.Mat');
});

test('primaryRowTypeLabel(undefined) → defaults to Main.Mat (feature-off path)', () => {
  assert.equal(primaryRowTypeLabel(undefined), 'Main.Mat');
});

test('primaryRowTypeLabel(null) → defaults to Main.Mat (pre-PR-A quote)', () => {
  assert.equal(primaryRowTypeLabel(null), 'Main.Mat');
});

test('primaryRowTypeLabel("garbage") → defaults to Main.Mat (defensive)', () => {
  assert.equal(primaryRowTypeLabel('garbage'), 'Main.Mat');
});
