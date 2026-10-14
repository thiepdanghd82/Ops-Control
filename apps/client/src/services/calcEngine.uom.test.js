// @ts-check
/**
 * calcEngine UOM (speed_uom) rename — MONEY-PATH regression.
 *
 * The Rate Table UOM labels were renamed 2026-08 (Stamp/min→Shot/min,
 * Pcs/H→Pcs/hrs, Sheets/H+Sheet/H→Sheets/Hrs, new 'Hrs'). calcProcess
 * keys the Machine-UPH formula off the (normalized) speed_uom on the
 * matched lib RATE ROW and keeps the OLD tokens as aliases, so every
 * rename is LABEL-ONLY — identical uph. These tests pin that: new label
 * == legacy label, legacy aliases still compute, 'Hrs' is manual.
 *
 * Runner: node --test src/services/calcEngine.uom.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcProcess } from './calcEngine.js';

// The UOM lives on the lib rate row (matched by workcenter), not the proc.
function libWith(uom) {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
      { workcenter: 'WC', machine_rate: 40, labor_rate: 10, crew: 1, speed_uom: uom },
    ],
  };
}
function makeSt(proc) {
  return {
    processes: [proc],
    sheet_length: 50,
    min_gap_md: 2,
    annual_qty: 100000,
    product_lifetime: 1,
    trade_mode: 'USD(Normal)',
  };
}
const PROC = { workcenter: 'WC', speed: 20, efficiency: 0.85, layout: 3, scrap_pct: 0 };
function uphFor(uom) {
  return calcProcess(PROC, makeSt(PROC), 1000, libWith(uom)).uph;
}

test('Shot/min == legacy Stamp/min (same uph)', () => {
  const a = uphFor('Shot/min');
  assert.ok(a > 0, 'stamp formula → uph > 0');
  assert.equal(a, uphFor('Stamp/min'));
});

test('Sheets/Hrs == legacy Sheets/H == legacy Sheet/H', () => {
  const a = uphFor('Sheets/Hrs');
  assert.ok(a > 0);
  assert.equal(a, uphFor('Sheets/H'));
  assert.equal(a, uphFor('Sheet/H'));
  assert.equal(a, uphFor('Sheet/Hr'));
});

test('Pcs/hrs == legacy Pcs/H == Pcs/Hr', () => {
  const a = uphFor('Pcs/hrs');
  assert.ok(a > 0);
  assert.equal(a, uphFor('Pcs/H'));
  assert.equal(a, uphFor('Pcs/Hr'));
});

test('M/min unchanged (pitch-based formula)', () => {
  const a = uphFor('M/min');
  assert.ok(a > 0);
  // Recompute the documented formula: (sp*eff*60*1000 / max(1,pitch)) * layout.
  // pitch = calcPitch(sheet_length 50, min_gap 2) — just assert stability
  // against the same call, and that it differs from the hourly variant.
  assert.equal(a, uphFor('m/min'), 'case-insensitive');
  assert.notEqual(a, uphFor('Mtr/Hr'), 'per-min ≠ per-hour formula');
});

test('Mtr/Hr alias still computes (dropped from UI list, legacy rows)', () => {
  const a = uphFor('Mtr/Hr');
  assert.ok(a > 0, 'mtr/hr formula → uph > 0');
  assert.equal(a, uphFor('m/hr'), 'm/hr alias');
});

test("'Hrs' → uph 0 (manual), same as empty; labor from setup_h path", () => {
  assert.equal(uphFor('Hrs'), 0, "'Hrs' has no machine run formula");
  // A manual process (uph 0) with a Setup H produces setup_labor from the
  // existing setup_h → setup_labor path, identical to an empty UOM row.
  const proc = { workcenter: 'WC', speed: 0, efficiency: 0.85, crew: 1, setup_h: 2, scrap_pct: 0 };
  const rHrs = calcProcess(proc, makeSt(proc), 1000, libWith('Hrs'));
  const rEmpty = calcProcess(proc, makeSt(proc), 1000, libWith(''));
  assert.equal(rHrs.uph, 0);
  assert.ok(rHrs.setup_labor > 0, 'setup_h drives setup_labor for an Hrs row');
  assert.equal(rHrs.setup_labor, rEmpty.setup_labor, "'Hrs' labor == empty-UOM labor");
});

test('unknown UOM → uph 0 (manual fallback), unchanged', () => {
  assert.equal(uphFor('RPM'), 0);
  assert.equal(uphFor(''), 0);
});
