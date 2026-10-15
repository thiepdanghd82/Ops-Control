/**
 * dataEventBus — the SSE stream follows the signed-in session (2026-10-15).
 *
 * The stream used to open once at module load, before sign-in: the server
 * answered 401, EventSource treats an HTTP error as fatal (readyState
 * CLOSED, no reconnect) and live push stayed dead until a reload. It also
 * read only localStorage, so "Remember me" off (token in sessionStorage)
 * never authenticated, and it stayed open after sign-out.
 *
 * Runner: node --test src/services/dataEventBus.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();

class FakeEventSource {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.closed = false;
    FakeEventSource.all.push(this);
  }
  addEventListener() {}
  close() {
    this.readyState = 2;
    this.closed = true;
  }
  accept() {
    this.readyState = 1;
    this.onopen?.();
  }
  refuse() {
    // HTTP 401/5xx: the browser closes the stream for good.
    this.readyState = 2;
    this.onerror?.();
  }
  drop() {
    // Network blip: the browser keeps CONNECTING and retries by itself.
    this.readyState = 0;
    this.onerror?.();
  }
}
globalThis.EventSource = FakeEventSource;

const { startDataEventStream, stopDataEventStream } = await import('./dataEventBus.js');
const { setToken, clearToken } = await import('./api.js');

const latest = () => FakeEventSource.all.at(-1);
const opened = () => FakeEventSource.all.length;

test.beforeEach(() => {
  stopDataEventStream();
  clearToken();
  FakeEventSource.all.length = 0;
});

test('opens with the token from sessionStorage ("Remember me" off)', () => {
  setToken('tok-session', { persistent: false });
  startDataEventStream();
  assert.equal(latest().url, '/api/events/stream?t=tok-session');
});

test('a second start for the same token is a no-op; a new token reopens', () => {
  setToken('tok-a');
  startDataEventStream();
  startDataEventStream();
  assert.equal(opened(), 1);
  const first = latest();
  setToken('tok-b');
  startDataEventStream();
  assert.equal(opened(), 2);
  assert.equal(first.closed, true);
  assert.equal(latest().url, '/api/events/stream?t=tok-b');
});

test('a stream refused before sign-in is reopened on sign-in', () => {
  startDataEventStream(); // no token yet
  latest().refuse();
  setToken('tok-after-login');
  startDataEventStream();
  assert.equal(opened(), 2);
  assert.equal(latest().url, '/api/events/stream?t=tok-after-login');
});

test('a refused stream is retried with backoff while signed in', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  setToken('tok-x');
  startDataEventStream();
  latest().refuse(); // e.g. server restarted, session not yet valid
  assert.equal(opened(), 1, 'no immediate hammering');
  t.mock.timers.tick(1000);
  assert.equal(opened(), 2, 'first retry after 1 s');
  latest().refuse();
  t.mock.timers.tick(1999);
  assert.equal(opened(), 2);
  t.mock.timers.tick(1);
  assert.equal(opened(), 3, 'second retry after 2 s');
  latest().accept();
  assert.equal(latest().readyState, 1);
});

test('without a token a refused stream is not retried', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  startDataEventStream();
  latest().refuse();
  t.mock.timers.tick(120000);
  assert.equal(opened(), 1);
});

test('a network drop is left to the browser, not reopened here', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  setToken('tok-y');
  startDataEventStream();
  latest().drop();
  t.mock.timers.tick(120000);
  assert.equal(opened(), 1);
});

test('sign-out closes the stream and cancels a pending retry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  setToken('tok-z');
  startDataEventStream();
  const es = latest();
  es.refuse();
  stopDataEventStream();
  t.mock.timers.tick(120000);
  assert.equal(opened(), 1);
  assert.equal(es.closed, true);
});
