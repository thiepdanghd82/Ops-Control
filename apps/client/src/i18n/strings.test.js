/**
 * strings/translate — Phase 9P tests.
 *
 * v1.3 (per ADR-0012): platform shell keys live in `strings.js`; per-tab strings
 * live in `i18n/domains/<sap>.js` and register at module load via side-effect
 * import. The placeholders + dashboard tests below need the basis domain loaded
 * because dashboard.* keys moved there during consolidation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, STRINGS, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './strings.js';
import './domains/basis.js';

test('translate returns vi string when locale=vi', () => {
  assert.equal(translate('common.save', 'vi'), 'Lưu');
});

test('translate returns en when locale=en', () => {
  assert.equal(translate('common.save', 'en'), 'Save');
});

test('translate falls back to en for unknown locale', () => {
  assert.equal(translate('common.save', 'fr'), 'Save');
});

test('translate returns the key when both locale and en are missing', () => {
  assert.equal(translate('nonexistent.key', 'en'), 'nonexistent.key');
});

test('translate interpolates {placeholders}', () => {
  assert.equal(translate('dashboard.kpi.won_lost', 'en', { won: 3, lost: 1 }), '3 won / 1 lost');
  assert.equal(translate('dashboard.kpi.won_lost', 'vi', { won: 3, lost: 1 }), '3 thắng / 1 thua');
});

test('translate preserves {placeholders} when var missing', () => {
  assert.equal(translate('dashboard.kpi.won_lost', 'en', { won: 3 }), '3 won / {lost} lost');
});

test('translate handles no-vars call', () => {
  assert.equal(translate('dashboard.title', 'vi'), 'Bảng điều khiển Doanh nghiệp');
});

test('SUPPORTED_LOCALES includes en + vi', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['en', 'vi']);
});

test('DEFAULT_LOCALE is en', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
});

test('every vi translation is non-empty (catches empty entries)', () => {
  const bad = [];
  for (const [key, row] of Object.entries(STRINGS)) {
    if (row.vi == null || row.vi === '') bad.push(key);
  }
  assert.deepEqual(bad, [], `Keys with empty vi translation: ${bad.join(', ')}`);
});

test('no duplicate keys across STRINGS (object invariant — runtime self-check)', () => {
  const keys = Object.keys(STRINGS);
  const uniq = new Set(keys);
  assert.equal(keys.length, uniq.size);
});
