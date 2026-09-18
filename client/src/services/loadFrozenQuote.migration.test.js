/**
 * A 2026 quote must still OPEN under the post-2026-09-18 engine.
 *
 * `loadFrozenQuote.test.js` pins that today's engine reproduces today's
 * numbers. It says nothing about the quotes saved BEFORE a deliberate engine
 * change, and its own playbook asks for this file: "KEEP the old fixture +
 * add a migration test proving the old quote can still be RENDERED (even if
 * recompute drifts)."
 *
 * The drift here is the tooling-yield fix: tooling now amortises over GOOD
 * pieces (`tool_life × layout × yield`) instead of pieces the tool merely
 * produced. 52 of 134 saved quotes recompute with higher tooling, by up to
 * 1.9% of subtotal. The customer-facing artefact is unaffected — the server
 * never re-runs calcEngine and the xlsx reads the persisted `quote.result` —
 * so this is what an operator sees on re-opening, not a re-quote.
 *
 * What this file asserts is therefore NOT "the numbers still match". It is:
 *   1. an archived quote still computes — no throw, no NaN, no missing field
 *   2. the drift is CONFINED to the tooling chain
 *
 * (2) is the one that would have caught a mistake. A change to a shared
 * divisor is exactly the kind that leaks sideways into materials or inks
 * without anybody noticing, because every number still looks plausible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calcAll } from './calcEngine.js';

const ARCHIVE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'pre-tooling-yield'
);
const load = (f) => JSON.parse(readFileSync(path.join(ARCHIVE, f), 'utf8'));
const FIXTURES = readdirSync(ARCHIVE).filter((f) => f.endsWith('.json'));

/** Fields the tooling fix is allowed to move, and everything it rolls up into. */
const TOOLING_CHAIN = new Set([
  'tooling',
  's_ttl',
  'g_ttl',
  'g_ttl_with_sga',
  'sga',
  'gm',
  'va',
  'contribution',
  'contr_pct',
  'gm_pct',
  // Margin after SGA — derived from g_ttl_with_sga, so tooling reaches it.
  // It was missing from the first draft of this list and the test caught it,
  // which is the only reason anyone knows the list is complete.
  'gm_after_sga',
]);

test('the archive is present — the old baseline must not be deleted', () => {
  assert.equal(FIXTURES.length, 4, `expected 4 archived fixtures, found ${FIXTURES.length}`);
});

for (const file of FIXTURES) {
  test(`${file}: a 2026 quote still computes — no throw, no NaN, no dropped field`, () => {
    const { lib, state, expected_result: was } = load(file);
    const now = calcAll(state, null, lib, null, {});
    assert.ok(now && typeof now === 'object', 'calcAll returned nothing');
    for (const [k, v] of Object.entries(was)) {
      if (typeof v !== 'number') continue;
      assert.ok(k in now, `field "${k}" disappeared — an old quote would render a gap`);
      assert.ok(Number.isFinite(now[k]), `field "${k}" is ${now[k]} — not renderable`);
    }
  });

  test(`${file}: the drift is confined to the tooling chain`, () => {
    const { lib, state, expected_result: was } = load(file);
    const now = calcAll(state, null, lib, null, {});
    const leaked = [];
    for (const [k, v] of Object.entries(was)) {
      if (typeof v !== 'number' || TOOLING_CHAIN.has(k)) continue;
      // Tolerance is float noise only, not a budget for real movement.
      if (Math.abs((now[k] ?? 0) - v) > 1e-9) leaked.push(`${k}: ${v} → ${now[k]}`);
    }
    assert.deepEqual(
      leaked,
      [],
      `the tooling fix moved fields outside the tooling chain:\n  ${leaked.join('\n  ')}`
    );
  });
}
