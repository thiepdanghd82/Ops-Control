/**
 * Phase 2 — calcAll snapshot-reader integration tests.
 *
 * Covers:
 *   - Backward-compat (snapshot=null/undefined) — calcAll must produce
 *     identical results to the pre-Phase-2 lib-only path.
 *   - Snapshot stability: rate freezing isolates the result from
 *     subsequent master-library mutation.
 *   - Resolver fallback: snapshot misses on new materials/workcenters
 *     post-save fall through to lib (graceful, no crash).
 *   - Site-mismatch warning: collected in `_warnings` when both
 *     snapshot._site and state.site are set and diverge.
 *   - Public exports `getMatByCode` / `getRateByWC` stay BC for
 *     external callers (CostLibContext + SubProductRow).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcAll, calcProcess, getMatByCode, getRateByWC } from './calcEngine.js';
import { freezeLib, createEmptySnapshot } from './pricingSnapshot.js';

// Minimal-but-realistic tier-state + lib fixtures. calcAll requires
// `materials` + `inks` + `processes` arrays as a contract; the fixtures
// below are the smallest shape that exercises every code path the
// resolver touches (mat lookup, coverage lookup, rate lookup).
function makeTierState(overrides = {}) {
  return {
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
    materials: [
      { code: 'MAT-A', _mid: 'm1', usage: 1, s_price: 5.0, g_price: 5.5, width: 200, cavities: 1 },
    ],
    inks: [
      { _mid: 'i1', color: 'C', print_type: 'Flexo', s_price: 50, coverage_override: 0 },
    ],
    processes: [
      { _mid: 'p1', workcenter: 'Slit', process_type: 'Slit', setup_h: 1, run_h: 0, speed: 100, efficiency: 0.85 },
    ],
    extra_moqs: [],
    num_moq: 1,
    active_moq_idx: 0,
    ...overrides,
  };
}

function makeLibV1() {
  return {
    mat: [{ code: 'MAT-A', s_price: 5.0, g_price: 5.5 }],
    rate: [
      { workcenter: 'Slit', crew: 1, machine_rate: 11.92, labor_rate: 3.08, speed_uom: 'M/min', oh_cost: 0 },
      { workcenter: 'Manual', crew: 1, machine_rate: 0, labor_rate: 2.54, speed_uom: '—', oh_cost: 0 },
    ],
    ddl: { coverage: [{ pt: 'Flexo', cov: 0.5 }] },
    finance: { vat_pct: 0.1 },
  };
}

function makeLibV2() {
  // Master rates shifted upward; coverage rate also shifted. If a saved
  // snapshot freezes V1 values, calcAll(state, snapV1, libV2) must
  // produce identical numbers to calcAll(state, null, libV1).
  return {
    mat: [{ code: 'MAT-A', s_price: 6.0, g_price: 6.6 }],
    rate: [
      { workcenter: 'Slit', crew: 1, machine_rate: 14.3, labor_rate: 3.7, speed_uom: 'M/min', oh_cost: 0 },
      { workcenter: 'Manual', crew: 1, machine_rate: 0, labor_rate: 3.0, speed_uom: '—', oh_cost: 0 },
    ],
    ddl: { coverage: [{ pt: 'Flexo', cov: 0.6 }] },
    finance: { vat_pct: 0.1 },
  };
}

describe('calcAll — BC mode (snapshot=null/undefined)', () => {
  test('calcAll(st, null, lib, null) — legacy 4-arg signature unchanged', () => {
    const st = makeTierState();
    const lib = makeLibV1();
    const result = calcAll(st, null, lib, null);
    // Sanity: result populated, no crash
    assert.equal(typeof result, 'object');
    assert.ok(Number.isFinite(result.s_ttl), 's_ttl is a finite number');
    assert.ok(Number.isFinite(result.gm), 'gm is a finite number');
    assert.equal(result._warnings, undefined, 'no _warnings on BC path with no snapshot');
  });

  test('calcAll with options={} — empty options behaves identically to no options', () => {
    const st = makeTierState();
    const lib = makeLibV1();
    const noOpts = calcAll(st, null, lib, null);
    const emptyOpts = calcAll(st, null, lib, null, {});
    assert.equal(noOpts.s_ttl, emptyOpts.s_ttl);
    assert.equal(noOpts.gm, emptyOpts.gm);
    assert.equal(noOpts.bd_labor, emptyOpts.bd_labor);
    assert.equal(noOpts.bd_overhead, emptyOpts.bd_overhead);
  });

  test('public exports getMatByCode / getRateByWC — 2-arg signature preserved', () => {
    // External callers (CostLibContext + SubProductRow.jsx) keep working.
    const lib = makeLibV1();
    assert.equal(typeof getMatByCode, 'function');
    assert.equal(typeof getRateByWC, 'function');
    assert.equal(getMatByCode(lib, 'MAT-A').s_price, 5.0);
    assert.equal(getRateByWC(lib, 'Slit').labor_rate, 3.08);
  });
});

describe('calcAll — Snapshot reader (Phase 2 core)', () => {
  test('frozen snapshot isolates calc from master library mutation', () => {
    // Operator saves under libV1 — snapshot freezes the V1 rates.
    // Master library later shifts to V2.
    // calcAll(state, snapV1, libV2) MUST produce the V1 numbers, not V2.
    const st = makeTierState();
    const snapV1 = freezeLib(makeLibV1(), st);

    const atSave = calcAll(st, null, makeLibV1(), null);
    const atLoad = calcAll(st, null, makeLibV2(), null, { snapshot: snapV1 });

    // The key buckets that depend on rate/coverage lookup:
    assert.ok(
      Math.abs(atSave.s_ttl - atLoad.s_ttl) < 1e-4,
      `s_ttl drift > 0.0001: save=${atSave.s_ttl}, load=${atLoad.s_ttl}`
    );
    assert.ok(
      Math.abs(atSave.bd_labor - atLoad.bd_labor) < 1e-4,
      `bd_labor drift > 0.0001: save=${atSave.bd_labor}, load=${atLoad.bd_labor}`
    );
    assert.ok(
      Math.abs(atSave.bd_overhead - atLoad.bd_overhead) < 1e-4,
      `bd_overhead drift > 0.0001: save=${atSave.bd_overhead}, load=${atLoad.bd_overhead}`
    );
  });

  test('snapshot=null + libV1 vs snapshot=null + libV2 — DO differ (sanity: lib reads actually change calc)', () => {
    // Without a snapshot, calcAll reads lib direct. libV2 has different
    // rates so the result MUST differ from libV1. If they match, then
    // either the test fixtures are degenerate or the lib reads aren't
    // wired at all — this sanity guard catches both.
    const st = makeTierState();
    const r1 = calcAll(st, null, makeLibV1(), null);
    const r2 = calcAll(st, null, makeLibV2(), null);
    assert.notEqual(r1.bd_labor, r2.bd_labor, 'libV2 labor_rate=3.7 should change bd_labor vs libV1=3.08');
  });

  test('snapshot V1 + libV1 === snapshot V1 + libV2 (stability)', () => {
    const st = makeTierState();
    const snapV1 = freezeLib(makeLibV1(), st);
    const withV1lib = calcAll(st, null, makeLibV1(), null, { snapshot: snapV1 });
    const withV2lib = calcAll(st, null, makeLibV2(), null, { snapshot: snapV1 });
    // Snapshot wins on every hit, so master change is invisible.
    assert.equal(withV1lib.s_ttl, withV2lib.s_ttl);
    assert.equal(withV1lib.bd_labor, withV2lib.bd_labor);
    assert.equal(withV1lib.bd_overhead, withV2lib.bd_overhead);
  });

  test('empty snapshot (legacy quote) → identical to BC mode', () => {
    const st = makeTierState();
    const lib = makeLibV1();
    const empty = createEmptySnapshot();
    const r1 = calcAll(st, null, lib, null);
    const r2 = calcAll(st, null, lib, null, { snapshot: empty });
    assert.equal(r1.s_ttl, r2.s_ttl);
    assert.equal(r1.bd_labor, r2.bd_labor);
  });

  test('snapshot missing material → fallback lib (post-save operator added new mat)', () => {
    const st = makeTierState();
    const snapV1 = freezeLib(makeLibV1(), st);
    // Operator later adds MAT-B to the quote — snapshot doesn't know it.
    const stWithNewMat = {
      ...st,
      materials: [
        ...st.materials,
        { code: 'MAT-B', _mid: 'm2', usage: 1, s_price: 3.0, g_price: 3.3, width: 200, cavities: 1 },
      ],
    };
    const libExtended = {
      ...makeLibV1(),
      mat: [...makeLibV1().mat, { code: 'MAT-B', s_price: 3.0, g_price: 3.3 }],
    };
    // Resolver: snapshot HIT on MAT-A, snapshot MISS → fallback lib on MAT-B.
    // No crash; result includes both contributions.
    const result = calcAll(stWithNewMat, null, libExtended, null, { snapshot: snapV1 });
    assert.ok(Number.isFinite(result.s_ttl));
    assert.ok(result.s_ttl > 0);
  });

  test('snapshot missing workcenter → fallback lib (operator added new wc)', () => {
    const st = makeTierState();
    const snapV1 = freezeLib(makeLibV1(), st);
    const stWithNewWc = {
      ...st,
      processes: [
        ...st.processes,
        { _mid: 'p2', workcenter: 'Laminate', process_type: 'Lam', setup_h: 0.5, run_h: 0, speed: 50, efficiency: 0.85 },
      ],
    };
    const libExtended = {
      ...makeLibV1(),
      rate: [
        ...makeLibV1().rate,
        { workcenter: 'Laminate', crew: 1, machine_rate: 15, labor_rate: 4, speed_uom: 'M/min', oh_cost: 0 },
      ],
    };
    const result = calcAll(stWithNewWc, null, libExtended, null, { snapshot: snapV1 });
    assert.ok(Number.isFinite(result.bd_labor));
    assert.ok(result.bd_labor > 0);
  });
});

describe('calcProcess — resolver-aware (Phase 2 calcAll-internal path)', () => {
  test('calcProcess(p, st, moq, lib) without options falls through to lib', () => {
    // BC path: external callers pass 4 args, no resolver — lib direct.
    const lib = makeLibV1();
    const proc = { workcenter: 'Slit', process_type: 'Slit', setup_h: 1, run_h: 0, speed: 100, efficiency: 0.85 };
    const st = makeTierState();
    const r = calcProcess(proc, st, 1000, lib);
    assert.ok(Number.isFinite(r.run_mach || 0));
  });

  test('calcProcess with options.resolver — snapshot HIT, lib ignored', () => {
    const snap = freezeLib(makeLibV1(), makeTierState());
    // Pass libV2 (different rates) — resolver pulls from snapV1 instead.
    const proc = { workcenter: 'Slit', process_type: 'Slit', setup_h: 1, run_h: 0, speed: 100, efficiency: 0.85 };
    const st = makeTierState();
    const fromSnap = calcProcess(proc, st, 1000, makeLibV2(), {
      resolver: {
        getRate(wc) {
          if (wc === 'Slit') return snap.rates.Slit;
          if (wc === 'Manual') return { labor_rate: 2.54 };
          return null;
        },
      },
    });
    // Reference: same call but with libV1 + no resolver.
    const ref = calcProcess(proc, st, 1000, makeLibV1());
    assert.equal(fromSnap.mach_rate, ref.mach_rate, 'snapshot resolver pinned to V1 rate');
  });
});

describe('calcAll — Site-mismatch warnings', () => {
  function buildSnapWithSite(site) {
    return { ...freezeLib(makeLibV1(), { ...makeTierState(), site }), _site: site };
  }

  test('snapshot._site === state.site → no warning', () => {
    const st = makeTierState({ site: 'VN' });
    const snap = buildSnapWithSite('VN');
    const result = calcAll(st, null, makeLibV1(), null, { snapshot: snap });
    assert.equal(result._warnings, undefined);
  });

  test('snapshot._site !== state.site → site_mismatch warning attached', () => {
    const st = makeTierState({ site: 'India' });
    const snap = buildSnapWithSite('VN');
    const result = calcAll(st, null, makeLibV1(), null, { snapshot: snap });
    assert.ok(Array.isArray(result._warnings), '_warnings array attached');
    assert.equal(result._warnings.length, 1);
    assert.equal(result._warnings[0].type, 'site_mismatch');
    assert.equal(result._warnings[0].snapshot_site, 'VN');
    assert.equal(result._warnings[0].state_site, 'India');
    assert.match(result._warnings[0].message, /Site mismatch/);
  });

  test('snapshot._site = null (legacy/synthesized) → no warning even if state.site set', () => {
    const st = makeTierState({ site: 'VN' });
    const snap = { ...createEmptySnapshot(), _site: null };
    const result = calcAll(st, null, makeLibV1(), null, { snapshot: snap });
    assert.equal(result._warnings, undefined);
  });

  test('state.site = null → no warning even if snapshot._site set', () => {
    const st = makeTierState({ site: null });
    const snap = buildSnapWithSite('VN');
    const result = calcAll(st, null, makeLibV1(), null, { snapshot: snap });
    assert.equal(result._warnings, undefined);
  });

  test('options.warnSiteMismatch=false → no warning even on diverge', () => {
    const st = makeTierState({ site: 'India' });
    const snap = buildSnapWithSite('VN');
    const result = calcAll(st, null, makeLibV1(), null, {
      snapshot: snap,
      warnSiteMismatch: false,
    });
    assert.equal(result._warnings, undefined);
  });

  test('options.collectWarnings=false → no _warnings field even on diverge', () => {
    const st = makeTierState({ site: 'India' });
    const snap = buildSnapWithSite('VN');
    const result = calcAll(st, null, makeLibV1(), null, {
      snapshot: snap,
      collectWarnings: false,
    });
    assert.equal(result._warnings, undefined);
  });

  test('site mismatch does NOT corrupt the cost result itself', () => {
    // The snapshot wins on every lookup; the warning is metadata only.
    // s_ttl etc. should equal what we'd get with snapshot + same site.
    const stVN = makeTierState({ site: 'VN' });
    const stIndia = makeTierState({ site: 'India' });
    const snap = buildSnapWithSite('VN');
    const rA = calcAll(stVN, null, makeLibV1(), null, { snapshot: snap });
    const rB = calcAll(stIndia, null, makeLibV1(), null, { snapshot: snap });
    assert.equal(rA.s_ttl, rB.s_ttl, 'cost numbers identical; only _warnings differs');
  });
});

describe('calcAll — Backward-compat with existing `warnings` (scrap_pct) field', () => {
  test('existing warnings array still emitted; _warnings is separate channel', () => {
    // Build a state that trips the scrap_pct >=0.95 guard (existing
    // warning string array) AND has a site mismatch (new _warnings).
    const st = {
      ...makeTierState({ site: 'India' }),
      processes: [
        { _mid: 'p1', workcenter: 'Slit', process_type: 'Slit', setup_h: 1, run_h: 0, scrap_pct: 0.99 },
      ],
    };
    const snap = { ...freezeLib(makeLibV1(), st), _site: 'VN' };
    const result = calcAll(st, null, makeLibV1(), null, { snapshot: snap });
    // Existing scrap_pct string warning still surfaces in `warnings`:
    assert.ok(Array.isArray(result.warnings));
    assert.ok(result.warnings.some((w) => typeof w === 'string' && /scrap/i.test(w)));
    // New site-mismatch warning surfaces separately in `_warnings`:
    assert.ok(Array.isArray(result._warnings));
    assert.equal(result._warnings[0].type, 'site_mismatch');
  });
});
