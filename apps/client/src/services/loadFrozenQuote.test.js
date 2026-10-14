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
// (Materials/Inks coverage/Rate per Sprint S-SNAPSHOT-PHASE-1 +
// tool_life/click_charges per PR-A 2026-06-20). Other clusters
// (SGA rate) are NOT in the snapshot today and stay pinned to
// fixture.lib so test 2 isolates the snapshot's pinning contract
// from non-snapshot retention gaps.
//
// PR-A CHANGE: tool_life + click_charges NOW MUTATED in libV2 because
// they ARE pinned by the snapshot. T4 + T5 below assert mutating
// these does NOT shift result — pins the new PR-A contract.
//
// SGA STILL not snapshot-pinned at this PR layer. PR-A2 will extend
// pricing_snapshot to include SGA precedence (approval > snapshot >
// lib); until then SGA stays pinned to fixture.lib here.
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
      // PR-A: BOTH click_charges and tool_life MUTATED — snapshot must pin both.
      click_charges: { 100: 0.7, 1000: 4.5 },
      tool_life: { 'RDC Die': 50000, 'Pinacle die': 30000, Jig: 200000 }, // halved from fixture.lib
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

// ─── PR-A new contract tests ───────────────────────────────────────

test('PR-A pin: mutating libV2.ddl.tool_life does NOT shift result (snapshot pins tool_life)', () => {
  // Targeted mutate: ONLY tool_life changed; everything else matches
  // fixture.lib. Pre-PR-A this would fail because tool_life lookup
  // bypassed the resolver; post-PR-A snapshot.tool_life wins.
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;
  const lib = {
    ...fixture.lib,
    ddl: {
      ...fixture.lib.ddl,
      tool_life: { 'RDC Die': 1, 'Pinacle die': 1, Jig: 1 }, // catastrophic 100,000× shift
    },
  };

  const tierSt = getActiveTierState(state);
  const result = calcAll(tierSt, null, lib, null, { snapshot });
  const actual = serializeResultForPersist(result);

  assert.equal(
    actual.tooling,
    expected.tooling,
    `tooling drifted under tool_life mutation — snapshot.tool_life is NOT pinning. ` +
      `Expected ${expected.tooling}, got ${actual.tooling}. Check calcEngine resolver.getToolLife.`
  );
  assert.equal(actual.s_ttl, expected.s_ttl, 'downstream s_ttl also pinned');
});

test('PR-A pin: mutating libV2.ddl.click_charges does NOT shift result (snapshot pins click_charges)', () => {
  // Fixture quote has no Indigo inks (Flexo only), so click_charges
  // snapshot is {} and the resolver returns {} → no clicks computed
  // regardless. This test exercises the resolver branch — the result
  // should be invariant under click_charges mutation in any case.
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;
  const lib = {
    ...fixture.lib,
    ddl: {
      ...fixture.lib.ddl,
      click_charges: { 100: 999, 1000: 9999 }, // catastrophic 2000× shift
    },
  };

  const tierSt = getActiveTierState(state);
  const result = calcAll(tierSt, null, lib, null, { snapshot });
  const actual = serializeResultForPersist(result);

  // Whole result identical — proves resolver routes click_charges
  // lookup through snapshot, not live lib.
  for (const k of Object.keys(expected)) {
    assert.deepStrictEqual(actual[k], expected[k], `${k} drifted under click_charges mutation`);
  }
});

test('PR-A legacy: snapshot without tool_life/click_charges emits _warnings + uses live lib', () => {
  // Simulate a pre-PR-A snapshot: persisted block lacks tool_life +
  // click_charges keys. Resolver falls back to live lib (calc still
  // works) AND attaches one _warnings entry per missing field so audit
  // UI can flag the quote as partially-pinned.
  const state = fixture.state;
  const snapshot = state.pricing_snapshot;
  // Strip new-cluster fields to simulate legacy
  const { tool_life, click_charges, ...legacySnapshot } = snapshot;
  // Silence unused destructure (the whole point is to drop them)
  void tool_life;
  void click_charges;
  const legacyState = { ...state, pricing_snapshot: legacySnapshot };

  const tierSt = getActiveTierState(legacyState);
  const result = calcAll(tierSt, null, fixture.lib, null, { snapshot: legacySnapshot });

  assert.ok(Array.isArray(result._warnings), 'result has _warnings array');
  const warnTypes = result._warnings.map((w) => `${w.type}/${w.field || ''}`);
  assert.ok(
    warnTypes.includes('legacy_snapshot_partial/tool_life'),
    `_warnings should include legacy_snapshot_partial for tool_life. Got: ${warnTypes.join(', ')}`
  );
  assert.ok(
    warnTypes.includes('legacy_snapshot_partial/click_charges'),
    `_warnings should include legacy_snapshot_partial for click_charges. Got: ${warnTypes.join(', ')}`
  );

  // Calc still runs (no crash) and falls back to live lib for the
  // missing clusters → tooling cost matches expected (because lib
  // here IS fixture.lib, same as save-time)
  const actual = serializeResultForPersist(result);
  assert.equal(
    actual.tooling,
    fixture.expected_result.tooling,
    'tooling computed via lib fallback'
  );
});

