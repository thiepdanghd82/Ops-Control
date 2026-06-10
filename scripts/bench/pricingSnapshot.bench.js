#!/usr/bin/env node
// @ts-check
/**
 * Pricing-snapshot perf benchmark. Times `freezeLib` (save path) and
 * `snapshotPricingParams` (render/calc path) across synthetic fixtures
 * sized 100 / 1k / 10k quotes so we can prove the snapshot work added
 * no measurable hot-path cost before the CCL Vietnam Hai Duong go-live
 * on 2026-07-21.
 *
 * Goals (each operation, p95):
 *   - freezeLib            ≤ 5 ms — fired once per save
 *   - snapshotPricingParams ≤ 2 ms — fired per render + per calc tick
 *   - resolver hot path     ≤ 1 ms — getMat/Rate/Coverage from snapshot
 *
 * The synthetic state mirrors the shape calcEngine actually walks:
 *   - 5 main + 3 alt material rows referencing 6 distinct codes
 *   - 7 processes referencing 5 workcenters (Slit, Pre_Cut, Flexo, …)
 *   - 4 inks (mixed Indigo subtypes)
 *
 * Library is sized to 50 materials + 40 workcenters — close to the
 * production CCL Vietnam library at v1.5.12 (47 mat / 38 wc per
 * 2026-06 export). Coverage table 30 rows.
 *
 * Usage:
 *   node scripts/bench/pricingSnapshot.bench.js            # human report
 *   node scripts/bench/pricingSnapshot.bench.js --json     # machine JSON
 *
 * Exit code: always 0 unless a goal regression is detected, in which
 * case 1 (so CI can opt-in to enforce). Default thresholds at top.
 */

import { performance } from 'node:perf_hooks';

import {
  freezeLib,
  snapshotPricingParams,
  getMatFromSnapshot,
  getRateFromSnapshot,
  getCoverageFromSnapshot,
} from '../../client/src/services/pricingSnapshot.js';

// p95 budgets (ms) — exit 1 if any op breaches under the 10k fixture
const BUDGETS = {
  freezeLib: 5,
  snapshotPricingParams: 2,
  resolverLookup: 1,
};

const FIXTURE_SIZES = [100, 1000, 10000];

const ARGS = new Set(process.argv.slice(2));
const JSON_OUT = ARGS.has('--json');

// ─── Fixture synthesis ──────────────────────────────────────────────

function makeLibrary() {
  const mat = [];
  for (let i = 0; i < 50; i++) {
    mat.push({
      code: `MAT-${i.toString().padStart(3, '0')}`,
      desc: `Material ${i}`,
      width: 200 + (i % 5) * 50,
      s_price: 5 + (i % 7) * 0.5,
      _u: 'sqm',
    });
  }
  const rate = [];
  const wcs = [
    'Slit', 'Pre_Cut', 'Flexo', 'Indigo', 'SS_Sheet',
    'Inspection', 'Lamination', 'Slitting', 'Rewind', 'Finish',
  ];
  for (let i = 0; i < 40; i++) {
    rate.push({
      workcenter: wcs[i % wcs.length] + (i >= wcs.length ? `_${Math.floor(i / wcs.length)}` : ''),
      labor_rate: 2.5 + (i % 5) * 0.3,
      machine_rate: 4 + (i % 6) * 0.5,
      oh_cost: 1.2 + (i % 4) * 0.2,
      crew: 1 + (i % 3),
      speed_uom: 'lm_per_hr',
    });
  }
  const coverage = [];
  const printTypes = ['Flexo', 'Indigo', 'Indigo(Primer)', 'SS', 'Indigo(Spot)'];
  for (let i = 0; i < 30; i++) {
    coverage.push({
      pt: printTypes[i % printTypes.length],
      cov: 0.1 + (i % 10) * 0.05,
      click: 80 + (i % 5) * 20,
    });
  }
  return { _version: 'v3.1', mat, rate, ddl: { coverage } };
}

