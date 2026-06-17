import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUOTE_HISTORY_COLUMN_KEYS,
  QUOTE_HISTORY_REQUIRED_KEYS,
  QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS,
  QUOTE_HISTORY_SORT_FNS,
  STATUS_ORDER,
  resolveSortKey,
} from './QuoteHistory.columns.js';

describe('QUOTE_HISTORY_COLUMN_KEYS', () => {
  test('contains 27 keys in source order — REGRESSION GUARD for table shape', () => {
    // Header row in QuoteHistory.jsx renders this exact set in this exact
    // order. Drift here means the ColumnsToggle popover ↔ table-render
    // contract broke; bump this number only when intentionally
    // adding/removing a column.
    // Sprint S-SALE-OWNER-COL (2026-06-16) bumped 26 → 27 by adding 'sale'.
    assert.equal(QUOTE_HISTORY_COLUMN_KEYS.length, 27);
  });

  test('no duplicate keys', () => {
    assert.equal(new Set(QUOTE_HISTORY_COLUMN_KEYS).size, QUOTE_HISTORY_COLUMN_KEYS.length);
  });

  test('every required key appears in the order list', () => {
    for (const k of QUOTE_HISTORY_REQUIRED_KEYS) {
      assert.ok(
        QUOTE_HISTORY_COLUMN_KEYS.includes(k),
        `required key "${k}" missing from order list`
      );
    }
  });

  test('every default-hidden key appears in the order list', () => {
    for (const k of QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS) {
      assert.ok(
        QUOTE_HISTORY_COLUMN_KEYS.includes(k),
        `default-hidden key "${k}" missing from order list`
      );
    }
  });

  test('required ∩ defaultHidden is empty — required cols must never be hidden by default', () => {
    for (const k of QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS) {
      assert.equal(
        QUOTE_HISTORY_REQUIRED_KEYS.has(k),
        false,
        `key "${k}" cannot be both required and default-hidden`
      );
    }
  });
});

describe('QUOTE_HISTORY_SORT_FNS — basic shape', () => {
  test('matches the sortable columns from the header', () => {
    // SortTh wired in QuoteHistory.jsx for these column keys. Mismatch
    // here means a SortTh column has no sortFn → click does nothing.
    // Sprint S-OPTIONS-COL bumped by adding 'option'; Sprint
    // S-SALE-OWNER-COL (2026-06-16) added 'sale'.
    const expected = new Set([
      'date',
      'rfq',
      'option',
      'owner',
      'sale',
      'direct_cu',
      'end_cu',
      'project',
      'ifs',
      'dcu_pn',
      'moq',
      'sell',
      'price_vnd',
      'va',
      'contr',
      'gm',
      'status',
    ]);
    const actual = new Set(Object.keys(QUOTE_HISTORY_SORT_FNS));
    assert.deepEqual(actual, expected);
  });

  test('every sortFn is a function', () => {
    for (const [k, fn] of Object.entries(QUOTE_HISTORY_SORT_FNS)) {
      assert.equal(typeof fn, 'function', `sortFn for "${k}" is not a function`);
    }
  });

  test('every sortFn tolerates empty quote without throwing', () => {
    for (const [k, fn] of Object.entries(QUOTE_HISTORY_SORT_FNS)) {
      assert.doesNotThrow(() => fn({}), `sortFn "${k}" threw on empty quote`);
    }
  });
});

