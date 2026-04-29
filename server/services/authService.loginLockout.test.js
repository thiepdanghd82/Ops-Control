/**
 * Sprint W — login lockout Map size cap (OOM defense).
 *
 * The per-username lockout state lives in an in-memory Map keyed by
 * lowercase username. Without a cap, an attacker cycling through a
 * dictionary of usernames could grow the Map arbitrarily. These tests
 * lock in the cap + eviction semantics.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordLoginFailure, checkLoginLockout, clearLoginFailures,
  _resetLoginLockouts, _loginFailsSize, _LOGIN_FAIL_MAX_ENTRIES,
} from './authService.js';

test('recordLoginFailure: single user stays below cap', () => {
  _resetLoginLockouts();
  recordLoginFailure('alice');
  recordLoginFailure('alice');
  recordLoginFailure('bob');
  assert.equal(_loginFailsSize(), 2);
});

test('recordLoginFailure: Map size does NOT exceed cap', () => {
  _resetLoginLockouts();
  // Push a little past the cap. The eviction logic should keep size
  // at-or-below the cap after each set().
  for (let i = 0; i < _LOGIN_FAIL_MAX_ENTRIES + 500; i++) {
    recordLoginFailure(`attacker${i}`);
  }
  assert.ok(
    _loginFailsSize() <= _LOGIN_FAIL_MAX_ENTRIES,
    `Map size ${_loginFailsSize()} exceeded cap ${_LOGIN_FAIL_MAX_ENTRIES}`
  );
});

test('recordLoginFailure: still escalates lockout for a real user after eviction', () => {
  _resetLoginLockouts();
  // Fill past the cap, then ensure a real user who hits the soft
  // threshold still gets locked. This defends the semantic — eviction
  // of low-count entries is OK, but an active attacker on one username
  // must still be stopped.
  for (let i = 0; i < _LOGIN_FAIL_MAX_ENTRIES + 50; i++) {
    recordLoginFailure(`noise${i}`);
  }
  for (let i = 0; i < 5; i++) recordLoginFailure('victim');
  const r = checkLoginLockout('victim');
  assert.equal(r.allowed, false, 'soft lockout should fire at 5 fails');
  assert.ok(r.retry_after_ms > 0);
  clearLoginFailures('victim');
});

test('clearLoginFailures removes entry, unlocks', () => {
  _resetLoginLockouts();
  for (let i = 0; i < 5; i++) recordLoginFailure('carol');
  assert.equal(checkLoginLockout('carol').allowed, false);
  clearLoginFailures('carol');
  assert.equal(checkLoginLockout('carol').allowed, true);
});

test('checkLoginLockout: case-insensitive and whitespace-tolerant', () => {
  _resetLoginLockouts();
  for (let i = 0; i < 5; i++) recordLoginFailure('Dave');
  assert.equal(checkLoginLockout('dave').allowed, false);
  assert.equal(checkLoginLockout('  DAVE  ').allowed, false);
  clearLoginFailures('dave');
});
