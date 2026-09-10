/**
 * PR-B (2026-06-20) — frozen-quote contract tests for the 3 quote
 * classes that cover the P1 retention gaps PR-A + PR-A2 closed:
 *
 *   frozen-quote-diecut-2026.json   — tool_life pin (PR-A)
 *   frozen-quote-indigo-2026.json   — click_charges pin (PR-A)
 *   frozen-quote-draft-sga-2026.json — sga pin (PR-A2)
 *
 * Each fixture is tested 3 ways (same pattern as loadFrozenQuote.test.js):
 *   1. TODAY engine + fixture lib + snapshot → identical to expected
 *   2. MUTATED libV2 (snapshot-cluster fields shifted) + snapshot →
 *      still identical (proves PR-A/A2 snapshot pin works)
 *   3. WITHOUT snapshot, libV2 → drift (negative control)
 *
 * Mũi tên 2 đích: these are reproducibility PINS (Phase 2 — 20-year
 * retention contract) AND golden tests for die-cut/Indigo/draft-SGA
 * quote classes (Phase 1 M-4 + PR-A/A2 finishing).
 *
 *   node --test client/src/services/loadFrozenQuotesAll.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calcAll, getActiveTierState, serializeResultForPersist } from './calcEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = (name) => join(__dirname, '__fixtures__', `frozen-quote-${name}-2026.json`);

function loadFixture(name) {
  return JSON.parse(readFileSync(FIX(name), 'utf8'));
}

/**
 * Build a libV2 that mutates ALL snapshot-pinned clusters but keeps
 * other lib fields (which calcEngine reads directly outside the
 * snapshot scope) identical to fixture.lib. Tests assert snapshot
 * resolver overrides each mutation.
 */
function makeLibV2(baseLib) {
  return {
    ...baseLib,
    rate: baseLib.rate.map((r) => ({
      ...r,
      machine_rate: (r.machine_rate || 0) * 2,
      labor_rate: (r.labor_rate || 0) * 2,
    })),
    mat: baseLib.mat.map((m) => ({
      ...m,
      s_price: (m.s_price || 0) * 2,
      g_price: (m.g_price || 0) * 2,
    })),
    ddl: {
      ...baseLib.ddl,
      coverage: baseLib.ddl.coverage.map((c) => ({ ...c, cov: c.cov * 0.5 })),
      click_charges: Object.fromEntries(
        Object.entries(baseLib.ddl.click_charges || {}).map(([k, v]) => [k, v * 10])
      ),
      tool_life: Object.fromEntries(
        Object.entries(baseLib.ddl.tool_life || {}).map(([k, v]) => [k, Math.max(1, v / 100)])
      ),
    },
    finance: {
      ...baseLib.finance,
      summary: {
        ...baseLib.finance.summary,
        sga_rate_pct_by_site: Object.fromEntries(
          Object.entries(baseLib.finance?.summary?.sga_rate_pct_by_site || {}).map(([k, v]) => [
            k,
            v * 3,
          ])
        ),
      },
    },
  };
}

function assertAllFieldsIdentical(actual, expected, contextMsg) {
  for (const k of Object.keys(expected)) {
    assert.deepStrictEqual(
      actual[k],
      expected[k],
      `${contextMsg}: field "${k}" drifted.\n` +
        `Expected: ${JSON.stringify(expected[k])}\nActual:   ${JSON.stringify(actual[k])}`
    );
  }
}

// ─── DIE-CUT FIXTURE (PR-A tool_life pin) ────────────────────────

const DIECUT = loadFixture('diecut');

test('frozen-quote-diecut: TODAY engine + fixture lib + snapshot reproduces expected', () => {
  const state = DIECUT.state;
  const result = calcAll(getActiveTierState(state), null, DIECUT.lib, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    DIECUT.expected_result,
    'diecut TODAY reproduce'
  );
});

test('frozen-quote-diecut: MUTATED libV2 (tool_life × 0.01) + snapshot still identical', () => {
  // Catastrophic tool_life cut: RDC Die 100k → 1k, Pinacle die 60k → 600
  // Without PR-A pin, tooling cost would explode 100×.
  const state = DIECUT.state;
  const libV2 = makeLibV2(DIECUT.lib);
  const result = calcAll(getActiveTierState(state), null, libV2, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    DIECUT.expected_result,
    'diecut libV2 mutate'
  );
});

