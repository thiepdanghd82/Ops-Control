import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptySnapshot,
  freezeLib,
  snapshotPricingParams,
  getMatFromSnapshot,
  getRateFromSnapshot,
  getCoverageFromSnapshot,
  getSnapshotSite,
  getToolLifeFromSnapshot,
  getClickChargesFromSnapshot,
  detectLegacyPartialFields,
} from './pricingSnapshot.js';

describe('createEmptySnapshot', () => {
  test('canonical shape — all 10 keys default to safe-empty (PR-A added tool_life + click_charges)', () => {
    const s = createEmptySnapshot();
    assert.deepEqual(s, {
      _captured_at: null,
      _captured_by: null,
      _synthesized: false,
      _lib_version: null,
      _site: null,
      materials: {},
      coverage: [],
      rates: {},
      tool_life: {},
      click_charges: {},
    });
  });

  test('each call returns a fresh object (no shared mutation hazard)', () => {
    const a = createEmptySnapshot();
    const b = createEmptySnapshot();
    a.materials['MAT-A'] = { s_price: 1 };
    a.coverage.push({ x: 1 });
    a.tool_life['RDC Die'] = 99999;
    a.click_charges[100] = 0.99;
    assert.deepEqual(b.materials, {});
    assert.deepEqual(b.coverage, []);
    assert.deepEqual(b.tool_life, {});
    assert.deepEqual(b.click_charges, {});
  });
});

describe('freezeLib — materials cluster (USED rows only)', () => {
  const LIB = {
    mat: [
      { code: 'MAT-A', s_price: 5.0, g_price: 5.5 },
      { code: 'MAT-B', s_price: 3.0, g_price: 3.3 },
      { code: 'MAT-UNUSED', s_price: 99 },
    ],
    rate: [],
    ddl: { coverage: [] },
  };

  test('Std quote: freezes only material codes referenced by state.materials', () => {
    const snap = freezeLib(LIB, {
      materials: [{ code: 'MAT-A' }, { code: 'MAT-B' }],
    });
    assert.deepEqual(Object.keys(snap.materials).sort(), ['MAT-A', 'MAT-B']);
    assert.equal(snap.materials['MAT-A'].s_price, 5.0);
    assert.equal(snap.materials['MAT-A'].g_price, 5.5);
    assert.equal(snap.materials['MAT-UNUSED'], undefined);
  });

  test('Cpx quote: walks every subproducts[i].materials', () => {
    const snap = freezeLib(LIB, {
      subproducts: [{ materials: [{ code: 'MAT-A' }] }, { materials: [{ code: 'MAT-B' }] }],
    });
    assert.deepEqual(Object.keys(snap.materials).sort(), ['MAT-A', 'MAT-B']);
  });

  test('material code referenced but missing from lib → null entry', () => {
    const snap = freezeLib(LIB, { materials: [{ code: 'MAT-DELETED' }] });
    assert.equal(snap.materials['MAT-DELETED'], null);
  });

  test('frozen row is a copy — mutating snapshot does not mutate lib', () => {
    const snap = freezeLib(LIB, { materials: [{ code: 'MAT-A' }] });
    snap.materials['MAT-A'].s_price = 999;
    assert.equal(LIB.mat[0].s_price, 5.0);
  });

  test('blank / null / missing code in materials silently skipped', () => {
    const snap = freezeLib(LIB, {
      materials: [{ code: 'MAT-A' }, { code: '' }, { code: null }, {}, null],
    });
    assert.deepEqual(Object.keys(snap.materials), ['MAT-A']);
  });
});

describe('freezeLib — Inks coverage cluster (entire array)', () => {
  test('snapshots whole lib.ddl.coverage', () => {
    const lib = {
      mat: [],
      rate: [],
      ddl: {
        coverage: [
          { pt: 'Flexo', rate: 0.5 },
          { pt: 'Indigo', rate: 0.7 },
        ],
      },
    };
    const snap = freezeLib(lib, {});
    assert.equal(snap.coverage.length, 2);
    assert.equal(snap.coverage[0].pt, 'Flexo');
  });

  test('coverage is deep-cloned — snapshot mutation does not leak', () => {
    const lib = {
      mat: [],
      rate: [],
      ddl: { coverage: [{ pt: 'Flexo', rate: 0.5 }] },
    };
    const snap = freezeLib(lib, {});
    snap.coverage[0].rate = 99;
    assert.equal(lib.ddl.coverage[0].rate, 0.5);
  });

  test('lib.ddl absent → coverage []', () => {
    const snap = freezeLib({ mat: [], rate: [] }, {});
    assert.deepEqual(snap.coverage, []);
  });
});

