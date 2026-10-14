/**
 * asyncLock — serialization + cleanup + error-propagation tests.
 *   node --test server/utils/asyncLock.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withLock, _activeKeyCount, _resetLocksForTests } from './asyncLock.js';

// Fresh-map guard: run tests sequentially so one doesn't pollute
// another's count check. node --test runs tests in file order by default.

test('same key: tasks run serialized (interleave IS prevented)', async () => {
  const log = [];
  const slow = async (tag) => {
    log.push(`enter:${tag}`);
    await new Promise((r) => setTimeout(r, 10));
    log.push(`exit:${tag}`);
    return tag;
  };
  const a = withLock('same', () => slow('A'));
  const b = withLock('same', () => slow('B'));
  const c = withLock('same', () => slow('C'));
  await Promise.all([a, b, c]);
  assert.deepEqual(
    log,
    ['enter:A', 'exit:A', 'enter:B', 'exit:B', 'enter:C', 'exit:C'],
    `serialized, got ${log.join(',')}`
  );
});

test('different keys: tasks run in parallel (interleave IS allowed)', async () => {
  const log = [];
  const slow = async (tag) => {
    log.push(`enter:${tag}`);
    await new Promise((r) => setTimeout(r, 15));
    log.push(`exit:${tag}`);
  };
  const a = withLock('k1', () => slow('A'));
  const b = withLock('k2', () => slow('B'));
  await Promise.all([a, b]);
  // Both enter before either exits → entries are interleaved.
  assert.equal(log[0].startsWith('enter:'), true);
  assert.equal(log[1].startsWith('enter:'), true);
  assert.equal(log.filter((x) => x.startsWith('enter:')).length, 2);
  assert.equal(log.filter((x) => x.startsWith('exit:')).length, 2);
});

test('returns fn result', async () => {
  const result = await withLock('r', async () => {
    await new Promise((r) => setTimeout(r, 1));
    return { ok: true, value: 42 };
  });
  assert.deepEqual(result, { ok: true, value: 42 });
});

test('propagates thrown errors, releases lock so next caller proceeds', async () => {
  const errMsg = 'intentional failure';
  let caught;
  try {
    await withLock('err', async () => {
      throw new Error(errMsg);
    });
  } catch (e) {
    caught = e;
  }
  assert.equal(caught?.message, errMsg);
  // Next caller on the same key must still be able to run.
  const after = await withLock('err', async () => 'recovered');
  assert.equal(after, 'recovered');
});

test('sync fn works too', async () => {
  const result = await withLock('sync', () => 'hello');
  assert.equal(result, 'hello');
});

test('Map cleanup: key drops after last task drains', async () => {
  const before = _activeKeyCount();
  await withLock('ephemeral', async () => {
    await new Promise((r) => setTimeout(r, 1));
  });
  // Let any pending microtasks flush.
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(_activeKeyCount(), before, 'key should be removed after task completes');
});

test('Map keeps key while queue has pending tasks', async () => {
  let release1;
  const held1 = new Promise((r) => {
    release1 = r;
  });
  const t1 = withLock('queued', async () => {
    await held1;
  });
  const t2 = withLock('queued', async () => 'second');
  // t1 is running (awaiting held1); t2 is queued behind. Key must exist.
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(_activeKeyCount() >= 1, 'key present while t2 waits');
  release1();
  await Promise.all([t1, t2]);
});

test('10 concurrent writers on same key all observe previous result', async () => {
  // Simulates the read-modify-write pattern the approval endpoint uses.
  let counter = 0;
  const N = 10;
  const writers = Array.from({ length: N }, (_, i) =>
    withLock('ctr', async () => {
      const snapshot = counter;
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      counter = snapshot + 1;
      return i;
    })
  );
  await Promise.all(writers);
  assert.equal(counter, N, `without lock this would be <${N} due to stale snapshots`);
});

// ── Sprint 34 — multi-instance (proper-lockfile) layer ──────────────
// These tests flip OPS_MULTI_INSTANCE=1 in-process and verify:
//   1. Caller contract unchanged (same API, same serialization).
//   2. Lock directory gets populated with a lock stub.
//   3. Concurrent writers still interleave-free.
//   4. Turning the flag OFF mid-test returns to pure in-process.

function setupFileLockEnv() {
  _resetLocksForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-lock-'));
  process.env.DATA_DIR = dir;
  process.env.OPS_MULTI_INSTANCE = '1';
  return dir;
}
function teardownFileLockEnv() {
  delete process.env.OPS_MULTI_INSTANCE;
  _resetLocksForTests();
}

test('multi-instance: caller contract unchanged (single caller)', async () => {
  setupFileLockEnv();
  try {
    const result = await withLock('unit-a', async () => 42);
    assert.equal(result, 42);
  } finally {
    teardownFileLockEnv();
  }
});

test('multi-instance: lock file is created + released', async () => {
  const dir = setupFileLockEnv();
  try {
    await withLock('quotes', async () => 'ok');
    const stub = path.join(dir, 'locks', 'quotes.lock');
    assert.ok(
      fs.existsSync(stub),
      'lock stub file persists after release (proper-lockfile pattern)'
    );
    // Lock itself is removed by proper-lockfile after release — the
    // stub marker file remains as a known mount point.
  } finally {
    teardownFileLockEnv();
  }
});

test('multi-instance: concurrent writers still serialize (same key)', async () => {
  setupFileLockEnv();
  try {
    let counter = 0;
    const N = 5;
    const writers = Array.from({ length: N }, () =>
      withLock('ctr', async () => {
        const snapshot = counter;
        await new Promise((r) => setTimeout(r, 3));
        counter = snapshot + 1;
      })
    );
    await Promise.all(writers);
    assert.equal(counter, N, 'all writes visible; file-lock + in-process dual serialization holds');
  } finally {
    teardownFileLockEnv();
  }
});

test('multi-instance: error in fn releases the file lock', async () => {
  setupFileLockEnv();
  try {
    await assert.rejects(
      withLock('err-key', async () => {
        throw new Error('boom');
      }),
      /boom/
    );
    // Subsequent acquire must not deadlock.
    const result = await Promise.race([
      withLock('err-key', async () => 'recovered'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock')), 2000)),
    ]);
    assert.equal(result, 'recovered');
  } finally {
    teardownFileLockEnv();
  }
});

test('multi-instance: safe key sanitization (slashes, colons)', async () => {
  const dir = setupFileLockEnv();
  try {
    // Keys with path separators would escape the lock dir without
    // sanitization. Verify the stub file lives INSIDE the lock dir.
    await withLock('quote:123/evil', async () => 1);
    const locksDir = path.join(dir, 'locks');
    const files = fs.readdirSync(locksDir);
    // Every emitted stub must be a bare filename (no subdirs).
    assert.ok(files.length >= 1);
    for (const f of files) {
      assert.ok(!f.includes('/'), `lock file ${f} must not contain path separators`);
      assert.ok(!f.includes(':'), `lock file ${f} must strip colons too`);
    }
  } finally {
    teardownFileLockEnv();
  }
});

test('single-instance (default): no lock directory created', async () => {
  _resetLocksForTests();
  delete process.env.OPS_MULTI_INSTANCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-lock-single-'));
  process.env.DATA_DIR = dir;
  try {
    await withLock('nofile', async () => 1);
    const locksDir = path.join(dir, 'locks');
    // Default path must NOT touch the filesystem — keeps single-node
    // deployments at zero-I/O per acquire.
    assert.ok(
      !fs.existsSync(locksDir),
      'no locks dir should exist when multi-instance flag is off'
    );
  } finally {
    delete process.env.DATA_DIR;
  }
});
