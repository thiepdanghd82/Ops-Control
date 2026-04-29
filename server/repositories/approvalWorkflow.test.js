/**
 * approvalWorkflow — state machine tests for the 3-stage chain.
 *
 * Runner: node --test (ESM-native). Mirrors client-side test pattern
 * since jest + ESM requires experimental flags; these tests are pure
 * functions with no IO, so node --test is the right tool.
 *   node --test server/repositories/approvalWorkflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transition,
  getStatus,
  availableActions,
  countActionable,
  APPROVAL_STATES,
} from './approvalWorkflow.js';

// ── Fixtures ──
const costEng = { username: 'hana',   role: 'cost',   approval_roles: [] };
const salesMgr = { username: 'sonia',  role: 'user',   approval_roles: ['sales_mgr'] };
const finDir   = { username: 'felix',  role: 'user',   approval_roles: ['finance_dir'] };
const admin    = { username: 'admin',  role: 'admin',  approval_roles: [] };
const sysUser  = { username: 'root',   role: 'sys',    approval_roles: [] };
const viewonly = { username: 'vic',    role: 'viewonly', approval_roles: [] };

// ── Shape + initial state ──
test('APPROVAL_STATES lists the 5 v2 states', () => {
  assert.deepEqual(APPROVAL_STATES,
    ['draft', 'pending_sales', 'pending_finance', 'approved', 'rejected']);
});

test('getStatus: missing / null / undefined → draft', () => {
  assert.equal(getStatus(null), 'draft');
  assert.equal(getStatus(undefined), 'draft');
  assert.equal(getStatus({}), 'draft');
  assert.equal(getStatus({ status: undefined }), 'draft');
});

test('getStatus: unknown status → draft (safety fallback)', () => {
  assert.equal(getStatus({ status: 'bogus' }), 'draft');
});

test('getStatus: legacy "submitted" aliases to pending_sales', () => {
  assert.equal(getStatus({ status: 'submitted' }), 'pending_sales');
});

// ── SUBMIT: draft → pending_sales ──
test('SUBMIT from draft by cost engineer → pending_sales', () => {
  const r = transition({ approval: null, action: 'SUBMIT', actorUser: costEng });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'pending_sales');
  assert.equal(r.approval.submitted_by, 'hana');
  assert.ok(r.approval.submitted_at, 'submitted_at stamped');
  assert.equal(r.approval.history.length, 1);
  assert.equal(r.approval.history[0].action, 'SUBMIT');
  assert.equal(r.approval.history[0].from, 'draft');
  assert.equal(r.approval.history[0].to, 'pending_sales');
});

test('SUBMIT by viewonly user → rejected', () => {
  const r = transition({ approval: null, action: 'SUBMIT', actorUser: viewonly });
  assert.equal(r.ok, false);
  assert.match(r.error, /user \+|role user\+/i);
});

test('SUBMIT from approved → rejected (bad transition)', () => {
  const approved = { status: 'approved' };
  const r = transition({ approval: approved, action: 'SUBMIT', actorUser: costEng });
  assert.equal(r.ok, false);
  assert.match(r.error, /Cannot SUBMIT from status approved/);
});

// ── APPROVE_SALES: pending_sales → pending_finance ──
test('APPROVE_SALES by sales_mgr → pending_finance', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'pending_finance');
  assert.equal(r.approval.sales_approved_by, 'sonia');
  assert.ok(r.approval.sales_approved_at);
  // History chain preserved
  assert.equal(r.approval.history.length, 2);
  assert.equal(r.approval.history[1].action, 'APPROVE_SALES');
});

test('APPROVE_SALES by finance_dir (without sales_mgr) → rejected', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: finDir });
  assert.equal(r.ok, false);
  assert.match(r.error, /APPROVE_SALES/);
});

test('APPROVE_SALES by admin (fallback) → pending_finance', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: admin });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'pending_finance');
  assert.equal(r.approval.sales_approved_by, 'admin');
});

test('APPROVE_SALES from draft → rejected', () => {
  const r = transition({ approval: null, action: 'APPROVE_SALES', actorUser: salesMgr });
  assert.equal(r.ok, false);
});

// ── APPROVE_FINANCE: pending_finance → approved ──
test('APPROVE_FINANCE by finance_dir → approved (+ mirror fields)', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const r = transition({ approval: s2, action: 'APPROVE_FINANCE', actorUser: finDir });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'approved');
  assert.equal(r.approval.finance_approved_by, 'felix');
  assert.equal(r.approval.approved_by, 'felix', 'v1 mirror field populated');
  assert.equal(r.approval.finance_approved_at, r.approval.approved_at);
});

test('APPROVE_FINANCE by sales_mgr alone → rejected', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const r = transition({ approval: s2, action: 'APPROVE_FINANCE', actorUser: salesMgr });
  assert.equal(r.ok, false);
});

test('APPROVE_FINANCE from pending_sales → rejected (skip not allowed)', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'APPROVE_FINANCE', actorUser: finDir });
  assert.equal(r.ok, false);
});

// ── REJECT: any pending → rejected (requires reason) ──
test('REJECT from pending_sales without reason → rejected (error)', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'REJECT', actorUser: salesMgr });
  assert.equal(r.ok, false);
  assert.match(r.error, /reason/i);
});

test('REJECT from pending_sales with reason → rejected', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({
    approval: s1, action: 'REJECT', actorUser: salesMgr,
    reason: 'Price too low for current tooling plan.',
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'rejected');
  assert.equal(r.approval.rejected_by, 'sonia');
  assert.equal(r.approval.rejected_stage, 'pending_sales');
  assert.match(r.approval.reason, /tooling/);
});

test('REJECT from pending_finance stores rejected_stage = pending_finance', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const r = transition({
    approval: s2, action: 'REJECT', actorUser: finDir,
    reason: 'Margin below 25% target',
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.rejected_stage, 'pending_finance');
});

test('REJECT by cost engineer → rejected (insufficient role)', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'REJECT', actorUser: costEng, reason: 'oops' });
  assert.equal(r.ok, false);
});

// ── Re-submission after rejection ──
test('rejected + SUBMIT by cost engineer → pending_sales, rejection fields cleared', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const rejected = transition({
    approval: s1, action: 'REJECT', actorUser: salesMgr, reason: 'fix MOQ'
  }).approval;
  const r = transition({ approval: rejected, action: 'SUBMIT', actorUser: costEng });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'pending_sales');
  assert.equal(r.approval.rejected_by, undefined, 'cleared on re-submit');
  assert.equal(r.approval.rejected_stage, undefined);
  assert.equal(r.approval.reason, undefined);
  // History keeps the rejection record so audit trail stays intact.
  assert.ok(r.approval.history.some(h => h.action === 'REJECT'));
  assert.ok(r.approval.history.some(h => h.action === 'SUBMIT' && h.from === 'rejected'));
});

// ── REVOKE: sys-only escape hatch ──
test('REVOKE approved → draft by sys', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const s3 = transition({ approval: s2, action: 'APPROVE_FINANCE', actorUser: finDir }).approval;
  const r = transition({ approval: s3, action: 'REVOKE', actorUser: sysUser });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'draft');
  assert.equal(r.approval.approved_by, undefined, 'final-approval stamp cleared');
  assert.equal(r.approval.finance_approved_by, undefined);
});

test('REVOKE by admin → rejected (sys-only)', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const s3 = transition({ approval: s2, action: 'APPROVE_FINANCE', actorUser: finDir }).approval;
  const r = transition({ approval: s3, action: 'REVOKE', actorUser: admin });
  assert.equal(r.ok, false);
});

// ── Legacy APPROVE alias ──
test('legacy APPROVE from submitted → pending_finance (back-compat)', () => {
  const legacy = { status: 'submitted', submitted_by: 'hana' };
  const r = transition({ approval: legacy, action: 'APPROVE', actorUser: salesMgr });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'pending_finance');
  assert.equal(r.approval.sales_approved_by, 'sonia');
});

test('legacy APPROVE from pending_finance → approved', () => {
  const s1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng }).approval;
  const s2 = transition({ approval: s1, action: 'APPROVE_SALES', actorUser: salesMgr }).approval;
  const r = transition({ approval: s2, action: 'APPROVE', actorUser: finDir });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'approved');
  assert.equal(r.approval.approved_by, 'felix');
});

// ── availableActions: UI helper ──
test('availableActions: draft + cost engineer → [SUBMIT]', () => {
  assert.deepEqual(availableActions(null, costEng), ['SUBMIT']);
});

test('availableActions: pending_sales + sales_mgr → [APPROVE_SALES, APPROVE, REJECT]', () => {
  const s1 = { status: 'pending_sales' };
  const acts = availableActions(s1, salesMgr);
  assert.ok(acts.includes('APPROVE_SALES'));
  assert.ok(acts.includes('REJECT'));
});

test('availableActions: pending_sales + cost engineer → []', () => {
  const s1 = { status: 'pending_sales' };
  assert.deepEqual(availableActions(s1, costEng), []);
});

test('availableActions: pending_finance + finance_dir → includes APPROVE_FINANCE', () => {
  const s1 = { status: 'pending_finance' };
  const acts = availableActions(s1, finDir);
  assert.ok(acts.includes('APPROVE_FINANCE'));
  assert.ok(acts.includes('REJECT'));
});

test('availableActions: approved + sys → [REVOKE]', () => {
  assert.deepEqual(availableActions({ status: 'approved' }, sysUser), ['REVOKE']);
});

test('availableActions: approved + admin → [] (admin cannot revoke)', () => {
  assert.deepEqual(availableActions({ status: 'approved' }, admin), []);
});

// ── History bound ──
test('history is capped at 50 entries', () => {
  // Thrash the state machine: submit → reject → submit → reject … until cap.
  let approval = null;
  for (let i = 0; i < 40; i++) {
    approval = transition({ approval, action: 'SUBMIT', actorUser: costEng }).approval;
    approval = transition({
      approval, action: 'REJECT', actorUser: salesMgr, reason: 'churn',
    }).approval;
  }
  assert.equal(approval.history.length, 50);
  // Oldest entry should have been evicted — earliest remaining should
  // come from the tail of the sequence.
  assert.equal(approval.history[approval.history.length - 1].action, 'REJECT');
});

// ── countActionable (Sprint 6.5) ──
test('countActionable: empty inputs → 0', () => {
  assert.equal(countActionable(null, salesMgr), 0);
  assert.equal(countActionable([], salesMgr), 0);
  assert.equal(countActionable([{ state: {} }], null), 0);
});

test('countActionable: only pending_* states count (draft/approved/rejected ignored)', () => {
  const quotes = [
    { state: { approval: { status: 'draft' } } },
    { state: { approval: { status: 'approved', approved_by: 'x' } } },
    { state: { approval: { status: 'rejected', rejected_by: 'x' } } },
    { state: { approval: { status: 'pending_sales' } } },
    { state: { approval: { status: 'pending_finance' } } },
  ];
  // sales_mgr can act on pending_sales (APPROVE/REJECT) and pending_finance (REJECT)
  assert.equal(countActionable(quotes, salesMgr), 2);
});

test('countActionable: cost engineer on all pending → 0', () => {
  const quotes = [
    { state: { approval: { status: 'pending_sales' } } },
    { state: { approval: { status: 'pending_finance' } } },
  ];
  assert.equal(countActionable(quotes, costEng), 0);
});

test('countActionable: finance_dir on pending_sales → REJECT only, counts', () => {
  const quotes = [
    { state: { approval: { status: 'pending_sales' } } },
    { state: { approval: { status: 'pending_finance' } } },
  ];
  assert.equal(countActionable(quotes, finDir), 2);
});

test('countActionable: admin fallback authorizes all pending gates', () => {
  const quotes = [
    { state: { approval: { status: 'pending_sales' } } },
    { state: { approval: { status: 'pending_finance' } } },
    { state: { approval: { status: 'pending_sales' } } },
  ];
  assert.equal(countActionable(quotes, admin), 3);
});

test('countActionable: quotes missing state or approval are skipped', () => {
  const quotes = [
    null,
    {},                                   // no state
    { state: null },
    { state: { approval: null } },        // no approval = draft
    { state: { approval: { status: 'pending_sales' } } },
  ];
  assert.equal(countActionable(quotes, salesMgr), 1);
});

test('countActionable: legacy submitted alias is treated as pending_sales', () => {
  const quotes = [
    { state: { approval: { status: 'submitted', submitted_by: 'hana' } } },
  ];
  assert.equal(countActionable(quotes, salesMgr), 1);
});

// ── Immutability ──
test('transition() does not mutate input approval object', () => {
  const s0 = { status: 'pending_sales', history: [] };
  const frozen = Object.freeze(s0);
  const r = transition({ approval: frozen, action: 'APPROVE_SALES', actorUser: salesMgr });
  assert.equal(r.ok, true);
  assert.equal(s0.status, 'pending_sales', 'input untouched');
  assert.equal(s0.history.length, 0, 'input history untouched');
});