describe('freezeLib — Rate cluster (pre-filtered lib.rate per active site)', () => {
  // lib.rate arriving here is already filtered by activeSite at
  // CostLibContext. freezeLib reads it direct, no multi-site logic.
  const VN_RATES = [
    {
      workcenter: 'Pre_Cut',
      crew: 1,
      machine_rate: 0,
      labor_rate: 2.54,
      speed_uom: '—',
      oh_cost: 0,
    },
    {
      workcenter: 'Slit',
      crew: 1,
      machine_rate: 11.92,
      labor_rate: 3.08,
      speed_uom: 'M/min',
      oh_cost: 0,
    },
    {
      workcenter: 'Laminate(Roll)',
      crew: 2,
      machine_rate: 11.92,
      labor_rate: 2.92,
      speed_uom: 'M/min',
      oh_cost: 0.5,
    },
  ];

  test('freeze FULL row spread from pre-filtered lib.rate (machine+labor+oh+crew+speed_uom)', () => {
    const snap = freezeLib(
      { mat: [], rate: VN_RATES, ddl: { coverage: [] } },
      { processes: [{ workcenter: 'Slit' }], site: 'VN' }
    );
    assert.deepEqual(snap.rates['Slit'], {
      workcenter: 'Slit',
      crew: 1,
      machine_rate: 11.92,
      labor_rate: 3.08,
      speed_uom: 'M/min',
      oh_cost: 0,
    });
  });

  test('Cpx: walks every subproducts[i].processes', () => {
    const snap = freezeLib(
      { mat: [], rate: VN_RATES, ddl: { coverage: [] } },
      {
        site: 'VN',
        subproducts: [
          { processes: [{ workcenter: 'Pre_Cut' }] },
          { processes: [{ workcenter: 'Slit' }] },
        ],
      }
    );
    assert.deepEqual(Object.keys(snap.rates).sort(), ['Pre_Cut', 'Slit']);
  });

  test('Std + Cpx mixed: dedupes the workcenter Set', () => {
    const snap = freezeLib(
      { mat: [], rate: VN_RATES, ddl: { coverage: [] } },
      {
        processes: [{ workcenter: 'Slit' }],
        subproducts: [{ processes: [{ workcenter: 'Slit' }, { workcenter: 'Pre_Cut' }] }],
      }
    );
    assert.deepEqual(Object.keys(snap.rates).sort(), ['Pre_Cut', 'Slit']);
  });

  test('workcenter referenced but missing from lib → null', () => {
    const snap = freezeLib(
      { mat: [], rate: VN_RATES, ddl: { coverage: [] } },
      { processes: [{ workcenter: 'UNKNOWN' }] }
    );
    assert.equal(snap.rates['UNKNOWN'], null);
  });

  test('frozen rate row is a copy — mutating snapshot does not mutate lib', () => {
    const lib = { mat: [], rate: [...VN_RATES], ddl: { coverage: [] } };
    const snap = freezeLib(lib, { processes: [{ workcenter: 'Slit' }] });
    snap.rates['Slit'].labor_rate = 999;
    assert.equal(lib.rate.find((r) => r.workcenter === 'Slit').labor_rate, 3.08);
  });

  test('blank / null / missing workcenter in processes silently skipped', () => {
    const snap = freezeLib(
      { mat: [], rate: VN_RATES, ddl: { coverage: [] } },
      { processes: [{ workcenter: 'Slit' }, { workcenter: '' }, { workcenter: null }, {}, null] }
    );
    assert.deepEqual(Object.keys(snap.rates), ['Slit']);
  });
});

describe('freezeLib — site context capture (_site metadata)', () => {
  const EMPTY_LIB = { mat: [], rate: [], ddl: { coverage: [] } };

  test('_site populated from state.site', () => {
    assert.equal(freezeLib(EMPTY_LIB, { site: 'VN' })._site, 'VN');
    assert.equal(freezeLib(EMPTY_LIB, { site: 'India' })._site, 'India');
  });

  test('_site = null when state has no site field', () => {
    assert.equal(freezeLib(EMPTY_LIB, {})._site, null);
  });

  test('_site = null when state is null/undefined', () => {
    assert.equal(freezeLib(EMPTY_LIB, null)._site, null);
    assert.equal(freezeLib(EMPTY_LIB, undefined)._site, null);
  });

  test('audit-trail integrity: rate frozen under VN tag stays paired with _site=VN', () => {
    // Phase 2 will compare snapshot._site vs current state.site and
    // emit a warning if they diverge — this guards that pairing.
    const lib = {
      mat: [],
      rate: [{ workcenter: 'Slit', labor_rate: 3.08 }],
      ddl: { coverage: [] },
    };
    const snap = freezeLib(lib, { processes: [{ workcenter: 'Slit' }], site: 'VN' });
    assert.equal(snap._site, 'VN');
    assert.equal(snap.rates['Slit'].labor_rate, 3.08);
  });
});

