import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLang } from './pickLang.js';

test('pickLang returns the Vietnamese twin when the locale is vi', () => {
  assert.equal(pickLang('vi', 'Field', 'Trường'), 'Trường');
});

test('pickLang falls back to English when no Vietnamese twin exists', () => {
  assert.equal(pickLang('vi', 'Field', undefined), 'Field');
  assert.equal(pickLang('vi', 'Field', null), 'Field');
  assert.equal(pickLang('vi', 'Field', ''), 'Field');
});

test('pickLang returns English for any non-vi locale', () => {
  assert.equal(pickLang('en', 'Field', 'Trường'), 'Field');
  assert.equal(pickLang(undefined, 'Field', 'Trường'), 'Field');
});
