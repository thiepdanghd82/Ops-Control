/**
 * approvalPersist — integration-style test proving the exact
 * read-modify-write pattern the new /approvals/:id/transition endpoint
 * uses survives concurrent callers. Exercises:
 *   - asyncLock keyed by quote id
 *   - approvalWorkflow.transition() state machine
 *   - real filesystem write of a quote_history-shaped JSON
 *
 * Without the lock this test reliably loses transitions (two SUBMITs
 * land but only one is visible). With the lock all transitions land
 * and the history chain is complete.
 *
 *   node --test server/utils/approvalPersist.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withLock } from './asyncLock.js';
import { transition as approvalTransition } from '../repositories/approvalWorkflow.js';
import { atomicWriteFileSync } from '../services/atomicWrite.js';

function tmpHistoryFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-approval-'));
  return path.join(dir, 'quote_history.json');
}

function readHistory(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeHistory(p, quotes) {
  atomicWriteFileSync(p, JSON.stringify(quotes, null, 2));
}

async function applyTransition(filePath, quoteId, action, actorUser, reason) {
  return withLock(`quote:${quoteId}`, async () => {
    const quotes = readHistory(filePath);
    const idx = quotes.findIndex(q => q.id === quoteId);
    if (idx === -1) return { ok: false, error: 'not found' };
    const prev = quotes[idx].state?.approval || null;
    const tr = approvalTransition({ approval: prev, action, actorUser, reason });
    if (!tr.ok) return tr;
    if (!quotes[idx].state) quotes[idx].state = {};
    quotes[idx].state.approval = tr.approval;
    writeHistory(filePath, quotes);
    return { ok: true, approval: tr.approval };
  });
}

const costEng  = { username: 'hana',  role: 'cost',  approval_roles: [] };
const salesMgr = { username: 'sonia', role: 'user',  approval_roles: ['sales_mgr'] };
const finDir   = { username: 'felix', role: 'user',  approval_roles: ['finance_dir'] };

test('end-to-end: full Cost→Sales→Finance chain persists to file', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, type: 'standard', state: {} }]);

  const r1 = await applyTransition(file, 1, 'SUBMIT', costEng);
  assert.equal(r1.ok, true);
  assert.equal(readHistory(file)[0].state.approval.status, 'pending_sales');

  const r2 = await applyTransition(file, 1, 'APPROVE_SALES', salesMgr);
  assert.equal(r2.ok, true);
  assert.equal(readHistory(file)[0].state.approval.status, 'pending_finance');
  assert.equal(readHistory(file)[0].state.approval.sales_approved_by, 'sonia');

  const r3 = await applyTransition(file, 1, 'APPROVE_FINANCE', finDir);
  assert.equal(r3.ok, true);
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'approved');
  assert.equal(final.finance_approved_by, 'felix');
  assert.equal(final.approved_by, 'felix', 'v1 mirror preserved');
  assert.equal(final.history.length, 3, 'history = SUBMIT + APPROVE_SALES + APPROVE_FINANCE');
});

test('concurrent SUBMITs on two different quotes stay parallel', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [
    { id: 1, state: {} },
    { id: 2, state: {} },
    { id: 3, state: {} },
  ]);

  const [r1, r2, r3] = await Promise.all([
    applyTransition(file, 1, 'SUBMIT', costEng),
    applyTransition(file, 2, 'SUBMIT', costEng),
    applyTransition(file, 3, 'SUBMIT', costEng),
  ]);
  assert.ok(r1.ok && r2.ok && r3.ok);
  const after = readHistory(file);
  assert.equal(after[0].state.approval.status, 'pending_sales');
  assert.equal(after[1].state.approval.status, 'pending_sales');
  assert.equal(after[2].state.approval.status, 'pending_sales');
});

test('concurrent duplicate APPROVE_SALES: second one hits invalid-state error', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, state: {} }]);
  // Put the quote in pending_sales first.
  await applyTransition(file, 1, 'SUBMIT', costEng);

  // Two sales managers race to approve. Lock serializes them:
  // first wins → pending_finance; second sees pending_finance and
  // fails with "Cannot APPROVE_SALES from status pending_finance".
  const [a, b] = await Promise.all([
    applyTransition(file, 1, 'APPROVE_SALES', salesMgr),
    applyTransition(file, 1, 'APPROVE_SALES', salesMgr),
  ]);
  const okCount = [a, b].filter(r => r.ok).length;
  const failCount = [a, b].filter(r => !r.ok).length;
  assert.equal(okCount, 1, 'exactly one transition succeeds');
  assert.equal(failCount, 1, 'the loser is rejected, not silently dropped');
  // Final state on disk is pending_finance, history length = 2 (SUBMIT + one APPROVE_SALES).
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'pending_finance');
  assert.equal(final.history.length, 2);
});

test('concurrent APPROVE_SALES + REJECT on same pending_sales quote: deterministic rejected outcome', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, state: {} }]);
  await applyTransition(file, 1, 'SUBMIT', costEng);

  // Both reviewers act simultaneously while the quote is at
  // pending_sales. The lock orders them; the two legal orderings are:
  //   (a) APPROVE_SALES → pending_finance; then REJECT → rejected
  //       (REJECT is valid at pending_finance). Both ops succeed,
  //       history length = 3.
  //   (b) REJECT → rejected; then APPROVE_SALES on rejected fails
  //       (rejected only accepts SUBMIT). One op succeeds, history
  //       length = 2.
  // The invariant that matters: final status is `rejected` in BOTH
  // orderings (no mid-state leak) and history is a clean chain with
  // no phantom writes.
  const [approve, reject] = await Promise.all([
    applyTransition(file, 1, 'APPROVE_SALES', salesMgr),
    applyTransition(file, 1, 'REJECT', salesMgr, 'changed my mind'),
  ]);
  // REJECT never fails from a legal state under this scenario.
  assert.equal(reject.ok, true, 'REJECT should always land');
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'rejected', `lock must converge to rejected; got ${final.status}`);
  // Whichever ordering, history entries are either SUBMIT+APPROVE_SALES+REJECT or SUBMIT+REJECT.
  assert.ok([2, 3].includes(final.history.length),
    `history length ${final.history.length} must be 2 or 3`);
  const last = final.history[final.history.length - 1];
  assert.equal(last.action, 'REJECT');
  assert.equal(last.to, 'rejected');
  // Whichever won the race for APPROVE_SALES, it must either be
  // reflected (len=3) or completely absent (len=2) — never half-applied.
  if (final.history.length === 3) {
    assert.equal(final.history[1].action, 'APPROVE_SALES');
    assert.equal(approve.ok, true, 'approve succeeded in the 3-entry path');
  } else {
    assert.equal(approve.ok, false, 'approve failed in the 2-entry path');
  }
});

test('100 concurrent SUBMITs on rejected quote: exactly 1 succeeds per turn', async () => {
  // Build a quote already in rejected state — SUBMIT is the only
  // legal transition. Fire 100 concurrent SUBMITs. Without the lock,
  // a rejected→pending_sales→SUBMIT-from-pending_sales race would
  // produce invalid transitions silently recorded by the state
  // machine. With the lock, only the FIRST submit moves to
  // pending_sales; the rest fail with "Cannot SUBMIT from pending_sales".
  const file = tmpHistoryFile();
  const rejected = {
    status: 'rejected',
    rejected_by: 'sonia',
    reason: 'fix',
    history: [{ ts: new Date().toISOString(), from: 'pending_sales', to: 'rejected', action: 'REJECT', actor: 'sonia' }],
  };
  writeHistory(file, [{ id: 1, state: { approval: rejected } }]);

  const results = await Promise.all(
    Array.from({ length: 100 }, () => applyTransition(file, 1, 'SUBMIT', costEng))
  );
  const ok = results.filter(r => r.ok).length;
  assert.equal(ok, 1, `exactly one SUBMIT wins, got ${ok}`);
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'pending_sales');
});
