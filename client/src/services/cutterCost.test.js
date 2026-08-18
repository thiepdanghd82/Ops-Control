// @ts-check
/**
 * Cutter cost calc — pure-helper tests (money-path). Covers the "Dao cắt"
 * formula: perimeter × base + addon (perimeter types) / base + addon (flat),
 * with the Magnetic Rotary tiered base resolved by circumference.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MAGNETIC_ROTARY } from '../services/cutterBaseCost.js';
import {
  normType,
  isPerimeterType,
  circumferenceM,
  getCutterBaseCost,
  getCutterAddon,
  getCutterMin,
  computeCutterCost,
  effCavity,
} from '../services/cutterCost.js';

// Library fixture keyed by the exact tool_type strings (whitespace as shipped).
const LIB = {
  ddl: {
    cutter_cost: {
      'Knife/ Wood': 70,
      'Etching/ Pinnacle Die': 120,
      'Carving/ NC Die': 150,
      'Magnetic Rotary': DEFAULT_MAGNETIC_ROTARY,
      'Jig&Fixture': 45,
      CNC: 45,
      Stencil: '', // configured-but-blank flat type
      'Boundary Flat': 80, // base 80 + addon 20 = 100 == min → floor branch at the boundary
    },
    cutter_addon: {
      'Etching/ Pinnacle Die': 40,
      'Carving/ NC Die': 77,
      'Boundary Flat': 20,
    },
    cutter_min: {
      'Knife/ Wood': 25,
      'Etching/ Pinnacle Die': 100,
      'Carving/ NC Die': 100,
      'Magnetic Rotary': 100,
      'Boundary Flat': 100,
    },
  },
};

// Standard geometry: W=586, L=120, cavity=6 → perim 1.412 m, circ 8.472 m.
const DIMS = { widthMm: 586, lengthMm: 120, cavity: 6 };

test('normType collapses case + whitespace', () => {
  assert.equal(normType('Knife/ Wood'), 'knife/wood');
  assert.equal(normType('  Magnetic   Rotary '), 'magneticrotary');
  assert.equal(normType(null), '');
});

test('isPerimeterType matches the 4 formula types, whitespace-insensitive', () => {
  assert.equal(isPerimeterType('Knife/ Wood'), true);
  assert.equal(isPerimeterType('Etching/ Pinnacle Die'), true);
  assert.equal(isPerimeterType('Carving/ NC Die'), true);
  assert.equal(isPerimeterType('Magnetic Rotary'), true);
  assert.equal(isPerimeterType('Jig&Fixture'), false);
  assert.equal(isPerimeterType('CNC'), false);
  assert.equal(isPerimeterType('RDC'), false);
  assert.equal(isPerimeterType(''), false);
});

test('circumferenceM = (2W + 2L)/1000 * cavity', () => {
  assert.equal(circumferenceM(DIMS), 8.472);
  assert.equal(circumferenceM({ widthMm: 150, lengthMm: 100, cavity: 2 }), 1); // (300+200)/1000*2
});

test('getCutterBaseCost: flat number + Magnetic Rotary tier by circumference', () => {
  assert.equal(getCutterBaseCost(LIB, 'Knife/ Wood', 8.472), 70);
  assert.equal(getCutterBaseCost(LIB, 'Magnetic Rotary', 8.472), 60); // >4 → catch-all
  assert.equal(getCutterBaseCost(LIB, 'Magnetic Rotary', 4), 80); // exactly 4 → up-to-4 band
  assert.equal(getCutterBaseCost(LIB, 'Magnetic Rotary', 1.2), 150);
});

test('getCutterAddon reads cutter_addon (0 default)', () => {
  assert.equal(getCutterAddon(LIB, 'Etching/ Pinnacle Die'), 40);
  assert.equal(getCutterAddon(LIB, 'Carving/ NC Die'), 77);
  assert.equal(getCutterAddon(LIB, 'Knife/ Wood'), 0);
  assert.equal(getCutterAddon({ ddl: {} }, 'Knife/ Wood'), 0);
});

// ── The money-path examples (Henry's spec numbers) ──────────────────
test('perimeter types: circumference × base + addon', () => {
  assert.equal(computeCutterCost('Knife/ Wood', DIMS, LIB), 593.04); // 8.472*70 + 0
  assert.equal(computeCutterCost('Etching/ Pinnacle Die', DIMS, LIB), 1056.64); // 8.472*120 + 40
  assert.equal(computeCutterCost('Carving/ NC Die', DIMS, LIB), 1347.8); // 8.472*150 + 77
  assert.equal(computeCutterCost('Magnetic Rotary', DIMS, LIB), 508.32); // 8.472*60 + 0 (>4 band)
});

test('Magnetic Rotary lands in each tier band by circumference', () => {
  // circ = (2W+2L)/1000 * cavity; pick geometry to hit each band, cost = circ * tier
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 150, lengthMm: 100, cavity: 2 }, LIB),
    150
  ); // circ 1.0 → tier150
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 500, lengthMm: 250, cavity: 1 }, LIB),
    225
  ); // circ 1.5 → 150 → 225
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 500, lengthMm: 500, cavity: 1 }, LIB),
    240
  ); // circ 2.0 → 120 → 240
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 1000, lengthMm: 1000, cavity: 1 }, LIB),
    320
  ); // circ 4.0 → 80 → 320
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 1250, lengthMm: 1250, cavity: 1 }, LIB),
    300
  ); // circ 5.0 → 60 → 300
});

test('flat types = base + addon (no perimeter)', () => {
  assert.equal(computeCutterCost('Jig&Fixture', DIMS, LIB), 45);
  assert.equal(computeCutterCost('CNC', DIMS, LIB), 45);
  assert.equal(computeCutterCost('CNC', { widthMm: 0, lengthMm: 0, cavity: 0 }, LIB), 45); // geometry irrelevant for flat
});

// ── Per-cutter cavity override (money-path) ─────────────────────────
test('per-cutter cavity drives that cutter cost — cavity 6 vs 3', () => {
  // Same W=586, L=120 (perim 1.412 m). cavity 6 → circ 8.472 → 593.04.
  assert.equal(
    computeCutterCost('Knife/ Wood', { widthMm: 586, lengthMm: 120, cavity: 6 }, LIB),
    593.04
  );
  // Override cavity 3 → circ 4.236 → 4.236*70 = 296.52 (this cutter only).
  assert.equal(
    computeCutterCost('Knife/ Wood', { widthMm: 586, lengthMm: 120, cavity: 3 }, LIB),
    296.52
  );
});

test('effCavity: non-empty override wins; empty falls back to the global cavity', () => {
  assert.equal(effCavity('3', 6), 3); // override
  assert.equal(effCavity(3, 6), 3);
  assert.equal(effCavity('', 6), 6); // empty → fallback
  assert.equal(effCavity('   ', 6), 6); // whitespace → fallback
  assert.equal(effCavity(null, 6), 6);
  assert.equal(effCavity(undefined, 6), 6);
  assert.equal(effCavity('0', 6), 0); // explicit 0 override wins (→ blank cost downstream)
  assert.equal(effCavity('abc', 6), 0); // garbage → num()→0 (guarded downstream)
});

test('blank cases → empty string', () => {
  assert.equal(computeCutterCost('', DIMS, LIB), ''); // no type
  assert.equal(computeCutterCost('Knife/ Wood', { widthMm: 0, lengthMm: 120, cavity: 6 }, LIB), ''); // missing width
  assert.equal(
    computeCutterCost('Knife/ Wood', { widthMm: 586, lengthMm: 120, cavity: 0 }, LIB),
    ''
  ); // missing cavity
  assert.equal(computeCutterCost('Stencil', DIMS, LIB), ''); // flat, base blank + no addon
  assert.equal(computeCutterCost('Unknown Type', DIMS, LIB), ''); // flat, absent + no addon
});

// ── Min tools price floor (computed <= minBase → minBase + addon/cavities) ──
test('getCutterMin reads cutter_min (0 default)', () => {
  assert.equal(getCutterMin(LIB, 'Knife/ Wood'), 25);
  assert.equal(getCutterMin(LIB, 'Etching/ Pinnacle Die'), 100);
  assert.equal(getCutterMin(LIB, 'Jig&Fixture'), 0); // no floor configured
  assert.equal(getCutterMin({ ddl: {} }, 'Knife/ Wood'), 0);
});

test('above the Min → computed value unchanged', () => {
  // standard geometry (circ 8.472) is well above every floor
  assert.equal(computeCutterCost('Knife/ Wood', DIMS, LIB), 593.04);
  assert.equal(computeCutterCost('Etching/ Pinnacle Die', DIMS, LIB), 1056.64);
  assert.equal(computeCutterCost('Carving/ NC Die', DIMS, LIB), 1347.8);
  assert.equal(computeCutterCost('Magnetic Rotary', DIMS, LIB), 508.32);
});

test('at/below the Min → floor = minBase + addon/cavities', () => {
  // Knife/Wood: circ 0.2 → 0.2*70 = 14 (<= 25) → floor 25 + 0/1 = 25
  assert.equal(computeCutterCost('Knife/ Wood', { widthMm: 50, lengthMm: 50, cavity: 1 }, LIB), 25);
  // Etching: circ 0.4 → 0.4*120 + 40 = 88 (<= 100) → floor 100 + 40/2 = 120
  assert.equal(
    computeCutterCost('Etching/ Pinnacle Die', { widthMm: 50, lengthMm: 50, cavity: 2 }, LIB),
    120
  );
  // Carving: circ 0.12 → 0.12*150 + 77 = 95 (<= 100) → floor 100 + 77/1 = 177
  assert.equal(
    computeCutterCost('Carving/ NC Die', { widthMm: 30, lengthMm: 30, cavity: 1 }, LIB),
    177
  );
  // Magnetic Rotary: circ 0.5 → 0.5*150 = 75 (<= 100) → floor 100 + 0 = 100
  assert.equal(
    computeCutterCost('Magnetic Rotary', { widthMm: 125, lengthMm: 125, cavity: 1 }, LIB),
    100
  );
});

test('exactly == Min applies the floor (<= inclusive)', () => {
  // Boundary Flat: base 80 + addon 20 = 100 == min 100 → floor 100 + 20/2 = 110
  assert.equal(
    computeCutterCost('Boundary Flat', { widthMm: 0, lengthMm: 0, cavity: 2 }, LIB),
    110
  );
});

test('type with no Min → no floor even when tiny', () => {
  // Jig&Fixture flat 45, no cutter_min → stays 45
  assert.equal(computeCutterCost('Jig&Fixture', { widthMm: 1, lengthMm: 1, cavity: 1 }, LIB), 45);
});
