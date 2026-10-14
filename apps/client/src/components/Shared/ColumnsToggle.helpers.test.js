import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyColumnVisibility,
  loadHiddenKeys,
  loadVisibleColumns,
  saveHiddenKeys,
} from './ColumnsToggle.helpers.js';

// Mock localStorage — fresh per test to avoid pollution.
function mockStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    _dump: () => Object.fromEntries(data),
    _throwOnSet: false,
  };
}

const SAMPLE_COLS = [
  { key: 'rfq_no', label: 'RFQ No', required: true },
  { key: 'direct_cu', label: 'Direct Customer' },
  { key: 'project', label: 'End Customer' },
  { key: 'moq', label: 'MOQ' },
  { key: 'gm_pct', label: 'GM%' },
];

describe('applyColumnVisibility', () => {
  test('empty hidden → returns full columns array (identity)', () => {
    const out = applyColumnVisibility(SAMPLE_COLS, new Set());
    assert.equal(out.length, 5);
    assert.equal(out, SAMPLE_COLS); // identity shortcut
  });

  test('null/undefined hidden → returns columns', () => {
    assert.equal(applyColumnVisibility(SAMPLE_COLS, null).length, 5);
    assert.equal(applyColumnVisibility(SAMPLE_COLS, undefined).length, 5);
  });

  test('hides non-required keys, preserves source order', () => {
    const out = applyColumnVisibility(SAMPLE_COLS, new Set(['project', 'moq']));
    assert.deepEqual(
      out.map((c) => c.key),
      ['rfq_no', 'direct_cu', 'gm_pct']
    );
  });

  test('required column ignores hiddenKeys (always visible) — REGRESSION GUARD', () => {
    // Even if storageKey somehow contained rfq_no, required guard wins.
    const out = applyColumnVisibility(SAMPLE_COLS, new Set(['rfq_no', 'direct_cu', 'project']));
    assert.equal(
      out.find((c) => c.key === 'rfq_no'),
      SAMPLE_COLS[0]
    );
    assert.equal(out.length, 3); // rfq_no (required) + moq + gm_pct
  });

  test('non-array input → []', () => {
    assert.deepEqual(applyColumnVisibility(null, new Set()), []);
    assert.deepEqual(applyColumnVisibility(undefined, new Set()), []);
  });
});

describe('loadHiddenKeys', () => {
  test('empty storage → defaultHiddenKeys', () => {
    const s = mockStorage();
    const out = loadHiddenKeys('test-key', ['a', 'b', 'c'], ['b'], s);
    assert.equal(out.size, 1);
    assert.ok(out.has('b'));
  });

  test('missing key in storage → defaultHiddenKeys', () => {
    const s = mockStorage();
    s.setItem('other-key', '[]');
    const out = loadHiddenKeys('test-key', ['a'], ['a'], s);
    assert.equal(out.size, 1);
    assert.ok(out.has('a'));
  });

  test('persisted hidden keys load correctly', () => {
    const s = mockStorage();
    s.setItem('test-key', JSON.stringify(['b', 'c']));
    const out = loadHiddenKeys('test-key', ['a', 'b', 'c', 'd'], [], s);
    assert.equal(out.size, 2);
    assert.ok(out.has('b'));
    assert.ok(out.has('c'));
  });

  test('stale keys filtered silently — REGRESSION GUARD for column rename', () => {
    const s = mockStorage();
    s.setItem('test-key', JSON.stringify(['valid', 'removed_in_v2', 'also_valid']));
    const out = loadHiddenKeys('test-key', ['valid', 'also_valid'], [], s);
    assert.equal(out.size, 2);
    assert.ok(out.has('valid'));
    assert.ok(out.has('also_valid'));
    assert.equal(out.has('removed_in_v2'), false);
  });

  test('corrupt JSON in storage → defaultHiddenKeys (no crash)', () => {
    const s = mockStorage();
    s.setItem('test-key', '{not json at all');
    const out = loadHiddenKeys('test-key', ['a'], ['a'], s);
    assert.equal(out.size, 1);
    assert.ok(out.has('a'));
  });

  test('non-array JSON → defaultHiddenKeys', () => {
    const s = mockStorage();
    s.setItem('test-key', JSON.stringify({ a: 1 }));
    const out = loadHiddenKeys('test-key', ['a'], [], s);
    assert.equal(out.size, 0);
  });

  test('no storage available → defaultHiddenKeys (SSR-safe)', () => {
    const out = loadHiddenKeys('test-key', ['a', 'b'], ['b'], null);
    assert.equal(out.size, 1);
    assert.ok(out.has('b'));
  });

  test('default keys filter against validKeys (no stale defaults)', () => {
    const s = mockStorage();
    const out = loadHiddenKeys('test-key', ['a'], ['a', 'stale_default'], s);
    assert.equal(out.size, 1);
    assert.ok(out.has('a'));
    assert.equal(out.has('stale_default'), false);
  });
});

describe('loadVisibleColumns', () => {
  test('compose load+filter in one call', () => {
    const s = mockStorage();
    s.setItem('compose-key', JSON.stringify(['project', 'moq']));
    const out = loadVisibleColumns(SAMPLE_COLS, 'compose-key', [], s);
    assert.deepEqual(
      out.map((c) => c.key),
      ['rfq_no', 'direct_cu', 'gm_pct']
    );
  });

  test('empty storage → all columns visible', () => {
    const s = mockStorage();
    const out = loadVisibleColumns(SAMPLE_COLS, 'empty-key', [], s);
    assert.equal(out.length, 5);
  });

  test('required column survives even if persisted hidden', () => {
    const s = mockStorage();
    s.setItem('protect-key', JSON.stringify(['rfq_no', 'moq']));
    const out = loadVisibleColumns(SAMPLE_COLS, 'protect-key', [], s);
    const keys = out.map((c) => c.key);
    assert.ok(keys.includes('rfq_no'), 'required column must survive persisted hidden');
    assert.equal(keys.includes('moq'), false);
  });
});

describe('saveHiddenKeys', () => {
  test('persists sorted array to localStorage', () => {
    const s = mockStorage();
    saveHiddenKeys('save-key', new Set(['c', 'a', 'b']), s);
    assert.equal(s.getItem('save-key'), JSON.stringify(['a', 'b', 'c']));
  });

  test('empty Set → []', () => {
    const s = mockStorage();
    saveHiddenKeys('save-key', new Set(), s);
    assert.equal(s.getItem('save-key'), '[]');
  });

  test('null/undefined → []', () => {
    const s = mockStorage();
    saveHiddenKeys('save-key', null, s);
    assert.equal(s.getItem('save-key'), '[]');
  });

  test('no storage → no-op (SSR-safe)', () => {
    // Must not throw.
    saveHiddenKeys('save-key', new Set(['a']), null);
    assert.ok(true);
  });

  test('storage throws on setItem → swallow (quota)', () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    // Must not throw.
    saveHiddenKeys('save-key', new Set(['a']), s);
    assert.ok(true);
  });
});
