// @ts-check
/**
 * Pure-helper tests for the ExportModal logic layer.
 *
 * Runner: node --test src/modules/cost/tabs/QuoteHistory/exportModalLogic.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTierList,
  isSingleTier,
  resolveSelectedTiers,
  canSubmit,
  errorCodeToI18nKey,
} from './exportModalLogic.js';

// ─── buildTierList ──────────────────────────────────────────────────

test('buildTierList: quote with no extra_moqs → single tier (idx=0)', () => {
  const tiers = buildTierList({
    state: { moq: 500, annual_qty: 10000 },
  });
  assert.equal(tiers.length, 1);
  assert.deepEqual(tiers[0], { idx: 0, label: 'MOQ 1', moq: 500, eau: 10000 });
});

test('buildTierList: quote with 2 extra_moqs → 3 tiers, idx 0/1/2', () => {
  const tiers = buildTierList({
    state: {
      moq: 500,
      annual_qty: 10000,
      extra_moqs: [{ moq: 1000, eau: 12000 }, { moq: 5000 }],
    },
  });
  assert.equal(tiers.length, 3);
  assert.equal(tiers[0].label, 'MOQ 1');
  assert.equal(tiers[1].label, 'MOQ 2');
  assert.equal(tiers[2].label, 'MOQ 3');
  assert.equal(tiers[2].eau, 10000, 'extra tier without eau inherits base annual_qty');
});

test('buildTierList: null/undefined quote → empty list', () => {
  assert.deepEqual(buildTierList(null), [{ idx: 0, label: 'MOQ 1', moq: null, eau: null }]);
  assert.deepEqual(buildTierList(undefined), [{ idx: 0, label: 'MOQ 1', moq: null, eau: null }]);
});

// ─── isSingleTier ──────────────────────────────────────────────────

test('isSingleTier: true for 1-tier, false for 2+', () => {
  assert.equal(isSingleTier([{ idx: 0 }]), true);
  assert.equal(isSingleTier([{ idx: 0 }, { idx: 1 }]), false);
  assert.equal(isSingleTier([]), true);
});

// ─── resolveSelectedTiers ──────────────────────────────────────────

test('resolveSelectedTiers: allTiers=true → "all"', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.equal(resolveSelectedTiers({ allTiers: true, selected: {} }, tiers), 'all');
});

test('resolveSelectedTiers: individual subset → number[]', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.deepEqual(
    resolveSelectedTiers({ allTiers: false, selected: { 0: true, 2: true } }, tiers),
    [0, 2]
  );
});

test('resolveSelectedTiers: all individual checkboxes ticked collapses to "all"', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.equal(
    resolveSelectedTiers({ allTiers: false, selected: { 0: true, 1: true, 2: true } }, tiers),
    'all'
  );
});

// ─── canSubmit ─────────────────────────────────────────────────────

test('canSubmit: single-tier quote always passes', () => {
  assert.equal(canSubmit({ allTiers: false, selected: {} }, [{ idx: 0 }]), true);
});

test('canSubmit: multi-tier with no selection AND allTiers off → false', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.equal(canSubmit({ allTiers: false, selected: {} }, tiers), false);
});

test('canSubmit: multi-tier with allTiers=true → true', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.equal(canSubmit({ allTiers: true, selected: {} }, tiers), true);
});

test('canSubmit: multi-tier with at least one selected → true', () => {
  const tiers = buildTierList({ state: { extra_moqs: [{}, {}] } });
  assert.equal(canSubmit({ allTiers: false, selected: { 1: true } }, tiers), true);
});

// ─── errorCodeToI18nKey ────────────────────────────────────────────

test('errorCodeToI18nKey: known codes route to specific keys', () => {
  assert.equal(errorCodeToI18nKey('legacy_no_rows'), 'qexp.error.legacy_no_rows');
  assert.equal(errorCodeToI18nKey('no_snapshot'), 'qexp.error.no_snapshot');
  assert.equal(errorCodeToI18nKey('no-snapshot'), 'qexp.error.no_snapshot');
  assert.equal(errorCodeToI18nKey('permission_denied'), 'qexp.error.permission');
  assert.equal(errorCodeToI18nKey('NETWORK'), 'qexp.error.network');
});

test('errorCodeToI18nKey: unknown code falls back to generic', () => {
  assert.equal(errorCodeToI18nKey('http_500'), 'qexp.error.generic');
  assert.equal(errorCodeToI18nKey('bad_id'), 'qexp.error.generic');
});