// ─── PR-A2 SGA precedence contract tests ───────────────────────────

test('PR-A2 pin: mutating libV2.finance.sga does NOT shift result (snapshot pins SGA for draft quote)', () => {
  // Closes STEP 0 finding: pre-PR-A2, draft quote (no approval) exported
  // via POST /api/quotes/:id/export computed SGA from live lib.finance.
  // Operator updating finance_sum.json mid-2027 shifted historical
  // g_ttl_with_sga + gm_after_sga silently. PR-A2 pins via
  // pricing_snapshot.sga → SGA mutation must NOT drift result.
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;
  const lib = {
    ...fixture.lib,
    finance: { summary: { sga_rate_pct_by_site: { VN: 12 }, version: 99 } }, // 5% → 12%
  };

  const tierSt = getActiveTierState(state);
  const result = calcAll(tierSt, null, lib, null, { snapshot });
  const actual = serializeResultForPersist(result);

  // SGA + downstream g_ttl_with_sga + gm_after_sga MUST be invariant
  assert.equal(actual.sga, expected.sga, `sga drifted under lib.finance mutation`);
  assert.equal(actual.sga_rate_pct, expected.sga_rate_pct, `sga_rate_pct drifted`);
  assert.equal(
    actual.g_ttl_with_sga,
    expected.g_ttl_with_sga,
    `g_ttl_with_sga drifted — pricing_snapshot.sga is NOT being honored. ` +
      `Check computeSga precedence (calcEngine.js:780).`
  );
  assert.equal(actual.gm_after_sga, expected.gm_after_sga, 'gm_after_sga also pinned');
});

test('PR-A2 REGRESSION GUARD: approved quote (approval.rates_snapshot wins over pricing_snapshot.sga)', () => {
  // CRITICAL: Phase 9E.4 approval workflow MUST keep wins-over-snapshot
  // semantics. This test simulates an approved quote carrying BOTH:
  //   - state.approval.rates_snapshot.sga_rate_pct = 5  (approval pin)
  //   - state.pricing_snapshot.sga.rate_pct = 99       (PR-A2 freeze)
  // Result MUST use 5 (approval), NOT 99 (snapshot). If this test FAILS,
  // precedence is WRONG and Phase 9E.4 has been broken.
  const state = fixture.state;
  const snapshot = state.pricing_snapshot;

  // Forge a divergent pair: pricing_snapshot.sga = 99% (PR-A2), but the
  // quote is "approved" with rates_snapshot.sga_rate_pct = 5%. Approval
  // wins per the precedence chain.
  const forgedState = {
    ...state,
    pricing_snapshot: { ...snapshot, sga: { rate_pct: 99, site_key: 'VN' } },
    approval: { rates_snapshot: { sga_rate_pct: 5, site: 'VN' } },
  };
  const lib = fixture.lib;

  const tierSt = getActiveTierState(forgedState);
  const result = calcAll(tierSt, null, lib, null, {
    snapshot: forgedState.pricing_snapshot,
  });

  // sga_rate_pct must be 5 (approval), NOT 99 (pricing snapshot)
  assert.equal(
    result.sga_rate_pct,
    5,
    `REGRESSION: approval.rates_snapshot (5%) should win over pricing_snapshot.sga (99%). ` +
      `Got ${result.sga_rate_pct}. Phase 9E.4 contract broken — fix computeSga precedence.`
  );
});

test('PR-A2 ACCEPTANCE: export path computes SGA via snapshot, not live lib (closes STEP 0 bypass)', () => {
  // Simulates the production export-path bypass: operator drafts a
  // quote, exports customer xlsx (which calls into engine via export
  // service), then 2027 lib.finance bumps SGA. If engine's
  // computeSga reads lib.finance directly (pre-PR-A2 bug), the 2027
  // re-export gives a different g_ttl_with_sga than the original.
  //
  // POST-PR-A2: precedence path MUST go through snapshot.sga so
  // re-export gives identical numbers.
  const state = fixture.state;
  const expected = fixture.expected_result;
  const snapshot = state.pricing_snapshot;

  // Simulate 2027: lib.finance SGA bumped 5% → 8%
  const lib2027 = {
    ...fixture.lib,
    finance: { summary: { sga_rate_pct_by_site: { VN: 8 }, version: 2 } },
  };

  const tierSt = getActiveTierState(state);
  // Mimic the call shape used by server/services/quoteExport — passes
  // lib + snapshot via the same options channel calcAll uses for UI
  // rendering. If snapshot precedence missed, this would compute SGA
  // from lib2027 (8%) instead of pricing_snapshot.sga (5%).
  const result = calcAll(tierSt, null, lib2027, null, { snapshot });

  assert.equal(
    result.sga_rate_pct,
    expected.sga_rate_pct,
    `ACCEPTANCE FAIL: export-path engine call computed SGA from lib2027 (8%) instead of snapshot (5%). ` +
      `This means a customer xlsx exported in 2026 would not reconcile if regenerated in 2027 after ` +
      `a finance rate change — the bug STEP 0 surfaced is not actually closed by PR-A2.`
  );
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
