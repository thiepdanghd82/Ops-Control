import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTierOptions, tierOptionLabel } from './CostSummaryBar.helpers.js';

// ── buildTierOptions ────────────────────────────────────────────────

test('buildTierOptions: a single-tier quote yields exactly the base tier', () => {
  assert.deepEqual(buildTierOptions({ moq: 1000 }), [{ idx: 0, moq: 1000 }]);
});

test('buildTierOptions: base tier first, then one per extra_moqs entry', () => {
  const st = { moq: 1000, extra_moqs: [{ moq: 5000 }, { moq: 10000 }] };
  assert.deepEqual(buildTierOptions(st), [
    { idx: 0, moq: 1000 },
    { idx: 1, moq: 5000 },
    { idx: 2, moq: 10000 },
  ]);
});

test('buildTierOptions: indices line up with active_moq_idx (0 = base)', () => {
  // The radios dispatch setActiveMoq(0) for base and setActiveMoq(i + 1)
  // for extra_moqs[i]; option.idx must be the value the dropdown sends.
  const opts = buildTierOptions({ moq: 1, extra_moqs: [{ moq: 2 }, { moq: 3 }] });
  assert.deepEqual(
    opts.map((o) => o.idx),
    [0, 1, 2]
  );
});

test('buildTierOptions: derives from extra_moqs, NEVER from num_moq', () => {
  // The whole point of the helper. A state claiming 5 tiers while holding
  // data for 2 must offer 2 — offering MOQ 3/4/5 would list tiers the RFQ
  // radio does not, and selecting one would show an empty tier.
  const st = { moq: 1000, num_moq: 5, extra_moqs: [{ moq: 5000 }] };
  assert.equal(buildTierOptions(st).length, 2);
});

test('buildTierOptions: legacy quote with no extra_moqs key still yields the base tier', () => {
  assert.deepEqual(buildTierOptions({ moq: 800 }), [{ idx: 0, moq: 800 }]);
});

test('buildTierOptions: extra_moqs of a non-array type is ignored, not thrown on', () => {
  assert.deepEqual(buildTierOptions({ moq: 800, extra_moqs: null }), [{ idx: 0, moq: 800 }]);
  assert.deepEqual(buildTierOptions({ moq: 800, extra_moqs: 'nope' }), [{ idx: 0, moq: 800 }]);
});

test('buildTierOptions: null / undefined state yields one tier instead of throwing', () => {
  assert.deepEqual(buildTierOptions(undefined), [{ idx: 0, moq: 0 }]);
  assert.deepEqual(buildTierOptions(null), [{ idx: 0, moq: 0 }]);
});

test('buildTierOptions: blank, zero, negative and garbage quantities read as 0', () => {
  const st = { moq: '', extra_moqs: [{ moq: 0 }, { moq: -5 }, { moq: 'abc' }, {}] };
  assert.deepEqual(
    buildTierOptions(st).map((o) => o.moq),
    [0, 0, 0, 0, 0]
  );
});

test('buildTierOptions: numeric strings are accepted (inputs hand back strings)', () => {
  const st = { moq: '1000', extra_moqs: [{ moq: '5000' }] };
  assert.deepEqual(
    buildTierOptions(st).map((o) => o.moq),
    [1000, 5000]
  );
});

// ── tierOptionLabel ─────────────────────────────────────────────────

test('tierOptionLabel: shows the quantity, thousand-separated', () => {
  assert.equal(tierOptionLabel({ idx: 0, moq: 1000 }), 'MOQ 1 · 1,000');
  assert.equal(tierOptionLabel({ idx: 2, moq: 250000 }), 'MOQ 3 · 250,000');
});

test('tierOptionLabel: numbers the tiers from 1, not from 0', () => {
  assert.equal(tierOptionLabel({ idx: 0, moq: 7 }), 'MOQ 1 · 7');
  assert.equal(tierOptionLabel({ idx: 1, moq: 7 }), 'MOQ 2 · 7');
});

test('tierOptionLabel: a tier with no quantity reads bare, never "MOQ 2 · —"', () => {
  // fmtInt(0) is an em-dash; appending it would make an empty tier look
  // broken rather than simply not filled in yet.
  assert.equal(tierOptionLabel({ idx: 1, moq: 0 }), 'MOQ 2');
  assert.equal(tierOptionLabel({ idx: 1, moq: '' }), 'MOQ 2');
});

test('tierOptionLabel: a malformed option still names a tier', () => {
  assert.equal(tierOptionLabel(undefined), 'MOQ 1');
  assert.equal(tierOptionLabel({}), 'MOQ 1');
});