test('frozen-quote-diecut: WITHOUT snapshot + libV2 → tooling drifts (proves snapshot does work)', () => {
  const state = DIECUT.state;
  const libV2 = makeLibV2(DIECUT.lib);
  const stateNoSnap = { ...state, pricing_snapshot: null };
  const result = calcAll(getActiveTierState(stateNoSnap), null, libV2, null);
  const actual = serializeResultForPersist(result);
  assert.notEqual(
    actual.tooling,
    DIECUT.expected_result.tooling,
    'diecut tooling MUST drift without snapshot — proves test 2 above is meaningful'
  );
});

// ─── INDIGO FIXTURE (PR-A click_charges pin) ─────────────────────

const INDIGO = loadFixture('indigo');

test('frozen-quote-indigo: TODAY engine + fixture lib + snapshot reproduces expected', () => {
  const state = INDIGO.state;
  const result = calcAll(getActiveTierState(state), null, INDIGO.lib, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    INDIGO.expected_result,
    'indigo TODAY reproduce'
  );
});

test('frozen-quote-indigo: MUTATED libV2 (click_charges × 10) + snapshot still identical', () => {
  const state = INDIGO.state;
  const libV2 = makeLibV2(INDIGO.lib);
  const result = calcAll(getActiveTierState(state), null, libV2, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    INDIGO.expected_result,
    'indigo libV2 mutate'
  );
});

test('frozen-quote-indigo: WITHOUT snapshot + libV2 → s_ttl drifts (proves snapshot does work)', () => {
  const state = INDIGO.state;
  const libV2 = makeLibV2(INDIGO.lib);
  const stateNoSnap = { ...state, pricing_snapshot: null };
  const result = calcAll(getActiveTierState(stateNoSnap), null, libV2, null);
  const actual = serializeResultForPersist(result);
  assert.notEqual(
    actual.s_ttl,
    INDIGO.expected_result.s_ttl,
    'indigo s_ttl MUST drift without snapshot'
  );
});

// ─── DRAFT-SGA FIXTURE (PR-A2 sga pin, closes STEP 0) ────────────

const DRAFT_SGA = loadFixture('draft-sga');

test('frozen-quote-draft-sga: TODAY engine reproduces expected (no approval → snapshot.sga wins)', () => {
  const state = DRAFT_SGA.state;
  // Sanity — confirm fixture is truly draft (no approval block)
  assert.equal(state.approval, undefined, 'fixture is draft, no approval');
  const result = calcAll(getActiveTierState(state), null, DRAFT_SGA.lib, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    DRAFT_SGA.expected_result,
    'draft-sga TODAY reproduce'
  );
});

test('frozen-quote-draft-sga: MUTATED libV2 (sga × 3) + snapshot still identical (closes STEP 0)', () => {
  // The canonical STEP 0 scenario: draft quote exported, finance bumps
  // SGA rate post-save. Without PR-A2, gm_after_sga drifts. With
  // PR-A2 snapshot.sga, draft quote is pinned same as approved.
  const state = DRAFT_SGA.state;
  const libV2 = makeLibV2(DRAFT_SGA.lib);
  const result = calcAll(getActiveTierState(state), null, libV2, null, {
    snapshot: state.pricing_snapshot,
  });
  assertAllFieldsIdentical(
    serializeResultForPersist(result),
    DRAFT_SGA.expected_result,
    'draft-sga libV2 sga mutate'
  );
});

test('frozen-quote-draft-sga: WITHOUT snapshot + libV2 → g_ttl_with_sga drifts (proves PR-A2 works)', () => {
  const state = DRAFT_SGA.state;
  const libV2 = makeLibV2(DRAFT_SGA.lib);
  const stateNoSnap = { ...state, pricing_snapshot: null };
  const result = calcAll(getActiveTierState(stateNoSnap), null, libV2, null);
  const actual = serializeResultForPersist(result);
  assert.notEqual(
    actual.g_ttl_with_sga,
    DRAFT_SGA.expected_result.g_ttl_with_sga,
    'draft-sga g_ttl_with_sga MUST drift without snapshot — proves PR-A2 closes STEP 0'
  );
});
