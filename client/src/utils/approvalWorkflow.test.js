/**
 * approvalWorkflow (client) — parity tests with the server state
 * machine. These tests don't re-derive semantics; they lock in that
 * the client dropdown-gating logic agrees with the server's source of
 * truth so the two stay synchronized.
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — rewritten for the flat
 * 5-status dropdown model. Legacy v1 cases (SUBMIT/APPROVE_SALES/etc.)
 * are gone; heal-on-read tests now cover the legacy STATUS strings
 * that may still be present in older quote records.
 *
 *   node --test src/utils/approvalWorkflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatus,
  availableTargetStatuses,
  canUserSetStatus,
  statusDisplay,
  statusRequiresReason,
  APPROVAL_STATES,
} from './approvalWorkflow.js';

const costEng = { username: 'hana', role: 'cost', approval_roles: [] };
const sales = { username: 'sonia', role: 'user', approval_roles: ['sales'] };
const salesMgrLegacy = { username: 'sue', role: 'user', approval_roles: ['sales_mgr'] };
const finDirLegacy = { username: 'felix', role: 'user', approval_roles: ['finance_dir'] };
const admin = { username: 'admin', role: 'admin', approval_roles: [] };
const sysUser = { username: 'root', role: 'sys', approval_roles: [] };
const viewonly = { username: 'vic', role: 'viewonly', approval_roles: [] };
const plainUser = { username: 'ulla', role: 'user', approval_roles: [] };

test('APPROVAL_STATES is the canonical 5 in dropdown order', () => {
  assert.deepEqual(APPROVAL_STATES, [
    'draft',
    'quote_to_sale',
    'price_approved',
    'cancelled',
    'rejected',
  ]);
});

test('getStatus: heal-on-read maps legacy v1 statuses', () => {
  assert.equal(getStatus({ status: 'submitted' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'pending_sales' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'pending_finance' }), 'quote_to_sale');
  assert.equal(getStatus({ status: 'approved' }), 'price_approved');
});

test('getStatus: fallback to draft for null / unknown', () => {
  assert.equal(getStatus(null), 'draft');
  assert.equal(getStatus({}), 'draft');
  assert.equal(getStatus({ status: 'bogus' }), 'draft');
});

test('canUserSetStatus: cost engineer can set any of the 5 statuses', () => {
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

test('canUserSetStatus: sales (new role) can only set price_approved + cancelled + rejected', () => {
  assert.equal(canUserSetStatus(sales, 'draft'), false);
  assert.equal(canUserSetStatus(sales, 'quote_to_sale'), false);
  assert.equal(canUserSetStatus(sales, 'price_approved'), true);
  assert.equal(canUserSetStatus(sales, 'cancelled'), true);
  assert.equal(canUserSetStatus(sales, 'rejected'), true);
});

test('canUserSetStatus: legacy sales_mgr approval_role is treated as sales', () => {
  assert.equal(canUserSetStatus(salesMgrLegacy, 'price_approved'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'cancelled'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'rejected'), true);
  assert.equal(canUserSetStatus(salesMgrLegacy, 'quote_to_sale'), false);
});

test('canUserSetStatus: viewonly + plain user without sales role cannot set anything', () => {
  for (const user of [viewonly, plainUser]) {
    for (const s of APPROVAL_STATES) {
      assert.equal(canUserSetStatus(user, s), false, `${user.role} must not set ${s}`);
    }
  }
});

test('canUserSetStatus: legacy finance_dir alone (no sales) does NOT grant Sales perms', () => {
  // finance_dir is no longer a recognised approval_role in V2. Users
  // carrying ONLY 'finance_dir' lose their v1 powers (admins should
  // migrate them to 'sales' or promote to admin role).
  assert.equal(canUserSetStatus(finDirLegacy, 'price_approved'), false);
  assert.equal(canUserSetStatus(finDirLegacy, 'rejected'), false);
});

test('canUserSetStatus: null user → false', () => {
  for (const s of APPROVAL_STATES) {
    assert.equal(canUserSetStatus(null, s), false);
    assert.equal(canUserSetStatus(undefined, s), false);
  }
});

test('availableTargetStatuses excludes the current status (no-op skipped)', () => {
  const targets = availableTargetStatuses({ status: 'quote_to_sale' }, costEng);
  assert.equal(targets.includes('quote_to_sale'), false);
  // The remaining 4 should all appear for a cost engineer.
  assert.deepEqual(targets, ['draft', 'price_approved', 'cancelled', 'rejected']);
});

test('availableTargetStatuses for sales on draft quote → 3 transition targets', () => {
  // Sales can't set draft / quote_to_sale and the quote IS draft so
  // it's already excluded — leaves price_approved / cancelled / rejected.
  const targets = availableTargetStatuses(null, sales);
  assert.deepEqual(targets, ['price_approved', 'cancelled', 'rejected']);
});

test('availableTargetStatuses for legacy pending_sales (heal-on-read) → quote_to_sale current', () => {
  // Heal-on-read sees 'pending_sales' → 'quote_to_sale', so that's
  // excluded from the dropdown options on a cost engineer's account.
  const targets = availableTargetStatuses({ status: 'pending_sales' }, costEng);
  assert.equal(targets.includes('quote_to_sale'), false);
  assert.ok(targets.includes('price_approved'));
});

test('statusRequiresReason: cancelled + rejected require reason; others do not', () => {
  assert.equal(statusRequiresReason('cancelled'), true);
  assert.equal(statusRequiresReason('rejected'), true);
  assert.equal(statusRequiresReason('draft'), false);
  assert.equal(statusRequiresReason('quote_to_sale'), false);
  assert.equal(statusRequiresReason('price_approved'), false);
});

test('statusDisplay returns label + tone for every state', () => {
  for (const s of APPROVAL_STATES) {
    const d = statusDisplay(s);
    assert.ok(d.label, `label for ${s}`);
    assert.ok(d.tone, `tone for ${s}`);
  }
  // Heal-on-read: legacy alias still renders a useful label.
  assert.equal(statusDisplay('submitted').label, 'Quote to sale');
  assert.equal(statusDisplay('approved').label, 'Price Approved');
  // Fallback for entirely unknown values surfaces the raw string.
  assert.equal(statusDisplay('xyz').label, 'xyz');
});
