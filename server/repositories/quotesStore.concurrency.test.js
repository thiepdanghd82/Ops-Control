/**
 * Sprint AU — concurrency stress test for quotesStore.upsertQuote.
 *
 * Risk: two users hit Approve at the same time on different quotes.
 * Both request handlers call upsertQuote → each loads the file →
 * modifies → writes. Without the withLock('quotes', ...) serializer
 * both writes race and the second one clobbers the first (classic
 * lost-update). The lock was added in Sprint A; this test PROVES it
 * still works by firing N concurrent upserts with distinct ids and
 * asserting every one landed in the persisted file.
 *
 * Real lock, real filesystem, real async — no mocks. We use a tmp
 * path via OPS_QUOTE_HISTORY_FILE so the test is isolated from prod
 * data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-concur-'));
const historyFile = path.join(tmp, 'quote_history.json');
process.env.OPS_QUOTE_HISTORY_FILE = historyFile;
// Keep SQLite out of the loop so the test exercises the file path
// that actually holds the lock. The withLock serializer is backend-
// agnostic; file is the simplest surface to race against.
process.env.OPS_BACKEND_QUOTES = 'file';

// Import AFTER env is set so module-load code picks up the override.
const { upsertQuote, loadQuotes } = await import('./quotesStore.js');

test('20 concurrent upserts all persist (no lost updates)', async () => {
  const N = 20;
  const payloads = Array.from({ length: N }, (_, i) => ({
    id: 1000 + i,
    type: 'standard',
    state: { rfq_number: `CONCUR-${i}` },
  }));

  // Fire all N in parallel. Promise.all resolves when every lock
  // acquisition has completed — if the serializer works, all 20 land.
  const results = await Promise.all(payloads.map((p) => upsertQuote(p)));
  assert.equal(results.length, N);

  const persisted = loadQuotes();
  assert.equal(
    persisted.length,
    N,
    `expected ${N} quotes after concurrent upsert, got ${persisted.length} — lost updates indicate the lock is not serializing writes`
  );

  // Every id must be present — order doesn't matter, but presence does.
  const ids = new Set(persisted.map((q) => q.id));
  for (const p of payloads) {
    assert.ok(ids.has(p.id), `quote id ${p.id} missing after concurrent write`);
  }
});

test('concurrent update of the SAME id settles to one of the inputs (no corruption)', async () => {
  // 10 writers update quote id=2000 with different labels. Last-write-
  // wins is fine (the lock just serializes; it doesn't arbitrate which
  // caller wins). What we care about: the file stays parseable and
  // contains exactly one quote with id=2000 whose label matches one of
  // the inputs — not a half-merged frankenstein.
  const N = 10;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      upsertQuote({ id: 2000, type: 'standard', label: `W${i}`, state: {} })
    )
  );

  const persisted = loadQuotes();
  const matches = persisted.filter((q) => q.id === 2000);
  assert.equal(matches.length, 1, 'expected exactly one record for the contested id');
  assert.match(matches[0].label, /^W\d$/, 'label must equal one of the writer labels');
});

test('cleanup: tmp dir removed', () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});
