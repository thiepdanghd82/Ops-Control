import test from 'node:test';
import assert from 'node:assert/strict';
import { getCovOvrState, getCovOvrTooltip, EMPTY_PLACEHOLDER } from './covOvrState.js';

function makeLookup(entries) {
  const m = new Map();
  for (const [k, v] of entries) m.set(k, v);
  return m;
}

const COV = makeLookup([
  ['SS', 30],
  ['SS (Glue)', 300],
  ['Flexo', 300],
  ['Indigo', 400],
  ['Indigo(Primer)', 400],
  ['Indigo(Spot)', 176],
  ['Indigo(oil)', 400],
]);

test('Auto state — print_type Indigo, no override, returns 400 placeholder', () => {
  const r = getCovOvrState({
    override: null,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: false, // pretend non-Indigo to isolate auto-branch (Indigo state covered below)
  });
  assert.equal(r.state, 'auto');
  assert.equal(r.autoValue, 400);
  assert.equal(r.displayPlaceholder, '400');
  assert.equal(r.showReset, false);
});

test('Auto state — Indigo(Spot) lookup returns 176', () => {
  const r = getCovOvrState({
    override: null,
    printType: 'Indigo(Spot)',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'auto');
  assert.equal(r.autoValue, 176);
  assert.equal(r.displayPlaceholder, '176');
});

test('Indigo subtype state — disabled, no placeholder', () => {
  const r = getCovOvrState({
    override: null,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: true,
  });
  assert.equal(r.state, 'indigo');
  assert.equal(r.displayPlaceholder, '');
  assert.equal(r.showReset, false);
});

test('Manual state — override = 250, showReset true', () => {
  const r = getCovOvrState({
    override: 250,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'manual');
  assert.equal(r.showReset, true);
  assert.equal(r.displayPlaceholder, ''); // value field wins
  assert.equal(r.autoValue, 400); // exposed for tooltip "auto would be N"
});

test('Manual state holds when print_type changes (regression case)', () => {
  // user had override=250 on Indigo, then switched to LP (no coverage)
  const r = getCovOvrState({
    override: 250,
    printType: 'LP',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'manual');
  assert.equal(r.showReset, true);
  assert.equal(r.autoValue, null); // LP not in table
});

test('Manual state holds when print_type changes from Indigo → SS', () => {
  const r = getCovOvrState({
    override: 250,
    printType: 'SS',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'manual');
  assert.equal(r.autoValue, 30);
});

test('Empty state — LP (not in coverage table) + no override', () => {
  const r = getCovOvrState({
    override: null,
    printType: 'LP',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'empty');
  assert.equal(r.displayPlaceholder, EMPTY_PLACEHOLDER);
  assert.equal(r.showReset, false);
});

test('Empty state — undefined print_type', () => {
  const r = getCovOvrState({
    override: null,
    printType: '',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'empty');
  assert.equal(r.displayPlaceholder, EMPTY_PLACEHOLDER);
});

test('Auto re-lookup when Coverage Table updates (no override)', () => {
  // simulate admin changing Indigo from 400 → 450 by passing new lookup
  const updated = makeLookup([['Indigo', 450]]);
  const r = getCovOvrState({
    override: null,
    printType: 'Indigo',
    covLookup: updated,
    isIndigo: false,
  });
  assert.equal(r.state, 'auto');
  assert.equal(r.autoValue, 450);
});

test('Manual unaffected by Coverage Table change', () => {
  const updated = makeLookup([['Indigo', 450]]);
  const r = getCovOvrState({
    override: 250,
    printType: 'Indigo',
    covLookup: updated,
    isIndigo: false,
  });
  assert.equal(r.state, 'manual');
  assert.equal(r.autoValue, 450); // tooltip surfaces the new auto for context
});

test('Override = 0 treated as no-override (not manual)', () => {
  // 0 is the DecimalInput "cleared on blur" sentinel — must fall back to auto
  const r = getCovOvrState({
    override: 0,
    printType: 'SS',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'auto');
  assert.equal(r.autoValue, 30);
});

test('Override negative coerced to no-override', () => {
  const r = getCovOvrState({
    override: -5,
    printType: 'Flexo',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'auto');
});

test('Override NaN coerced to no-override', () => {
  const r = getCovOvrState({
    override: NaN,
    printType: 'Flexo',
    covLookup: COV,
    isIndigo: false,
  });
  assert.equal(r.state, 'auto');
});

test('getCovOvrTooltip — auto state surfaces value', () => {
  const cov = getCovOvrState({
    override: null,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: false,
  });
  const tip = getCovOvrTooltip(cov);
  assert.match(tip, /Auto-synced.*400/);
});

test('getCovOvrTooltip — manual state mentions reset', () => {
  const cov = getCovOvrState({
    override: 250,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: false,
  });
  const tip = getCovOvrTooltip(cov);
  assert.match(tip, /Manual override/);
  assert.match(tip, /reset/i);
});

test('getCovOvrTooltip — indigo state explains click-charges', () => {
  const cov = getCovOvrState({
    override: null,
    printType: 'Indigo',
    covLookup: COV,
    isIndigo: true,
  });
  assert.match(getCovOvrTooltip(cov), /click-charges/);
});

test('getCovOvrTooltip — empty state prompts manual entry', () => {
  const cov = getCovOvrState({
    override: null,
    printType: 'LP',
    covLookup: COV,
    isIndigo: false,
  });
  assert.match(getCovOvrTooltip(cov), /No Coverage Table entry/);
});

test('Missing covLookup handled gracefully (defensive)', () => {
  const r = getCovOvrState({
    override: null,
    printType: 'SS',
    covLookup: null,
    isIndigo: false,
  });
  assert.equal(r.state, 'empty');
});
