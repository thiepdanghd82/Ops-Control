/**
 * MES-1.2 — Work Order state-machine pure-function tests.
 *
 * Coverage:
 *   - 13 named valid edges (AC-1.2.1)
 *   - 7 named invalid representative pairs (AC-1.2.3)
 *   - 1 explicit AC-1.2.6 cardinality check on allowed_from for to=CANCELLED
 *   - 3 defensive cases for unknown / null / undefined state strings (AC-1.2.5)
 *   - 1 property-based sweep over all 81 ordered pairs asserting the
 *     13 / 9 / 59 split + invariants (AC-1.2.2, AC-1.2.3, AC-1.2.4)
 *
 * Runner:
 *   node --test domains/planning/tests/unit/workOrderTransition.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { workOrderTransition } from '../../server/domain/workOrderTransition.js';
import { WO_STATES } from '../../shared/constants/workOrderStates.js';

const VALID_EDGES = [
  // Forward (6)
  ['CREATED', 'RELEASED'],
  ['RELEASED', 'SCHEDULED'],
  ['SCHEDULED', 'IN_PROGRESS'],
  ['IN_PROGRESS', 'COMPLETED'],
  ['COMPLETED', 'QC_RELEASED'],
  ['QC_RELEASED', 'CLOSED'],
  // Pause / Resume (2)
  ['IN_PROGRESS', 'ON_HOLD'],
  ['ON_HOLD', 'IN_PROGRESS'],
  // Cancel (5)
  ['CREATED', 'CANCELLED'],
  ['RELEASED', 'CANCELLED'],
  ['SCHEDULED', 'CANCELLED'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['ON_HOLD', 'CANCELLED'],
];

const INVALID_REPRESENTATIVE = [
  // [from, to, expected allowed_from]
  ['CREATED', 'IN_PROGRESS', ['SCHEDULED', 'ON_HOLD']],
  ['RELEASED', 'ON_HOLD', ['IN_PROGRESS']],
  ['SCHEDULED', 'ON_HOLD', ['IN_PROGRESS']],
  ['COMPLETED', 'CANCELLED', ['CREATED', 'RELEASED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD']],
  ['QC_RELEASED', 'CANCELLED', ['CREATED', 'RELEASED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD']],
  ['CLOSED', 'IN_PROGRESS', ['SCHEDULED', 'ON_HOLD']],
  ['CANCELLED', 'CREATED', []],
];

describe('workOrderTransition — valid edges (13)', () => {
  // AC-1.2.1
  for (const [from, to] of VALID_EDGES) {
    test(`${from} → ${to}`, () => {
      assert.deepEqual(workOrderTransition(from, to), { ok: true });
    });
  }
});

describe('workOrderTransition — invalid representative (7)', () => {
  // AC-1.2.3 — named subset from PRD §10.1 cases 14-20
  for (const [from, to, allowedFrom] of INVALID_REPRESENTATIVE) {
    test(`${from} → ${to} → wo-invalid-transition`, () => {
      const r = workOrderTransition(from, to);
      assert.equal(r.ok, false);
      assert.equal(r.error.type, 'urn:ops:wo-invalid-transition');
      assert.deepEqual([...r.error.allowed_from].sort(), [...allowedFrom].sort());
    });
  }
});

describe('workOrderTransition — AC-1.2.6 cardinality', () => {
  test('allowed_from for to=CANCELLED has exactly 5 elements (the 5 non-terminal cancellable states)', () => {
    const r = workOrderTransition('COMPLETED', 'CANCELLED');
    assert.equal(r.error.allowed_from.length, 5);
    assert.deepEqual([...r.error.allowed_from].sort(), [
      'CREATED',
      'IN_PROGRESS',
      'ON_HOLD',
      'RELEASED',
      'SCHEDULED',
    ]);
  });
});

describe('workOrderTransition — defensive: unknown / null / undefined (≥3)', () => {
  // AC-1.2.5 — never throw, always return wo-unknown-state
  test("from='foo', to='CREATED'", () => {
    assert.deepEqual(workOrderTransition('foo', 'CREATED'), {
      ok: false,
      error: { type: 'urn:ops:wo-unknown-state' },
    });
  });

  test("from='CREATED', to=null", () => {
    assert.deepEqual(workOrderTransition('CREATED', null), {
      ok: false,
      error: { type: 'urn:ops:wo-unknown-state' },
    });
  });

  test('from=null, to=undefined', () => {
    assert.deepEqual(workOrderTransition(null, undefined), {
      ok: false,
      error: { type: 'urn:ops:wo-unknown-state' },
    });
  });
});

describe('workOrderTransition — property-based (81 ordered pairs)', () => {
  // AC-1.2.2, AC-1.2.3, AC-1.2.4
  test('exactly 13 valid + 9 self-loops + 59 invalid; sweep < 50ms', () => {
    const t0 = process.hrtime.bigint();
    let validCount = 0;
    let selfLoopCount = 0;
    let invalidCount = 0;

    for (const from of WO_STATES) {
      for (const to of WO_STATES) {
        const r = workOrderTransition(from, to);
        if (r.ok === true) {
          assert.notEqual(from, to, `valid implies from !== to (${from}→${to})`);
          validCount++;
        } else if (r.error.type === 'urn:ops:wo-no-change') {
          assert.equal(from, to, `wo-no-change implies from === to (${from}→${to})`);
          selfLoopCount++;
        } else if (r.error.type === 'urn:ops:wo-invalid-transition') {
          assert.notEqual(from, to);
          assert.ok(
            Array.isArray(r.error.allowed_from),
            `allowed_from must be an array (${from}→${to})`
          );
          // Inverse-lookup invariant: `from` cannot itself appear in
          // allowed_from — if it did, the pair would be valid.
          assert.ok(
            !r.error.allowed_from.includes(from),
            `allowed_from must not contain from (${from}→${to})`
          );
          invalidCount++;
        } else {
          assert.fail(`unexpected error.type ${r.error.type} for ${from}→${to}`);
        }
      }
    }

    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(validCount, 13, `expected 13 valid, got ${validCount}`);
    assert.equal(selfLoopCount, 9, `expected 9 self-loops, got ${selfLoopCount}`);
    assert.equal(invalidCount, 59, `expected 59 invalid, got ${invalidCount}`);
    assert.ok(elapsedMs < 50, `81-pair sweep took ${elapsedMs.toFixed(2)}ms (budget 50ms)`);
  });
});
