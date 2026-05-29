/**
 * Unit tests for shared format helpers.
 * Run: node --test src/utils/format.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtN, pct, gmClr, fmtInt, safeNum, parseLocaleNumber } from './format.js';

const EMDASH = '\u2014';

// ── fmtN ──────────────────────────────────────────────────────────
test('fmtN: null / undefined / empty / zero → em-dash', () => {
  assert.equal(fmtN(null), EMDASH);
  assert.equal(fmtN(undefined), EMDASH);
  assert.equal(fmtN(0), EMDASH);
  assert.equal(fmtN(NaN), EMDASH);
});

test('fmtN: default 5 decimals', () => {
  assert.equal(fmtN(1.234567), '1.23457');
  assert.equal(fmtN(0.1), '0.10000');
});

test('fmtN: custom decimals', () => {
  assert.equal(fmtN(1.234567, 2), '1.23');
  assert.equal(fmtN(1.5, 0), '2');
});

// ── pct ──────────────────────────────────────────────────────────
test('pct: null → em-dash', () => {
  assert.equal(pct(null), EMDASH);
  assert.equal(pct(undefined), EMDASH);
  assert.equal(pct(NaN), EMDASH);
});

test('pct: 0.25 → "25.0%"', () => {
  assert.equal(pct(0.25), '25.0%');
});

test('pct: 0 → "0.0%" (not em-dash, since 0% is meaningful)', () => {
  assert.equal(pct(0), '0.0%');
});

test('pct: negative values format correctly', () => {
  assert.equal(pct(-0.15), '-15.0%');
});

// ── gmClr ──────────────────────────────────────────────────────────
test('gmClr: null → slate gray', () => {
  assert.equal(gmClr(null), '#94a3b8');
});

test('gmClr: >= 20% green', () => {
  assert.equal(gmClr(0.2), '#16a34a');
  assert.equal(gmClr(0.35), '#16a34a');
});

test('gmClr: >= 10% amber', () => {
  assert.equal(gmClr(0.1), '#d97706');
  assert.equal(gmClr(0.15), '#d97706');
});

test('gmClr: < 10% red (including negative)', () => {
  assert.equal(gmClr(0.05), '#dc2626');
  assert.equal(gmClr(-0.1), '#dc2626');
  assert.equal(gmClr(0), '#dc2626');
});

// ── fmtInt ──────────────────────────────────────────────────────────
test('fmtInt: thousand separators', () => {
  assert.equal(fmtInt(1234567), '1,234,567');
  assert.equal(fmtInt(1000), '1,000');
});

test('fmtInt: null/zero/NaN → em-dash', () => {
  assert.equal(fmtInt(null), EMDASH);
  assert.equal(fmtInt(0), EMDASH);
  assert.equal(fmtInt(NaN), EMDASH);
});

// ── safeNum ──────────────────────────────────────────────────────────
test('safeNum: numeric strings parse', () => {
  assert.equal(safeNum('123'), 123);
  assert.equal(safeNum('1.5'), 1.5);
});

test('safeNum: non-numeric → fallback', () => {
  assert.equal(safeNum('abc'), 0);
  assert.equal(safeNum('abc', 42), 42);
});

test('safeNum: null/undefined/empty → fallback', () => {
  assert.equal(safeNum(null), 0);
  assert.equal(safeNum(undefined), 0);
  assert.equal(safeNum(''), 0);
  assert.equal(safeNum(null, -1), -1);
});

test('safeNum: preserves 0 (does NOT replace with fallback)', () => {
  // Common bug: `parseFloat(v) || fallback` replaces literal 0 with fallback.
  // safeNum must preserve 0 since it is a valid input.
  assert.equal(safeNum(0, 99), 0);
  assert.equal(safeNum('0', 99), 0);
});

test('safeNum: Infinity and NaN → fallback', () => {
  assert.equal(safeNum(Infinity), 0);
  assert.equal(safeNum(-Infinity), 0);
  assert.equal(safeNum(NaN), 0);
});

test('safeNum: already-a-number passes through', () => {
  assert.equal(safeNum(3.14), 3.14);
  assert.equal(safeNum(-7), -7);
});

// ── parseLocaleNumber (Sprint 28: VN locale safety) ────────────────
// Sites that bypass DecimalInput.jsx (direct `<input type="number">`
// with parseFloat(e.target.value)) were silently dropping VN user
// input: "8,5" → 8, "1.234,56" → 1.234. This parser accepts both US
// and VN conventions and returns NaN for unparseable.

test('parseLocaleNumber: US decimal — no separator', () => {
  assert.equal(parseLocaleNumber('1234.56'), 1234.56);
  assert.equal(parseLocaleNumber('0'), 0);
  assert.equal(parseLocaleNumber('-7.5'), -7.5);
});

test('parseLocaleNumber: US full with thousands comma + dot decimal', () => {
  assert.equal(parseLocaleNumber('1,234.56'), 1234.56);
  assert.equal(parseLocaleNumber('12,345,678.9'), 12345678.9);
});

test('parseLocaleNumber: VN full — "." thousands, "," decimal', () => {
  assert.equal(parseLocaleNumber('1.234,56'), 1234.56);
  assert.equal(parseLocaleNumber('12.345.678,9'), 12345678.9);
});

test('parseLocaleNumber: VN short — comma-as-decimal (single separator)', () => {
  // The scenario raw parseFloat silently truncates.
  assert.equal(parseLocaleNumber('8,5'), 8.5);
  assert.equal(parseLocaleNumber('0,2342'), 0.2342);
});

test('parseLocaleNumber: US short — dot-as-decimal (single separator)', () => {
  assert.equal(parseLocaleNumber('8.5'), 8.5);
  assert.equal(parseLocaleNumber('0.2342'), 0.2342);
});

test('parseLocaleNumber: ambiguous ties broken by LAST separator = decimal', () => {
  // "1.2,34" — dot earlier, comma later → comma is decimal → 1.2,34 = ?
  // Strip all '.' → "12,34" → replace "," with "." → 12.34.
  assert.equal(parseLocaleNumber('1.2,34'), 12.34);
  // "1,2.34" — inverted: strip ',' → "12.34".
  assert.equal(parseLocaleNumber('1,2.34'), 12.34);
});

test('parseLocaleNumber: empty / whitespace / signs-only → NaN', () => {
  assert.ok(Number.isNaN(parseLocaleNumber('')));
  assert.ok(Number.isNaN(parseLocaleNumber('   ')));
  assert.ok(Number.isNaN(parseLocaleNumber('-')));
  assert.ok(Number.isNaN(parseLocaleNumber('.')));
  assert.ok(Number.isNaN(parseLocaleNumber(',')));
});

test('parseLocaleNumber: unparseable strings → NaN (no silent 0)', () => {
  assert.ok(Number.isNaN(parseLocaleNumber('abc')));
  assert.ok(Number.isNaN(parseLocaleNumber('N/A')));
});

test('parseLocaleNumber: null / undefined → NaN', () => {
  assert.ok(Number.isNaN(parseLocaleNumber(null)));
  assert.ok(Number.isNaN(parseLocaleNumber(undefined)));
});

test('parseLocaleNumber: already-a-number passes through', () => {
  assert.equal(parseLocaleNumber(42), 42);
  assert.equal(parseLocaleNumber(3.14), 3.14);
});

test('parseLocaleNumber: trimmed of surrounding whitespace', () => {
  assert.equal(parseLocaleNumber('  1,234.5  '), 1234.5);
});

test('parseLocaleNumber: negative values across conventions', () => {
  assert.equal(parseLocaleNumber('-1.234,5'), -1234.5); // VN
  assert.equal(parseLocaleNumber('-1,234.5'), -1234.5); // US
  assert.equal(parseLocaleNumber('-8,5'), -8.5); // VN short
});

test('parseLocaleNumber: caller pattern `parseLocaleNumber(v) || 0` works for VN user input', () => {
  // Before: parseFloat("8,5") || 0  === 8   ❌ wrong
  // After:  parseLocaleNumber("8,5") || 0 === 8.5  ✓
  assert.equal(parseLocaleNumber('8,5') || 0, 8.5);
  // Empty input still falls back.
  assert.equal(parseLocaleNumber('') || 0, 0);
});
