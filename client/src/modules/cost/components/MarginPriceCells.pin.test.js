import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pinDrift,
  formatPinHint,
  planAutoHold,
  actionablePinDrift,
  PIN_TOLERANCE,
} from './MarginPriceCells.helpers.js';
import {
  readTierPin,
  readPinMetric,
  planTierPinWrite,
  planPinMetricWrite,
} from '../../../services/priceSolver.js';

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

// ── readTierPin: metric is quote-level, value is per tier ──
test('the held METRIC comes from the quote, the VALUE from each tier', () => {
  // A header tick spans every column-row, so it cannot mean different
  // metrics on different tiers; the value it holds is per tier because each
  // tier has its own price and costs.
  const st = {
    pin_metric: 'contribution',
    pin_pct: 0.3,
    extra_moqs: [{ pin_pct: 0.26 }, { pin_pct: 0.22 }],
  };
  assert.deepEqual(readTierPin(st, 0), { metric: 'contribution', pct: 0.3 });
  assert.deepEqual(readTierPin(st, 1), { metric: 'contribution', pct: 0.26 });
  assert.deepEqual(readTierPin(st, 2), { metric: 'contribution', pct: 0.22 });
});

test('a stale per-tier metric from the old shape is ignored', () => {
  // The first cut stored a metric per tier. Only the quote-level one counts
  // now, so a leftover cannot quietly drive one row differently.
  const st = { pin_metric: 'gm', pin_pct: 0.25, extra_moqs: [{ pin_metric: 'va', pin_pct: 0.4 }] };
  assert.equal(readTierPin(st, 1).metric, 'gm');
});

test('no tick → nothing is held, whatever the tiers carry', () => {
  assert.equal(readTierPin({ pin_pct: 0.3, extra_moqs: [{ pin_pct: 0.3 }] }, 0), null);
  assert.equal(readPinMetric({}), null);
  assert.equal(readPinMetric(null), null);
});

test('ticked but a tier has no value yet → that tier holds nothing', () => {
  const st = { pin_metric: 'gm', extra_moqs: [{}] };
  assert.equal(readTierPin(st, 0), null);
  assert.equal(readTierPin(st, 1), null);
});

test('unknown metric name is refused', () => {
  assert.equal(readPinMetric({ pin_metric: 'ebitda' }), null);
  assert.equal(readTierPin({ pin_metric: 'ebitda', pin_pct: 0.3 }, 0), null);
});

test('legacy quote reads as nothing held rather than throwing', () => {
  assert.equal(readTierPin({}, 0), null);
  assert.equal(readTierPin({}, 3), null);
  assert.equal(readTierPin(null, 0), null);
});

// ── writes ──
test('the header tick writes one quote-level field', () => {
  assert.deepEqual(planPinMetricWrite({ kind: 'std', metric: 'contribution' }), [
    { type: 'SET_STD_FIELD', payload: { field: 'pin_metric', value: 'contribution' } },
  ]);
  assert.equal(planPinMetricWrite({ kind: 'cpx', metric: 'gm' })[0].type, 'SET_CPLX_FIELD');
});

test('unticking, and any junk metric, clears rather than stores', () => {
  for (const m of [null, undefined, '', 'ebitda']) {
    assert.equal(planPinMetricWrite({ kind: 'std', metric: m })[0].payload.value, null);
  }
});

test('the per-tier value routes base vs extra', () => {
  assert.deepEqual(planTierPinWrite({ kind: 'std', tierIdx: 0, pct: 0.3 }), [
    { type: 'SET_STD_FIELD', payload: { field: 'pin_pct', value: 0.3 } },
  ]);
  const b = planTierPinWrite({ kind: 'std', tierIdx: 2, pct: 0.26 });
  assert.equal(b[0].type, 'SET_EXTRA_MOQ');
  assert.equal(b[0].payload.idx, 1, 'tier 2 is extra_moqs[1]');
});

test('Complex routes to its OWN slice actions', () => {
  // MES-3-FIX-53: a Cpx write sent through the Std action lands in stdState
  // and is lost on save. The two must never share an action name.
  assert.equal(planTierPinWrite({ kind: 'cpx', tierIdx: 0, pct: 0.3 })[0].type, 'SET_CPLX_FIELD');
  assert.equal(
    planTierPinWrite({ kind: 'cpx', tierIdx: 1, pct: 0.3 })[0].type,
    'SET_CPLX_EXTRA_MOQ'
  );
});

test('clearing a tier value writes null; nonsense writes nothing', () => {
  assert.equal(planTierPinWrite({ kind: 'std', tierIdx: 0, pct: null })[0].payload.value, null);
  assert.deepEqual(planTierPinWrite({ kind: 'std', tierIdx: 0, pct: NaN }), []);
  assert.deepEqual(planTierPinWrite({ kind: 'std', tierIdx: 0, pct: 'x' }), []);
});

// ── planAutoHold: the guard that keeps the auto-write from spinning ──
test('no drift → write nothing', () => {
  assert.equal(planAutoHold(null, 0.99, 0.5), null);
});

