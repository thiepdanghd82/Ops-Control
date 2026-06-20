/**
 * 20-year reproducibility contract — Phase 2.1 of Debug Playbook
 * (2026-06-20). Enforces B-2 R2 from the Enterprise Review Board
 * retention strategy.
 *
 * THE CONTRACT
 * ────────────
 * A quote saved on 2026-06-20 must produce EXACT same numbers when
 * loaded by ANY future calcEngine version. This test pins a frozen
 * fixture (real quote state + result captured by today's engine) and
 * fails CI if any future refactor produces drifted output for that
 * exact state.
 *
 * The fixture lives at __fixtures__/frozen-quote-2026.json (JSON,
 * not JS, so a future engineer can read it without grokking JS module
 * semantics — important for 20-year hand-off).
 *
 * WHEN THIS TEST FAILS — what to do
 * ──────────────────────────────────
 *   A. Engine refactor that changes math → DELIBERATE break.
 *      → Document the change in CLAUDE.md Lessons + sprint history
 *      → Update fixture: `node scripts/regen-frozen-quote.mjs`
 *      → Add a NEW frozen-quote-YYYY.json for the new behavior
 *      → KEEP the old fixture + add a migration test proving the
 *        old quote can still be RENDERED (even if recompute drifts)
 *
 *   B. Accidental drift → REAL BUG.
 *      → DO NOT update the fixture. Revert the engine change.
 *      → The frozen quote is the contract; the engine serves it.
 *
 * WHY THIS MATTERS FOR 20 YEARS
 * ──────────────────────────────
 * CCL Design master-supplier contracts reference cost lines from
 * quotes up to 15 years old. Sales must be able to pull RFQ-2027-S0156
 * in 2042 and prove the cost breakdown matches the audit trail.
 * Pricing Snapshot (Phase 1-5 of S-SNAPSHOT, shipped 2026-06-10)
 * gave us the persisted snapshot SHAPE; this test gives us the
 * persisted snapshot SEMANTICS — any drift surfaces as a CI red.
 *
 *   node --test client/src/services/loadFrozenQuote.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calcAll, getActiveTierState, serializeResultForPersist } from './calcEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '__fixtures__', 'frozen-quote-2026.json');

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

// Synthetic libV2 simulating "5 years of master library drift" but
// ONLY mutating clusters that the pricing snapshot ACTUALLY pins
// (Materials/Inks coverage/Rate per Sprint S-SNAPSHOT-PHASE-1). Other
// clusters (tool_life DDL, SGA rate) are NOT in the snapshot today
// and stay pinned to fixture.lib so test 2 isolates the snapshot's
// pinning contract from non-snapshot retention gaps.
//
// PHASE 2.1 FINDING: tool_life + SGA rate are NOT pinned by snapshot.
// Operator updating either after-the-fact silently changes historical
// quote reload values. Filed as follow-up tickets:
//   - S-SNAPSHOT-EXTEND-TOOL-LIFE (tool_life DDL freeze)
//   - S-SNAPSHOT-EXTEND-SGA (finance.summary SGA rate freeze)
// Both P1 for 20-year retention compliance, but out of scope for this
// PR which only tests the EXISTING contract.
function makeLibV2(baseLib) {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 4.0, crew: 1, speed_uom: '' },
      { workcenter: 'Flexo-A', machine_rate: 60, labor_rate: 15, crew: 2, speed_uom: 'm/min' },
      { workcenter: 'RDC-1', machine_rate: 50, labor_rate: 12, crew: 1, speed_uom: 'm/min' },
    ],
    mat: [
      { code: 'PET-80', type: 'face', s_price: 12.0, g_price: 13.5, thickness: 80 },
      { code: 'LIN-75', type: 'liner', s_price: 4.0, g_price: 4.8, thickness: 75 },
    ],
    ddl: {
      coverage: [
        { pt: 'Flexo', cov: 250 },
        { pt: 'Indigo', cov: 350 },
      ],
      click_charges: { 100: 0.7, 1000: 4.5 },
      tool_life: baseLib.ddl.tool_life, // NOT a snapshot cluster — must stay pinned to isolate
      print_type_list: ['Flexo', 'Indigo'],
    },
    finance: baseLib.finance, // SGA NOT a snapshot cluster — stay pinned
    inkCalc: {},
  };
}

test('20-year contract: frozen quote reproduces identical numbers under TODAY engine + frozen snapshot', () => {
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;
  const lib = fixture.lib; // captured at save time — used for SGA + other non-snapshot reads

  // Load the frozen quote AS-IS. No mutation; feed today's calcEngine
  // the persisted state + persisted snapshot + the captured lib
  // (SGA rate lives outside the snapshot cluster set per Phase 1 design).
  const tierSt = getActiveTierState(state);
  const result = calcAll(tierSt, null, lib, null, { snapshot });
  const actual = serializeResultForPersist(result);

  // Field-by-field deep equality on every PERSISTED_RESULT_FIELD.
  // Using assert.deepEqual would dump the whole diff which is hard
  // to read for floats; iterate to give a precise per-field error.
  const keys = Object.keys(expected);
  for (const k of keys) {
    assert.deepStrictEqual(
      actual[k],
      expected[k],
      `Field "${k}" drifted from frozen fixture.\n` +
        `Expected: ${JSON.stringify(expected[k])}\n` +
        `Actual:   ${JSON.stringify(actual[k])}\n\n` +
        `This is the 20-year reproducibility contract. If the change is intentional, ` +
        `bump the fixture per the file header docstring + document in CLAUDE.md Lessons. ` +
        `If accidental, revert the engine change.`
    );
  }

  // Belt-and-braces: also check no NEW field appeared in actual that's
  // missing from expected (silent shape drift would mean the persisted
  // contract grew without explicit acknowledgment).
  const actualKeys = Object.keys(actual);
  const extra = actualKeys.filter((k) => !(k in expected));
  assert.equal(
    extra.length,
    0,
    `New persisted fields appeared since fixture was frozen: ${JSON.stringify(extra)}. ` +
      `If these fields should be part of the 20-year contract, update the fixture; otherwise, ` +
      `verify they aren't load-bearing for historical quote reload semantics.`
  );
});

test('20-year contract: frozen quote reproduces identical numbers under MUTATED libV2 + frozen snapshot', () => {
  // This is the STRONGEST proof: a fresh lib with completely different
  // rates/prices/coverage MUST NOT change the result, because the
  // snapshot pins the original rates at save time. Any future change
  // that lets libV2 leak into the calc → CI red.
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;
  const libV2 = makeLibV2(fixture.lib);

  const tierSt = getActiveTierState(state);
  const result = calcAll(tierSt, null, libV2, null, { snapshot });
  const actual = serializeResultForPersist(result);

  for (const k of Object.keys(expected)) {
    // _warnings may add site_mismatch noise if state.site differs from
    // snapshot._site; fixture has both = 'VN' so warnings should be [].
    assert.deepStrictEqual(
      actual[k],
      expected[k],
      `Field "${k}" drifted under libV2 mutation — snapshot is NOT pinning correctly.\n` +
        `Expected (frozen at save): ${JSON.stringify(expected[k])}\n` +
        `Actual (libV2 leaked in):  ${JSON.stringify(actual[k])}\n\n` +
        `This means the snapshot resolver path has a regression — calcEngine is reading from ` +
        `live lib instead of the persisted snapshot for at least one cost cluster. Check ` +
        `pricingSnapshot.js + calcEngine.js for new lib.* lookups that bypass the resolver.`
    );
  }
});

test('20-year contract: WITHOUT snapshot, libV2 DOES produce different numbers (sanity proves drift exists)', () => {
  // Negative control: prove that the snapshot is actually doing the
  // work. Without snapshot, libV2 should change the result — if it
  // doesn't, the previous test's "identical" assertion is meaningless
  // (libV2 fixture might accidentally be the same as the captured lib).
  const state = fixture.state;
  const expected = fixture.expected_result;
  const libV2 = makeLibV2(fixture.lib);

  // Strip snapshot to force live-lib reads.
  const stateNoSnap = { ...state, pricing_snapshot: null };
  const tierSt = getActiveTierState(stateNoSnap);
  const result = calcAll(tierSt, null, libV2, null);
  const actual = serializeResultForPersist(result);

  // s_ttl is the canonical roll-up; it MUST differ.
  assert.notEqual(
    actual.s_ttl,
    expected.s_ttl,
    `libV2 produced same s_ttl as frozen result WITHOUT snapshot — libV2 fixture is too similar ` +
      `to the captured lib, so the previous test is not actually proving snapshot reproducibility. ` +
      `Bump libV2 rates further to ensure meaningful drift.`
  );
});
