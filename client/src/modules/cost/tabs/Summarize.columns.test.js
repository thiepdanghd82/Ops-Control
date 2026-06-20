/**
 * Summarize column-config regression guard.
 *
 * Mirrors the QuoteHistory.columns.test.js pattern so column-add /
 * -reorder / required-flag changes can't drift silently — Phase A
 * audit (A3-03) flagged that Summarize had no fixture test, so the
 * DATE column (#164) + any future column add would go uncaught.
 *
 * Sprint B3b / A3-03 (2026-06-19).
 *
 *   node --test src/modules/cost/tabs/Summarize.columns.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUMMARIZE_COLUMN_KEYS,
  SUMMARIZE_REQUIRED_KEYS,
  SUMMARIZE_DEFAULT_HIDDEN_KEYS,
  CSV_ALWAYS_INCLUDE_KEYS,
  SUMMARIZE_COLUMNS_STORAGE_KEY,
} from './Summarize.columns.js';

describe('SUMMARIZE_COLUMN_KEYS', () => {
  test('contains 37 keys in source order — REGRESSION GUARD for table shape', () => {
    // Header row in Summarize.jsx renders this exact set in this exact
    // order. Drift here means the ColumnsToggle popover ↔ table-render
    // contract broke; bump this number only when intentionally
    // adding/removing a column.
    //
    // History:
    //   - S-D20-SUMMARIZE-SCHEMA-EXTEND baseline 32 cols
    //   - S-SALE-OWNER-COL (2026-06-16) +1 → 33
    //   - existing snapshot_status + 2 tooling cols brought us to 35
    //   - S-SUMMARIZE-DATE-COL #164 (2026-06-18) +1 update_date → 36
    //   - S-SUMMARIZE-EAU-COL (2026-06-19) +1 annual_qty → 37
    assert.equal(SUMMARIZE_COLUMN_KEYS.length, 37);
  });

  test('no duplicate keys', () => {
    assert.equal(new Set(SUMMARIZE_COLUMN_KEYS).size, SUMMARIZE_COLUMN_KEYS.length);
  });

  test('every required key appears in the order list', () => {
    for (const k of SUMMARIZE_REQUIRED_KEYS) {
      assert.ok(SUMMARIZE_COLUMN_KEYS.includes(k), `required key "${k}" missing from order list`);
    }
  });

  test('every default-hidden key appears in the order list', () => {
    for (const k of SUMMARIZE_DEFAULT_HIDDEN_KEYS) {
      assert.ok(
        SUMMARIZE_COLUMN_KEYS.includes(k),
        `default-hidden key "${k}" missing from order list`
      );
    }
  });

  test('required ∩ defaultHidden is empty — required cols must never be hidden by default', () => {
    for (const k of SUMMARIZE_DEFAULT_HIDDEN_KEYS) {
      assert.equal(
        SUMMARIZE_REQUIRED_KEYS.has(k),
        false,
        `key "${k}" cannot be both required and default-hidden`
      );
    }
  });

  test('anchor identity triad row_idx → update_date → rfq_no leads the list', () => {
    // Sprint S-SUMMARIZE-DATE-COL (#164, 2026-06-18) placed DATE
    // ahead of RFQ NO so the operator scan reads "when → what" left-
    // to-right, mirroring the QuoteHistory sidebar header order.
    assert.deepEqual(
      SUMMARIZE_COLUMN_KEYS.slice(0, 3),
      ['row_idx', 'update_date', 'rfq_no'],
      'DATE must sit between # and RFQ NO'
    );
  });

  test('row_idx + update_date + rfq_no are all required (anchor identity contract)', () => {
    for (const k of ['row_idx', 'update_date', 'rfq_no']) {
      assert.ok(SUMMARIZE_REQUIRED_KEYS.has(k), `anchor key "${k}" must be required`);
    }
  });
});

describe('SUMMARIZE_DEFAULT_HIDDEN_KEYS', () => {
  test('contains the 6 Lead Time / Notice text-heavy columns + snapshot', () => {
    // Phase 4 (S-D20-PRICING-SNAPSHOT) added 'snapshot_status'; the 6
    // L/T columns predate this and are hidden because operators write
    // multi-line essays into the source textareas — wide and rarely
    // referenced day-to-day. CSV export respects visibility.
    assert.deepEqual(SUMMARIZE_DEFAULT_HIDDEN_KEYS, [
      'material_lt',
      'sample_lt',
      'po_lt',
      'remark',
      'process',
      'type_of_material',
      'snapshot_status',
    ]);
  });
});

describe('CSV_ALWAYS_INCLUDE_KEYS', () => {
  test('forensic audit prefix is exactly 5 keys in this order', () => {
    // Operator workflows (Quote History cross-ref, multi-tier MOQ diff,
    // timestamp forensic) rely on these being unconditional. Adding to
    // this list bypasses the ColumnsToggle "hide" behavior — should
    // only happen for new audit-class fields, not display preferences.
    assert.deepEqual(CSV_ALWAYS_INCLUDE_KEYS, [
      'quote_id',
      'tier',
      'update_date',
      'type',
      'sale_owner',
    ]);
  });

  test("'update_date' lands in BOTH CSV_ALWAYS_INCLUDE_KEYS and SUMMARIZE_COLUMN_KEYS", () => {
    // Sprint S-SUMMARIZE-DATE-COL #164 expectation: the CSV builder
    // dedupes via a `seen` Set so the prefix slot wins (raw ISO value)
    // and the header label flips to the friendly 'DATE' via
    // colByKey.get(k).label lookup. If only one of the two lists has
    // 'update_date' the dedup / label-relabel contract breaks.
    assert.ok(CSV_ALWAYS_INCLUDE_KEYS.includes('update_date'));
    assert.ok(SUMMARIZE_COLUMN_KEYS.includes('update_date'));
  });

  test("'sale_owner' lands in BOTH CSV_ALWAYS_INCLUDE_KEYS and SUMMARIZE_COLUMN_KEYS", () => {
    // Sprint S-SALE-OWNER-COL same contract — friendly header relabel.
    assert.ok(CSV_ALWAYS_INCLUDE_KEYS.includes('sale_owner'));
    assert.ok(SUMMARIZE_COLUMN_KEYS.includes('sale_owner'));
  });
});

describe('SUMMARIZE_COLUMNS_STORAGE_KEY', () => {
  test('localStorage key is stable across releases (column-toggle persistence)', () => {
    // Operators have ColumnsToggle hidden-keys saved against this string.
    // Renaming silently wipes everyone's preferences on next reload.
    assert.equal(SUMMARIZE_COLUMNS_STORAGE_KEY, 'ops-cost-summarize-cols');
  });
});
