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

test('the two pricing worksheets open maximized', () => {
  // They were floating on the theory that operators compare Standard against
  // Complex side by side. The operator who actually runs this app said no:
  // each is a dense multi-tab form that a 900px window cuts off, and in
  // practice you work one quote at a time. Trust the person doing the job.
  for (const id of ['standard', 'complex']) {
    assert.equal(opensMaximized(id), true, `${id} should open maximized`);
  }
});

test('the utility calculators stay floating', () => {
  // These are opened ALONGSIDE a quote being priced — an ink calculation or
  // a print-area check feeds a number back into the worksheet, so covering
  // the worksheet with them would defeat the point.
  for (const id of ['ink-calc', 'print-area', 'design-tools', 'messages']) {
    assert.equal(opensMaximized(id), false, `${id} should stay floating`);
  }
});

test('home is never maximized — it is the fixed base layer', () => {
  assert.equal(opensMaximized('home'), false);
});

test('every non-calculator screen opens maximized', () => {
  // The full sidebar, minus the calculators listed in the test above.
  for (const id of [
    'standard',
    'complex',
    'summarize',
    'formal-quote',
    'quote-history',
    'npi-parts-list',
    'rfq-tracking',
    'approvals-inbox',
    'lib-mfg',
    'lib-rop',
    'lib-inventory',
    'lib-mat',
    'rfq-tracker',
    'sample-tracking',
    'dashboard',
    'quote-analysis',
    'lib-rate',
    'lib-ddl',
    'lib-finance',
    'lib-machine-tech',
    'settings',
    'metrics',
    'audit-log',
    'help',
  ]) {
    assert.equal(opensMaximized(id), true, `${id} should open maximized`);
  }
});

test('a screen added later defaults to maximized, not floating', () => {
  // The rule is inverted on purpose: FLOATING_BY_DEFAULT is the short,
  // deliberate list. An allowlist of screens to maximize is what left 19 of
  // 28 tabs opening as 900px windows after the first pass — the next person
  // to add a data screen would have hit the same gap.
  assert.equal(opensMaximized('some-future-grid'), true);
});

test('no tab id at all is not maximized', () => {
  assert.equal(opensMaximized(undefined), false);
  assert.equal(opensMaximized(''), false);
});
