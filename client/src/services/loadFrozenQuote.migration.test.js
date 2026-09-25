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
 *
 * SECOND DELIBERATE BREAK — 2026-09-25, the ink make-ready length.
 * ─────────────────────────────────────────────────────────────────
 * Setup ink spans the material's `setup_lm` metres of make-ready, not the
 * 1 metre it charged before (see inkSetupMakeReady.test.js for why the old
 * reading could never resolve). So each archived quote now drifts on a
 * SECOND chain, and the confinement assertion below covers both.
 *
 * The control worth knowing: the Indigo fixture is byte-identical across
 * this change, because Indigo bills click-charges by SHEET and never enters
 * the coverage branch. Three fixtures moved, one did not — which is what
 * shows the change landed where it was aimed.
 *
 * THIRD DELIBERATE BREAK — 2026-09-25, the same length in Indigo frames.
 * ───────────────────────────────────────────────────────────────────────
 * The Indigo branch had the identical port error — the source workbook reads
 * "Setup lm" there too, as ROUNDUP(setup_lm / 0.98, 0) frames — and charged 2
 * frames on every row. Now it counts setup_lm in 980 mm frames.
 *
 * The controls invert, which is the evidence for both changes at once: here
 * ONLY the Indigo fixture moved, and the three coverage fixtures regenerated
 * byte-identical. No third archive directory: the Indigo fixture as it stood
 * before this change is byte-identical to `pre-ink-makeready/`'s copy, so the
 * baseline is already kept. Its drift (bd_ink_setup 0.6 → 15.6, 2 → 52 frames)
 * lands entirely inside ALLOWED, so the confinement assertion needs no change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calcAll } from './calcEngine.js';

const FIX_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
/**
 * One directory per deliberate break, holding the fixtures as they stood
 * BEFORE it. `pre-tooling-yield` predates both changes; `pre-ink-makeready`
 * predates only the ink one. A quote from either era must still open.
 */
const ARCHIVES = ['pre-tooling-yield', 'pre-ink-makeready'];
const load = (dir, f) => JSON.parse(readFileSync(path.join(FIX_ROOT, dir, f), 'utf8'));
const FIXTURES = ARCHIVES.flatMap((dir) =>
  readdirSync(path.join(FIX_ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [dir, f])
);

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

/**
 * Fields the two ink make-ready fixes are allowed to move. Setup ink now spans
 * `setup_lm` metres (coverage branch) or ⌈setup_lm / 0.98⌉ frames (Indigo)
 * instead of 1 metre / 2 frames, so `bd_ink_setup` moves — and the two
 * material-cost roll-ups move with it, because MES-3-FIX-47 established that
 * `s_mat_cost` already aggregates ink subcost despite its name.
 */
const INK_SETUP_CHAIN = new Set(['bd_ink_setup', 's_mat_cost', 'g_mat_cost']);

/** Everything a DOCUMENTED deliberate break may touch. Nothing else may move. */
const ALLOWED = new Set([...TOOLING_CHAIN, ...INK_SETUP_CHAIN]);

test('the archive is present — no old baseline may be deleted', () => {
  assert.equal(
    FIXTURES.length,
    8,
    `expected 8 archived fixtures across ${ARCHIVES.length} breaks, found ${FIXTURES.length}`
  );
});

for (const [dir, file] of FIXTURES) {
  test(`${dir}/${file}: a 2026 quote still computes — no throw, no NaN, no dropped field`, () => {
    const { lib, state, expected_result: was } = load(dir, file);
    const now = calcAll(state, null, lib, null, {});
    assert.ok(now && typeof now === 'object', 'calcAll returned nothing');
    for (const [k, v] of Object.entries(was)) {
      if (typeof v !== 'number') continue;
      assert.ok(k in now, `field "${k}" disappeared — an old quote would render a gap`);
      assert.ok(Number.isFinite(now[k]), `field "${k}" is ${now[k]} — not renderable`);
    }
  });

  test(`${dir}/${file}: the drift is confined to the chains we deliberately changed`, () => {
    const { lib, state, expected_result: was } = load(dir, file);
    const now = calcAll(state, null, lib, null, {});
    const leaked = [];
    for (const [k, v] of Object.entries(was)) {
      if (typeof v !== 'number' || ALLOWED.has(k)) continue;
      // Tolerance is float noise only, not a budget for real movement.
      if (Math.abs((now[k] ?? 0) - v) > 1e-9) leaked.push(`${k}: ${v} → ${now[k]}`);
    }
    assert.deepEqual(
      leaked,
      [],
      `a deliberate change moved fields outside the tooling + ink-setup chains:\n  ${leaked.join('\n  ')}`
    );
  });
}
