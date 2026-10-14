// @ts-check
/**
 * Filename helper tests — sanitize() handles diacritics + odd chars;
 * build1TierName + buildZipName produce the spec §3 patterns.
 *
 * Runner: node --test server/services/quoteExport/__tests__/filenames.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, yyyymmdd, build1TierName, buildZipName } from '../filenames.js';

// ── sanitize ────────────────────────────────────────────────────

test('sanitize: passthrough for clean alnum', () => {
  assert.equal(sanitize('CCL-2026-S0012'), 'CCL-2026-S0012');
});

test('sanitize: spaces become underscores', () => {
  assert.equal(sanitize('Hai Phong Plant'), 'Hai_Phong_Plant');
});

test('sanitize: collapses runs of underscores', () => {
  assert.equal(sanitize('Hai  Phong   Plant'), 'Hai_Phong_Plant');
});

test('sanitize: strips Vietnamese diacritics (NFKD)', () => {
  assert.equal(sanitize('Đặng Thế Thiệp'), 'Dang_The_Thiep');
});

test('sanitize: handles capital Đ + lowercase đ', () => {
  assert.equal(sanitize('Đông Đô'), 'Dong_Do');
});

test('sanitize: trims leading/trailing junk', () => {
  assert.equal(sanitize('---foo---'), 'foo');
  assert.equal(sanitize('___foo___'), 'foo');
});

test('sanitize: empty + null fall back to provided default', () => {
  assert.equal(sanitize('', 'X'), 'X');
  assert.equal(sanitize(null, 'X'), 'X');
  assert.equal(sanitize(undefined, 'X'), 'X');
});

test('sanitize: caps at 50 chars', () => {
  const long = 'A'.repeat(80);
  const out = sanitize(long);
  assert.equal(out.length, 50);
});

test('sanitize: non-Latin scripts become underscores after diacritic strip', () => {
  // Chinese / Cyrillic - no NFKD decomposition into Latin
  const out = sanitize('北京 Plant');
  assert.match(out, /^_*Plant$|Plant$/, `got ${out}`);
});

// ── yyyymmdd ────────────────────────────────────────────────────

test('yyyymmdd: pads month + day to 2 digits', () => {
  const out = yyyymmdd(new Date('2026-01-07T10:00:00Z'));
  assert.equal(out, '20260107');
});

test('yyyymmdd: end of year UTC', () => {
  assert.equal(yyyymmdd(new Date('2026-12-31T23:59:59Z')), '20261231');
});

test('yyyymmdd: defaults to now when no arg', () => {
  const out = yyyymmdd();
  assert.match(out, /^\d{8}$/);
});

// ── build1TierName ─────────────────────────────────────────────

test('build1TierName: full happy path', () => {
  const out = build1TierName({
    rfq: '2026-S0012',
    customer: 'Hai Phong',
    tierLabel: 500,
    variant: 'customer',
    version: 3,
    now: new Date('2026-05-18T10:00:00Z'),
  });
  assert.equal(out, 'Quote_2026-S0012_Hai_Phong_MOQ500_customer_v3_20260518.xlsx');
});

test('build1TierName: internal variant + diacritics', () => {
  const out = build1TierName({
    rfq: 'RFQ-001',
    customer: 'Đặng Thế Thiệp',
    tierLabel: 1,
    variant: 'internal',
    version: 1,
    now: new Date('2026-01-01T00:00:00Z'),
  });
  assert.equal(out, 'Quote_RFQ-001_Dang_The_Thiep_MOQ1_internal_v1_20260101.xlsx');
});

test('build1TierName: missing rfq + customer fall back to placeholders', () => {
  const out = build1TierName({
    tierLabel: 10,
    variant: 'customer',
    version: 1,
    now: new Date('2026-05-18T00:00:00Z'),
  });
  assert.equal(out, 'Quote_NoRFQ_NoCust_MOQ10_customer_v1_20260518.xlsx');
});

// ── buildZipName ───────────────────────────────────────────────

test('buildZipName: pattern matches spec', () => {
  const out = buildZipName({
    rfq: 'RFQ-2026',
    customer: 'Plant A',
    version: 5,
    now: new Date('2026-05-18T00:00:00Z'),
  });
  assert.equal(out, 'Quote_RFQ-2026_Plant_A_v5_20260518.zip');
});
