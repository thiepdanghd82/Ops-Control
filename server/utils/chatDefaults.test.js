/**
 * chatDefaults — normalizeApprovalRoles tests.
 *
 * Locks in the cap + dedupe + type-filter semantics so a regression
 * can't accidentally reintroduce the OOM surface (a user record with
 * 1000+ approval_roles bloating the chat rooms table on every fetch).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApprovalRoles, MAX_DEFAULT_ROOMS_PER_USER } from './chatDefaults.js';

test('normalizeApprovalRoles: empty input → empty roles, not truncated', () => {
  assert.deepEqual(normalizeApprovalRoles([]), { roles: [], truncated: false });
});

test('normalizeApprovalRoles: non-array inputs coerce to empty', () => {
  assert.deepEqual(normalizeApprovalRoles(null), { roles: [], truncated: false });
  assert.deepEqual(normalizeApprovalRoles(undefined), { roles: [], truncated: false });
  assert.deepEqual(normalizeApprovalRoles('not an array'), { roles: [], truncated: false });
  assert.deepEqual(normalizeApprovalRoles(42), { roles: [], truncated: false });
});

test('normalizeApprovalRoles: preserves insertion order, dedupes', () => {
  const { roles, truncated } = normalizeApprovalRoles([
    'sales',
    'finance',
    'sales',
    'pe',
    'finance',
    'sales',
  ]);
  assert.deepEqual(roles, ['sales', 'finance', 'pe']);
  assert.equal(truncated, false);
});

test('normalizeApprovalRoles: filters non-strings and empty strings', () => {
  const { roles } = normalizeApprovalRoles([
    'sales',
    '',
    null,
    42,
    undefined,
    'pe',
    false,
    'finance',
  ]);
  assert.deepEqual(roles, ['sales', 'pe', 'finance']);
});

test('normalizeApprovalRoles: exactly MAX returns full list, not truncated', () => {
  const input = Array.from({ length: MAX_DEFAULT_ROOMS_PER_USER }, (_, i) => `role${i}`);
  const { roles, truncated } = normalizeApprovalRoles(input);
  assert.equal(roles.length, MAX_DEFAULT_ROOMS_PER_USER);
  assert.equal(truncated, false);
});

test('normalizeApprovalRoles: over MAX is truncated to cap', () => {
  // Simulates the original attack: a user record with 1000+ roles.
  // Every /rooms fetch used to auto-provision all of them — this
  // cap is the defense. Test locks in the upper bound so a config
  // typo can't silently remove it.
  const input = Array.from({ length: 1200 }, (_, i) => `role${i}`);
  const { roles, truncated } = normalizeApprovalRoles(input);
  assert.equal(roles.length, MAX_DEFAULT_ROOMS_PER_USER);
  assert.equal(truncated, true);
  // First N roles preserved (insertion order, not random slice) so
  // the user's "primary" roles (first in the array) are always the
  // ones that get rooms.
  assert.equal(roles[0], 'role0');
  assert.equal(roles[MAX_DEFAULT_ROOMS_PER_USER - 1], `role${MAX_DEFAULT_ROOMS_PER_USER - 1}`);
});

test('normalizeApprovalRoles: dedupe happens BEFORE cap', () => {
  // Edge case: user has 100 entries but only 20 unique. Unique
  // count is well under the cap → truncated should be false.
  const input = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 20; j++) input.push(`role${j}`);
  }
  const { roles, truncated } = normalizeApprovalRoles(input);
  assert.equal(roles.length, 20);
  assert.equal(truncated, false);
});

test('MAX_DEFAULT_ROOMS_PER_USER is a sane cap', () => {
  // Defensive check — if someone tries to loosen this to a huge
  // number, the test fails so the PR conversation surfaces the risk.
  assert.ok(MAX_DEFAULT_ROOMS_PER_USER >= 10, 'must accommodate real users with multiple roles');
  assert.ok(
    MAX_DEFAULT_ROOMS_PER_USER <= 100,
    'must stay small enough to bound the /rooms fetch cost'
  );
});
