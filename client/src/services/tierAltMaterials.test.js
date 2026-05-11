// @ts-check
/**
 * Per-tier alt-materials override tests (Sprint S-ALT-MAT, PR #C).
 *
 * Three surfaces under test:
 *
 *   1. Std calc engine — buildTierState + getActiveTierState pick
 *      `mat_setup_lm` when state.materials_active='main', `mat_setup_lm_alt`
 *      when active='alt'. Index integrity: tier overrides line up with
 *      whichever set is the active mirror.
 *
 *   2. Cpx applyCplxTierToSp — per-SP branching (amendment A): SP-A's
 *      override map (sp_mat_setup_lm vs sp_mat_setup_lm_alt) picked
 *      independently of SP-B's. Mixed scenarios at the same tier.
 *
 *   3. Boundary / regression — when *_alt is undefined the calc engine
 *      MUST fall back to no override (alt rows use base setup_lm), not
 *      silently apply the main-side override against the alt array.
 *
 *   Also includes Std + Cpx regression gates per the PR #C spec:
 *   - PR #A main-only behavior bit-identical with no alt override set.
 *   - PR #B all-main / all-alt Cpx output unchanged.
 *
 * Runner: node --test src/services/tierAltMaterials.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTierState, getActiveTierState, applyCplxTierToSp } from './calcEngine.js';

// Tiny factory helpers — synthesized fixtures keep these tests
// reproducible across dev boxes (no dependency on quote_history.json).
function stdFixture({ active = 'main', extra = {} } = {}) {
  return {
    moq: 1000,
    annual_qty: 10000,
    selling_price: 0.2,
    active_moq_idx: 0,
    num_moq: 2,
    materials_main: [
      { _mid: 'm_a', code: 'M001', setup_lm: 100 },
      { _mid: 'm_b', code: 'M002', setup_lm: 200 },
    ],
    materials_alt: [
      { _mid: 'a_a', code: 'ALT001', setup_lm: 500 },
      { _mid: 'a_b', code: 'ALT002', setup_lm: 600 },
    ],
    materials_active: active,
    // Mirror reflects active set (reducer invariant from PR #A).
    materials:
      active === 'alt'
        ? [
            { _mid: 'a_a', code: 'ALT001', setup_lm: 500 },
            { _mid: 'a_b', code: 'ALT002', setup_lm: 600 },
          ]
        : [
            { _mid: 'm_a', code: 'M001', setup_lm: 100 },
            { _mid: 'm_b', code: 'M002', setup_lm: 200 },
          ],
    inks: [],
    processes: [],
    extra_moqs: [{ moq: 5000, price: 0.18, eau: 50000, ...extra }],
  };
}

function spFixture({
  code = 'SP-A',
  active = 'main',
  mainSetup = [100, 200],
  altSetup = [500, 600],
} = {}) {
  const main = mainSetup.map((v, i) => ({
    _mid: `mm_${code}_${i}`,
    code: `${code}-MAT-${i}`,
    setup_lm: v,
  }));
  const alt = altSetup.map((v, i) => ({
    _mid: `ma_${code}_${i}`,
    code: `${code}-ALT-${i}`,
    setup_lm: v,
  }));
  return {
    code,
    is_assembly: false,
    materials_main: main,
    materials_alt: alt,
    materials_active: active,
    materials: active === 'alt' ? alt : main,
    inks: [],
    processes: [],
  };
}

// ── Std buildTierState ────────────────────────────────────────────────

test('Std buildTierState: active=main + tier mat_setup_lm override applied to materials_main', () => {
  const st = stdFixture({
    active: 'main',
    extra: { mat_setup_lm: [777, null] },
  });
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  // First material row gets override (777); second stays at base setup_lm (200).
  assert.equal(tier.materials[0].setup_lm, 777);
  assert.equal(tier.materials[1].setup_lm, 200);
});

test('Std buildTierState: active=alt + tier mat_setup_lm_alt applied to materials_alt rows', () => {
  const st = stdFixture({
    active: 'alt',
    extra: { mat_setup_lm_alt: [888, null] },
  });
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  // First alt row gets override (888); second stays at alt base (600).
  assert.equal(tier.materials[0].setup_lm, 888);
  assert.equal(tier.materials[1].setup_lm, 600);
});

test('Std buildTierState: active=alt + mat_setup_lm_alt undefined → no override (alt rows use base setup_lm)', () => {
  // CRITICAL boundary: when operator hasn\'t set per-tier alt override,
  // alt rows MUST use their own base setup_lm (500, 600). The main-side
  // mat_setup_lm must NOT leak into alt mode.
  const st = stdFixture({
    active: 'alt',
    extra: { mat_setup_lm: [777, null] }, // ONLY main override present
  });
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  // No leak from main override — alt rows use their own base.
  assert.equal(tier.materials[0].setup_lm, 500);
  assert.equal(tier.materials[1].setup_lm, 600);
});

test('Std buildTierState: active=main + mat_setup_lm_alt set but main override missing → no leak', () => {
  // Symmetric guard: alt-only tier override must not leak into main mode.
  const st = stdFixture({
    active: 'main',
    extra: { mat_setup_lm_alt: [888, null] },
  });
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  assert.equal(tier.materials[0].setup_lm, 100);
  assert.equal(tier.materials[1].setup_lm, 200);
});

test('Std buildTierState: tier 0 (base) returns state unchanged regardless of active', () => {
  // Base tier path doesn\'t run override logic, so active flag doesn\'t
  // matter — just pass-through with the requested tier scalars.
  const st = stdFixture({ active: 'alt' });
  const tier = buildTierState(st, 0, 0.2, 1000, 10000);
  // materials reference is the active-set mirror unchanged.
  assert.equal(tier.materials[0].setup_lm, 500);
  assert.equal(tier.moq, 1000);
});

// ── Std getActiveTierState ────────────────────────────────────────────

test('Std getActiveTierState: active=main + mat_rows override applied to materials_main', () => {
  const st = stdFixture({
    active: 'main',
    extra: { mat_rows: [{ usage: 7 }, null] },
  });
  st.active_moq_idx = 1; // resolve tier 1
  const out = getActiveTierState(st);
  assert.equal(out.materials[0].usage, 7);
  // Row index 1 has no override entry → original
  assert.equal(out.materials[1].setup_lm, 200);
});

test('Std getActiveTierState: active=alt + mat_rows_alt override applied to materials_alt', () => {
  const st = stdFixture({
    active: 'alt',
    extra: { mat_rows_alt: [{ usage: 9 }, null] },
  });
  st.active_moq_idx = 1;
  const out = getActiveTierState(st);
  assert.equal(out.materials[0].usage, 9);
  assert.equal(out.materials[1].setup_lm, 600);
});

test('Std getActiveTierState: active=alt + mat_rows (no _alt) → no leak', () => {
  const st = stdFixture({
    active: 'alt',
    extra: { mat_rows: [{ usage: 999 }, null] }, // main-side mat_rows only
  });
  st.active_moq_idx = 1;
  const out = getActiveTierState(st);
  // alt rows untouched by main-side mat_rows
  assert.equal(out.materials[0].usage, undefined);
  assert.equal(out.materials[0].setup_lm, 500);
});

// ── Cpx applyCplxTierToSp ─────────────────────────────────────────────

test('Cpx applyCplxTierToSp: SP active=main → reads sp_mat_setup_lm', () => {
  const sp = spFixture({ code: 'SP-A', active: 'main' });
  const cs = {
    extra_moqs: [{ sp_mat_setup_lm: { 0: [333, null] } }],
  };
  const out = applyCplxTierToSp(cs, sp, 0, 1);
  assert.equal(out.materials[0].setup_lm, 333);
  assert.equal(out.materials[1].setup_lm, 200, 'second main row unchanged');
});

test('Cpx applyCplxTierToSp: SP active=alt → reads sp_mat_setup_lm_alt', () => {
  const sp = spFixture({ code: 'SP-A', active: 'alt' });
  const cs = {
    extra_moqs: [{ sp_mat_setup_lm_alt: { 0: [444, null] } }],
  };
  const out = applyCplxTierToSp(cs, sp, 0, 1);
  assert.equal(out.materials[0].setup_lm, 444, 'alt row 0 overridden');
  assert.equal(out.materials[1].setup_lm, 600, 'alt row 1 untouched (alt base)');
});

test('Cpx applyCplxTierToSp: SP active=alt + only sp_mat_setup_lm set (no _alt) → no override', () => {
  // Boundary: main-side override map must NOT leak into alt-mode SP.
  const sp = spFixture({ code: 'SP-A', active: 'alt' });
  const cs = {
    extra_moqs: [{ sp_mat_setup_lm: { 0: [333, null] } }],
  };
  const out = applyCplxTierToSp(cs, sp, 0, 1);
  assert.equal(out.materials[0].setup_lm, 500, 'alt base preserved (no main leak)');
  assert.equal(out.materials[1].setup_lm, 600);
});

test('Cpx applyCplxTierToSp: mixed per-SP active at same tier — SP-A main + SP-B alt branch independently (amendment A)', () => {
  const spA = spFixture({ code: 'SP-A', active: 'main' });
  const spB = spFixture({ code: 'SP-B', active: 'alt' });
  const cs = {
    extra_moqs: [
      {
        // SP-A's main override
        sp_mat_setup_lm: { 0: [111, null] },
        // SP-B's alt override (at the same tier!)
        sp_mat_setup_lm_alt: { 1: [222, null] },
      },
    ],
  };
  const outA = applyCplxTierToSp(cs, spA, 0, 1);
  const outB = applyCplxTierToSp(cs, spB, 1, 1);
  // SP-A picks its main override
  assert.equal(outA.materials[0].setup_lm, 111);
  // SP-B picks its alt override — main map (which has SP-A entry only) ignored
  assert.equal(outB.materials[0].setup_lm, 222);
  // Cross-leak check: SP-A doesn\'t see SP-B\'s alt override
  assert.equal(outA.materials[1].setup_lm, 200);
  // Cross-leak check: SP-B doesn\'t see SP-A\'s main override
  assert.equal(outB.materials[1].setup_lm, 600);
});

test('Cpx applyCplxTierToSp: tier 0 returns SP unchanged regardless of active', () => {
  const sp = spFixture({ code: 'SP-A', active: 'alt' });
  const out = applyCplxTierToSp({}, sp, 0, 0);
  assert.equal(out, sp);
});

test('Cpx applyCplxTierToSp: sp_proc_setup_h override remains shared across active states', () => {
  // Process overrides are orthogonal to materials_active — they\'re NOT
  // material-related, so PR #C did NOT add a _alt variant. Test that
  // toggling SP\'s material active doesn\'t affect process overrides.
  const spMain = {
    ...spFixture({ code: 'SP-A', active: 'main' }),
    processes: [{ setup_h: 1 }, { setup_h: 2 }],
  };
  const spAlt = {
    ...spFixture({ code: 'SP-A', active: 'alt' }),
    processes: [{ setup_h: 1 }, { setup_h: 2 }],
  };
  const cs = { extra_moqs: [{ sp_proc_setup_h: { 0: [9, null] } }] };
  const outMain = applyCplxTierToSp(cs, spMain, 0, 1);
  const outAlt = applyCplxTierToSp(cs, spAlt, 0, 1);
  // Both pick the same process override
  assert.equal(outMain.processes[0].setup_h, 9);
  assert.equal(outAlt.processes[0].setup_h, 9);
});

// ── Regression gates (PR #A + PR #B bit-identical when no _alt set) ───

test('Regression PR #A: Std main-only tier override + no _alt → identical to pre-PR-C behavior', () => {
  // The pre-PR-C path: mat_setup_lm only, no mat_setup_lm_alt. With
  // active='main', calc engine should produce the same overridden
  // setup_lm values as it always did.
  const st = stdFixture({
    active: 'main',
    extra: { mat_setup_lm: [555, 666] },
  });
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  assert.equal(tier.materials[0].setup_lm, 555);
  assert.equal(tier.materials[1].setup_lm, 666);
});

test('Regression PR #B: Cpx all-main (no alt-mode SPs, no _alt map) → identical to PR #B baseline', () => {
  const spA = spFixture({ code: 'SP-A', active: 'main' });
  const spB = spFixture({ code: 'SP-B', active: 'main' });
  const cs = {
    extra_moqs: [{ sp_mat_setup_lm: { 0: [111, null], 1: [222, null] } }],
  };
  const outA = applyCplxTierToSp(cs, spA, 0, 1);
  const outB = applyCplxTierToSp(cs, spB, 1, 1);
  assert.equal(outA.materials[0].setup_lm, 111);
  assert.equal(outB.materials[0].setup_lm, 222);
});

test('Regression PR #B: Cpx all-alt (alt-mode SPs only, _alt map present) → consistent picking', () => {
  const spA = spFixture({ code: 'SP-A', active: 'alt' });
  const spB = spFixture({ code: 'SP-B', active: 'alt' });
  const cs = {
    extra_moqs: [{ sp_mat_setup_lm_alt: { 0: [11, null], 1: [22, null] } }],
  };
  const outA = applyCplxTierToSp(cs, spA, 0, 1);
  const outB = applyCplxTierToSp(cs, spB, 1, 1);
  assert.equal(outA.materials[0].setup_lm, 11);
  assert.equal(outB.materials[0].setup_lm, 22);
});

// ── Index integrity (active-set length awareness) ─────────────────────

test('Std buildTierState: mat_setup_lm_alt[matIdx] indexes against materials_alt[matIdx]', () => {
  // Sanity: when alt has DIFFERENT row count than main, the tier
  // override indexes line up with the alt array — not main\'s indices.
  const st = stdFixture({ active: 'alt' });
  // Make alt longer than main
  st.materials_alt = [
    { _mid: 'a_0', code: 'A0', setup_lm: 700 },
    { _mid: 'a_1', code: 'A1', setup_lm: 800 },
    { _mid: 'a_2', code: 'A2', setup_lm: 900 },
  ];
  st.materials = st.materials_alt; // mirror
  st.extra_moqs = [{ mat_setup_lm_alt: [null, null, 1234] }]; // override idx 2 only
  const tier = buildTierState(st, 1, 0.18, 5000, 50000);
  assert.equal(tier.materials.length, 3);
  assert.equal(tier.materials[0].setup_lm, 700);
  assert.equal(tier.materials[1].setup_lm, 800);
  assert.equal(tier.materials[2].setup_lm, 1234);
});
