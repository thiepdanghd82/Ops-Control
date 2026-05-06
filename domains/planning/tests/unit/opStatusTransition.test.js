/**
 * MES-2.2 — Operation-status state-machine pure-function tests.
 *
 * Coverage layout (mirrors MES-1.2 workOrderTransition.test.js):
 *   - 15 named valid edges (PRD §10 happy path + 6 wo_cancel cascade edges)
 *   - 8 named invalid representative pairs (allowed_from inverse-lookup,
 *     incl. wo_cancel from a terminal state)
 *   - 8 no-change assertions (one per (state, event) where event.to === state)
 *   - 10 boundary cases: ACCEPTED + every event → invalid + allowed_from=[]
 *   - 10 boundary cases: CANCELLED + every event → invalid + allowed_from=[]
 *     (MES-3-V1 — cascade target is terminal too)
 *   - 5 defensive cases (unknown state/event, null, undefined, ctx-ignored)
 *   - 1 property sweep over all 8 × 10 = 80 pairs asserting 15 / 8 / 57 split
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

// MES-3-V1: WO_CANCEL_SOURCES is the canonical multi-source list for the
// `wo_cancel` event. Six non-terminal states cascade to CANCELLED on a
// parent WO cancel; ACCEPTED + CANCELLED are excluded (terminal, no edges).
const WO_CANCEL_SOURCES = ['PENDING', 'DISPATCHED', 'SETUP', 'RUNNING', 'PAUSED', 'DONE'];

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
  // MES-3-V1: 6 wo_cancel cascade edges (multi-source event).
  ...WO_CANCEL_SOURCES.map((from) => [from, 'wo_cancel', 'CANCELLED']),
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
  // MES-3-V1: from a non-source state, wo_cancel returns the full
  // 6-source list (operator never fires it directly anyway, but the
  // inverse-lookup contract still applies for forensics).
  // Note: ACCEPTED is terminal so it returns allowed_from=[] via the
  // terminal short-circuit, NOT the multi-source list. Tested below.
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

describe('opStatusTransition — boundary: ACCEPTED is terminal', () => {
  // PRD §10: ACCEPTED has no outgoing edges. Every event from ACCEPTED
  // must return op-invalid-transition with allowed_from=[] (terminal
  // beats no-change for ACCEPTED+accept). MES-3-V1 added wo_cancel —
  // ACCEPTED is also terminal w.r.t. cascade (an op already ACCEPTED
  // cannot be retroactively un-accepted by cancelling the WO).
  for (const event of OP_STATUS_EVENTS) {
    test(`ACCEPTED + ${event} → op-invalid-transition + allowed_from=[]`, () => {
      const r = opStatusTransition('ACCEPTED', event);
      assert.equal(r.ok, false);
      assert.equal(r.error.type, 'op-invalid-transition');
      assert.deepEqual([...r.error.allowed_from], []);
    });
  }
});

describe('opStatusTransition — boundary: CANCELLED is terminal (MES-3-V1)', () => {
  // KIOSK-003 a: CANCELLED joins ACCEPTED as terminal. Every event from
  // CANCELLED returns op-invalid-transition + allowed_from=[]. Notably:
  // CANCELLED + wo_cancel does NOT return no-change despite from === edge.to;
  // the terminal short-circuit fires first so a re-cancel attempt is a hard
  // 409 not a quiet 304.
  for (const event of OP_STATUS_EVENTS) {
    test(`CANCELLED + ${event} → op-invalid-transition + allowed_from=[]`, () => {
      const r = opStatusTransition('CANCELLED', event);
      assert.equal(r.ok, false);
      assert.equal(r.error.type, 'op-invalid-transition');
      assert.deepEqual([...r.error.allowed_from], []);
    });
  }
});

describe('opStatusTransition — wo_cancel cascade edges (MES-3-V1)', () => {
  // The 6 valid sources (already covered by the VALID_EDGES sweep) — these
  // tests assert the multi-source allowed_from contract for the negative
  // case: a non-source, non-terminal state (impossible today since the 6
  // sources cover all non-terminal states, but the contract should still
  // surface the full source list if a future state is added without a
  // corresponding wo_cancel edge).
  test('multi-source allowed_from list is the full 6-state set', () => {
    // No state outside {ACCEPTED, CANCELLED, ...WO_CANCEL_SOURCES} exists
    // today, so we exercise the inverse-lookup via a synthetic call with
    // an unknown source. The terminal check passes (unknown ≠ terminal),
    // edge.to !== from, and we land on the array branch.
    const r = opStatusTransition('SOME_FUTURE_STATE', 'wo_cancel');
    assert.equal(r.ok, false);
    assert.equal(r.error.type, 'op-invalid-transition');
    assert.deepEqual([...r.error.allowed_from].sort(), [...WO_CANCEL_SOURCES].sort());
  });
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

describe('opStatusTransition — property sweep (8 states × 10 events = 80 pairs)', () => {
  test('every pair returns one of 3 shapes; counts: 15 valid + 8 no-change + 57 invalid; sweep < 50ms', () => {
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
    // MES-3-V1: 80 pairs (8 states × 10 events).
    //   valid     = 9 (existing) + 6 (wo_cancel cascade) = 15
    //   no-change = 8 (unchanged — wo_cancel from CANCELLED hits terminal first)
    //   invalid   = 80 − 15 − 8 = 57
    assert.equal(validCount, 15, `expected 15 valid, got ${validCount}`);
    assert.equal(noChangeCount, 8, `expected 8 no-change, got ${noChangeCount}`);
    assert.equal(invalidCount, 57, `expected 57 invalid, got ${invalidCount}`);
    assert.ok(elapsedMs < 50, `80-pair sweep took ${elapsedMs.toFixed(2)}ms (budget 50ms)`);
  });
});
