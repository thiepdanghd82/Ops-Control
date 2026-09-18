import test from 'node:test';
import assert from 'node:assert/strict';
import { pinDrift, formatPinHint, PIN_TOLERANCE } from './MarginPriceCells.helpers.js';
import { readTierPin, planTierPinWrite } from '../../../services/priceSolver.js';

const PIN = { metric: 'contribution', pct: 0.3 };

// ── pinDrift ──
test('drift on the pinned metric is reported with its size and direction', () => {
  const d = pinDrift(PIN, 'contribution', 0.273);
  assert.ok(d);
  assert.equal(d.pinned, 0.3);
  assert.equal(d.actual, 0.273);
  assert.ok(d.delta < 0, 'negative delta = below the pin');
});

test('a different metric never drifts off this pin', () => {
  // The operator pinned Contr; GM moving is not a broken promise.
  assert.equal(pinDrift(PIN, 'gm', 0.05), null);
  assert.equal(pinDrift(PIN, 'va', 0.9), null);
});

test('nothing pinned → never drifts', () => {
  assert.equal(pinDrift(null, 'contribution', 0.1), null);
  assert.equal(pinDrift(undefined, 'contribution', 0.1), null);
});

test('a gap too small to SEE is not reported', () => {
  // Price rounds to 4 decimals, so the achieved % is never exactly the pin.
  // Both of these render as "30.0%" — flagging them would cry wolf.
  assert.equal(pinDrift(PIN, 'contribution', 0.3 + PIN_TOLERANCE / 2), null);
  assert.equal(pinDrift(PIN, 'contribution', 0.3 - PIN_TOLERANCE / 2), null);
  assert.equal(pinDrift(PIN, 'contribution', 0.3), null, 'exact match');
});

test('a gap just big enough to change the rendered digit IS reported', () => {
  assert.ok(pinDrift(PIN, 'contribution', 0.3 + PIN_TOLERANCE * 3));
  assert.ok(pinDrift(PIN, 'contribution', 0.3 - PIN_TOLERANCE * 3));
});

test('uncomputable live value → no drift, no throw', () => {
  for (const v of [null, undefined, NaN, Infinity, '30']) {
    assert.equal(pinDrift(PIN, 'contribution', v), null);
  }
});

// ── formatPinHint ──
test('hint names the live value, the gap, the direction and the fix', () => {
  const h = formatPinHint(pinDrift(PIN, 'contribution', 0.273), 0.9912);
  assert.match(h, /27\.3%/);
  assert.match(h, /2\.7%/);
  assert.match(h, /below/);
  assert.match(h, /30\.0%/);
  assert.match(h, /\$0\.9912/);
});

test('hint still helps when no price can be suggested', () => {
  const h = formatPinHint(pinDrift(PIN, 'contribution', 0.35), null);
  assert.match(h, /above/);
  assert.doesNotMatch(h, /\$/, 'no dollar figure invented when there is none');
});

test('no drift → empty hint', () => {
  assert.equal(formatPinHint(null, 1), '');
});

// ── readTierPin ──
test('reads the base tier off the state root, extra tiers off extra_moqs', () => {
  const st = {
    pin_metric: 'gm',
    pin_pct: 0.25,
    extra_moqs: [{ pin_metric: 'contribution', pin_pct: 0.3 }],
  };
  assert.deepEqual(readTierPin(st, 0), { metric: 'gm', pct: 0.25 });
  assert.deepEqual(readTierPin(st, 1), { metric: 'contribution', pct: 0.3 });
});

test('unpinned / legacy quote reads as null rather than throwing', () => {
  assert.equal(readTierPin({}, 0), null);
  assert.equal(readTierPin({}, 3), null, 'tier that does not exist');
  assert.equal(readTierPin(null, 0), null);
  assert.equal(readTierPin({ extra_moqs: [] }, 1), null);
});

test('a half-written pin is treated as no pin', () => {
  // Either half missing means we cannot say what was promised.
  assert.equal(readTierPin({ pin_metric: 'gm' }, 0), null, 'metric without pct');
  assert.equal(readTierPin({ pin_pct: 0.3 }, 0), null, 'pct without metric');
  assert.equal(readTierPin({ pin_metric: 'gm', pin_pct: 'abc' }, 0), null);
});

test('an unknown metric name is refused', () => {
  // Guards against a stale field from some future rename silently driving the UI.
  assert.equal(readTierPin({ pin_metric: 'ebitda', pin_pct: 0.3 }, 0), null);
});

// ── planTierPinWrite ──
test('base tier writes through SET_STD_FIELD, extra tier through SET_EXTRA_MOQ', () => {
  const a = planTierPinWrite({ kind: 'std', tierIdx: 0, metric: 'gm', pct: 0.25 });
  assert.deepEqual(a, [
    { type: 'SET_STD_FIELD', payload: { field: 'pin_metric', value: 'gm' } },
    { type: 'SET_STD_FIELD', payload: { field: 'pin_pct', value: 0.25 } },
  ]);
  const b = planTierPinWrite({ kind: 'std', tierIdx: 2, metric: 'va', pct: 0.3 });
  assert.equal(b[0].type, 'SET_EXTRA_MOQ');
  assert.equal(b[0].payload.idx, 1, 'tier 2 is extra_moqs[1]');
});

test('Complex routes to its OWN slice actions', () => {
  // MES-3-FIX-53: writing Cpx tiers through the Std action silently lands in
  // stdState and is lost on save. The two must never share an action name.
  assert.equal(
    planTierPinWrite({ kind: 'cpx', tierIdx: 0, metric: 'gm', pct: 0.25 })[0].type,
    'SET_CPLX_FIELD'
  );
  assert.equal(
    planTierPinWrite({ kind: 'cpx', tierIdx: 1, metric: 'gm', pct: 0.25 })[0].type,
    'SET_CPLX_EXTRA_MOQ'
  );
});

test('clearing a pin nulls BOTH halves', () => {
  const a = planTierPinWrite({ kind: 'std', tierIdx: 0, metric: null });
  assert.deepEqual(
    a.map((x) => x.payload.value),
    [null, null]
  );
});

test('a nonsense target writes nothing at all', () => {
  assert.deepEqual(planTierPinWrite({ kind: 'std', tierIdx: 0, metric: 'gm', pct: NaN }), []);
  assert.deepEqual(planTierPinWrite({ kind: 'std', tierIdx: 0, metric: 'gm', pct: 'x' }), []);
});
