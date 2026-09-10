/**
 * windowLogic — which tabs open maximized.
 *   cd client && node --test src/window/windowLogic.test.js
 *
 * Measured 2026-09-10 at viewport 1440x900 with six windows open: every
 * window was 898px wide — 62% of the viewport — while the widest table
 * reported scrollWidth 3333px. The operator saw roughly a quarter of the
 * columns and scrolled sideways for the rest, with 38% of the screen
 * sitting empty behind the floating window.
 *
 * Calculators are deliberately excluded: comparing Standard against
 * Complex side by side is the reason the MDI shell exists at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { opensMaximized } from './windowLogic.js';

test('data-grid screens open maximized', () => {
  for (const id of [
    'quote-history',
    'rfq-tracking',
    'lib-inventory',
    'npi-parts-list',
    'rfq-tracker',
    'sample-tracking',
    'lib-mat',
    'approvals-inbox',
    'audit-log',
  ]) {
    assert.equal(opensMaximized(id), true, `${id} should open maximized`);
  }
});

test('calculators keep floating so they can be compared side by side', () => {
  for (const id of ['standard', 'complex', 'ink-calc', 'print-area']) {
    assert.equal(opensMaximized(id), false, `${id} should stay floating`);
  }
});

test('home is never maximized — it is the fixed base layer', () => {
  assert.equal(opensMaximized('home'), false);
});

test('an unknown tab id is not maximized', () => {
  assert.equal(opensMaximized('does-not-exist'), false);
  assert.equal(opensMaximized(undefined), false);
});
