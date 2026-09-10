import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSnapshotTone,
  resolveSnapshotBadgeLabel,
  resolveSnapshotStatusLabel,
  countSnapshotEntries,
  formatSnapshotDateTime,
  isCopyMode,
} from './SnapshotPanel.helpers.js';

describe('resolveSnapshotTone', () => {
  test('persisted → success (green)', () => {
    assert.equal(resolveSnapshotTone('persisted'), 'success');
  });
  test('synthesized → warning (amber)', () => {
    assert.equal(resolveSnapshotTone('synthesized'), 'warning');
  });
  test('empty → neutral (gray)', () => {
    assert.equal(resolveSnapshotTone('empty'), 'neutral');
  });
  test('unknown source → neutral (defensive fallback)', () => {
    assert.equal(resolveSnapshotTone('not-a-source'), 'neutral');
    assert.equal(resolveSnapshotTone(null), 'neutral');
    assert.equal(resolveSnapshotTone(undefined), 'neutral');
  });
});

describe('resolveSnapshotBadgeLabel', () => {
  test('persisted → "Frozen"', () => {
    assert.equal(resolveSnapshotBadgeLabel('persisted'), 'Frozen');
  });
  test('synthesized → "Live rates"', () => {
    assert.equal(resolveSnapshotBadgeLabel('synthesized'), 'Live rates');
  });
  test('empty → "No snapshot"', () => {
    assert.equal(resolveSnapshotBadgeLabel('empty'), 'No snapshot');
  });
  test('unknown source → "No snapshot" fallback', () => {
    assert.equal(resolveSnapshotBadgeLabel('whatever'), 'No snapshot');
  });
});

describe('resolveSnapshotStatusLabel', () => {
  test('persisted explains frozen-at-save semantics', () => {
    const s = resolveSnapshotStatusLabel('persisted');
    assert.match(s, /Frozen at save time/);
  });
  test('synthesized prompts operator to save', () => {
    const s = resolveSnapshotStatusLabel('synthesized');
    assert.match(s, /save to freeze/i);
  });
  test('empty states there is no pricing data', () => {
    const s = resolveSnapshotStatusLabel('empty');
    assert.match(s, /No pricing data/);
  });
});

describe('countSnapshotEntries', () => {
  test('null / undefined snapshot → all zeros (defensive)', () => {
    assert.deepEqual(countSnapshotEntries(null), { materials: 0, rates: 0, coverage: 0 });
    assert.deepEqual(countSnapshotEntries(undefined), { materials: 0, rates: 0, coverage: 0 });
  });

  test('empty-shell snapshot → all zeros', () => {
    const empty = { materials: {}, rates: {}, coverage: [] };
    assert.deepEqual(countSnapshotEntries(empty), { materials: 0, rates: 0, coverage: 0 });
  });

  test('counts dictionary keys for materials + rates', () => {
    const snap = {
      materials: { 'MAT-A': {}, 'MAT-B': {}, 'MAT-C': {} },
      rates: { Slit: {}, Pre_Cut: {} },
      coverage: [{ pt: 'Flexo' }, { pt: 'Indigo' }, { pt: 'SS' }, { pt: 'Offset' }],
    };
    assert.deepEqual(countSnapshotEntries(snap), { materials: 3, rates: 2, coverage: 4 });
  });

  test('non-object materials / rates / non-array coverage → 0', () => {
    const malformed = { materials: null, rates: 'broken', coverage: 'nope' };
    assert.deepEqual(countSnapshotEntries(malformed), { materials: 0, rates: 0, coverage: 0 });
  });
});

describe('formatSnapshotDateTime', () => {
  test('valid ISO → DD/MM/YYYY HH:mm', () => {
    // Use a fixed numeric construction to avoid timezone drift in CI.
    const iso = new Date(2026, 5, 10, 14, 30).toISOString(); // 10 Jun 2026 14:30 local
    const out = formatSnapshotDateTime(iso);
    assert.match(out, /^10\/06\/2026 \d{2}:\d{2}$/);
  });

  test('null / undefined / empty → "—"', () => {
    assert.equal(formatSnapshotDateTime(null), '—');
    assert.equal(formatSnapshotDateTime(undefined), '—');
    assert.equal(formatSnapshotDateTime(''), '—');
  });

  test('non-string → "—"', () => {
    assert.equal(formatSnapshotDateTime(123), '—');
    assert.equal(formatSnapshotDateTime({}), '—');
  });

  test('invalid date string → "—"', () => {
    assert.equal(formatSnapshotDateTime('not-an-iso'), '—');
  });

  test('zero-padded month + day', () => {
    const iso = new Date(2026, 0, 3, 9, 5).toISOString(); // 3 Jan 09:05
    assert.match(formatSnapshotDateTime(iso), /^03\/01\/2026 09:05$/);
  });
});

describe('isCopyMode', () => {
  test('true: activeQuoteId null + _synthesized + has materials', () => {
    const state = {
      pricing_snapshot: { _synthesized: true, _captured_at: null },
      materials: [{ code: 'M1' }],
    };
    assert.equal(isCopyMode(state, null), true);
  });

  test('true: Cpx copy — subproducts populated', () => {
    const state = {
      pricing_snapshot: { _synthesized: true, _captured_at: null },
      subproducts: [{ code: 'FG-1' }],
    };
    assert.equal(isCopyMode(state, null), true);
  });

  test('false: activeQuoteId set (normal load path)', () => {
    const state = {
      pricing_snapshot: { _synthesized: true, _captured_at: null },
      materials: [{ code: 'M1' }],
    };
    assert.equal(isCopyMode(state, 'q-123'), false);
  });

  test('false: fresh empty quote (no materials, no SPs)', () => {
    const state = {
      pricing_snapshot: { _synthesized: true, _captured_at: null },
      materials: [],
      subproducts: [],
    };
    assert.equal(isCopyMode(state, null), false);
  });

  test('false: _synthesized: false (persisted snapshot)', () => {
    const state = {
      pricing_snapshot: { _synthesized: false, _captured_at: '2026-06-09T00:00:00Z' },
      materials: [{ code: 'M1' }],
    };
    assert.equal(isCopyMode(state, null), false);
  });

  test('false: no pricing_snapshot at all', () => {
    const state = { materials: [{ code: 'M1' }] };
    assert.equal(isCopyMode(state, null), false);
  });

  test('false: null/undefined state defensively', () => {
    assert.equal(isCopyMode(null, null), false);
    assert.equal(isCopyMode(undefined, null), false);
  });

  test('false: activeQuoteId 0 (number) — quote.id may be falsy-zero', () => {
    // Defensive: numeric quote ids of 0 should still be a "real" load.
    // Spec uses `!== null && !== undefined && !== ''` so 0 counts as a real id.
    const state = {
      pricing_snapshot: { _synthesized: true },
      materials: [{ code: 'M1' }],
    };
    assert.equal(isCopyMode(state, 0), false);
  });
});