describe('freezeLib — metadata + edge cases', () => {
  test('_captured_at is a valid ISO timestamp', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {});
    assert.match(snap._captured_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('_synthesized defaults false (this IS the persisted-flavor freeze)', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {});
    assert.equal(snap._synthesized, false);
  });

  test('_lib_version reads from lib._version (falls back to null when absent)', () => {
    const withVersion = freezeLib(
      { _version: 'v3.1', mat: [], rate: [], ddl: { coverage: [] } },
      {}
    );
    assert.equal(withVersion._lib_version, 'v3.1');
    const without = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {});
    assert.equal(without._lib_version, null);
  });

  test('_captured_by defaults to null when options omitted (legacy callers)', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {});
    assert.equal(snap._captured_by, null);
  });

  test('_captured_by reads options.userId — Phase 3 explicit-option pattern', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {}, { userId: 'henry' });
    assert.equal(snap._captured_by, 'henry');
  });

  test('_captured_by accepts numeric user id (server may surface number)', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {}, { userId: 42 });
    assert.equal(snap._captured_by, 42);
  });

  test('_captured_by falls back to null when options.userId explicitly null', () => {
    const snap = freezeLib({ mat: [], rate: [], ddl: { coverage: [] } }, {}, { userId: null });
    assert.equal(snap._captured_by, null);
  });

  test('lib=null → empty snapshot (no throw)', () => {
    assert.deepEqual(freezeLib(null, {}), createEmptySnapshot());
    assert.deepEqual(freezeLib(undefined, {}), createEmptySnapshot());
  });
});

describe('snapshotPricingParams resolver — 3 branches', () => {
  test('persisted: state has real snapshot → returned as-is, lib ignored', () => {
    const state = {
      pricing_snapshot: {
        _captured_at: '2026-06-09T10:00:00.000Z',
        _captured_by: null,
        _synthesized: false,
        _lib_version: null,
        _site: 'VN',
        materials: { 'MAT-A': { s_price: 5 } },
        coverage: [],
        rates: {},
      },
    };
    const result = snapshotPricingParams(state, /* lib */ { mat: [] });
    assert.equal(result.source, 'persisted');
    assert.equal(result.snapshot._site, 'VN');
    assert.equal(result.snapshot.materials['MAT-A'].s_price, 5);
  });

  test('synthesized: legacy quote (no snapshot) + lib present → freezeLib + _synthesized:true', () => {
    const result = snapshotPricingParams(
      { materials: [{ code: 'MAT-A' }], site: 'VN' },
      {
        mat: [{ code: 'MAT-A', s_price: 5 }],
        rate: [],
        ddl: { coverage: [] },
      }
    );
    assert.equal(result.source, 'synthesized');
    assert.equal(result.snapshot._synthesized, true);
    assert.equal(result.snapshot._site, 'VN');
    assert.equal(result.snapshot.materials['MAT-A'].s_price, 5);
  });

  test('synthesized: persisted snapshot but flagged _synthesized → re-synthesize', () => {
    // A Phase 1 quote loaded once through heal-on-read carries
    // `_synthesized: true` until the operator re-saves; treat as legacy.
    const state = {
      pricing_snapshot: {
        _captured_at: '2026-01-01T00:00:00.000Z',
        _synthesized: true,
        materials: {},
        coverage: [],
        rates: {},
      },
      materials: [{ code: 'MAT-A' }],
    };
    const lib = { mat: [{ code: 'MAT-A', s_price: 7 }], rate: [], ddl: { coverage: [] } };
    const result = snapshotPricingParams(state, lib);
    assert.equal(result.source, 'synthesized');
    // Fresh synthesize used live lib, not the stale heal-on-read shell.
    assert.equal(result.snapshot.materials['MAT-A'].s_price, 7);
  });

  test('empty: no snapshot + no lib → empty shell', () => {
    const result = snapshotPricingParams({}, null);
    assert.equal(result.source, 'empty');
    assert.deepEqual(result.snapshot, createEmptySnapshot());
  });

  test('empty: null state + null lib → empty', () => {
    const result = snapshotPricingParams(null, null);
    assert.equal(result.source, 'empty');
  });
});

