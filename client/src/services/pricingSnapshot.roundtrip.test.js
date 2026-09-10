/**
 * Phase 3 round-trip integration test.
 *
 * Proves the end-to-end recompute-drift fix works:
 *   save with libV1 → master library mutates to V2 → reload → calcAll
 *   produces IDENTICAL numbers to save time. Phase 2 already verified
 *   the reader-side path; this file verifies writer + reader together
 *   so the audit-trail claim "saved cost == reloaded cost" is testable.
 *
 * No React / no buildQuoteData mock — just the pure helpers
 * (freezeLib + snapshotPricingParams + calcAll) wired end-to-end.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcAll, getActiveTierState } from './calcEngine.js';
import { freezeLib, snapshotPricingParams, createEmptySnapshot } from './pricingSnapshot.js';

function makeQuoteState(overrides = {}) {
  return {
    _schema_version: 3,
    moq: 1000,
    annual_qty: 5000,
    selling_price: 0.5,
    usd_rate: 24500,
    site: 'VN',
    trade_mode: 'USD(Normal)',
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    part_width: 50,
    part_length_md: 30,
    web_width_td: 200,
    sheet_length: 300,
    materials_main: [
      { code: 'MAT-A', _mid: 'm1', usage: 1, s_price: 5.0, g_price: 5.5, width: 200, cavities: 1 },
    ],
    materials_alt: [],
    materials_active: 'main',
    materials: [
      { code: 'MAT-A', _mid: 'm1', usage: 1, s_price: 5.0, g_price: 5.5, width: 200, cavities: 1 },
    ],
    inks: [{ _mid: 'i1', color: 'C', print_type: 'Flexo', s_price: 50, coverage_override: 0 }],
    processes: [
      {
        _mid: 'p1',
        workcenter: 'Slit',
        process_type: 'Slit',
        setup_h: 1,
        run_h: 0,
        speed: 100,
        efficiency: 0.85,
      },
    ],
    extra_moqs: [],
    num_moq: 1,
    active_moq_idx: 0,
    pricing_snapshot: null, // overridden per test
    ...overrides,
  };
}

function makeLib(rev) {
  if (rev === 'v2') {
    return {
      mat: [{ code: 'MAT-A', s_price: 6.0, g_price: 6.6 }],
      rate: [
        {
          workcenter: 'Slit',
          crew: 1,
          machine_rate: 14.3,
          labor_rate: 3.7,
          speed_uom: 'M/min',
          oh_cost: 0,
        },
        {
          workcenter: 'Manual',
          crew: 1,
          machine_rate: 0,
          labor_rate: 3.0,
          speed_uom: '—',
          oh_cost: 0,
        },
      ],
      ddl: { coverage: [{ pt: 'Flexo', cov: 0.6 }] },
    };
  }
  return {
    mat: [{ code: 'MAT-A', s_price: 5.0, g_price: 5.5 }],
    rate: [
      {
        workcenter: 'Slit',
        crew: 1,
        machine_rate: 11.92,
        labor_rate: 3.08,
        speed_uom: 'M/min',
        oh_cost: 0,
      },
      {
        workcenter: 'Manual',
        crew: 1,
        machine_rate: 0,
        labor_rate: 2.54,
        speed_uom: '—',
        oh_cost: 0,
      },
    ],
    ddl: { coverage: [{ pt: 'Flexo', cov: 0.5 }] },
  };
}

describe('Phase 3 round-trip — save+reload with master mutation', () => {
  test('FIX: save with libV1 → reload after libV1→V2 → numbers unchanged', () => {
    const libV1 = makeLib('v1');
    const libV2 = makeLib('v2');
    const stateAtSave = makeQuoteState();

    // ── SAVE phase ───────────────────────────────────────────────
    // Writer-side (buildQuoteData pattern): freezeLib + embed snapshot
    // + calcAll with the just-frozen snapshot for the persisted result.
    const snapshot = freezeLib(libV1, stateAtSave, { userId: 'henry' });
    const stateWithSnapshot = { ...stateAtSave, pricing_snapshot: snapshot };
    const tierAtSave = getActiveTierState(stateWithSnapshot);
    const resultAtSave = calcAll(tierAtSave, null, libV1, null, { snapshot });

    // ── RELOAD phase (master library has shifted to V2) ─────────
    // Reader-side (render path): snapshotPricingParams resolves the
    // persisted snapshot, calcAll uses it instead of libV2.
    const { source, snapshot: resolved } = snapshotPricingParams(
      stateWithSnapshot,
      libV2 // <-- master changed in between
    );
    const tierAtLoad = getActiveTierState(stateWithSnapshot);
    const resultAtLoad = calcAll(tierAtLoad, null, libV2, null, { snapshot: resolved });

    // Persisted snapshot wins
    assert.equal(source, 'persisted');
    assert.equal(resolved._captured_by, 'henry');
    assert.equal(resolved._site, 'VN');

    // Numbers identical despite master shift
    assert.equal(resultAtLoad.s_ttl, resultAtSave.s_ttl);
    assert.equal(resultAtLoad.bd_labor, resultAtSave.bd_labor);
    assert.equal(resultAtLoad.bd_overhead, resultAtSave.bd_overhead);
  });

  test('Sanity: WITHOUT snapshot, libV2 produces different numbers (proves drift exists)', () => {
    const stateNoSnap = makeQuoteState();
    const tierSt = getActiveTierState(stateNoSnap);
    const r1 = calcAll(tierSt, null, makeLib('v1'), null);
    const r2 = calcAll(tierSt, null, makeLib('v2'), null);
    assert.notEqual(
      r1.bd_labor,
      r2.bd_labor,
      'libV2 labor_rate=3.7 should change bd_labor vs libV1=3.08'
    );
  });

  test('Legacy quote (no snapshot persisted): synthesize on load, freeze on next save', () => {
    const libV1 = makeLib('v1');
    const legacyState = makeQuoteState({ pricing_snapshot: null });

    // RELOAD path resolves to synthesized snapshot (=current lib)
    const { source: loadSource, snapshot: synth } = snapshotPricingParams(legacyState, libV1);
    assert.equal(loadSource, 'synthesized');
    assert.equal(synth._synthesized, true);

    // Operator clicks Save → writer freezes a real snapshot, embeds.
    const realSnap = freezeLib(libV1, legacyState, { userId: 'henry' });
    const stateAfterSave = { ...legacyState, pricing_snapshot: realSnap };
    assert.equal(stateAfterSave.pricing_snapshot._synthesized, false);
    assert.equal(stateAfterSave.pricing_snapshot._captured_by, 'henry');
    assert.ok(stateAfterSave.pricing_snapshot._captured_at);

    // Next reload: source = 'persisted' (no more synthesize)
    const { source: nextSource } = snapshotPricingParams(stateAfterSave, libV1);
    assert.equal(nextSource, 'persisted');
  });

  test('Empty snapshot heal (Phase 1 migration): _captured_at null → still synthesizes on load', () => {
    // Heal-on-read shape: pricing_snapshot present but with null
    // _captured_at. snapshotPricingParams treats this as legacy +
    // synthesizes from lib (Phase 1 documented behavior).
    const stateAfterMigration = makeQuoteState({
      pricing_snapshot: createEmptySnapshot(),
    });
    const { source, snapshot } = snapshotPricingParams(stateAfterMigration, makeLib('v1'));
    assert.equal(source, 'synthesized');
    assert.equal(snapshot._synthesized, true);
  });

  test('Cross-site mismatch: operator flips state.site after freeze → _warnings surface', () => {
    const libVN = makeLib('v1');
    const state = makeQuoteState({ site: 'VN' });
    const snap = freezeLib(libVN, state, { userId: 'henry' });
    // Operator switches state.site to India without re-freezing.
    const stateIndia = { ...state, pricing_snapshot: snap, site: 'India' };
    const tierSt = getActiveTierState(stateIndia);
    const result = calcAll(tierSt, null, libVN, null, { snapshot: snap });
    assert.ok(Array.isArray(result._warnings), '_warnings array attached on site flip');
    assert.equal(result._warnings[0].type, 'site_mismatch');
    assert.equal(result._warnings[0].snapshot_site, 'VN');
    assert.equal(result._warnings[0].state_site, 'India');
  });
});

describe('Phase 3 — buildStdRowsPayload + buildCpxRowsPayload propagate snapshot', () => {
  test('buildStdRowsPayload pinned to snapshot — process rows stable across master shift', async () => {
    const { buildStdRowsPayload } = await import('./calcEngine.js');
    const libV1 = makeLib('v1');
    const libV2 = makeLib('v2');
    const state = makeQuoteState();
    const snap = freezeLib(libV1, state, { userId: 'henry' });
    const payloadV1 = buildStdRowsPayload(state, libV1, { snapshot: snap });
    const payloadV2 = buildStdRowsPayload(state, libV2, { snapshot: snap });
    // Snapshot wins on every rate lookup → process row shape identical
    // across libV1 / libV2. Stringify-compare to make the assertion
    // robust to the exact row-shape contract (which may evolve).
    assert.equal(
      JSON.stringify(payloadV1.rows?.processes),
      JSON.stringify(payloadV2.rows?.processes)
    );
  });
});
