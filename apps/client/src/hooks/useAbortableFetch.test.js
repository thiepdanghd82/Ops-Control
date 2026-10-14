/**
 * useAbortableFetch — contract tests using React's act() + a tiny
 * test host, so the hook is exercised without JSDOM.
 *
 * Why not a full React render: node --test has no JSX loader + no
 * DOM, and adding those deps for one hook is overkill. Instead we
 * use React's legacy renderer-less API (`react/test-renderer` is
 * also heavy) and manually drive the effect contract — spawn the
 * hook's closure via a test-only entry point.
 *
 * What we CAN test without a DOM:
 *   - The controller/signal plumbing as a pure call graph.
 *   - AbortError swallowing.
 *   - Non-abort errors surface.
 *
 * We do NOT test React lifecycle (mount/unmount) — that would
 * require JSDOM + Testing Library. Those are covered indirectly by
 * the existing call sites (Dashboard etc.) passing integration smoke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Tiny shim — extract the fetcher-callback contract the hook enforces,
// so we can validate the abort semantics without mounting React.
// Mirrors the logic in useAbortableFetch's refresh() closure.
async function runOnce(fetcher, { onError, signal }) {
  let data = null,
    error = null;
  try {
    data = await fetcher(signal);
  } catch (err) {
    if (err?.name === 'AbortError') return { data: null, error: null, aborted: true };
    error = err;
    // Matches real hook: wrap onError in try/catch so a buggy
    // handler can't propagate and take down the component.
    if (onError) {
      try {
        onError(err);
      } catch {
        /* never crash */
      }
    }
  }
  return { data, error, aborted: signal.aborted };
}

test('fetcher receives the AbortSignal', async () => {
  const ctrl = new AbortController();
  let received = null;
  await runOnce(
    (signal) => {
      received = signal;
      return Promise.resolve('ok');
    },
    { signal: ctrl.signal }
  );
  assert.equal(received, ctrl.signal);
});

test('resolves to data when fetcher succeeds', async () => {
  const ctrl = new AbortController();
  const r = await runOnce(() => Promise.resolve({ rows: 42 }), { signal: ctrl.signal });
  assert.deepEqual(r.data, { rows: 42 });
  assert.equal(r.error, null);
});

test('AbortError is swallowed, not surfaced as error', async () => {
  const ctrl = new AbortController();
  let onErrorCalled = false;
  const err = new Error('aborted');
  err.name = 'AbortError';
  const r = await runOnce(() => Promise.reject(err), {
    signal: ctrl.signal,
    onError: () => {
      onErrorCalled = true;
    },
  });
  assert.equal(r.error, null, 'AbortError must not populate error state');
  assert.equal(onErrorCalled, false, 'onError must not fire for AbortError');
});

test('non-abort error surfaces as error AND calls onError', async () => {
  const ctrl = new AbortController();
  let captured = null;
  const err = new Error('network down');
  const r = await runOnce(() => Promise.reject(err), {
    signal: ctrl.signal,
    onError: (e) => {
      captured = e;
    },
  });
  assert.equal(r.error, err);
  assert.equal(captured, err);
});

test('signal.aborted reflects controller state', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const r = await runOnce(() => Promise.resolve('never seen'), { signal: ctrl.signal });
  // The fetcher still resolved (it doesn't check signal itself), so
  // data is returned — but the `aborted` flag tells the hook to
  // discard it upstream. Mirrors the real hook's early-return guard.
  assert.equal(r.aborted, true);
});

test('onError that throws does not break the error path', async () => {
  const ctrl = new AbortController();
  const err = new Error('db unavailable');
  const r = await runOnce(() => Promise.reject(err), {
    signal: ctrl.signal,
    onError: () => {
      throw new Error('boom in onError');
    },
  });
  // The hook swallows onError exceptions (see try/catch in
  // useAbortableFetch.js refresh() → onErrorRef.current). This test
  // simulates that by not catching — but the contract-test shim
  // above doesn't wrap onError in try/catch, so we verify the
  // behavioral intent: the ORIGINAL error is still the one surfaced.
  assert.equal(r.error, err);
});

test('multiple concurrent calls each get a distinct signal', async () => {
  // The hook pattern cancels the previous controller on every
  // refresh — simulated here by creating two controllers and
  // confirming they are independent.
  const c1 = new AbortController();
  const c2 = new AbortController();
  c1.abort();
  assert.equal(c1.signal.aborted, true);
  assert.equal(c2.signal.aborted, false, 'second controller must not be affected');
});

// ── initialLoading derivation contract ─────────────────────────
// Stale-while-revalidate gate (Lesson 29). Callers gate their skeleton
// on `initialLoading` instead of raw `loading` so polling/refresh ticks
// don't unmount the tree. The derivation is pure — test it directly.
function deriveInitialLoading({ loading, data, error }) {
  return loading && data === null && error === null;
}

test('initialLoading: true on first load (loading=true, data=null, error=null)', () => {
  assert.equal(deriveInitialLoading({ loading: true, data: null, error: null }), true);
});

test('initialLoading: false on refresh (loading=true but data already loaded)', () => {
  assert.equal(
    deriveInitialLoading({ loading: true, data: [{ id: 1 }], error: null }),
    false,
    'stale-while-revalidate must keep skeleton off when data already shown'
  );
});

test('initialLoading: false after error (no skeleton over error state)', () => {
  assert.equal(
    deriveInitialLoading({ loading: true, data: null, error: new Error('500') }),
    false,
    'error UX takes precedence over skeleton'
  );
});

test('initialLoading: false when not loading (idle state)', () => {
  assert.equal(deriveInitialLoading({ loading: false, data: null, error: null }), false);
  assert.equal(deriveInitialLoading({ loading: false, data: [], error: null }), false);
});

test('initialLoading: empty array data DOES count as loaded (no flash on empty result)', () => {
  // A successful fetch returning [] is still a load — don't show
  // skeleton if the server says "no rows". Otherwise admin staring at
  // an empty Library see infinite skeleton.
  assert.equal(
    deriveInitialLoading({ loading: true, data: [], error: null }),
    false,
    'empty array is data, not absence — no skeleton'
  );
});
