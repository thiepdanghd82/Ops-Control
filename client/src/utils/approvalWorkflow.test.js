/**
 * approvalWorkflow (client) — parity tests with the server state
 * machine. These tests don't re-derive semantics; they lock in that
 * the client button-gating logic agrees with the server's source of
 * truth so the two stay synchronized.
 *   node --test src/utils/approvalWorkflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatus,
  availableActions,
  statusDisplay,
  actionDisplay,
  APPROVAL_STATES,
} from './approvalWorkflow.js';

const costEng = { username: 'hana', role: 'cost', approval_roles: [] };
const salesMgr = { username: 'sonia', role: 'user', approval_roles: ['sales_mgr'] };
const finDir = { username: 'felix', role: 'user', approval_roles: ['finance_dir'] };
const admin = { username: 'admin', role: 'admin', approval_roles: [] };
const sysUser = { username: 'root', role: 'sys', approval_roles: [] };
const viewonly = { username: 'vic', role: 'viewonly', approval_roles: [] };

test('APPROVAL_STATES matches server set', () => {
  assert.deepEqual(APPROVAL_STATES, [
    'draft',
    'pending_sales',
    'pending_finance',
    'approved',
    'rejected',
  ]);
});

test('getStatus: legacy submitted alias', () => {
  assert.equal(getStatus({ status: 'submitted' }), 'pending_sales');
  assert.equal(getStatus(null), 'draft');
  assert.equal(getStatus({ status: 'bogus' }), 'draft');
});

test('availableActions: draft + cost engineer → [SUBMIT]', () => {
  assert.deepEqual(availableActions(null, costEng), ['SUBMIT']);
});

test('availableActions: draft + viewonly → []', () => {
  assert.deepEqual(availableActions(null, viewonly), []);
});

test('availableActions: pending_sales + sales_mgr → APPROVE_SALES + REJECT', () => {
  const acts = availableActions({ status: 'pending_sales' }, salesMgr);
  assert.ok(acts.includes('APPROVE_SALES'));
  assert.ok(acts.includes('REJECT'));
  assert.equal(acts.length, 2);
});

test('availableActions: pending_sales + finance_dir → REJECT only', () => {
  const acts = availableActions({ status: 'pending_sales' }, finDir);
  assert.deepEqual(acts, ['REJECT']);
});

test('availableActions: pending_sales + cost engineer → []', () => {
  assert.deepEqual(availableActions({ status: 'pending_sales' }, costEng), []);
});

test('availableActions: pending_sales + admin (fallback) → APPROVE_SALES + REJECT', () => {
  const acts = availableActions({ status: 'pending_sales' }, admin);
  assert.ok(acts.includes('APPROVE_SALES'));
  assert.ok(acts.includes('REJECT'));
});

test('availableActions: pending_finance + finance_dir → APPROVE_FINANCE + REJECT', () => {
  const acts = availableActions({ status: 'pending_finance' }, finDir);
  assert.ok(acts.includes('APPROVE_FINANCE'));
  assert.ok(acts.includes('REJECT'));
});

test('availableActions: approved + sys → [REVOKE]', () => {
  assert.deepEqual(availableActions({ status: 'approved' }, sysUser), ['REVOKE']);
});

test('availableActions: approved + admin → [] (admin cannot revoke)', () => {
  assert.deepEqual(availableActions({ status: 'approved' }, admin), []);
});

test('availableActions: rejected + cost engineer → [SUBMIT] (re-submit path)', () => {
  assert.deepEqual(availableActions({ status: 'rejected' }, costEng), ['SUBMIT']);
});

test('availableActions: null user → []', () => {
  assert.deepEqual(availableActions(null, null), []);
  assert.deepEqual(availableActions({ status: 'pending_sales' }, undefined), []);
});

test('statusDisplay returns label + tone for every state', () => {
  for (const s of APPROVAL_STATES) {
    const d = statusDisplay(s);
    assert.ok(d.label);
    assert.ok(d.tone);
  }
  // Legacy alias.
  assert.equal(statusDisplay('submitted').label, 'Pending Sales');
  // Fallback.
  const unknown = statusDisplay('xyz');
  assert.equal(unknown.label, 'xyz');
});

test('actionDisplay covers all actions the UI can render', () => {
  for (const a of ['SUBMIT', 'APPROVE_SALES', 'APPROVE_FINANCE', 'REJECT', 'REVOKE']) {
    const d = actionDisplay(a);
    assert.ok(d.label);
    assert.ok(d.tone);
  }
});
