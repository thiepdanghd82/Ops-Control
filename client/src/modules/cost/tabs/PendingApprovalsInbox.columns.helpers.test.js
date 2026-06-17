/**
 * Tests for PendingApprovalsInbox.columns.helpers — pins the inbox row
 * derive contract against Quote History's column accessors so the same
 * quote cross-checks IDENTICAL numbers in both tables. Critical for
 * reviewer trust: a discrepancy between inbox + history → "which one
 * is right?" → escalation.
 *
 * Test groups:
 *   A. project_name vs project          (Lesson 21 — S-PROJFIX trap)
 *   B. end_cu fallback                  (Lesson 21 mirror — Std stores at s.project)
 *   C. price_vnd raw, no USD×rate fallback  (Sprint S-D20 / S-1.7g pair contract)
 *   D. price_usd from s.selling_price
 *   E. materials Main.Mat filter        (delegate to Summarize helpers)
 *   F. contrVal legacy contr_pct coerce (Sprint 1.7f)
 *   G. gmVal legacy gm_pct coerce
 *   H. sale_owner from s.sale_owner
 *   I. defensive (null / undefined / partial state)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveInboxRow,
  deriveContrFraction,
  deriveGmFraction,
} from './PendingApprovalsInbox.columns.helpers.js';

// ─── A. project_name vs project (Lesson 21) ──────────────────────

test('A1: project reads s.project_name (canonical), NOT s.project (which is End Cu alias on Std)', () => {
  const q = {
    state: {
      project_name: 'Acme Q3 Refresh',
      // Pre-Lesson-21 trap: Std's RfqInfoCard aliases End Customer into
      // state.project via CalcHeader.jsx aliasMap. Reading s.project for
      // a "Project" column would surface "Customer XYZ Co" text under
      // Project header.
      project: 'Customer XYZ Co (END CU TRAP)',
    },
  };
  const r = deriveInboxRow(q);
  assert.equal(r.project, 'Acme Q3 Refresh');
  assert.notEqual(r.project, 'Customer XYZ Co (END CU TRAP)');
});

test('A2: project is empty string when project_name missing (no fallback to s.project)', () => {
  const q = { state: { project: 'End Customer text in aliased slot' } };
  const r = deriveInboxRow(q);
  assert.equal(r.project, '');
});

// ─── B. end_cu fallback (Lesson 21) ──────────────────────────────

test('B1: end_cu uses s.end_cu when present (Complex quote canonical)', () => {
  const q = { state: { end_cu: 'CCL Vietnam', project: 'ignored' } };
  const r = deriveInboxRow(q);
  assert.equal(r.end_cu, 'CCL Vietnam');
});

test('B2: end_cu falls back to s.project when end_cu missing (Std alias path)', () => {
  const q = { state: { project: 'CCL Vietnam (Std-aliased)' } };
  const r = deriveInboxRow(q);
  assert.equal(r.end_cu, 'CCL Vietnam (Std-aliased)');
});

test('B3: end_cu returns "" when both end_cu and project are missing', () => {
  const q = { state: {} };
  const r = deriveInboxRow(q);
  assert.equal(r.end_cu, '');
});

// ─── C. price_vnd RAW (no USD×rate fallback) ─────────────────────

test('C1: price_vnd reads RAW s.selling_price_vnd', () => {
  const q = { state: { selling_price_vnd: 250000 } };
  const r = deriveInboxRow(q);
  assert.equal(r.price_vnd, 250000);
});

test('C2: price_vnd is null when selling_price_vnd missing — NO USD×rate fallback', () => {
  // Pre-S-1.7g legacy: would compute selling_price × usd_rate. Inbox
  // spec explicitly forbids this — show what operator entered, not
  // what was derived. Differentiates from QuoteHistory which DOES fall
  // back; the spec accepts this divergence intentionally.
  const q = { state: { selling_price: 12.5, usd_rate: 24500 } };
  const r = deriveInboxRow(q);
  assert.equal(r.price_vnd, null);
});

test('C3: price_vnd null when input not finite (string, NaN, undefined)', () => {
  for (const v of [undefined, null, '', 'abc', NaN]) {
    const r = deriveInboxRow({ state: { selling_price_vnd: v } });
    assert.equal(r.price_vnd, null, `Failed for input: ${String(v)}`);
  }
});

test('C4: price_vnd preserves explicit 0 only if Number-finite (0 is valid)', () => {
  const r = deriveInboxRow({ state: { selling_price_vnd: 0 } });
  assert.equal(r.price_vnd, 0);
});

// ─── D. price_usd from s.selling_price ───────────────────────────

test('D1: price_usd reads s.selling_price', () => {
  const r = deriveInboxRow({ state: { selling_price: 12.345 } });
  assert.equal(r.price_usd, 12.345);
});

test('D2: price_usd null when missing or non-finite', () => {
  for (const v of [undefined, null, '', 'abc', NaN]) {
    const r = deriveInboxRow({ state: { selling_price: v } });
    assert.equal(r.price_usd, null, `Failed for input: ${String(v)}`);
  }
});

// ─── E. materials Main.Mat filter ────────────────────────────────

test('E1: drw_materials applies Main.Mat filter (Process Mat rows skipped)', () => {
  const q = {
    state: {
      materials: [
        { row_type: 'Main.Mat', drw_material: 'M-Primary' },
        { row_type: 'Process Mat', drw_material: 'M-Liner-skipped' },
        { row_type: 'Main.Mat', drw_material: 'M-Secondary' },
      ],
    },
  };
  const r = deriveInboxRow(q);
  assert.equal(r.drw_materials, '- M-Primary\n- M-Secondary');
});

test('E2: quote_materials applies Main.Mat filter (delegate test)', () => {
  const q = {
    state: {
      materials: [
        { row_type: 'Main.Mat', desc: 'PET 50um' },
        { row_type: 'Process Mat', desc: 'Release liner — skipped' },
      ],
    },
  };
  const r = deriveInboxRow(q);
  assert.equal(r.quote_materials, '- PET 50um');
});

test('E3: materials empty string when no rows match', () => {
  const r = deriveInboxRow({ state: { materials: [] } });
  assert.equal(r.drw_materials, '');
  assert.equal(r.quote_materials, '');
});

// ─── F. contrVal legacy contr_pct coerce ─────────────────────────

test('F1: contrVal prefers result.contribution (fraction, new shape)', () => {
  const q = { state: {}, result: { contribution: 0.234 } };
  const r = deriveInboxRow(q);
  assert.equal(r.contrVal, 0.234);
});

test('F2: contrVal coerces legacy result.contr_pct (already-% stored, divide by 100)', () => {
  const q = { state: {}, result: { contr_pct: 23.4 } };
  const r = deriveInboxRow(q);
  assert.ok(Math.abs(r.contrVal - 0.234) < 1e-9);
});

test('F3: contrVal null when neither contribution nor contr_pct present', () => {
  const r = deriveInboxRow({ state: {}, result: {} });
  assert.equal(r.contrVal, null);
});

test('F4: deriveContrFraction direct — contribution wins when both set', () => {
  assert.equal(
    deriveContrFraction({ contribution: 0.5, contr_pct: 99 }),
    0.5,
    'contribution must take precedence over legacy contr_pct'
  );
});

// ─── G. gmVal legacy gm_pct coerce ───────────────────────────────

test('G1: gmVal prefers result.gm (fraction)', () => {
  const r = deriveInboxRow({ state: {}, result: { gm: 0.21 } });
  assert.equal(r.gmVal, 0.21);
});

test('G2: gmVal coerces legacy gm_pct (divide by 100)', () => {
  const r = deriveInboxRow({ state: {}, result: { gm_pct: 21 } });
  assert.ok(Math.abs(r.gmVal - 0.21) < 1e-9);
});

test('G3: gmVal null when neither gm nor gm_pct present', () => {
  const r = deriveInboxRow({ state: {}, result: {} });
  assert.equal(r.gmVal, null);
});

test('G4: deriveGmFraction direct — gm wins when both set', () => {
  assert.equal(deriveGmFraction({ gm: 0.42, gm_pct: 99 }), 0.42);
});

// ─── H. sale_owner ───────────────────────────────────────────────

test('H1: sale_owner from s.sale_owner', () => {
  const r = deriveInboxRow({ state: { sale_owner: 'Henry' } });
  assert.equal(r.sale_owner, 'Henry');
});

test('H2: sale_owner defaults to empty string when missing', () => {
  const r = deriveInboxRow({ state: {} });
  assert.equal(r.sale_owner, '');
});

// ─── I. defensive (null / undefined / partial state) ─────────────

test('I1: returns null for null/undefined input', () => {
  assert.equal(deriveInboxRow(null), null);
  assert.equal(deriveInboxRow(undefined), null);
});

test('I2: returns null for non-object input (defensive)', () => {
  assert.equal(deriveInboxRow('not-a-quote'), null);
  assert.equal(deriveInboxRow(42), null);
});

test('I3: partial state — no throw, all derived fields empty/null', () => {
  const r = deriveInboxRow({});
  assert.equal(r.sale_owner, '');
  assert.equal(r.end_cu, '');
  assert.equal(r.project, '');
  assert.equal(r.drw_materials, '');
  assert.equal(r.quote_materials, '');
  assert.equal(r.price_usd, null);
  assert.equal(r.price_vnd, null);
  assert.equal(r.vaVal, null);
  assert.equal(r.contrVal, null);
  assert.equal(r.gmVal, null);
});

test('I4: q with only result (no state) — derive uses {} for state, all state-derived fields empty', () => {
  const r = deriveInboxRow({ result: { gm: 0.3, contribution: 0.2 } });
  assert.equal(r.sale_owner, '');
  assert.equal(r.gmVal, 0.3);
  assert.equal(r.contrVal, 0.2);
});

// ─── Cross-check with QuoteHistory contract (regression guard) ───

test('J1: same quote derives identical sale_owner as QuoteHistory sort fn', () => {
  // QH sort fn: (q) => (q.state?.sale_owner || '').toLowerCase()
  // Inbox derive: s.sale_owner ?? ''
  // Both lowercase to '' for empty, and the inbox renders verbatim
  // (sorting not applied here). Pin the raw read parity.
  const q = { state: { sale_owner: 'Alice' } };
  assert.equal(deriveInboxRow(q).sale_owner, 'Alice');
  assert.equal(deriveInboxRow({ state: { sale_owner: '' } }).sale_owner, '');
});

test('J2: same quote derives identical contr fraction as QuoteHistory contr sort fn', () => {
  // QH contr sort fn body:
  //   if (Number.isFinite(+r.contribution)) return Number(r.contribution);
  //   if (Number.isFinite(+r.contr_pct)) return Number(r.contr_pct) / 100;
  //   return 0;
  // Inbox returns null instead of 0 (because fmtPct shows '—' on null).
  // Pin the FRACTION VALUE for present cases; the null vs 0 divergence
  // is intentional (presentation layer, not math layer).
  assert.equal(deriveInboxRow({ result: { contribution: 0.18 } }).contrVal, 0.18);
  assert.ok(Math.abs(deriveInboxRow({ result: { contr_pct: 18.5 } }).contrVal - 0.185) < 1e-9);
});
