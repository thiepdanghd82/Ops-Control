/**
 * Cpx tier MOQ/EAU/Price slice routing — regression for the P0 bug
 * filed as MES-3-FIX-53.
 *
 * Pre-fix: ComplexCalc.jsx:1396 dispatched `SET_EXTRA_MOQ` for every
 * Cpx tier input (moq / eau / price / price_vnd / target / target_vnd).
 * But the SET_EXTRA_MOQ reducer case writes ONLY to
 * `state.stdState.extra_moqs` — the wrong slice for Cpx. Result:
 *   - VND mirror never renders (binding reads cplxState.extra_moqs[i].price_vnd
 *     which never gets updated)
 *   - On save round-trip the Cpx tier price/eau land in stdState slice
 *     of an in-memory cplxState quote — DATA LOSS on persistence
 * Fix: introduce SET_CPLX_EXTRA_MOQ (mirror of SET_EXTRA_MOQ but for
 * cplxState) + flip the Cpx callsite to dispatch it. Std's
 * SET_EXTRA_MOQ stays untouched.
 *
 *   node --test src/context/calcReducer.cplxExtraMoq.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer, CALC_ACTIONS as A } from './calcReducer.js';

function initialState() {
  return {
    isDirty: false,
    stdState: {
      _schema_version: 3,
      moq: 500,
      extra_moqs: [{ moq: 1000, price: 0.5, eau: 5000 }],
    },
    cplxState: {
      _shape_version: 4,
      moq: 500,
      selling_price: 0.6,
      extra_moqs: [
        { moq: 2000, price: null, eau: null, price_vnd: null, target_vnd: null },
        { moq: 5000, price: null, eau: null, price_vnd: null, target_vnd: null },
      ],
    },
  };
}

// ── Slice routing — primary bug ──

test('SET_CPLX_EXTRA_MOQ [tier 1]: writes cplxState.extra_moqs[0], leaves stdState alone', () => {
  const prev = initialState();
  const next = calcReducer(prev, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 0, field: 'price', value: 0.2 },
  });
  assert.equal(next.cplxState.extra_moqs[0].price, 0.2, 'cplxState tier 1 price updated');
  // Pre-existing keys preserved.
  assert.equal(next.cplxState.extra_moqs[0].moq, 2000, 'sibling key preserved');
  // STD slice MUST be untouched (regression guard — Std uses its own SET_EXTRA_MOQ).
  assert.deepEqual(
    next.stdState.extra_moqs,
    prev.stdState.extra_moqs,
    'stdState.extra_moqs untouched — wrong-slice bug fixed'
  );
  assert.equal(next.isDirty, true);
});

test('SET_CPLX_EXTRA_MOQ [tier 2]: writes index 1 only, tier 1 unchanged', () => {
  const prev = initialState();
  const next = calcReducer(prev, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 1, field: 'eau', value: 80000 },
  });
  assert.equal(next.cplxState.extra_moqs[1].eau, 80000);
  // tier 1 untouched.
  assert.deepEqual(next.cplxState.extra_moqs[0], prev.cplxState.extra_moqs[0]);
});

// ── DATA-LOSS round-trip — the severity-justifying test ──
//
// Simulates a Cpx multi-tier quote: operator types Price USD + EAU at
// tier 1, code dispatches the action, state gets serialized for save,
// deserialized on load, and the tier 1 values must survive. Pre-fix
// SET_EXTRA_MOQ wrote to stdState; the cplxState half of the round
// trip therefore came back with tier 1 price/eau = null/undefined.

test('Cpx data-loss round-trip: tier 1 price + eau survive serialize→deserialize', () => {
  let state = initialState();
  // Operator types price = 0.2 at Cpx tier 1.
  state = calcReducer(state, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 0, field: 'price', value: 0.2 },
  });
  // Operator types eau = 80000 at Cpx tier 1.
  state = calcReducer(state, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 0, field: 'eau', value: 80000 },
  });
  // Simulate save → JSON.stringify → JSON.parse round trip (what the
  // server persistence + client reload would do).
  const persistedCplx = JSON.parse(JSON.stringify(state.cplxState));
  // Tier 1 values MUST be in cplxState (the slice the Cpx quote
  // serializer reads). Pre-fix these were lost into stdState.
  assert.equal(
    persistedCplx.extra_moqs[0].price,
    0.2,
    'tier 1 price survives round-trip on cplxState slice'
  );
  assert.equal(
    persistedCplx.extra_moqs[0].eau,
    80000,
    'tier 1 eau survives round-trip on cplxState slice'
  );
});

// ── 6-field coverage — every Cpx tier input field routes correctly ──

for (const field of ['moq', 'eau', 'price', 'price_vnd', 'target', 'target_vnd']) {
  test(`SET_CPLX_EXTRA_MOQ: field '${field}' lands in cplxState.extra_moqs[i].${field}`, () => {
    const prev = initialState();
    const next = calcReducer(prev, {
      type: A.SET_CPLX_EXTRA_MOQ,
      payload: { idx: 0, field, value: 123 },
    });
    assert.equal(next.cplxState.extra_moqs[0][field], 123);
    assert.deepEqual(next.stdState.extra_moqs, prev.stdState.extra_moqs);
  });
}

// ── Std no-regress — SET_EXTRA_MOQ keeps its existing Std-slice contract ──

test('SET_EXTRA_MOQ [Std no-regress]: still writes stdState.extra_moqs, leaves cplxState alone', () => {
  const prev = initialState();
  const next = calcReducer(prev, {
    type: A.SET_EXTRA_MOQ,
    payload: { idx: 0, field: 'price', value: 0.4 },
  });
  assert.equal(next.stdState.extra_moqs[0].price, 0.4, 'Std slice updated as before');
  assert.equal(next.stdState.extra_moqs[0].eau, 5000, 'sibling Std key preserved');
  // Cpx untouched.
  assert.deepEqual(
    next.cplxState.extra_moqs,
    prev.cplxState.extra_moqs,
    'Cpx slice untouched — Std action contract unchanged'
  );
});

// ── Immutability ──

test('SET_CPLX_EXTRA_MOQ: new object refs at every level (no in-place mutation)', () => {
  const prev = initialState();
  const prevExtras = prev.cplxState.extra_moqs;
  const prevEm = prev.cplxState.extra_moqs[0];
  const next = calcReducer(prev, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 0, field: 'price', value: 0.2 },
  });
  assert.notEqual(next, prev, 'state ref new');
  assert.notEqual(next.cplxState, prev.cplxState, 'cplxState ref new');
  assert.notEqual(next.cplxState.extra_moqs, prevExtras, 'extra_moqs ref new');
  assert.notEqual(next.cplxState.extra_moqs[0], prevEm, 'extra_moqs[0] ref new');
  assert.equal(prevEm.price, null, 'prev em.price untouched (no mutation)');
});

// ── Edge: extra_moqs missing entirely (legacy heal) ──

test('SET_CPLX_EXTRA_MOQ: cplxState without extra_moqs array creates it', () => {
  const prev = initialState();
  delete prev.cplxState.extra_moqs;
  const next = calcReducer(prev, {
    type: A.SET_CPLX_EXTRA_MOQ,
    payload: { idx: 0, field: 'price', value: 0.2 },
  });
  assert.deepEqual(next.cplxState.extra_moqs, [{ price: 0.2 }]);
});
