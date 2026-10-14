/**
 * useTheme — Phase 9J tests.
 *
 * Scope: the pure helpers (readStoredPref, resolveTheme). The React
 * hook itself is harder to unit-test without a DOM stub; its behavior
 * is covered by the preview smoke test in the sprint verification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Pre-stub globals the module reads at import time.
globalThis.localStorage = {
  _store: {},
  getItem(k) {
    return this._store[k] ?? null;
  },
  setItem(k, v) {
    this._store[k] = String(v);
  },
  removeItem(k) {
    delete this._store[k];
  },
};
globalThis.window = {
  matchMedia(q) {
    return {
      matches: q.includes('dark') && globalThis.__prefersDark === true,
      addEventListener() {},
      removeEventListener() {},
    };
  },
};

const { readStoredPref, resolveTheme } = await import('./useTheme.js');

test('readStoredPref: default to system when no localStorage entry', () => {
  globalThis.localStorage._store = {};
  assert.equal(readStoredPref(), 'system');
});

test('readStoredPref: returns stored pref when valid', () => {
  globalThis.localStorage._store = { ops_theme_pref: 'dark' };
  assert.equal(readStoredPref(), 'dark');
  globalThis.localStorage._store = { ops_theme_pref: 'light' };
  assert.equal(readStoredPref(), 'light');
  globalThis.localStorage._store = { ops_theme_pref: 'system' };
  assert.equal(readStoredPref(), 'system');
});

test('readStoredPref: falls back to system for invalid value', () => {
  globalThis.localStorage._store = { ops_theme_pref: 'neon' };
  assert.equal(readStoredPref(), 'system');
});

test('resolveTheme: light returns light regardless of OS', () => {
  globalThis.__prefersDark = true;
  assert.equal(resolveTheme('light'), 'light');
  globalThis.__prefersDark = false;
  assert.equal(resolveTheme('light'), 'light');
});

test('resolveTheme: dark returns dark regardless of OS', () => {
  globalThis.__prefersDark = true;
  assert.equal(resolveTheme('dark'), 'dark');
  globalThis.__prefersDark = false;
  assert.equal(resolveTheme('dark'), 'dark');
});

test('resolveTheme: system follows prefers-color-scheme', () => {
  globalThis.__prefersDark = true;
  assert.equal(resolveTheme('system'), 'dark');
  globalThis.__prefersDark = false;
  assert.equal(resolveTheme('system'), 'light');
});

test('resolveTheme: bogus pref defaults to light', () => {
  globalThis.__prefersDark = false;
  assert.equal(resolveTheme('neon'), 'light');
  assert.equal(resolveTheme(null), 'light');
  assert.equal(resolveTheme(undefined), 'light');
});
