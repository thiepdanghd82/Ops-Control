/**
 * MES-2.2 — Operation-status state-machine pure-function tests.
 *
 * Coverage layout (mirrors MES-1.2 workOrderTransition.test.js):
 *   - 9 named valid edges (PRD §10 happy path, incl. scan/start_run alias)
 *   - 7 named invalid representative pairs (allowed_from inverse-lookup)
 *   - 8 no-change assertions (one per (state, event) where event.to === state)
 *   - 9 boundary cases: ACCEPTED + every event → invalid + allowed_from=[]
 *   - 5 defensive cases (unknown state/event, null, undefined, ctx-ignored)
 *   - 1 property sweep over all 7 × 9 = 63 pairs asserting 9 / 8 / 46 split
 *
 * Total: 39 tests.
 *
 * Runner:
 *   node --test domains/planning/tests/unit/opStatusTransition.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { opStatusTransition } from '../../server/domain/opStatusTransition.js';
import {
  WO_OP_STATUSES,
  OP_STATUS_EVENTS,
  OP_TERMINAL_STATUSES,
} from '../../shared/constants/workOrderStates.js';

const VALID_EDGES = [
  // [from, event, to]
  ['PENDING', 'dispatch', 'DISPATCHED'],
  ['DISPATCHED', 'start', 'SETUP'],
  ['SETUP', 'start_run', 'RUNNING'],
  ['SETUP', 'scan', 'RUNNING'], // alias of start_run (PRD §10 edge #9)
  ['RUNNING', 'pause', 'PAUSED'],
  ['PAUSED', 'resume', 'RUNNING'],
  ['RUNNING', 'complete', 'DONE'],
  ['PAUSED', 'complete_from_pause', 'DONE'],
  ['DONE', 'accept', 'ACCEPTED'],
];

const INVALID_REPRESENTATIVE = [
  // [from, event, expected allowed_from]
  ['PENDING', 'start', ['DISPATCHED']],
  ['PENDING', 'complete', ['RUNNING']],
  ['DISPATCHED', 'pause', ['RUNNING']],
  ['SETUP', 'accept', ['DONE']],
  ['RUNNING', 'start', ['DISPATCHED']],
  ['PAUSED', 'start_run', ['SETUP']],
  ['DONE', 'dispatch', ['PENDING']],
];

const NO_CHANGE_CASES = [
  // [from, event] — applying an event whose target equals current state.
  ['DISPATCHED', 'dispatch'],
  ['SETUP', 'start'],
  ['RUNNING', 'start_run'],
  ['RUNNING', 'scan'],
  ['RUNNING', 'resume'],
  ['PAUSED', 'pause'],
  ['DONE', 'complete'],
  ['DONE', 'complete_from_pause'],
];

describe('opStatusTransition — valid edges (9)', () => {
  for (const [from, event, to] of VALID_EDGES) {
    test(`${from} + ${event} → ${to}`, () => {
      assert.deepEqual(opStatusTransition(from, event), { ok: true, to });
    });
  }
});

describe('opStatusTransition — invalid representative (7)', () => {
  for (const [from, event, allowed] of INVALID_REPRESENTATIVE) {
    test(`${from} + ${event} → op-invalid-transition`, () => {
      const r = opStatusTransition(from, event);
      assert.equal(r.ok, false);
      assert.equal(r.error.type, 'op-invalid-transition');
      assert.deepEqual([...r.error.allowed_from], allowed);
      // Inverse-lookup invariant (parity with MES-1.2): from must NOT be in allowed_from.
      assert.ok(!r.error.allowed_from.includes(from));
    });
  }
});

describe('opStatusTransition — no-change / idempotent retry (8)', () => {
  for (const [from, event] of NO_CHANGE_CASES) {
    test(`${from} + ${event} → op-no-change`, () => {
      assert.deepEqual(opStatusTransition(from, event), {
        ok: false,
        error: { type: 'op-no-change' },
      });
    });
  }
});

describe('opStatusTransition — boundary: ACCEPTED is terminal (9)', () => {
  // PRD §10: ACCEPTED has no outgoing edges. Every event from ACCEPTED
  // must return op-invalid-transition with allowed_from=[] (terminal
  // beats no-change for ACCEPTED+accept).
  for (const event of OP_STATUS_EVENTS) {
    test(`ACCEPTED + ${event} → op-invalid-transition + allowed_from=[]`, () => {
      const r = opStatusTransition('ACCEPTED', event);
      assert.equal(r.ok, false);
      assert.equal(r.error.type, 'op-invalid-transition');
      assert.deepEqual([...r.error.allowed_from], []);
    });
  }
});

describe('opStatusTransition — defensive: unknown / null / undefined / ctx-ignored', () => {
  test("from='???', event='dispatch' returns op-invalid-transition", () => {
    const r = opStatusTransition('???', 'dispatch');
    assert.equal(r.ok, false);
    assert.equal(r.error.type, 'op-invalid-transition');
    assert.deepEqual([...r.error.allowed_from], ['PENDING']);
  });

  test("from='PENDING', event='garbage' returns op-invalid-transition + allowed_from=[]", () => {
    const r = opStatusTransition('PENDING', 'garbage');
    assert.equal(r.ok, false);
    assert.equal(r.error.type, 'op-invalid-transition');
    assert.deepEqual([...r.error.allowed_from], []);
  });

  test('from=null, event=null returns op-invalid-transition (no throw)', () => {
    const r = opStatusTransition(null, null);
    assert.equal(r.ok, false);
    assert.equal(r.error.type, 'op-invalid-transition');
  });

  test('from=undefined, event=undefined returns op-invalid-transition (no throw)', () => {
    const r = opStatusTransition(undefined, undefined);
    assert.equal(r.ok, false);
    assert.equal(r.error.type, 'op-invalid-transition');
  });

  test('ctx is ignored — actor/reason_code enforcement lives in service layer', () => {
    // Same valid edge with various ctx shapes — must produce identical results.
    // (MES-2.4 will add actor authz and reason_code FK validation around this fn.)
    const expected = { ok: true, to: 'PAUSED' };
    assert.deepEqual(opStatusTransition('RUNNING', 'pause'), expected);
    assert.deepEqual(opStatusTransition('RUNNING', 'pause', { actor: 'planner' }), expected);
    assert.deepEqual(opStatusTransition('RUNNING', 'pause', { reason_code: undefined }), expected);
    assert.deepEqual(opStatusTransition('RUNNING', 'pause', null), expected);
  });
});

describe('opStatusTransition — property sweep (7 states × 9 events = 63 pairs)', () => {
  test('every pair returns one of 3 shapes; counts: 9 valid + 8 no-change + 46 invalid; sweep < 50ms', () => {
    const t0 = process.hrtime.bigint();
    let validCount = 0;
    let noChangeCount = 0;
    let invalidCount = 0;

    for (const from of WO_OP_STATUSES) {
      for (const event of OP_STATUS_EVENTS) {
        let r;
        assert.doesNotThrow(() => {
          r = opStatusTransition(from, event);
        }, `threw on ${from} + ${event}`);
        assert.notEqual(r, undefined, `undefined on ${from} + ${event}`);

        if (r.ok === true) {
          assert.equal(typeof r.to, 'string', `valid must include .to (${from} + ${event})`);
          validCount++;
        } else if (r.error.type === 'op-no-change') {
          assert.ok(
            !OP_TERMINAL_STATUSES.includes(from),
            `no-change must never fire from a terminal state (${from} + ${event})`
          );
          noChangeCount++;
        } else if (r.error.type === 'op-invalid-transition') {
          assert.ok(
            Array.isArray(r.error.allowed_from),
            `allowed_from must be an array (${from} + ${event})`
          );
          assert.ok(
            !r.error.allowed_from.includes(from),
            `allowed_from must not contain from (${from} + ${event})`
          );
          invalidCount++;
        } else {
          assert.fail(`unexpected error.type ${r.error.type} for ${from} + ${event}`);
        }
      }
    }

    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(validCount, 9, `expected 9 valid, got ${validCount}`);
    assert.equal(noChangeCount, 8, `expected 8 no-change, got ${noChangeCount}`);
    assert.equal(invalidCount, 46, `expected 46 invalid, got ${invalidCount}`);
    assert.ok(elapsedMs < 50, `63-pair sweep took ${elapsedMs.toFixed(2)}ms (budget 50ms)`);
  });
});
