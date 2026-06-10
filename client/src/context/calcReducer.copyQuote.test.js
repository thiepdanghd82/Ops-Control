/**
 * Phase 3 LOAD_QUOTE action='copy' reducer tests.
 *
 * Verifies the bug fix: previously `_openQuoteInCalc(id, type, 'copy')`
 * set `pendingQuote.action = 'copy'` but the consuming useEffects in
 * StandardCalc / ComplexCalc only destructured `{ id }`, dropping the
 * action. Reducer never saw action → copy was treated as load →
 * subsequent save UPDATED the original record instead of creating a
 * new one. Operator's "copy and tweak" workflow silently overwrote
 * the source quote.
 *
 * Fix: useEffect reads pendingQuote.action, loadQuote() carries it,
 * reducer branches:
 *   - action === 'copy' → activeQuoteId reset (null), pricing_snapshot
 *     marked _synthesized so next save re-freezes against current lib.
 *   - action === 'load' or undefined → identity preserved (BC).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcReducer, CALC_ACTIONS as A } from './calcReducer.js';

// Minimal initial state — only the fields the reducer touches in the
// LOAD_QUOTE branch are required.
function initialState() {
  return {
    isDirty: false,
    activeQuoteId: 'previous-quote-id',
    activeQuoteVersion: 99,
    stdState: { _schema_version: 0 },
    cplxState: { _shape_version: 0 },
    pendingQuote: null,
  };
}

function persistedSnapshotFixture() {
  return {
    _captured_at: '2026-06-09T00:00:00.000Z',
    _captured_by: 'henry',
    _synthesized: false,
    _lib_version: null,
    _site: 'VN',
    materials: { 'MAT-A': { code: 'MAT-A', s_price: 5.0 } },
    coverage: [{ pt: 'Flexo', cov: 0.5 }],
    rates: { Slit: { workcenter: 'Slit', machine_rate: 11.92, labor_rate: 3.08 } },
  };
}

describe('LOAD_QUOTE — Std action="copy" branch', () => {
  test('resets activeQuoteId + activeQuoteVersion (forces save-as-new)', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: { _schema_version: 3, materials_main: [], materials_alt: [], materials_active: 'main' },
        id: 'q-copy-source',
        version: 5,
        action: 'copy',
      },
    });
    assert.equal(next.activeQuoteId, null, 'identity reset → next save creates a new record');
    assert.equal(next.activeQuoteVersion, 0);
  });

  test('marks pricing_snapshot._synthesized so next save re-freezes', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: {
          _schema_version: 3,
          materials_main: [],
          materials_alt: [],
          materials_active: 'main',
          pricing_snapshot: persistedSnapshotFixture(),
        },
        id: 'q-copy-source',
        version: 5,
        action: 'copy',
      },
    });
    // Snapshot's audit fields cleared; _synthesized flipped so the
    // next freezeLib call at save time creates a real snapshot.
    assert.equal(next.stdState.pricing_snapshot._synthesized, true);
    assert.equal(next.stdState.pricing_snapshot._captured_at, null);
    assert.equal(next.stdState.pricing_snapshot._captured_by, null);
    // But the materials / coverage / rates content is preserved so
    // the copy still calc-renders identically until next save.
    assert.equal(next.stdState.pricing_snapshot.materials['MAT-A'].s_price, 5.0);
    assert.equal(next.stdState.pricing_snapshot._site, 'VN');
  });

  test('clears isDirty so the copy starts on the unmodified baseline', () => {
    const next = calcReducer({ ...initialState(), isDirty: true }, {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: { _schema_version: 3, materials_main: [], materials_alt: [], materials_active: 'main' },
        id: 'q-copy',
        version: 5,
        action: 'copy',
      },
    });
    assert.equal(next.isDirty, false);
  });
});

describe('LOAD_QUOTE — Std action="load" (or omitted) preserves identity', () => {
  test('action="load" — activeQuoteId + version preserved (BC explicit)', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: { _schema_version: 3, materials_main: [], materials_alt: [], materials_active: 'main' },
        id: 'q-load-target',
        version: 7,
        action: 'load',
      },
    });
    assert.equal(next.activeQuoteId, 'q-load-target');
    assert.equal(next.activeQuoteVersion, 7);
  });

  test('action omitted — same as load (BC for pre-Phase-3 callers)', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: { _schema_version: 3, materials_main: [], materials_alt: [], materials_active: 'main' },
        id: 'q-bc-load',
        version: 3,
        // no action field
      },
    });
    assert.equal(next.activeQuoteId, 'q-bc-load');
    assert.equal(next.activeQuoteVersion, 3);
  });

  test('action="load" preserves pricing_snapshot untouched (no _synthesized flip)', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: {
          _schema_version: 3,
          materials_main: [],
          materials_alt: [],
          materials_active: 'main',
          pricing_snapshot: persistedSnapshotFixture(),
        },
        id: 'q-load',
        version: 1,
        action: 'load',
      },
    });
    assert.equal(next.stdState.pricing_snapshot._synthesized, false);
    assert.equal(next.stdState.pricing_snapshot._captured_at, '2026-06-09T00:00:00.000Z');
    assert.equal(next.stdState.pricing_snapshot._captured_by, 'henry');
  });
});

describe('LOAD_QUOTE — Cpx symmetric behavior', () => {
  test('action="copy" resets Cpx identity + flips snapshot _synthesized', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'cplx',
        state: {
          _shape_version: 4,
          subproducts: [],
          bom: [],
          tooling_alloc: [],
          pricing_snapshot: persistedSnapshotFixture(),
        },
        id: 'cpx-copy',
        version: 9,
        action: 'copy',
      },
    });
    assert.equal(next.activeQuoteId, null);
    assert.equal(next.activeQuoteVersion, 0);
    assert.equal(next.cplxState.pricing_snapshot._synthesized, true);
    assert.equal(next.cplxState.pricing_snapshot._captured_at, null);
    assert.equal(next.cplxState.pricing_snapshot._captured_by, null);
  });

  test('action="load" — Cpx identity preserved', () => {
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'cplx',
        state: { _shape_version: 4, subproducts: [], bom: [], tooling_alloc: [] },
        id: 'cpx-load',
        version: 4,
        action: 'load',
      },
    });
    assert.equal(next.activeQuoteId, 'cpx-load');
    assert.equal(next.activeQuoteVersion, 4);
  });
});

describe('LOAD_QUOTE — copy mode with synthesized snapshot (post-Phase-1 migration)', () => {
  test('Quote that was healed to empty snapshot still copies cleanly', () => {
    // Phase 1 migration heals legacy quotes to createEmptySnapshot() —
    // _captured_at=null, _synthesized=false. Copy mode should still
    // work: identity reset + snapshot._synthesized:true so next save
    // re-freezes.
    const healedSnapshot = {
      _captured_at: null,
      _captured_by: null,
      _synthesized: false,
      _lib_version: null,
      _site: null,
      materials: {},
      coverage: [],
      rates: {},
    };
    const next = calcReducer(initialState(), {
      type: A.LOAD_QUOTE,
      payload: {
        quoteType: 'std',
        state: {
          _schema_version: 3,
          materials_main: [],
          materials_alt: [],
          materials_active: 'main',
          pricing_snapshot: healedSnapshot,
        },
        id: 'healed-copy',
        version: 1,
        action: 'copy',
      },
    });
    assert.equal(next.activeQuoteId, null);
    assert.equal(next.stdState.pricing_snapshot._synthesized, true);
  });
});
