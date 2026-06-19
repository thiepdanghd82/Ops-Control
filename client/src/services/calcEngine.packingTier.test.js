/**
 * Per-MOQ packing & shipping override — red tests for sprint
 * S-PACK-SHIP-PER-TIER. Writer of any of the 10 pack/ship fields on a
 * non-zero MOQ tier should land in `extra_moqs[idx-1].packing[field]`
 * (sparse — only the keys actually overridden). Reader (`buildTierState`
 * + `aggregateComplex` parent pack/ship + `getActiveTierState`) field-
 * merges via `Object.assign` so unspecified keys naturally fall back to
 * top-level base.
 *
 *   node --test src/services/calcEngine.packingTier.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTierState,
  calcAll,
  calcPacking,
  calcShipping,
  aggregateComplex,
  createSubProduct,
} from './calcEngine.js';

// ── Helpers ──
// Std state with 3 tiers (base + 2 extras) carrying explicit pack/ship.
// Tier 0 (base) is the top-level state; tiers 1+ live in extra_moqs and
// override per spec.
function makeStdState({ extra_moqs = [] } = {}) {
  return {
    moq: 500,
    annual_qty: 60_000,
    product_lifetime: 1,
    selling_price: 1.0,
    site: 'VN',
    trade_mode: 'USD',
    materials: [],
    materials_active: 'main',
    inks: [],
    processes: [],
    // Base pack/ship (tier 0).
    packing_method: 'Sheet',
    pcs_per_bag: 100,
    bags_per_box: 10,
    container_cost: 0,
    box_cost: 1.0,
    other_packing: 0.01,
    delivery_term: 'DAP',
    ship_qty: 0,
    shipping_cost: 200,
    other_ship: 50,
    extra_moqs,
    active_moq_idx: 0,
  };
}

// ── buildTierState read path ──

test('buildTierState [pack/ship per-tier]: tier 0 returns base shape unchanged', () => {
  const st = makeStdState({
    extra_moqs: [{ moq: 2000, packing: { pcs_per_bag: 200, shipping_cost: 400 } }],
  });
  const tier0 = buildTierState(st, 0, st.selling_price, st.moq, st.annual_qty);
  assert.equal(tier0.pcs_per_bag, 100, 'base pcs_per_bag preserved');
  assert.equal(tier0.shipping_cost, 200, 'base shipping_cost preserved');
  assert.equal(tier0.other_ship, 50, 'base other_ship preserved');
});

test('buildTierState [pack/ship per-tier]: tier 1 full override lands in resolved state', () => {
  const st = makeStdState({
    extra_moqs: [
      {
        moq: 2000,
        packing: {
          packing_method: 'Roll',
          pcs_per_bag: 200,
          bags_per_box: 20,
          container_cost: 5,
          box_cost: 2,
          other_packing: 0.02,
          delivery_term: 'FOB',
          ship_qty: 2000,
          shipping_cost: 400,
          other_ship: 100,
        },
      },
    ],
  });
  const tier1 = buildTierState(st, 1, 1.0, 2000, st.annual_qty);
  assert.equal(tier1.packing_method, 'Roll');
  assert.equal(tier1.pcs_per_bag, 200);
  assert.equal(tier1.bags_per_box, 20);
  assert.equal(tier1.container_cost, 5);
  assert.equal(tier1.box_cost, 2);
  assert.equal(tier1.other_packing, 0.02);
  assert.equal(tier1.delivery_term, 'FOB');
  assert.equal(tier1.ship_qty, 2000);
  assert.equal(tier1.shipping_cost, 400);
  assert.equal(tier1.other_ship, 100);
});

// Sprint B3b / A3-02 (2026-06-19) — pin "each tier inherits from
// BASE (tier 0), NOT from tier N-1". The implementation merges only
// `extra_moqs[idx-1].packing` onto top-level state for the requested
// tier, so each tier's resolution is independent. Without this test
// a future "inherit from previous tier" refactor could silently
// change the semantics (operators with tier 1 override but tier 2
// blank would suddenly see tier 1's value bleed into tier 2).
test('buildTierState [pack/ship per-tier]: tier 2 inherits from BASE, NOT from tier 1 override', () => {
  const st = makeStdState({
    extra_moqs: [
      // Tier 1 has a clear override on container_cost.
      { moq: 1000, packing: { container_cost: 999 } },
      // Tier 2 has NO packing override at all — must fall back to
      // base (container_cost: 0), not to tier 1 (container_cost: 999).
      { moq: 2000 },
    ],
  });
  const tier1 = buildTierState(st, 1, 1.0, 1000, st.annual_qty);
  const tier2 = buildTierState(st, 2, 1.0, 2000, st.annual_qty);
  assert.equal(tier1.container_cost, 999, 'tier 1 sees its own override');
  assert.equal(
    tier2.container_cost,
    0,
    'tier 2 must inherit base (0), NOT tier 1 (999) — independent resolution per tier'
  );
});

test('buildTierState [pack/ship per-tier]: partial override — unspecified keys fall back to base', () => {
  const st = makeStdState({
    extra_moqs: [
      {
        moq: 2000,
        // Only pcs_per_bag + shipping_cost overridden; other 8 fall back.
        packing: { pcs_per_bag: 200, shipping_cost: 400 },
      },
    ],
  });
  const tier1 = buildTierState(st, 1, 1.0, 2000, st.annual_qty);
  assert.equal(tier1.pcs_per_bag, 200, 'override applied');
  assert.equal(tier1.shipping_cost, 400, 'override applied');
  // Base fields fall through unchanged.
  assert.equal(tier1.packing_method, 'Sheet', 'method falls back');
  assert.equal(tier1.bags_per_box, 10, 'bags_per_box falls back');
  assert.equal(tier1.container_cost, 0, 'container_cost falls back');
  assert.equal(tier1.box_cost, 1.0, 'box_cost falls back');
  assert.equal(tier1.other_packing, 0.01, 'other_packing falls back');
  assert.equal(tier1.delivery_term, 'DAP', 'delivery_term falls back');
  assert.equal(tier1.other_ship, 50, 'other_ship falls back');
});

// Henry's explicit-0 case — the dễ-vỡ-nhất test. Empty input maps to
// "key absent" (key removed from packing object), but explicit 0 must
// override base — otherwise operators with a 0-cost tier (e.g. customer
// covers shipping) silently inherit base.
test('buildTierState [pack/ship per-tier]: explicit 0 override DOES take effect (not silent fallback)', () => {
  const st = makeStdState({
    extra_moqs: [
      {
        moq: 5000,
        packing: { other_ship: 0 }, // explicit 0 — operator confirmed "no other ship for this tier"
      },
    ],
  });
  const tier1 = buildTierState(st, 1, 1.0, 5000, st.annual_qty);
  assert.equal(tier1.other_ship, 0, 'explicit 0 overrides base 50 — not silent fallback');
  // Other fields fall back as expected.
  assert.equal(tier1.shipping_cost, 200, 'shipping_cost falls back to base');
});

test('buildTierState [pack/ship per-tier]: heal-on-read — legacy quote without packing key', () => {
  // Legacy quote shape — extra_moqs lacks `packing` field entirely.
  const st = makeStdState({
    extra_moqs: [{ moq: 2000, mat_setup_lm: [], proc_setup_h: [] }],
  });
  const tier1 = buildTierState(st, 1, 1.0, 2000, st.annual_qty);
  // No crash + tier inherits base packing 1:1 (back-compat invariant).
  assert.equal(tier1.pcs_per_bag, 100);
  assert.equal(tier1.shipping_cost, 200);
  assert.equal(tier1.other_ship, 50);
  assert.equal(tier1.packing_method, 'Sheet');
});

// ── calcAll end-to-end — packing_ship MUST differ per tier ──

test('calcAll [pack/ship per-tier]: 3 tiers produce 3 distinct packing_ship values', () => {
  // Pin ship_qty across all tiers so the calcShipping divisor is
  // identical — the ONLY input difference is the packing override.
  // Pre-hardening this test passed by accident: tier 1 dropped the
  // override (Edit 1 missing) but tier 0 vs tier 1 still differed
  // because calcShipping falls back to `moq` when ship_qty is 0,
  // and the per-tier moq differs. Pinning ship_qty kills that
  // false-positive path.
  const base = makeStdState({
    extra_moqs: [
      { moq: 2000, packing: { pcs_per_bag: 200, shipping_cost: 300, ship_qty: 1000 } },
      { moq: 5000, packing: { pcs_per_bag: 500, shipping_cost: 500, ship_qty: 1000 } },
    ],
  });
  const st = { ...base, ship_qty: 1000 }; // pin tier-0 divisor too
  const lib = { rate: [], ddl: { coverage: [], tool_life: {} } };
  const tier0 = calcAll(buildTierState(st, 0, 1, st.moq, st.annual_qty), null, lib);
  const tier1 = calcAll(buildTierState(st, 1, 1, 2000, st.annual_qty), null, lib);
  const tier2 = calcAll(buildTierState(st, 2, 1, 5000, st.annual_qty), null, lib);
  assert.notEqual(
    tier0.packing_ship,
    tier1.packing_ship,
    'tier 0 vs tier 1 packing_ship must differ (driven by packing override, not divisor)'
  );
  assert.notEqual(
    tier1.packing_ship,
    tier2.packing_ship,
    'tier 1 vs tier 2 packing_ship must differ'
  );
  // Sanity: each value should be > 0 and finite.
  for (const t of [tier0, tier1, tier2]) {
    assert.ok(
      Number.isFinite(t.packing_ship) && t.packing_ship > 0,
      'packing_ship positive finite'
    );
  }
});

// Sanity: calcPacking + calcShipping on the resolved tier shape produce
// expected math — confirms the merged state is what the formulas see.
test('calcPacking + calcShipping consume the merged tier state correctly', () => {
  const st = makeStdState({
    extra_moqs: [
      {
        moq: 2000,
        packing: {
          pcs_per_bag: 200,
          bags_per_box: 20,
          container_cost: 100,
          box_cost: 2,
          other_packing: 0.01,
          shipping_cost: 400,
          other_ship: 50,
          ship_qty: 2000,
        },
      },
    ],
  });
  const tier1 = buildTierState(st, 1, 1, 2000, st.annual_qty);
  // calcPacking = container/pcs + box/bags/pcs + other.
  // = 100/200 + 2/20/200 + 0.01 = 0.5 + 0.0005 + 0.01 = 0.5105
  assert.ok(
    Math.abs(calcPacking(tier1) - 0.5105) < 1e-9,
    `expected 0.5105, got ${calcPacking(tier1)}`
  );
  // calcShipping = (400 + 50) / 2000 = 0.225
  assert.equal(calcShipping(tier1), 0.225);
});

// ── Complex (aggregateComplex parent pack/ship) ──

test('aggregateComplex [pack/ship per-tier]: parent pack/ship picks up tier override', () => {
  // Anchor both tiers at the SAME ship_qty + moq so calcShipping divisor
  // is identical — otherwise calcShipping's `ship_qty || moq` fallback
  // creates a false-positive diff that masks whether the override merge
  // actually fires.
  const sp = createSubProduct('SP A');
  const cs = {
    moq: 1000,
    annual_qty: 60_000,
    selling_price: 1,
    site: 'VN',
    trade_mode: 'USD',
    subproducts: [sp],
    // Base parent pack/ship.
    packing_method: 'Sheet',
    pcs_per_bag: 100,
    bags_per_box: 10,
    box_cost: 1,
    other_packing: 0.01,
    shipping_cost: 200,
    other_ship: 50,
    ship_qty: 1000, // EXPLICIT — same as tier 1 below; pins divisor.
    extra_moqs: [
      // Tier 1: same MOQ + ship_qty as base, but pcs_per_bag overridden.
      // Pre-patch: override ignored → packing identical to base.
      // Post-patch: override merges → packing computes against pcs=500.
      {
        moq: 1000,
        packing: { pcs_per_bag: 500, ship_qty: 1000 },
      },
    ],
    active_moq_idx: 0,
  };
  const lib = { rate: [], ddl: { coverage: [], tool_life: {} } };
  const tier0 = aggregateComplex(cs, [sp], lib, 0);
  const tier1 = aggregateComplex(cs, [sp], lib, 1);
  // With ship_qty + moq pinned, the ONLY input difference is pcs_per_bag.
  // calcPacking(base) = 1/(10*100) + 0.01 = 0.011
  // calcPacking(tier1 post-patch) = 1/(10*500) + 0.01 = 0.0102
  // calcShipping shared: (200+50)/1000 = 0.25 → contributes equally.
  assert.notEqual(
    tier0.aggregate.packing_ship,
    tier1.aggregate.packing_ship,
    'tier 0 vs tier 1 packing_ship must differ — parent override should land via tierIdx'
  );
  // Spot-check: tier 1 packing_ship must reflect pcs_per_bag=500 contribution.
  // Per-unit parent ps = 0.0102 + 0.25 = 0.2602 (vs base 0.011 + 0.25 = 0.261).
  const expectedTier1 = 0.0102 + 0.25;
  assert.ok(
    Math.abs(tier1.aggregate.packing_ship - expectedTier1) < 1e-6,
    `expected tier 1 packing_ship ≈ ${expectedTier1}, got ${tier1.aggregate.packing_ship}`
  );
});
