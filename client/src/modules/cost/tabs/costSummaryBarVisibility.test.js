/**
 * shouldShowSummaryBar — sub-tab ID contract pin.
 *
 * Sprint S-SUMBAR-HIDE / 2026-06-19. Catches the failure mode where a
 * future rename of a SUB_TABS id (e.g. Phase 3 extraction renames
 * 'breakdown' → 'cost-breakdown') would silently re-show the strip
 * on what Henry wanted hidden — same class of bug as B3e's
 * 'machine-technical' vs 'lib-machine-tech' tab id mismatch.
 *
 *   node --test src/modules/cost/tabs/costSummaryBarVisibility.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldShowSummaryBar,
  STD_SUMMARY_BAR_HIDE,
  CPX_SUMMARY_BAR_HIDE,
} from './costSummaryBarVisibility.js';

describe('Std visibility', () => {
  test('HIDES on exactly 4 analysis/reference tabs (Henry red-box set)', () => {
    assert.equal(shouldShowSummaryBar('breakdown', 'std'), false);
    assert.equal(shouldShowSummaryBar('balancing', 'std'), false);
    assert.equal(shouldShowSummaryBar('summarize', 'std'), false);
    assert.equal(shouldShowSummaryBar('legend', 'std'), false);
  });

  test('SHOWS on all 5 data-entry tabs (operator needs live margin feedback)', () => {
    assert.equal(shouldShowSummaryBar('header', 'std'), true);
    assert.equal(shouldShowSummaryBar('layout', 'std'), true);
    assert.equal(shouldShowSummaryBar('combined', 'std'), true);
    assert.equal(shouldShowSummaryBar('packing', 'std'), true);
    assert.equal(shouldShowSummaryBar('lead-time', 'std'), true);
  });

  test('STD_SUMMARY_BAR_HIDE size is exactly 4 (bump only when intentional)', () => {
    assert.equal(STD_SUMMARY_BAR_HIDE.size, 4);
  });
});

describe('Cpx visibility', () => {
  test('HIDES on exactly 2 analysis tabs (Breakdown + Summary)', () => {
    assert.equal(shouldShowSummaryBar('breakdown', 'cpx'), false);
    assert.equal(shouldShowSummaryBar('summary', 'cpx'), false);
  });

  test('SHOWS on all 5 data-entry tabs (project / calculators / bomtree / packing / lead-time)', () => {
    assert.equal(shouldShowSummaryBar('project', 'cpx'), true);
    assert.equal(shouldShowSummaryBar('calculators', 'cpx'), true);
    assert.equal(shouldShowSummaryBar('bomtree', 'cpx'), true);
    assert.equal(shouldShowSummaryBar('packing', 'cpx'), true);
    assert.equal(shouldShowSummaryBar('lead-time', 'cpx'), true);
  });

  test('CPX_SUMMARY_BAR_HIDE size is exactly 2', () => {
    assert.equal(CPX_SUMMARY_BAR_HIDE.size, 2);
  });
});

describe('Std vs Cpx — id naming asymmetry guard', () => {
  test("'summarize' (Std) → HIDE on Std, SHOW on Cpx (Cpx uses 'summary' singular)", () => {
    // The naming divergence between SUB_TABS in StandardCalc.jsx ('summarize')
    // vs ComplexCalc.jsx ('summary') is the trap this test pins. A single
    // shared Set would have silently failed to hide the Cpx Summary tab.
    assert.equal(shouldShowSummaryBar('summarize', 'std'), false);
    assert.equal(shouldShowSummaryBar('summarize', 'cpx'), true);
  });

  test("'summary' (Cpx) → HIDE on Cpx, SHOW on Std", () => {
    assert.equal(shouldShowSummaryBar('summary', 'cpx'), false);
    assert.equal(shouldShowSummaryBar('summary', 'std'), true);
  });

  test("'balancing' (Std-only) → HIDE on Std, SHOW on Cpx (Cpx has no Balancing tab)", () => {
    assert.equal(shouldShowSummaryBar('balancing', 'std'), false);
    assert.equal(shouldShowSummaryBar('balancing', 'cpx'), true);
  });

  test("'legend' (Std-only) → HIDE on Std, SHOW on Cpx (Cpx has no Legend tab)", () => {
    assert.equal(shouldShowSummaryBar('legend', 'std'), false);
    assert.equal(shouldShowSummaryBar('legend', 'cpx'), true);
  });
});

describe('Default-show fallback (unknown / undefined ids)', () => {
  test('unknown tab id → SHOW (safe fallback; future tabs default-on)', () => {
    assert.equal(shouldShowSummaryBar('some-future-tab', 'std'), true);
    assert.equal(shouldShowSummaryBar('some-future-tab', 'cpx'), true);
  });

  test('undefined activeSubTab → SHOW', () => {
    assert.equal(shouldShowSummaryBar(undefined, 'std'), true);
    assert.equal(shouldShowSummaryBar(undefined, 'cpx'), true);
  });

  test("kind defaults to Std when not 'cpx' (defensive)", () => {
    assert.equal(shouldShowSummaryBar('breakdown', undefined), false); // Std hides
    assert.equal(shouldShowSummaryBar('breakdown', 'unrecognized'), false);
  });
});
