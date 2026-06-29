/**
 * calcEngine.crew.test — CREW column drives labor + throughput, and MAN UPH
 * is derived from crew for MANUAL processes (Inspection/FQC/OQC).
 *
 * calcProcess is the SHARED engine for both Standard (CalcProcesses) and
 * Complex (SubProductRow → aggregateComplex) calculators, so testing it here
 * covers both surfaces. The UI override-affordance helper crewOverrideState is
 * exercised separately at the bottom.
 *
 * Model: Option A (default) — crew is a throughput / balancing lever; manual
 * unit cost stays correct (crew-neutral) while MAN UPH + PROD TIME scale.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess } from './calcEngine.js';
import {
  crewOverrideState,
  isManualDerivedRow,
} from '../modules/cost/tabs/StandardCalc/processCrew.helpers.js';

const LIB = {
  rate: [
    { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
    { workcenter: 'FQC', machine_rate: 0, labor_rate: 3.0, crew: 1, speed_uom: '' },
    { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
  ],
};

// Minimal st — calcProcess only needs processes[] (scrap factor), pitch fields.
function makeSt(proc, extra = {}) {
  return {
    processes: [proc],
    sheet_length: 50,
    min_gap_md: 2,
    annual_qty: 100000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
    ...extra,
  };
}

const MANUAL_RATE = 2.54; // lib 'Manual' labor_rate

// ── MAN UPH derivation ────────────────────────────────────────────
test('MAN UPH derived: crew=1, speed=1000, eff=1.0 → 1000', () => {
  const proc = { workcenter: 'FQC', speed: 1000, efficiency: 1.0, crew: 1, scrap_pct: 0 };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(r.uph, 0, 'manual workcenter → machine uph 0');
  assert.equal(r.manualUph, 1000);
});

test('MAN UPH derived: crew=2 doubles throughput → 2000', () => {
  const proc = { workcenter: 'FQC', speed: 1000, efficiency: 1.0, crew: 2, scrap_pct: 0 };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(r.manualUph, 2000);
});

test('MAN UPH derived: eff applied (crew=1, speed=1000, eff=0.85 → 850)', () => {
  const proc = { workcenter: 'FQC', speed: 1000, efficiency: 0.85, crew: 1, scrap_pct: 0 };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(r.manualUph, 850);
});

test('machine row (uph > 0) keeps typed manual_uph, not derived', () => {
  const proc = {
    workcenter: 'Flexo-A',
    speed: 20,
    efficiency: 0.85,
    layout: 1,
    manual_uph: 5000,
    scrap_pct: 0,
  };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.ok(r.uph > 0, 'machine workcenter → uph > 0');
  assert.equal(r.manualUph, 5000, 'typed manual_uph preserved on machine rows');
});

test('legacy manual row (speed 0, manual_uph typed) keeps the typed value', () => {
  const proc = { workcenter: 'Manual', speed: 0, manual_uph: 7000, crew: 1, scrap_pct: 0 };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(r.manualUph, 7000);
});

// ── Labor scaling ─────────────────────────────────────────────────
test('machine labor (setup + run) scales linearly with proc.crew override', () => {
  const base = {
    workcenter: 'Flexo-A',
    speed: 20,
    efficiency: 0.85,
    layout: 1,
    setup_h: 2,
    scrap_pct: 0,
  };
  const r2 = calcProcess({ ...base, crew: 2 }, makeSt({ ...base, crew: 2 }), 1000, LIB);
  const r4 = calcProcess({ ...base, crew: 4 }, makeSt({ ...base, crew: 4 }), 1000, LIB);
  assert.ok(
    Math.abs(r4.setup_labor - 2 * r2.setup_labor) < 1e-9,
    'setup_labor doubles when crew doubles'
  );
  assert.ok(
    Math.abs(r4.run_labor - 2 * r2.run_labor) < 1e-9,
    'run_labor doubles when crew doubles'
  );
});

test('manual labor Option A: run_labor crew-NEUTRAL, MAN UPH + PROD TIME scale', () => {
  const base = { workcenter: 'FQC', speed: 1000, efficiency: 1.0, scrap_pct: 0 };
  const r1 = calcProcess({ ...base, crew: 1 }, makeSt({ ...base, crew: 1 }), 1000, LIB);
  const r2 = calcProcess({ ...base, crew: 2 }, makeSt({ ...base, crew: 2 }), 1000, LIB);
  // Per-piece manual labor is crew-neutral: (rate*crew)/(crew*eff*speed) = rate/(eff*speed)
  assert.ok(Math.abs(r1.run_labor - MANUAL_RATE / 1000) < 1e-12, 'crew=1 run_labor = rate/uph');
  assert.ok(Math.abs(r2.run_labor - r1.run_labor) < 1e-12, 'run_labor unchanged when crew doubles');
  // Throughput + production time DO scale (capacity / Balancing reflect crew).
  assert.equal(r2.manualUph, 2 * r1.manualUph, 'MAN UPH doubles');
  assert.ok(
    Math.abs(r2.total_time - r1.total_time / 2) < 1e-9,
    'PROD TIME halves when crew doubles'
  );
});

// ── Backward compatibility ────────────────────────────────────────
test('BC: proc.crew undefined + speed 0 → falls back to rate.crew, typed manual_uph', () => {
  const proc = { workcenter: 'Manual', speed: 0, manual_uph: 7000, scrap_pct: 0 };
  const r = calcProcess(proc, makeSt(proc), 1000, LIB);
  assert.equal(r.crew, 1, 'rate.crew fallback when column blank');
  assert.equal(r.manualUph, 7000, 'typed value untouched');
  // Old formula was manual_rate / manual_uph (crew=1 → identical).
  assert.ok(Math.abs(r.run_labor - MANUAL_RATE / 7000) < 1e-12);
});

test('BC: explicit crew = rate.crew gives identical result to undefined', () => {
  const a = {
    workcenter: 'Flexo-A',
    speed: 20,
    efficiency: 0.85,
    layout: 1,
    setup_h: 1,
    scrap_pct: 0,
  };
  const rUndef = calcProcess(a, makeSt(a), 1000, LIB);
  const rExplicit = calcProcess({ ...a, crew: 2 }, makeSt({ ...a, crew: 2 }), 1000, LIB);
  assert.ok(Math.abs(rUndef.run_labor - rExplicit.run_labor) < 1e-12);
  assert.ok(Math.abs(rUndef.setup_labor - rExplicit.setup_labor) < 1e-12);
});

// ── Override-affordance helper (Std + Cpx UI) ─────────────────────
test('crewOverrideState: override when proc.crew differs from rate', () => {
  const ovr = crewOverrideState(2, 1);
  assert.deepEqual(ovr, { value: 2, isOverride: true, base: 1 });
});

test('crewOverrideState: no override when equal / blank', () => {
  assert.deepEqual(crewOverrideState(1, 1), { value: 1, isOverride: false, base: 1 });
  assert.deepEqual(crewOverrideState(undefined, 2), { value: 2, isOverride: false, base: 2 });
  assert.deepEqual(crewOverrideState(null, 3), { value: 3, isOverride: false, base: 3 });
  assert.deepEqual(crewOverrideState(0, 2), { value: 2, isOverride: false, base: 2 });
});

test('crewOverrideState: rate blank → base defaults to 1', () => {
  assert.deepEqual(crewOverrideState(undefined, undefined), {
    value: 1,
    isOverride: false,
    base: 1,
  });
  assert.deepEqual(crewOverrideState(3, undefined), { value: 3, isOverride: true, base: 1 });
});

test('isManualDerivedRow: only manual rows with a speed', () => {
  assert.equal(isManualDerivedRow({ uph: 0 }, 1000), true);
  assert.equal(isManualDerivedRow({ uph: 0 }, 0), false, 'no speed → typed input');
  assert.equal(isManualDerivedRow({ uph: 1234 }, 1000), false, 'machine row');
  assert.equal(isManualDerivedRow(null, 1000), false, 'no result');
});
