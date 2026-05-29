/**
 * computeSga — Phase 9D.3 SGA burden formula tests.
 *
 * Runner: node --test. Pure function, no DOM, no React — test in
 * isolation. We verify:
 *   - default 0% rate leaves gm unchanged
 *   - rate pulled by site; missing site falls back to 0
 *   - sga + g_ttl_with_sga math
 *   - backwards-compat: undefined/empty site defaults to 'VN'
 *   - malformed rate values (string, NaN) coerced to 0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSga } from './calcEngine.js';

const EPS = 1e-9;

// ── default: no rate ──

test('no lib → rate 0, sga 0, gm_after_sga = gm', () => {
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib: null, site: 'VN' });
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
  assert.equal(r.g_ttl_with_sga, 100);
  // gm = 1 - 100/200 = 0.5; gm_after_sga should also be 0.5
  assert.ok(Math.abs(r.gm_after_sga - 0.5) < EPS);
});

test('lib with empty sga map → rate 0', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: {} } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
});

test('lib has site but rate=0 → sga=0', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 0 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga, 0);
});

// ── active rate ──

test('5% SGA on g_ttl=100 → sga=5, g_ttl_with_sga=105', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 5 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 5);
  assert.ok(Math.abs(r.sga - 5) < EPS);
  assert.ok(Math.abs(r.g_ttl_with_sga - 105) < EPS);
  // gm_after_sga = 1 - 105/200 = 0.475
  assert.ok(Math.abs(r.gm_after_sga - 0.475) < EPS);
});

test('10% SGA on g_ttl=80, sp=100 → sga=8, gm_after_sga=0.12', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10 } } } };
  const r = computeSga({ g_ttl: 80, sp_price: 100, lib, site: 'VN' });
  assert.ok(Math.abs(r.sga - 8) < EPS);
  assert.ok(Math.abs(r.g_ttl_with_sga - 88) < EPS);
  assert.ok(Math.abs(r.gm_after_sga - 0.12) < EPS);
});

test('site-specific rate: India=7, VN=0 → using India site applies 7%', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 0, India: 7 } } } };
  const rVn = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  const rIn = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'India' });
  assert.equal(rVn.sga, 0);
  assert.ok(Math.abs(rIn.sga - 7) < EPS);
});

// ── site fallback ──

test('missing site in input defaults to VN', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 3 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: undefined });
  assert.equal(r.site, 'VN');
  assert.equal(r.sga_rate_pct, 3);
});

test('site not in rate map → sga 0', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 5 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'Mars' });
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
});

// ── malformed inputs (defense against bad Finance data) ──

test('string-typed rate → coerced to number', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: '5' } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 5);
  assert.ok(Math.abs(r.sga - 5) < EPS);
  // Quick sanity on gm_after_sga: 1 - 105/200 = 0.475
  assert.ok(Math.abs(r.gm_after_sga - 0.475) < EPS);
});

test('NaN / null rate → treated as 0', () => {
  const lib1 = { finance: { summary: { sga_rate_pct_by_site: { VN: 'abc' } } } };
  const lib2 = { finance: { summary: { sga_rate_pct_by_site: { VN: null } } } };
  assert.equal(computeSga({ g_ttl: 100, sp_price: 200, lib: lib1, site: 'VN' }).sga, 0);
  assert.equal(computeSga({ g_ttl: 100, sp_price: 200, lib: lib2, site: 'VN' }).sga, 0);
});

test('negative rate → clamped to 0 (no SGA discount allowed)', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: -5 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
});

// ── edge cases ──

test('sp_price=0 → gm_after_sga=null (guard against divide-by-zero)', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 5 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 0, lib, site: 'VN' });
  assert.equal(r.gm_after_sga, null);
});

test('g_ttl=0 → sga=0 even with active rate', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10 } } } };
  const r = computeSga({ g_ttl: 0, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga, 0);
  assert.ok(Math.abs(r.gm_after_sga - 1) < EPS);
});

// ── Phase 9E.2 — case-insensitive site lookup ──

test('site lookup: lowercase site matches uppercase Finance key', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 5 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'vn' });
  assert.equal(r.sga_rate_pct, 5, 'lowercase vn should match VN in Finance map');
  assert.ok(Math.abs(r.sga - 5) < EPS);
});

test('site lookup: whitespace around site normalized', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { '41 RDC': 3 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: ' 41 RDC ' });
  assert.equal(r.sga_rate_pct, 3);
});

test('site lookup: exact match still preferred when present (no fallback scan)', () => {
  // If both 'VN' and 'vn' hypothetically coexist (shouldn't happen but
  // defensive check), the exact-match hit wins.
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 5, vn: 99 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 5, 'exact match wins over case-insensitive fallback');
});

// ── Phase 9E.4 — snapshot precedence (approved-quote immutability) ──

test('snapshot wins over live lib rate — protects approved quotes from Finance edits', () => {
  // Live Finance now says 10%, but the quote was approved when it was 5%.
  // Snapshot must be the authoritative source for margin reporting.
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10 } } } };
  const snapshot = {
    site: 'VN',
    sga_rate_pct: 5,
    frozen_at: '2026-04-01',
    frozen_by: 'finance_dir_alice',
  };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN', snapshot });
  assert.equal(r.sga_rate_pct, 5, 'snapshot rate wins, not the 10% live rate');
  assert.ok(Math.abs(r.sga - 5) < EPS);
  assert.equal(r.from_snapshot, true);
});

test('snapshot with rate=0 still wins (approved-at-0 must not later recompute >0)', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10 } } } };
  const snapshot = { site: 'VN', sga_rate_pct: 0 };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN', snapshot });
  assert.equal(r.sga_rate_pct, 0);
  assert.equal(r.sga, 0);
  assert.equal(r.from_snapshot, true);
});

test('no snapshot → falls back to live lib rate', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 7 } } } };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN' });
  assert.equal(r.sga_rate_pct, 7);
  assert.equal(r.from_snapshot, false);
});

test('snapshot with malformed rate (null/NaN) clamped to 0, still marked from_snapshot', () => {
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10 } } } };
  const r1 = computeSga({
    g_ttl: 100,
    sp_price: 200,
    lib,
    site: 'VN',
    snapshot: { site: 'VN', sga_rate_pct: null },
  });
  const r2 = computeSga({
    g_ttl: 100,
    sp_price: 200,
    lib,
    site: 'VN',
    snapshot: { site: 'VN', sga_rate_pct: 'abc' },
  });
  assert.equal(r1.sga_rate_pct, 0);
  assert.equal(r1.from_snapshot, true);
  assert.equal(r2.sga_rate_pct, 0);
  assert.equal(r2.from_snapshot, true);
});

test('snapshot carries its own site — may differ from live st.site', () => {
  // Admin accidentally changes the quote's site field post-approval,
  // but snapshot preserves what was used at approval.
  const lib = { finance: { summary: { sga_rate_pct_by_site: { VN: 10, India: 20 } } } };
  const snapshot = { site: 'India', sga_rate_pct: 7 };
  const r = computeSga({ g_ttl: 100, sp_price: 200, lib, site: 'VN', snapshot });
  assert.equal(r.site, 'India', 'returned site reflects the frozen snapshot value');
  assert.equal(r.sga_rate_pct, 7);
});
