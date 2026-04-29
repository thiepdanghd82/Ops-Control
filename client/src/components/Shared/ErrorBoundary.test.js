/**
 * ErrorBoundary — pure class-component behaviour tests.
 *
 * We can't render React to a DOM in node --test without extra deps, but
 * React's error-boundary surface is exposed through three static /
 * instance methods we can exercise directly:
 *   - getDerivedStateFromError(err) → next state
 *   - instance.componentDidCatch(err, info) → telemetry side-effect
 *   - instance.componentDidUpdate(prevProps) → resetKey auto-reset
 *   - instance.reset() → manual recovery
 *
 * The boundary's render() is also callable — it just switches on the
 * current state. No ReactDOM needed.
 *
 * Runner: node --test src/components/Shared/ErrorBoundary.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ErrorBoundary from './ErrorBoundary.js';

function makeInstance(props = {}) {
  // Mimic React's constructor call + initial state. Bypasses ReactDOM.
  const inst = new ErrorBoundary(props);
  // Replicate React's setState — synchronous for our purposes.
  inst.setState = (updater) => {
    const patch = typeof updater === 'function' ? updater(inst.state) : updater;
    inst.state = { ...inst.state, ...patch };
  };
  return inst;
}

test('initial state: no error captured', () => {
  const inst = makeInstance({ label: 'Test' });
  assert.equal(inst.state.hasError, false);
  assert.equal(inst.state.error, null);
});

test('getDerivedStateFromError: captures the error into state', () => {
  const next = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
  assert.equal(next.hasError, true);
  assert.equal(next.error.message, 'boom');
});

test('componentDidCatch: invokes onError callback with the error + info', () => {
  let captured = null;
  const inst = makeInstance({ label: 'X', onError: (err, info) => { captured = { err, info }; } });
  inst.componentDidCatch(new Error('nope'), { componentStack: '  in Foo\n  in Bar' });
  assert.ok(captured);
  assert.equal(captured.err.message, 'nope');
  assert.match(captured.info.componentStack, /Foo/);
});

test('componentDidCatch: onError throwing never propagates (boundary must not crash itself)', () => {
  const inst = makeInstance({ label: 'X', onError: () => { throw new Error('telemetry down'); } });
  assert.doesNotThrow(() => inst.componentDidCatch(new Error('inner'), {}));
});

test('reset(): flips hasError back to false', () => {
  const inst = makeInstance({ label: 'X' });
  inst.state = { hasError: true, error: new Error('x') };
  inst.reset();
  assert.equal(inst.state.hasError, false);
  assert.equal(inst.state.error, null);
});

test('componentDidUpdate: auto-resets when resetKey changes while errored', () => {
  const inst = makeInstance({ label: 'X', resetKey: 'tab-a' });
  inst.state = { hasError: true, error: new Error('x') };
  // Simulate the parent re-rendering with a new resetKey (user switched tabs).
  inst.props = { label: 'X', resetKey: 'tab-b' };
  inst.componentDidUpdate({ label: 'X', resetKey: 'tab-a' });
  assert.equal(inst.state.hasError, false, 'resetKey change should auto-recover');
});

test('componentDidUpdate: does NOT reset when resetKey is unchanged', () => {
  const inst = makeInstance({ label: 'X', resetKey: 'tab-a' });
  inst.state = { hasError: true, error: new Error('x') };
  inst.props = { label: 'X', resetKey: 'tab-a' };
  inst.componentDidUpdate({ label: 'X', resetKey: 'tab-a' });
  assert.equal(inst.state.hasError, true, 'unchanged resetKey must not clear error');
});

test('render: returns children when no error', () => {
  const inst = makeInstance({ label: 'X' });
  inst.props = { label: 'X', children: 'OK' };
  assert.equal(inst.render(), 'OK');
});

test('render: returns fallback() result when provided', () => {
  const inst = makeInstance({ label: 'X' });
  inst.state = { hasError: true, error: new Error('custom fail') };
  inst.props = {
    label: 'X',
    fallback: ({ error }) => `FB:${error.message}`,
  };
  assert.equal(inst.render(), 'FB:custom fail');
});
