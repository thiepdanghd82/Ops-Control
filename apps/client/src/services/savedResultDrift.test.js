// @ts-check
/**
 * savedResultDrift — does the result a quote was SAVED with differ from what
 * the engine computes for it today?
 *
 * Opening a quote recomputes it live, but every export (xlsx, CSV), Quote
 * History and the Cost Breakdown list read the PERSISTED result. After PR 427
 * and PR 428 that left ~150 quotes showing one number on screen and another in
 * every file, and the Save button stayed disabled because nothing had been
 * edited. Found on hardware 2026-09-25: Henry pressed Save on RFQ-2026-S0073
 * and nothing reached the server — 0 writes in the log.
 *
 * Runner: node --test src/services/savedResultDrift.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { savedResultDrift, IMPLAUSIBLE_DRIFT_SHARE } from './savedResultDrift.js';
import { calcAll } from './calcEngine.js';

const BASE = { sp: 0.0496, s_ttl: 0.046762, bd_ink_setup: 0.00226275, gm: 0.057, site: 'VN' };

test('identical results → no drift', () => {
  assert.equal(savedResultDrift({ ...BASE }, { ...BASE }), null);
});

test('float noise is not drift', () => {
  assert.equal(savedResultDrift({ ...BASE }, { ...BASE, s_ttl: BASE.s_ttl + 1e-15 }), null);
});

test('a real engine change is reported, with the subtotal either side', () => {
  // RFQ-2026-S0073 before and after PR 427 + PR 428.
  const live = { ...BASE, s_ttl: 0.050519, bd_ink_setup: 0.0059892, gm: -0.0185 };
  const d = savedResultDrift({ ...BASE }, live);
  assert.ok(d, 'must report drift');
  assert.deepEqual(d.fields.sort(), ['bd_ink_setup', 'gm', 's_ttl']);
  assert.equal(d.savedSubtotal, 0.046762);
  assert.equal(d.liveSubtotal, 0.050519);
});

test('a field the SAVED result never had is not drift — legacy quotes predate newer fields', () => {
  const saved = { sp: 1, s_ttl: 0.5 };
  const live = { sp: 1, s_ttl: 0.5, gm_after_sga: 0.3, sga: 0.02 };
  assert.equal(savedResultDrift(saved, live), null);
});

test('non-numeric persisted fields are ignored', () => {
  const live = { ...BASE, site: 'India', warnings: ['x'], rows: { inks: [] } };
  assert.equal(savedResultDrift({ ...BASE, warnings: [] }, live), null);
});

test('nothing saved, or nothing computed → no claim either way', () => {
  assert.equal(savedResultDrift(null, { ...BASE }), null);
  assert.equal(savedResultDrift({ ...BASE }, null), null);
  assert.equal(savedResultDrift(undefined, undefined), null);
});

// ── Against real quote fixtures, not invented numbers ────────────────────────
const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const load = (rel) => JSON.parse(readFileSync(path.join(FX, rel), 'utf8'));
const recompute = (f) => calcAll(f.state, null, f.lib, null, {});
const FILES = [
  'frozen-quote-2026.json',
  'frozen-quote-diecut-2026.json',
  'frozen-quote-draft-sga-2026.json',
  'frozen-quote-indigo-2026.json',
];

for (const f of FILES) {
  test(`${f}: a quote saved under TODAY's engine shows no drift — the banner must stay quiet`, () => {
    const fx = load(f);
    assert.equal(savedResultDrift(fx.expected_result, recompute(fx)), null);
  });
}

test('an archived pre-PR-427 quote DOES show drift, and names the ink-setup chain', () => {
  const fx = load('pre-tooling-yield/frozen-quote-2026.json');
  const d = savedResultDrift(fx.expected_result, recompute(fx));
  assert.ok(d, 'a quote saved before the ink make-ready fix must be flagged');
  assert.ok(d.fields.includes('bd_ink_setup'), `fields: ${d && d.fields}`);
});

test('the archived Indigo quote shows drift from PR 428 alone', () => {
  // pre-ink-makeready/indigo is byte-identical to the fixture as it stood before
  // PR 428, so the only change it can see is the Indigo make-ready frames.
  const fx = load('pre-ink-makeready/frozen-quote-indigo-2026.json');
  const d = savedResultDrift(fx.expected_result, recompute(fx));
  assert.ok(d && d.fields.includes('bd_ink_setup'), `fields: ${d && d.fields}`);
});

// ── The size of a drift, and when it is too big to save with one click ──
// Measured 2026-09-28 over the 44 Standard quotes still showing the banner:
// 40 move by under 31% of their selling price, 9 by 196% or more, and none in
// between. The nine are old quotes whose inputs today's engine reads
// differently (a tool with no tool life falling back to 1; a manual-labour
// speed read per operator) — RFQ-2026-S0007 would save $444/pc. Half the
// selling price sits in the middle of that gap.

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

test('the threshold is half the selling price', () => {
  assert.equal(IMPLAUSIBLE_DRIFT_SHARE, 0.5);
});

test('a drift carries its size as a share of the selling price — S0069, +5.3%', () => {
  const d = savedResultDrift(
    { ...BASE, sp: 0.0276, s_ttl: 0.020638 },
    { ...BASE, sp: 0.0276, s_ttl: 0.022102 }
  );
  close(d.share, (0.022102 - 0.020638) / 0.0276, 'share');
  assert.equal(d.implausible, false);
});

test('RFQ-2026-S0007: $0.09 → $444 is implausible', () => {
  const d = savedResultDrift(
    { ...BASE, sp: 0.1334, s_ttl: 0.090095 },
    { ...BASE, sp: 0.1334, s_ttl: 444.528177 }
  );
  assert.equal(d.implausible, true);
});

test('exactly half the selling price is still saveable; more is not', () => {
  const at = savedResultDrift({ ...BASE, sp: 1, s_ttl: 1 }, { ...BASE, sp: 1, s_ttl: 1.5 });
  const over = savedResultDrift({ ...BASE, sp: 1, s_ttl: 1 }, { ...BASE, sp: 1, s_ttl: 1.5000001 });
  assert.equal(at.implausible, false);
  assert.equal(over.implausible, true);
});

test('a fall counts the same as a rise', () => {
  const d = savedResultDrift({ ...BASE, sp: 1, s_ttl: 2 }, { ...BASE, sp: 1, s_ttl: 1.2 });
  assert.equal(d.implausible, true);
});

test('no selling price → measured against the saved subtotal instead', () => {
  const big = savedResultDrift({ ...BASE, sp: 0, s_ttl: 1 }, { ...BASE, sp: 0, s_ttl: 1.6 });
  const small = savedResultDrift({ ...BASE, sp: 0, s_ttl: 1 }, { ...BASE, sp: 0, s_ttl: 1.4 });
  assert.equal(big.implausible, true);
  assert.equal(small.implausible, false);
});

test('a drift with no subtotal to measure is never blocked — it cannot be judged', () => {
  const d = savedResultDrift({ gm: 0.2, sp: 1 }, { gm: 0.3, sp: 1 });
  assert.deepEqual(d.fields, ['gm']);
  assert.equal(d.implausible, false);
});
