// queue.js unit tests — Sprint MES-3-V2 KIOSK-004.
// Uses fake-indexeddb (wired in setup.js) so the real `idb` library
// runs end-to-end inside jsdom. Each test gets a fresh DB by deleting
// the named DB before mutating; queue.js memoises its handle, so we
// also need to reset its module state via vi.resetModules() between
// suites that exercise different cache regimes.
import { describe, test, expect, vi, beforeEach } from 'vitest';

beforeEach(async () => {
  // queue.js memoises `dbPromise` — re-import via resetModules so each
  // test starts with no closure state. We can't deleteDatabase() because
  // a still-open connection from a previous test would block (fake-
  // indexeddb honours the same lifecycle as real Chrome IDB). Clearing
  // the store via the freshly-imported module is enough — each test
  // gets an empty queue.
  vi.resetModules();
  const { openDB } = await import('idb');
  const d = await openDB('opskiosk', 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('queue')) {
        const s = d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        s.createIndex('created_at', 'created_at');
      }
    },
  });
  await d.clear('queue');
  d.close();
});

describe('enqueue + counts', () => {
  test('enqueue stores a record, counts() reports pending=1', async () => {
    const queue = await import('./queue.js');
    await queue.enqueue({
      method: 'POST',
      url: '/x',
      body: { a: 1 },
      idempotency_key: 'idem-1',
      op_id: 7,
      kind: 'pause',
    });
    const c = await queue.counts();
    expect(c.pending).toBe(1);
    expect(c.permanent).toBe(0);
    expect(c.total).toBe(1);
  });

  test('two enqueues bump count to 2', async () => {
    const queue = await import('./queue.js');
    await queue.enqueue({ method: 'POST', url: '/x', op_id: 1, kind: 'pause' });
    await queue.enqueue({ method: 'POST', url: '/y', op_id: 2, kind: 'pause' });
    const c = await queue.counts();
    expect(c.total).toBe(2);
  });
});

describe('onQueueEvent pub/sub', () => {
  test('listener is invoked on enqueue with type=queued', async () => {
    const queue = await import('./queue.js');
    const events = [];
    const off = queue.onQueueEvent((e) => events.push(e));
    await queue.enqueue({ method: 'POST', url: '/x', op_id: 1, kind: 'pause' });
    expect(events.some((e) => e.type === 'queued')).toBe(true);
    off();
  });

  test('off() unsubscribes — no further events delivered', async () => {
    const queue = await import('./queue.js');
    const events = [];
    const off = queue.onQueueEvent((e) => events.push(e));
    off();
    await queue.enqueue({ method: 'POST', url: '/x', op_id: 1, kind: 'pause' });
    expect(events).toEqual([]);
  });

  test('listener errors are swallowed (other listeners keep firing)', async () => {
    const queue = await import('./queue.js');
    const calls = [];
    queue.onQueueEvent(() => {
      throw new Error('listener boom');
    });
    queue.onQueueEvent((e) => calls.push(e.type));
    await queue.enqueue({ method: 'POST', url: '/x', op_id: 1, kind: 'pause' });
    expect(calls).toContain('queued');
  });
});

describe('flushNext — happy + retry + permanent paths', () => {
  test('on rawFetch ok=true, record is deleted', async () => {
    // Stub fetch so api.rawFetch (re-exported, used by queue) returns ok.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '{}',
    }));
    const queue = await import('./queue.js');
    await queue.enqueue({ method: 'POST', url: '/v2/operations/1/start', op_id: 1, kind: 'start' });
    const r = await queue.flushNext();
    expect(r).toBe('sent');
    const c = await queue.counts();
    expect(c.total).toBe(0);
  });

  test('on network error, record is kept and attempts incremented', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const queue = await import('./queue.js');
    await queue.enqueue({ method: 'POST', url: '/v2/operations/1/start', op_id: 1, kind: 'start' });
    const r = await queue.flushNext();
    expect(r).toBe('network_fail');
    const c = await queue.counts();
    expect(c.pending).toBe(1);
  });

  test('on 4xx (non-replayed), record is marked permanent + permanent count grows', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ type: 'urn:ops:op-invalid-transition', allowed_from: ['DISPATCHED'] }),
    }));
    const queue = await import('./queue.js');
    await queue.enqueue({ method: 'POST', url: '/v2/operations/1/start', op_id: 1, kind: 'start' });
    const r = await queue.flushNext();
    expect(r).toBe('permanent_fail');
    const c = await queue.counts();
    expect(c.permanent).toBe(1);
    expect(c.pending).toBe(0);
  });

  test('flushNext is idle on empty queue', async () => {
    const queue = await import('./queue.js');
    expect(await queue.flushNext()).toBe('idle');
  });
});