test('drift with a new price → write it, rounded the way prices are stored', () => {
  const d = pinDrift(PIN, 'contribution', 0.273);
  assert.equal(planAutoHold(d, 0.991234567, 0.88), 0.9912);
});

test('a price already equal to the solved one is refused — this is the loop guard', () => {
  // The effect writes state it also reads, so it must have a stop condition.
  // The stop is "the tier already holds this price": writing it would change
  // nothing, so there is nothing to do and the next pass has no work either.
  const d = pinDrift(PIN, 'contribution', 0.273);
  assert.equal(planAutoHold(d, 0.9912, 0.9912), null);
  assert.equal(planAutoHold(d, 0.99123, 0.9912), null, 'equal after rounding');
  assert.equal(planAutoHold(d, 0.9913, 0.9912), 0.9913, 'a different price still writes');
});

test('a price the operator typed by hand is corrected, not refused', () => {
  // The reason this compares against the CURRENT price and not against the
  // last price the driver wrote: with a remembered-write guard, typing a
  // price of your own would be met with silence -- the metric would stay
  // wrong and nothing would say why.
  const d = pinDrift(PIN, 'contribution', 0.273);
  assert.equal(planAutoHold(d, 0.9912, 0.95), 0.9912);
});

test('a tier with no price yet still gets one', () => {
  const d = pinDrift(PIN, 'contribution', 0.273);
  for (const empty of [0, null, undefined, NaN, '']) {
    assert.equal(planAutoHold(d, 0.9912, empty), 0.9912);
  }
});

test('an unsolvable target writes nothing rather than a junk price', () => {
  const d = pinDrift(PIN, 'contribution', 0.273);
  for (const v of [null, undefined, NaN, Infinity, 0, -1]) {
    assert.equal(planAutoHold(d, v, 0.88), null);
  }
});

// ── actionablePinDrift: the cue only fires when it has a remedy ───────

const GM_PIN = { metric: 'gm', pct: 0.2 };

test('no pin, or on target: nothing to show', () => {
  assert.equal(actionablePinDrift(null, 'gm', 0.2007, 0.029775, 0.0298), null);
  assert.equal(actionablePinDrift(GM_PIN, 'gm', 0.2, 0.03, 0.0298), null);
  assert.equal(
    actionablePinDrift(GM_PIN, 'va', 0.9, 0.05, 0.0298),
    null,
    'a pin on another metric says nothing about this cell'
  );
});

test('drifted AND a different price would help: the cue fires', () => {
  const d = actionablePinDrift(GM_PIN, 'gm', 0.24, 0.0312, 0.0298);
  assert.ok(d, 'this one is worth showing — re-applying changes the price');
  assert.equal(d.pinned, 0.2);
  assert.equal(d.actual, 0.24);
});

test('drifted but the solved price IS the current one: no cue', () => {
  // The whole fix. The old code showed amber here and offered "click to
  // re-apply", which re-solved to the same 4dp price and left the cue up
  // forever — an alarm with no remedy is the one people learn to ignore.
  assert.equal(actionablePinDrift(GM_PIN, 'gm', 0.2007, 0.029775, 0.0298), null);
});

test('the real case: GM 20% is unreachable at a 4-decimal price', () => {
  // cost 0.02382 → exact price 0.029775 → stored 0.0298 → reads back 20.07%.
  // The neighbouring price 0.0297 reads 19.80%, so NO 4dp price gives 20.0%.
  const cost = 0.02382;
  const exact = cost / (1 - 0.2);
  const stored = +exact.toFixed(4);
  const readBack = (stored - cost) / stored;
  assert.equal(stored, 0.0298);
  assert.ok(Math.abs(readBack - 0.2) > PIN_TOLERANCE, 'it really is outside tolerance');
  assert.ok(pinDrift(GM_PIN, 'gm', readBack), 'pinDrift alone still calls it drifted');
  assert.equal(
    actionablePinDrift(GM_PIN, 'gm', readBack, exact, stored),
    null,
    'but there is nothing to act on, so the cue must stay silent'
  );
});

test('an unusable solved price shows no cue rather than a dead button', () => {
  for (const bad of [null, undefined, NaN, Infinity, 0, -1]) {
    assert.equal(actionablePinDrift(GM_PIN, 'gm', 0.24, bad, 0.0298), null);
  }
});

test('the cue and the remedy agree by construction', () => {
  // Whenever the cue shows, planAutoHold must have a price to write; whenever
  // it does not, planAutoHold must have none. Two conditions that could drift
  // apart is exactly how this bug existed.
  const cases = [
    [0.24, 0.0312, 0.0298],
    [0.2007, 0.029775, 0.0298],
    [0.2, 0.0298, 0.0298],
    [0.31, 0.0432, 0.0298],
  ];
  for (const [actual, solved, current] of cases) {
    const cue = actionablePinDrift(GM_PIN, 'gm', actual, solved, current);
    const remedy = planAutoHold(pinDrift(GM_PIN, 'gm', actual), solved, current);
    assert.equal(
      Boolean(cue),
      remedy != null,
      `cue and remedy disagree for actual=${actual} solved=${solved} current=${current}`
    );
  }
});
