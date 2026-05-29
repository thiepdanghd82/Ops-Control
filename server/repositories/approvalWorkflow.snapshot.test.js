/**
 * Phase 9E.4 — approval snapshot freeze tests.
 *
 * Verifies that:
 *  - APPROVE_FINANCE captures the pricing snapshot into
 *    approval.rates_snapshot when the caller supplies it.
 *  - Other actions (SUBMIT, APPROVE_SALES, REJECT, REVOKE) don't
 *    write or persist a snapshot.
 *  - REVOKE clears the snapshot so a re-approval captures a fresh one.
 *  - Back-compat: callers that don't pass `snapshot` still work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { transition } from './approvalWorkflow.js';

const costEng = { username: 'hana', role: 'cost', approval_roles: [] };
const salesMgr = { username: 'sonia', role: 'user', approval_roles: ['sales_mgr'] };
const finDir = { username: 'felix', role: 'user', approval_roles: ['finance_dir'] };

// Helper — walk a fresh quote from draft → pending_finance.
function toPendingFinance() {
  const r1 = transition({ approval: null, action: 'SUBMIT', actorUser: costEng });
  assert.ok(r1.ok);
  const r2 = transition({ approval: r1.approval, action: 'APPROVE_SALES', actorUser: salesMgr });
  assert.ok(r2.ok);
  return r2.approval;
}

test('APPROVE_FINANCE with snapshot freezes site + rate', () => {
  const pending = toPendingFinance();
  const snapshot = { site: 'VN', sga_rate_pct: 5 };
  const r = transition({
    approval: pending,
    action: 'APPROVE_FINANCE',
    actorUser: finDir,
    snapshot,
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'approved');
  assert.ok(r.approval.rates_snapshot, 'rates_snapshot must be set');
  assert.equal(r.approval.rates_snapshot.site, 'VN');
  assert.equal(r.approval.rates_snapshot.sga_rate_pct, 5);
  assert.ok(r.approval.rates_snapshot.frozen_at, 'frozen_at timestamp stamped');
  assert.equal(r.approval.rates_snapshot.frozen_by, 'felix');
});

test('APPROVE_FINANCE without snapshot still succeeds (back-compat)', () => {
  const pending = toPendingFinance();
  const r = transition({ approval: pending, action: 'APPROVE_FINANCE', actorUser: finDir });
  assert.equal(r.ok, true);
  assert.equal(r.approval.rates_snapshot, undefined, 'no snapshot recorded when caller omits');
});

test('APPROVE_FINANCE normalizes non-finite rate to 0', () => {
  const pending = toPendingFinance();
  const r = transition({
    approval: pending,
    action: 'APPROVE_FINANCE',
    actorUser: finDir,
    snapshot: { site: 'VN', sga_rate_pct: 'abc' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.rates_snapshot.sga_rate_pct, 0);
});

test('SUBMIT / APPROVE_SALES do not record snapshot', () => {
  const r1 = transition({
    approval: null,
    action: 'SUBMIT',
    actorUser: costEng,
    snapshot: { site: 'VN', sga_rate_pct: 5 },
  });
  assert.equal(r1.approval.rates_snapshot, undefined);

  const r2 = transition({
    approval: r1.approval,
    action: 'APPROVE_SALES',
    actorUser: salesMgr,
    snapshot: { site: 'VN', sga_rate_pct: 5 },
  });
  assert.equal(r2.approval.rates_snapshot, undefined);
});

test('REJECT does not write snapshot', () => {
  const pending = toPendingFinance();
  const r = transition({
    approval: pending,
    action: 'REJECT',
    actorUser: finDir,
    reason: 'margin too low',
    snapshot: { site: 'VN', sga_rate_pct: 5 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'rejected');
  assert.equal(r.approval.rates_snapshot, undefined);
});

test('REVOKE clears snapshot — next approval captures fresh one', () => {
  const pending = toPendingFinance();
  const approved = transition({
    approval: pending,
    action: 'APPROVE_FINANCE',
    actorUser: finDir,
    snapshot: { site: 'VN', sga_rate_pct: 5 },
  }).approval;
  assert.ok(approved.rates_snapshot);

  const sys = { username: 'root', role: 'sys', approval_roles: [] };
  const revoked = transition({
    approval: approved,
    action: 'REVOKE',
    actorUser: sys,
  }).approval;
  assert.equal(revoked.rates_snapshot, undefined, 'REVOKE must clear snapshot');
  assert.equal(revoked.status, 'draft');
});

test('snapshot is copied, not referenced — caller mutations do not affect the stored value', () => {
  const pending = toPendingFinance();
  const snapshot = { site: 'VN', sga_rate_pct: 5 };
  const r = transition({
    approval: pending,
    action: 'APPROVE_FINANCE',
    actorUser: finDir,
    snapshot,
  });
  snapshot.sga_rate_pct = 99; // attacker mutates input after call
  assert.equal(
    r.approval.rates_snapshot.sga_rate_pct,
    5,
    'stored snapshot must be independent of caller'
  );
});
