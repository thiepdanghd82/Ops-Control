/**
 * navLabels — no two navigation items may read the same in a locale.
 *   cd client && node --test src/i18n/navLabels.test.js
 *
 * Found 2026-09-10 while walking the running app: the sidebar showed
 * "RFQ Tracking" under Quoting & Pricing and "RFQ Tracker" under Tracking.
 * In English those are the same words, and the Home quick action says
 * "RFQ Tracker", so nothing told the operator which screen it opened.
 *
 * Vietnamese was already unambiguous — Danh sách RFQ vs Theo dõi RFQ — so
 * this was an English-only defect, and the fix was to make the English
 * mirror the Vietnamese rather than to invent new wording.
 *
 * NOTE ON WHAT THIS FILE DOES AND DOES NOT DO. These tests passed BEFORE
 * the rename: "RFQ Tracking" and "RFQ Tracker" are not identical strings,
 * only confusingly similar, and no honest automated check defines
 * "confusingly similar" without an arbitrary threshold. The rename itself
 * was a wording judgement, not a test-driven change.
 *
 * What these tests do earn their place for is the failure mode one step
 * worse — two nav items rendering the exact same text, which is a real and
 * easy mistake when a screen is added or a label edited. That the guard was
 * absent is why nobody noticed the pair drifting this close together.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, SUPPORTED_LOCALES } from './strings.js';

test('no two nav tab labels are identical within a locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const seen = new Map();
    for (const [key, val] of Object.entries(STRINGS)) {
      if (!key.startsWith('nav.tab.')) continue;
      const label = val[locale];
      assert.ok(label, `${key} is missing a ${locale} label`);
      const clash = seen.get(label);
      assert.equal(
        clash,
        undefined,
        `${locale}: "${label}" is used by both ${clash} and ${key} — the operator cannot tell them apart`
      );
      seen.set(label, key);
    }
  }
});

test('the two RFQ screens are distinguishable in every locale', () => {
  const tracking = STRINGS['nav.tab.rfq_tracking'];
  const tracker = STRINGS['nav.tab.rfq_tracker'];

  for (const locale of SUPPORTED_LOCALES) {
    assert.notEqual(
      tracking[locale],
      tracker[locale],
      `${locale}: the RFQ list and the RFQ progress screen read the same`
    );
  }
});