describe('Accessor helpers', () => {
  const SNAPSHOT = {
    _site: 'VN',
    materials: { 'MAT-A': { s_price: 5, g_price: 5.5 } },
    rates: {
      Slit: { workcenter: 'Slit', machine_rate: 11.92, labor_rate: 3.08, oh_cost: 0, crew: 1 },
    },
    coverage: [{ pt: 'Flexo', rate: 0.5 }],
  };

  describe('getMatFromSnapshot', () => {
    test('present code → row', () => {
      assert.equal(getMatFromSnapshot(SNAPSHOT, 'MAT-A').s_price, 5);
    });
    test('missing code → null', () => {
      assert.equal(getMatFromSnapshot(SNAPSHOT, 'MISSING'), null);
    });
    test('null snapshot → null', () => {
      assert.equal(getMatFromSnapshot(null, 'MAT-A'), null);
    });
  });

  describe('getRateFromSnapshot', () => {
    test('returns FULL row — operator needs machine + labor + oh + crew, not just one field', () => {
      const r = getRateFromSnapshot(SNAPSHOT, 'Slit');
      assert.equal(r.machine_rate, 11.92);
      assert.equal(r.labor_rate, 3.08);
      assert.equal(r.oh_cost, 0);
      assert.equal(r.crew, 1);
    });
    test('missing workcenter → null', () => {
      assert.equal(getRateFromSnapshot(SNAPSHOT, 'MISSING'), null);
    });
    test('null snapshot → null', () => {
      assert.equal(getRateFromSnapshot(null, 'Slit'), null);
    });
  });

  describe('getCoverageFromSnapshot', () => {
    test('present → array', () => {
      assert.equal(getCoverageFromSnapshot(SNAPSHOT).length, 1);
    });
    test('null snapshot → []', () => {
      assert.deepEqual(getCoverageFromSnapshot(null), []);
    });
    test('snapshot without coverage → []', () => {
      assert.deepEqual(getCoverageFromSnapshot({}), []);
    });
  });

  describe('getSnapshotSite', () => {
    test('present → site string', () => {
      assert.equal(getSnapshotSite(SNAPSHOT), 'VN');
    });
    test('null snapshot → null', () => {
      assert.equal(getSnapshotSite(null), null);
    });
    test('snapshot without _site → null', () => {
      assert.equal(getSnapshotSite({}), null);
    });
  });
});

// ─── PR-A new clusters (tool_life + click_charges) ─────────────────

describe('PR-A freezeLib — tool_life cluster', () => {
  const LIB = {
    mat: [{ code: 'M', s_price: 1, g_price: 1 }],
    rate: [{ workcenter: 'WC', machine_rate: 1, labor_rate: 1, crew: 1 }],
    ddl: {
      coverage: [],
      click_charges: {},
      tool_life: { 'RDC Die': 100000, 'Pinacle die': 60000, Jig: 500000, woodie: 30000 },
    },
  };

  test('captures ONLY tool_types referenced by quote processes (snapshot-gọn)', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [
        { workcenter: 'WC', tool_type: 'RDC Die' },
        { workcenter: 'WC', tool_type: 'Jig' },
      ],
    };
    const snap = freezeLib(LIB, state);
    assert.deepEqual(snap.tool_life, { 'RDC Die': 100000, Jig: 500000 });
    // Pinacle die + woodie NOT captured because quote doesn't use them
    assert.ok(!('Pinacle die' in snap.tool_life));
    assert.ok(!('woodie' in snap.tool_life));
  });

  test('walks Cpx subproduct processes', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [],
      subproducts: [
        {
          materials: [{ code: 'M' }],
          processes: [{ workcenter: 'WC', tool_type: 'woodie' }],
        },
      ],
    };
    const snap = freezeLib(LIB, state);
    assert.equal(snap.tool_life.woodie, 30000);
  });

  test('quote with no die-cut → empty tool_life dict (not omitted)', () => {
    const state = { materials: [{ code: 'M' }], processes: [{ workcenter: 'WC' }] };
    const snap = freezeLib(LIB, state);
    assert.deepEqual(snap.tool_life, {});
    // Key MUST be present so detectLegacyPartialFields doesn't false-flag
    assert.ok(Object.prototype.hasOwnProperty.call(snap, 'tool_life'));
  });

  test('tool_type referencing key NOT in lib → field absent from snapshot (no junk)', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [{ workcenter: 'WC', tool_type: 'pinncle die' }], // typo
    };
    const snap = freezeLib(LIB, state);
    assert.deepEqual(snap.tool_life, {});
  });
});