describe('QUOTE_HISTORY_SORT_FNS — text columns', () => {
  test('rfq returns lowercase rfq_number', () => {
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.rfq({ state: { rfq_number: 'RFQ-2026-S0007' } }),
      'rfq-2026-s0007'
    );
  });

  test('rfq returns "" when missing', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.rfq({}), '');
    assert.equal(QUOTE_HISTORY_SORT_FNS.rfq({ state: {} }), '');
  });

  test('owner falls back state.npi_owner → q.npi_owner (S-PROJFIX guard)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.owner({ state: { npi_owner: 'Henry' } }), 'henry');
    assert.equal(QUOTE_HISTORY_SORT_FNS.owner({ state: {}, npi_owner: 'Top-Level' }), 'top-level');
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.owner({ state: { npi_owner: '' }, npi_owner: 'Fallback' }),
      'fallback'
    );
  });

  test('sale reads state.sale_owner (Sprint S-SALE-OWNER-COL)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.sale({ state: { sale_owner: 'Lien' } }), 'lien');
    assert.equal(QUOTE_HISTORY_SORT_FNS.sale({ state: {} }), '');
    assert.equal(QUOTE_HISTORY_SORT_FNS.sale({}), '');
  });

  test('end_cu falls back state.end_cu → state.project (Lesson 21 aliasMap)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.end_cu({ state: { end_cu: 'Complex-CU' } }), 'complex-cu');
    // Standard quote: end_cu empty, project holds the End Customer text
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.end_cu({ state: { end_cu: '', project: 'Standard-EndCU' } }),
      'standard-endcu'
    );
  });

  test('project reads state.project_name (canonical), NOT state.project', () => {
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.project({
        state: { project_name: 'MyProject', project: 'IGNORE-ME' },
      }),
      'myproject'
    );
  });

  test('ifs reads state.ccl_pn', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.ifs({ state: { ccl_pn: '12345' } }), '12345');
  });

  test('dcu_pn reads state.direct_cu_pn', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.dcu_pn({ state: { direct_cu_pn: 'PN-789' } }), 'pn-789');
  });

  test('option reads state.options lowercased (Sprint S-OPTIONS-COL)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.option({ state: { options: 'UL + RoHS' } }), 'ul + rohs');
    assert.equal(QUOTE_HISTORY_SORT_FNS.option({}), '');
    assert.equal(QUOTE_HISTORY_SORT_FNS.option({ state: {} }), '');
  });
});

describe('QUOTE_HISTORY_SORT_FNS — numeric columns', () => {
  test('moq coerces string → number', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.moq({ state: { moq: '1500' } }), 1500);
    assert.equal(QUOTE_HISTORY_SORT_FNS.moq({ state: { moq: 'not-a-number' } }), 0);
  });

  test('sell coerces selling_price', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.sell({ state: { selling_price: 0.12 } }), 0.12);
  });

  test('gm reads result.gm', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.gm({ result: { gm: 0.18 } }), 0.18);
    assert.equal(QUOTE_HISTORY_SORT_FNS.gm({}), 0);
  });

  test('va reads result.va', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.va({ result: { va: 0.22 } }), 0.22);
  });
});

describe('QUOTE_HISTORY_SORT_FNS — composite columns', () => {
  test('price_vnd reads selling_price_vnd when present', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.price_vnd({ state: { selling_price_vnd: 25000 } }), 25000);
  });

  test('price_vnd derives USD × usd_rate fallback (Sprint 1.7g)', () => {
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.price_vnd({ state: { selling_price: 1, usd_rate: 24500 } }),
      24500
    );
  });

  test('price_vnd returns 0 when both paths missing', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.price_vnd({ state: {} }), 0);
    assert.equal(QUOTE_HISTORY_SORT_FNS.price_vnd({ state: { selling_price: 1 } }), 0);
  });

  test('contr prefers result.contribution (fraction) over result.contr_pct (%)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.contr({ result: { contribution: 0.18 } }), 0.18);
  });

  test('contr coerces legacy result.contr_pct (already-multiplied %) back to fraction', () => {
    // Legacy bundle stored contr_pct = 18 to mean 18%. Sort comparison
    // must treat it as 0.18 so it aligns with the new contribution shape.
    assert.equal(QUOTE_HISTORY_SORT_FNS.contr({ result: { contr_pct: 18 } }), 0.18);
  });

  test('status maps approval workflow state to ordinal — REGRESSION GUARD on STATUS_ORDER (V2)', () => {
    // Sprint S-QUOTE-PROGRESS-V2 — new state model. Legacy 'approved'
    // status heal-on-reads to 'price_approved' via getApprovalStatus,
    // so this test exercises both fresh + legacy quote records.
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'draft' } } }),
      STATUS_ORDER.draft
    );
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'quote_to_sale' } } }),
      STATUS_ORDER.quote_to_sale
    );
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'price_approved' } } }),
      STATUS_ORDER.price_approved
    );
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'cancelled' } } }),
      STATUS_ORDER.cancelled
    );
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'rejected' } } }),
      STATUS_ORDER.rejected
    );
    // Heal-on-read for legacy quote records.
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'approved' } } }),
      STATUS_ORDER.price_approved
    );
    assert.equal(
      QUOTE_HISTORY_SORT_FNS.status({ state: { approval: { status: 'pending_sales' } } }),
      STATUS_ORDER.quote_to_sale
    );
  });

  test('status defaults to draft ordinal when approval missing (getStatus fallback)', () => {
    assert.equal(QUOTE_HISTORY_SORT_FNS.status({}), STATUS_ORDER.draft);
    assert.equal(QUOTE_HISTORY_SORT_FNS.status({ state: {} }), STATUS_ORDER.draft);
  });
});

