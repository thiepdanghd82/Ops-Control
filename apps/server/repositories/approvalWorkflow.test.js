/**
 * approvalWorkflow — state machine tests for the V2 5-status dropdown.
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — rewritten from the v1
 * 3-stage chain (draft → pending_sales → pending_finance → approved)
 * to the flat dropdown model. Legacy v1 test cases are gone except
 * for heal-on-read coverage on getStatus / transition.
 *
 *   node --test server/repositories/approvalWorkflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transition,
  getStatus,
  availableTargetStatuses,
  canUserSetStatus,
  countActionable,
  APPROVAL_STATES,
} from './approvalWorkflow.js';

// ── Fixtures ──
const costEng = { username: 'hana', role: 'cost', approval_roles: [] };
const sales = { username: 'sonia', role: 'user', approval_roles: ['sales'] };
const salesMgrLegacy = { username: 'sue', role: 'user', approval_roles: ['sales_mgr'] };
const finDirLegacy = { username: 'felix', role: 'user', approval_roles: ['finance_dir'] };
const admin = { username: 'admin', role: 'admin', approval_roles: [] };
const sysUser = { username: 'root', role: 'sys', approval_roles: [] };
const viewonly = { username: 'vic', role: 'viewonly', approval_roles: [] };
const plainUser = { username: 'ulla', role: 'user', approval_roles: [] };

// ── Shape + initial state ──
test('APPROVAL_STATES lists the V2 5 statuses in dropdown order', () => {
  assert.deepEqual(APPROVAL_STATES, [
    'draft',
    'quote_to_sale',
    'price_approved',
    'cancelled',
    'rejected',
  ]);
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

test('getStatus: heal-on-read maps legacy v1 statuses', () => {
  assert.equal(getStatus({ status: 'submitted' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'pending_sales' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'pending_finance' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'approved' }), 'price_approved');
});

// ── canUserSetStatus / availableTargetStatuses ──
test('canUserSetStatus: cost engineer can set any of the 5', () => {
  for (const s of APPROVAL_STATES) {
    assert.equal(canUserSetStatus(costEng, s), true, `cost should set ${s}`);
  }
});

test('canUserSetStatus: admin + sys can set any of the 5', () => {
  for (const user of [admin, sysUser]) {
    for (const s of APPROVAL_STATES) {
      assert.equal(canUserSetStatus(user, s), true, `${user.role} should set ${s}`);
    }
  }
});

test('canUserSetStatus: sales approval_role unlocks price_approved + cancelled + rejected', () => {
  assert.equal(canUserSetStatus(sales, 'draft'), false);
  assert.equal(canUserSetStatus(sales, 'quote_to_sale'), false);
  assert.equal(canUserSetStatus(sales, 'price_approved'), true);
  assert.equal(canUserSetStatus(sales, 'cancelled'), true);
  assert.equal(canUserSetStatus(sales, 'rejected'), true);
});

test('canUserSetStatus: legacy sales_mgr is aliased as sales', () => {
  assert.equal(canUserSetStatus(salesMgrLegacy, 'price_approved'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'cancelled'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'rejected'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'quote_to_sale'), false);
});

test('canUserSetStatus: legacy finance_dir alone (no sales) loses its v1 privileges', () => {
  assert.equal(canUserSetStatus(finDirLegacy, 'price_approved'), false);
  assert.equal(canUserSetStatus(finDirLegacy, 'rejected'), false);
});

test('canUserSetStatus: viewonly + plain user → false for everything', () => {
  for (const user of [viewonly, plainUser]) {
    for (const s of APPROVAL_STATES) {
      assert.equal(canUserSetStatus(user, s), false, `${user.role} must not set ${s}`);
    }
  }
});

test('availableTargetStatuses excludes the current status', () => {
  const targets = availableTargetStatuses({ status: 'quote_to_sale' }, costEng);
  assert.equal(targets.includes('quote_to_sale'), false);
  assert.deepEqual(targets, ['draft', 'price_approved', 'cancelled', 'rejected']);
});

// ── transition: forward + backward + no-op ──
test('transition: draft → quote_to_sale by cost engineer', () => {
  const r = transition({ approval: null, action: 'quote_to_sale', actorUser: costEng });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'quote_to_sale');
  assert.equal(r.approval.changed_by, 'hana');
  assert.ok(r.approval.changed_at, 'changed_at stamped');
  assert.equal(r.approval.history.length, 1);
  assert.equal(r.approval.history[0].from, 'draft');
  assert.equal(r.approval.history[0].to, 'quote_to_sale');
});

test('transition: quote_to_sale → price_approved by sales', () => {
  const s1 = transition({ approval: null, action: 'quote_to_sale', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'price_approved', actorUser: sales });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'price_approved');
  assert.equal(r.approval.changed_by, 'sonia');
  assert.equal(r.approval.history.length, 2);
});

test('transition: any status → draft is allowed for cost engineer (rollback flow)', () => {
  const s1 = transition({
    approval: null,
    action: 'price_approved',
    actorUser: admin,
  }).approval;
  const r = transition({ approval: s1, action: 'draft', actorUser: costEng });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'draft');
});

test('transition: same → same is rejected (no-op)', () => {
  const s1 = transition({ approval: null, action: 'quote_to_sale', actorUser: costEng }).approval;
  const r = transition({ approval: s1, action: 'quote_to_sale', actorUser: costEng });
  assert.equal(r.ok, false);
  assert.match(r.error, /already/i);
});

test('transition: unknown target status is rejected', () => {
  const r = transition({ approval: null, action: 'made_up', actorUser: admin });
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown target status/i);
});

test('transition: viewonly cannot set anything', () => {
  const r = transition({ approval: null, action: 'quote_to_sale', actorUser: viewonly });
  assert.equal(r.ok, false);
  assert.match(r.error, /cannot set status/);
});

// ── Reason-required: cancelled + rejected ──
test('transition: cancelled without reason → rejected', () => {
  const r = transition({ approval: null, action: 'cancelled', actorUser: costEng });
  assert.equal(r.ok, false);
  assert.match(r.error, /reason/i);
});

test('transition: cancelled with reason → ok', () => {
  const r = transition({
    approval: null,
    action: 'cancelled',
    actorUser: costEng,
    reason: 'Customer pulled the order',
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'cancelled');
  assert.equal(r.approval.reason, 'Customer pulled the order');
  assert.equal(r.approval.history[0].reason, 'Customer pulled the order');
});

test('transition: rejected without reason → rejected', () => {
  const r = transition({ approval: null, action: 'rejected', actorUser: admin });
  assert.equal(r.ok, false);
  assert.match(r.error, /reason/i);
});

test('transition: rejected with reason → ok by sales', () => {
  const s1 = transition({ approval: null, action: 'quote_to_sale', actorUser: costEng }).approval;
  const r = transition({
    approval: s1,
    action: 'rejected',
    actorUser: sales,
    reason: 'Margin below 25% target',
  });
  assert.equal(r.ok, true);
  assert.equal(r.approval.status, 'rejected');
  assert.equal(r.approval.changed_by, 'sonia');
});

test('transition: reason field is dropped when transitioning to a non-reason status', () => {
  const s1 = transition({
    approval: null,
    action: 'rejected',
    actorUser: admin,
    reason: 'X',
  }).approval;
  assert.equal(s1.reason, 'X');
  // Now transition back to draft (no reason needed) → reason cleared.
  const r = transition({ approval: s1, action: 'draft', actorUser: costEng });
  assert.equal(r.ok, true);
  assert.equal(r.approval.reason, undefined);
});

// ── History bound ──
test('history is capped at 50 entries', () => {
  let approval = null;
  // Thrash: alternate quote_to_sale and draft.
  for (let i = 0; i < 60; i++) {
    approval = transition({
      approval,
      action: i % 2 === 0 ? 'quote_to_sale' : 'draft',
      actorUser: admin,
    }).approval;
  }
  assert.equal(approval.history.length, 50);
});

// ── countActionable (sidebar inbox badge) ──
test('countActionable: empty inputs → 0', () => {
  assert.equal(countActionable(null, sales), 0);
  assert.equal(countActionable([], sales), 0);
  assert.equal(countActionable([{ state: {} }], null), 0);
});

test('countActionable: counts only quotes in quote_to_sale that user can approve', () => {
  const quotes = [
    { state: { approval: { status: 'draft' } } },
    { state: { approval: { status: 'price_approved' } } },
    { state: { approval: { status: 'rejected' } } },
    { state: { approval: { status: 'cancelled' } } },
    { state: { approval: { status: 'quote_to_sale' } } },
    { state: { approval: { status: 'quote_to_sale' } } },
  ];
  // sales can transition quote_to_sale → price_approved
  assert.equal(countActionable(quotes, sales), 2);
});

test('countActionable: legacy pending_sales / pending_finance heal-on-read into the queue', () => {
  const quotes = [
    { state: { approval: { status: 'pending_sales' } } },
    { state: { approval: { status: 'pending_finance' } } },
    { state: { approval: { status: 'submitted' } } },
  ];
  assert.equal(countActionable(quotes, sales), 3);
});

test('countActionable: soft-deleted quotes are excluded', () => {
  const quotes = [
    { state: { approval: { status: 'quote_to_sale' } }, deleted_at: '2026-01-01' },
    { state: { approval: { status: 'quote_to_sale' } } },
  ];
  assert.equal(countActionable(quotes, sales), 1);
});

test('countActionable: plain user without sales role → 0 even when quotes await review', () => {
  const quotes = [
    { state: { approval: { status: 'quote_to_sale' } } },
    { state: { approval: { status: 'quote_to_sale' } } },
  ];
  assert.equal(countActionable(quotes, plainUser), 0);
});

// ── Immutability ──
test('transition() does not mutate input approval object', () => {
  const s0 = { status: 'quote_to_sale', history: [] };
  const frozen = Object.freeze(s0);
  const r = transition({ approval: frozen, action: 'price_approved', actorUser: admin });
  assert.equal(r.ok, true);
  assert.equal(s0.status, 'quote_to_sale', 'input untouched');
  assert.equal(s0.history.length, 0, 'input history untouched');
});