describe('PR-A freezeLib — click_charges cluster', () => {
  const LIB_INDIGO = {
    mat: [{ code: 'M' }],
    rate: [{ workcenter: 'WC' }],
    ddl: {
      coverage: [],
      click_charges: { 100: 0.5, 1000: 3.0 },
      tool_life: {},
    },
  };

  test('captures full click_charges table when quote has Indigo ink', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [],
      inks: [{ print_type: 'Indigo6800' }],
    };
    const snap = freezeLib(LIB_INDIGO, state);
    assert.deepEqual(snap.click_charges, { 100: 0.5, 1000: 3.0 });
  });

  test('quote with no Indigo ink → empty click_charges dict (no bytes wasted)', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [],
      inks: [{ print_type: 'Flexo' }],
    };
    const snap = freezeLib(LIB_INDIGO, state);
    assert.deepEqual(snap.click_charges, {});
    assert.ok(Object.prototype.hasOwnProperty.call(snap, 'click_charges'));
  });

  test('walks Cpx subproduct inks for Indigo detection', () => {
    const state = {
      materials: [{ code: 'M' }],
      processes: [],
      subproducts: [{ materials: [{ code: 'M' }], inks: [{ print_type: 'Indigo7800' }] }],
    };
    const snap = freezeLib(LIB_INDIGO, state);
    assert.deepEqual(snap.click_charges, { 100: 0.5, 1000: 3.0 });
  });
});

describe('PR-A accessors — getToolLifeFromSnapshot + getClickChargesFromSnapshot', () => {
  const SNAP = { tool_life: { 'RDC Die': 100000 }, click_charges: { 100: 0.5 } };

  test('getToolLifeFromSnapshot — hit returns numeric value', () => {
    assert.equal(getToolLifeFromSnapshot(SNAP, 'RDC Die'), 100000);
  });
  test('getToolLifeFromSnapshot — miss returns 0 (matches pre-snapshot fallthrough)', () => {
    assert.equal(getToolLifeFromSnapshot(SNAP, 'woodie'), 0);
  });
  test('getToolLifeFromSnapshot — null snapshot → 0', () => {
    assert.equal(getToolLifeFromSnapshot(null, 'RDC Die'), 0);
  });
  test('getToolLifeFromSnapshot — snapshot lacks tool_life key → 0', () => {
    assert.equal(getToolLifeFromSnapshot({}, 'RDC Die'), 0);
  });

  test('getClickChargesFromSnapshot — present returns dict', () => {
    assert.deepEqual(getClickChargesFromSnapshot(SNAP), { 100: 0.5 });
  });
  test('getClickChargesFromSnapshot — null snapshot → {}', () => {
    assert.deepEqual(getClickChargesFromSnapshot(null), {});
  });
  test('getClickChargesFromSnapshot — snapshot lacks click_charges → {}', () => {
    assert.deepEqual(getClickChargesFromSnapshot({}), {});
  });
});

describe('PR-A detectLegacyPartialFields — legacy snapshot detection', () => {
  test('full PR-A snapshot → no missing fields', () => {
    const snap = createEmptySnapshot();
    assert.deepEqual(detectLegacyPartialFields(snap), []);
  });

  test('legacy snapshot missing tool_life → flagged', () => {
    const legacy = { _captured_at: 'T', materials: {}, rates: {}, coverage: [], click_charges: {} };
    assert.deepEqual(detectLegacyPartialFields(legacy), ['tool_life']);
  });

  test('legacy snapshot missing click_charges → flagged', () => {
    const legacy = { _captured_at: 'T', materials: {}, rates: {}, coverage: [], tool_life: {} };
    assert.deepEqual(detectLegacyPartialFields(legacy), ['click_charges']);
  });

  test('legacy snapshot missing BOTH new clusters → both flagged', () => {
    const legacy = { _captured_at: 'T', materials: {}, rates: {}, coverage: [] };
    assert.deepEqual(detectLegacyPartialFields(legacy), ['tool_life', 'click_charges']);
  });

  test('null snapshot → empty array (no flagging — caller handles missing snapshot separately)', () => {
    assert.deepEqual(detectLegacyPartialFields(null), []);
  });

  test('EMPTY dict ({}) is considered PRESENT, not missing', () => {
    // Distinct from "key absent". Empty means "quote had no die-cut /
    // no Indigo → freeze was a no-op (correctly captured)". Distinct
    // from "key absent" which means pre-PR-A snapshot lacked freeze.
    const snap = { tool_life: {}, click_charges: {} };
    assert.deepEqual(detectLegacyPartialFields(snap), []);
  });
});