describe('resolveSortKey', () => {
  test('returns the same key when valid + visible', () => {
    assert.equal(resolveSortKey('moq', new Set(['date', 'rfq', 'moq'])), 'moq');
  });

  test('falls back to "date" when sortKey is hidden', () => {
    assert.equal(resolveSortKey('moq', new Set(['date', 'rfq'])), 'date');
  });

  test('falls back to "date" when sortKey is not a real column', () => {
    assert.equal(resolveSortKey('does_not_exist', new Set(['date', 'rfq'])), 'date');
  });

  test('rewrites legacy "npi" → "owner" (column renamed in Phase 2)', () => {
    assert.equal(resolveSortKey('npi', new Set(['date', 'owner'])), 'owner');
  });

  test('rewrites legacy "ver" → "option" (column repurposed in Sprint S-OPTIONS-COL)', () => {
    assert.equal(resolveSortKey('ver', new Set(['date', 'option'])), 'option');
    // Hidden after rewrite still falls back to "date".
    assert.equal(resolveSortKey('ver', new Set(['date', 'rfq'])), 'date');
  });

  test('rewritten "owner" still falls back when hidden', () => {
    assert.equal(resolveSortKey('npi', new Set(['date', 'rfq'])), 'date');
  });

  test('falls back to "date" when sortKey is empty/null', () => {
    assert.equal(resolveSortKey('', new Set(['date'])), 'date');
    assert.equal(resolveSortKey(null, new Set(['date'])), 'date');
    assert.equal(resolveSortKey(undefined, new Set(['date'])), 'date');
  });

  test('accepts plain array for visibleKeys (not just Set)', () => {
    assert.equal(resolveSortKey('rfq', ['date', 'rfq']), 'rfq');
    assert.equal(resolveSortKey('rfq', ['date']), 'date');
  });

  test('with empty visibleKeys, only validates against SORT_FNS membership', () => {
    // Empty visible-set means we haven't loaded the toggle yet; accept
    // any real sort key so the initial render doesn't snap to 'date'
    // before useState hydrates.
    assert.equal(resolveSortKey('moq', []), 'moq');
    assert.equal(resolveSortKey('moq', new Set()), 'moq');
  });
});

describe('QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS (Phase 2 Q7 option C)', () => {
  test('hides exactly 5 cols → 22 visible by default', () => {
    // Sprint S-SALE-OWNER-COL (2026-06-16) bumped column total 26 → 27,
    // so visible-by-default went 21 → 22 (5 default-hidden unchanged).
    assert.equal(QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS.length, 5);
    assert.equal(QUOTE_HISTORY_COLUMN_KEYS.length - QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS.length, 22);
  });

  test('Option C list', () => {
    assert.deepEqual(
      new Set(QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS),
      new Set(['ul', 'ifs', 'dcu_pn', 'ecu_pn', 'target'])
    );
  });
});
