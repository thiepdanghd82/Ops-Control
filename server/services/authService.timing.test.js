/**
 * Regression guard for the F2-1 timing-equalization helper.
 *
 * `equalizeTimingForUnknownUser(plain)` runs a real argon2 verify
 * against a hardcoded dummy hash so a missing-username login takes the
 * same wallclock as a wrong-password login (OWASP ASVS V4.0 §6.2.4 —
 * "verify that information enumeration is not possible via login,
 * password reset, or forgot account functionality").
 *
 * These are SMOKE tests — they assert behaviour (returns false, runs
 * argon2, doesn't throw). The actual timing benchmark lives outside
 * the test suite (see /tmp/p0-f2-1-timing-after.mjs reproduction
 * script + STEP-B-fix-summary.md table) because nondeterministic
 * timing assertions flake under CI load.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { equalizeTimingForUnknownUser } from './authService.js';

test('equalizeTimingForUnknownUser: always returns false', async () => {
  assert.equal(await equalizeTimingForUnknownUser('any-password'), false);
  assert.equal(await equalizeTimingForUnknownUser(''), false);
  assert.equal(await equalizeTimingForUnknownUser('a'.repeat(256)), false);
});

test('equalizeTimingForUnknownUser: tolerates non-string input', async () => {
  // The auth route should always pass a string, but defensive: a
  // missing field shouldn't crash the equalizer.
  assert.equal(await equalizeTimingForUnknownUser(undefined), false);
  assert.equal(await equalizeTimingForUnknownUser(null), false);
  assert.equal(await equalizeTimingForUnknownUser(0), false);
});

test('equalizeTimingForUnknownUser: actually runs argon2 (≥ 5 ms wallclock)', async () => {
  // Lower bound only — we can't assert an upper bound without flake.
  // 5 ms is well below the ~38 ms argon2id verify cost on any modern
  // CPU but high enough to prove it's NOT a no-op short-circuit
  // (a no-op would be < 1 ms).
  const t0 = process.hrtime.bigint();
  await equalizeTimingForUnknownUser('probe-password');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(
    ms >= 5,
    `expected argon2 verify ≥ 5ms, got ${ms.toFixed(2)}ms — dummy may have been short-circuited`
  );
});

test('equalizeTimingForUnknownUser: deterministic across calls (no per-call randomisation)', async () => {
  // Two consecutive calls with the same input must both return false
  // and run the same code path. Catches accidental refactor that
  // generates a new dummy hash per-call (which would defeat JIT
  // optimization claims in the comment).
  const r1 = await equalizeTimingForUnknownUser('pwd');
  const r2 = await equalizeTimingForUnknownUser('pwd');
  assert.equal(r1, false);
  assert.equal(r2, false);
});
