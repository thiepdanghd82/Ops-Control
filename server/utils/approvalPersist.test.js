/**
 * approvalPersist — integration-style test proving the exact
 * read-modify-write pattern the /approvals/:id/transition endpoint
 * uses survives concurrent callers. Exercises:
 *   - asyncLock keyed by quote id
 *   - approvalWorkflow.transition() state machine
 *   - real filesystem write of a quote_history-shaped JSON
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — rewritten for the flat
 * dropdown model. `action` is now a target status; same-status
 * transitions are no-ops; lock semantics unchanged.
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
    const idx = quotes.findIndex((q) => q.id === quoteId);
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

const costEng = { username: 'hana', role: 'cost', approval_roles: [] };
const sales = { username: 'sonia', role: 'user', approval_roles: ['sales'] };
const admin = { username: 'admin', role: 'admin', approval_roles: [] };

test('end-to-end: full draft → quote_to_sale → price_approved chain persists to file', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, type: 'standard', state: {} }]);

  const r1 = await applyTransition(file, 1, 'quote_to_sale', costEng);
  assert.equal(r1.ok, true);
  assert.equal(readHistory(file)[0].state.approval.status, 'quote_to_sale');

  const r2 = await applyTransition(file, 1, 'price_approved', sales);
  assert.equal(r2.ok, true);
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'price_approved');
  assert.equal(final.changed_by, 'sonia');
  assert.equal(final.history.length, 2, 'history = 2 transitions');
});

test('concurrent transitions on two different quotes stay parallel', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [
    { id: 1, state: {} },
    { id: 2, state: {} },
    { id: 3, state: {} },
  ]);

  const [r1, r2, r3] = await Promise.all([
    applyTransition(file, 1, 'quote_to_sale', costEng),
    applyTransition(file, 2, 'quote_to_sale', costEng),
    applyTransition(file, 3, 'quote_to_sale', costEng),
  ]);
  assert.ok(r1.ok && r2.ok && r3.ok);
  const after = readHistory(file);
  assert.equal(after[0].state.approval.status, 'quote_to_sale');
  assert.equal(after[1].state.approval.status, 'quote_to_sale');
  assert.equal(after[2].state.approval.status, 'quote_to_sale');
});

test('concurrent duplicate transition: second one hits same-status no-op error', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, state: {} }]);
  await applyTransition(file, 1, 'quote_to_sale', costEng);

  // Two callers race to set the SAME target status. Lock serializes
  // them — first wins, second sees the quote already at quote_to_sale
  // and fails with "Status already quote_to_sale". The lock prevents
  // a silent double-write that would inflate history.length.
  const [a, b] = await Promise.all([
    applyTransition(file, 1, 'price_approved', admin),
    applyTransition(file, 1, 'price_approved', admin),
  ]);
  const okCount = [a, b].filter((r) => r.ok).length;
  const failCount = [a, b].filter((r) => !r.ok).length;
  assert.equal(okCount, 1, 'exactly one transition succeeds');
  assert.equal(failCount, 1, 'the loser is rejected, not silently dropped');
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'price_approved');
  assert.equal(final.history.length, 2, 'history = quote_to_sale + price_approved');
});

test('concurrent price_approved + rejected on same quote: deterministic terminal status', async () => {
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, state: {} }]);
  await applyTransition(file, 1, 'quote_to_sale', costEng);

  // Race: one caller approves, another rejects. Both are valid
  // transitions from quote_to_sale. The lock orders them, so the
  // final state is whichever ran LAST. Either way, both ops
  // succeed; history.length is always 3 (quote_to_sale + win + loser).
  // Actually no — the loser sees the new status (price_approved or
  // rejected) and runs its OWN transition off that. The invariant
  // we lock in: both ops succeed AND history is a clean 3-entry chain.
  const [a, b] = await Promise.all([
    applyTransition(file, 1, 'price_approved', admin),
    applyTransition(file, 1, 'rejected', admin, 'changed mind'),
  ]);
  assert.equal(a.ok, true, 'price_approved must succeed (no role gate against it)');
  assert.equal(b.ok, true, 'rejected must succeed (admin can reject any state with reason)');
  const final = readHistory(file)[0].state.approval;
  assert.ok(
    final.status === 'rejected' || final.status === 'price_approved',
    `lock must converge to one terminal status; got ${final.status}`
  );
  assert.equal(final.history.length, 3, 'history = quote_to_sale + first + second');
});

test('100 concurrent identical transitions on draft: exactly 1 succeeds per target', async () => {
  // Build a draft quote. Fire 100 concurrent transitions to
  // quote_to_sale. Without the lock, multiple would write phantom
  // history entries. With the lock, only the FIRST wins; the rest
  // fail with "Status already quote_to_sale".
  const file = tmpHistoryFile();
  writeHistory(file, [{ id: 1, state: {} }]);

  const results = await Promise.all(
    Array.from({ length: 100 }, () => applyTransition(file, 1, 'quote_to_sale', costEng))
  );
  const ok = results.filter((r) => r.ok).length;
  assert.equal(ok, 1, `exactly one transition wins, got ${ok}`);
  const final = readHistory(file)[0].state.approval;
  assert.equal(final.status, 'quote_to_sale');
  assert.equal(final.history.length, 1);
});
