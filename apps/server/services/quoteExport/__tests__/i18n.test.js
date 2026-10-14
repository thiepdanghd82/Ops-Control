// @ts-check
/**
 * i18n contract: every key has EN + VN, biLabel/L render correctly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, KEYS, L, biLabel } from '../i18n.js';

test('LABELS: every key has both en + vi strings, no null/empty', () => {
  for (const key of KEYS) {
    const entry = LABELS[key];
    assert.ok(entry, `key ${key} missing`);
    assert.equal(typeof entry.en, 'string', `${key}.en must be string`);
    assert.equal(typeof entry.vi, 'string', `${key}.vi must be string`);
    assert.ok(entry.en.length > 0, `${key}.en empty`);
    assert.ok(entry.vi.length > 0, `${key}.vi empty`);
  }
});

test('LABELS: at least 100 keys covering all 10 sheets', () => {
  assert.ok(KEYS.length >= 100, `expected ≥100 keys, got ${KEYS.length}`);
  const prefixes = [
    'common.',
    'cover.',
    'rfq.',
    'layout.',
    'mat.',
    'ink.',
    'proc.',
    'bal.',
    'pack.',
    'cb.',
    'summary.',
  ];
  for (const p of prefixes) {
    const found = KEYS.some((k) => k.startsWith(p));
    assert.ok(found, `expected at least one key starting with ${p}`);
  }
});

test('L: default (bilingual) returns EN\\nVN', () => {
  const out = L('cover.title');
  assert.ok(out.includes('\n'), `expected newline, got ${JSON.stringify(out)}`);
  const [en, vi] = out.split('\n');
  assert.equal(en, 'QUOTATION');
  assert.equal(vi, 'BẢN BÁO GIÁ');
});

test('L: en variant returns only EN', () => {
  assert.equal(L('cover.title', 'en'), 'QUOTATION');
});

test('L: vi variant returns only VN', () => {
  assert.equal(L('cover.title', 'vi'), 'BẢN BÁO GIÁ');
});

test('L: missing key surfaces gap with ? suffix (no throw)', () => {
  const out = L('nonexistent.key');
  assert.match(out, /\?$/);
});

test('biLabel: ad-hoc EN+VN renders by lang flag', () => {
  assert.equal(biLabel('A', 'B', 'en'), 'A');
  assert.equal(biLabel('A', 'B', 'vi'), 'B');
  assert.equal(biLabel('A', 'B', 'bilingual'), 'A\nB');
});

test('LABELS: no duplicate EN strings across sheets (sanity check)', () => {
  // Allow a few legitimate duplicates (Setup Cost, Run Cost) — but flag
  // if more than 20% of EN labels collide.
  const enValues = KEYS.map((k) => LABELS[k].en);
  const unique = new Set(enValues);
  const dupRatio = 1 - unique.size / enValues.length;
  assert.ok(dupRatio < 0.2, `dup ratio ${dupRatio.toFixed(2)} — too many EN clashes`);
});