function makeState(idx) {
  const matCodes = [
    `MAT-${(idx % 50).toString().padStart(3, '0')}`,
    `MAT-${((idx + 7) % 50).toString().padStart(3, '0')}`,
    `MAT-${((idx + 13) % 50).toString().padStart(3, '0')}`,
    `MAT-${((idx + 19) % 50).toString().padStart(3, '0')}`,
    `MAT-${((idx + 23) % 50).toString().padStart(3, '0')}`,
  ];
  const wcs = ['Slit', 'Pre_Cut', 'Flexo', 'Indigo', 'Inspection', 'Lamination', 'Rewind'];
  return {
    site: 'VN',
    materials_active: 'main',
    materials_main: matCodes.map((code, i) => ({
      _mid: `m${i}`,
      code,
      usage: 1 + (i % 3) * 0.5,
      s_price: 5,
      row_type: 'Main.Mat',
    })),
    materials_alt: matCodes.slice(0, 3).map((code, i) => ({
      _mid: `a${i}`,
      code,
      usage: 1,
      s_price: 5,
      row_type: 'Main.Mat',
    })),
    materials: matCodes.map((code, i) => ({
      _mid: `m${i}`,
      code,
      usage: 1,
      s_price: 5,
      row_type: 'Main.Mat',
    })),
    inks: [
      { _mid: 'i1', print_type: 'Indigo' },
      { _mid: 'i2', print_type: 'Indigo(Primer)' },
      { _mid: 'i3', print_type: 'Flexo' },
      { _mid: 'i4', print_type: 'SS' },
    ],
    processes: wcs.map((wc, i) => ({ _mid: `p${i}`, workcenter: wc })),
  };
}

// ─── Latency stats ──────────────────────────────────────────────────

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

function summarize(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    n: sorted.length,
    avg: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

function timeIt(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// ─── Benchmark loop ─────────────────────────────────────────────────

function runOnce(lib, states) {
  const freezeSamples = [];
  const resolveSamples = [];
  const lookupSamples = [];

  for (const state of states) {
    freezeSamples.push(timeIt(() => freezeLib(lib, state, { userId: 'bench' })));
  }

  const snapshots = states.map((s) => freezeLib(lib, s, { userId: 'bench' }));

  for (let i = 0; i < states.length; i++) {
    const stateWithSnap = { ...states[i], pricing_snapshot: snapshots[i] };
    resolveSamples.push(timeIt(() => snapshotPricingParams(stateWithSnap, lib)));
  }

  for (let i = 0; i < states.length; i++) {
    const snap = snapshots[i];
    lookupSamples.push(
      timeIt(() => {
        getMatFromSnapshot(snap, 'MAT-001');
        getRateFromSnapshot(snap, 'Slit');
        getCoverageFromSnapshot(snap);
      })
    );
  }

  return {
    freezeLib: summarize(freezeSamples),
    snapshotPricingParams: summarize(resolveSamples),
    resolverLookup: summarize(lookupSamples),
  };
}

function main() {
  const lib = makeLibrary();
  const report = { startedAt: new Date().toISOString(), runs: [] };
  let regressed = false;

  for (const n of FIXTURE_SIZES) {
    const states = Array.from({ length: n }, (_, i) => makeState(i));
    // Warm-up (V8 deopt avoidance) — small lap discarded.
    runOnce(lib, states.slice(0, Math.min(20, n)));
    const stats = runOnce(lib, states);
    const breaches = {};
    for (const [op, budget] of Object.entries(BUDGETS)) {
      const p95 = stats[op]?.p95 ?? 0;
      if (n === 10000 && p95 > budget) {
        breaches[op] = { p95, budget };
        regressed = true;
      }
    }
    report.runs.push({ fixtureSize: n, stats, breaches });
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printHuman(report);
  }
  process.exit(regressed ? 1 : 0);
}

function fmt(ms) {
  return ms < 1 ? `${(ms * 1000).toFixed(0)} μs` : `${ms.toFixed(2)} ms`;
}

function printHuman(report) {
  const out = [];
  out.push('Pricing-snapshot benchmark');
  out.push(`Started: ${report.startedAt}`);
  out.push('');
  for (const run of report.runs) {
    out.push(`── Fixture size: ${run.fixtureSize.toLocaleString()} quotes ──`);
    for (const [op, s] of Object.entries(run.stats)) {
      const budget = BUDGETS[op];
      const breach = run.breaches[op];
      const verdict = breach ? ' ⚠ BREACH' : run.fixtureSize === 10000 ? ' ✓ within budget' : '';
      out.push(
        `  ${op.padEnd(24)} avg=${fmt(s.avg).padStart(8)}  p50=${fmt(s.p50).padStart(8)}  p95=${fmt(s.p95).padStart(8)}  p99=${fmt(s.p99).padStart(8)}  budget=${budget}ms${verdict}`
      );
    }
    out.push('');
  }
  process.stdout.write(out.join('\n') + '\n');
}

main();
