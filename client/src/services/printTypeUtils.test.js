// @ts-check
/**
 * MES-3-FIX-33 — isIndigoPrintType helper tests.
 *
 * Operator's RFQ-2026-S0012 hardware test surfaced that the library
 * stores subtypes like `Indigo6800` while the gating code did
 * `=== 'Indigo'` — every Indigo subtype fell through to the non-Indigo
 * branch, CLICKS column went disabled, and ink Setup/Run = 0 → "—".
 *
 * Runner: node --test src/services/printTypeUtils.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isIndigoPrintType } from './printTypeUtils.js';

test('isIndigoPrintType("Indigo") → true (canonical name)', () => {
  assert.equal(isIndigoPrintType('Indigo'), true);
});

test('isIndigoPrintType("Indigo6800") → true (operator library subtype)', () => {
  assert.equal(isIndigoPrintType('Indigo6800'), true);
});

test('isIndigoPrintType("Indigo7800") → true (other library subtype)', () => {
  assert.equal(isIndigoPrintType('Indigo7800'), true);
});

test('isIndigoPrintType("Indigo Vmax") → true (future subtype with space)', () => {
  assert.equal(isIndigoPrintType('Indigo Vmax'), true);
});

test('isIndigoPrintType("Flexo") → false', () => {
  assert.equal(isIndigoPrintType('Flexo'), false);
});

test('isIndigoPrintType("Letterpress") → false', () => {
  assert.equal(isIndigoPrintType('Letterpress'), false);
});

test('isIndigoPrintType("") → false', () => {
  assert.equal(isIndigoPrintType(''), false);
});

test('isIndigoPrintType(null) → false (defensive — ink not yet picked)', () => {
  assert.equal(isIndigoPrintType(null), false);
});

test('isIndigoPrintType(undefined) → false', () => {
  assert.equal(isIndigoPrintType(undefined), false);
});

test('isIndigoPrintType("indigo6800") → false (case-sensitive — library data is canonical case)', () => {
  // Library entries are always title-case ("Indigo6800"). Case-insensitive
  // match would mask data-entry typos that should surface as errors.
  assert.equal(isIndigoPrintType('indigo6800'), false);
});

test('isIndigoPrintType("ZIndigo") → false (prefix anchored)', () => {
  assert.equal(isIndigoPrintType('ZIndigo'), false);
});
