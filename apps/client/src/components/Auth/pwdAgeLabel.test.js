/**
 * Runner: node --test src/components/Auth/pwdAgeLabel.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePwdAgeLabel, resolvePwdAgeUnit } from './pwdAgeLabel.js';

/** Identity t(): assertions read as the key that would be looked up. */
const t = (k) => k;

test('expired wins over a caller-supplied label', () => {
  // The regression #288 introduced: LoginPage always passes a label, which
  // made the expired caption unreachable.
  assert.equal(
    resolvePwdAgeLabel({ daysRemaining: 0, label: 'Password age', t }),
    'login.pwd_age_expired'
  );
});

test('a caller label still wins while the password is valid', () => {
  assert.equal(resolvePwdAgeLabel({ daysRemaining: 12, label: 'Custom', t }), 'Custom');
});

test('no label falls back to the translated caption', () => {
  assert.equal(
    resolvePwdAgeLabel({ daysRemaining: 12, label: undefined, t }),
    'login.pwd_age_label'
  );
  assert.equal(resolvePwdAgeLabel({ daysRemaining: 12, label: '', t }), 'login.pwd_age_label');
});

test('the unit is singular only at exactly one day', () => {
  assert.equal(resolvePwdAgeUnit({ daysRemaining: 1, t }), 'login.pwd_age_day');
  assert.equal(resolvePwdAgeUnit({ daysRemaining: 0, t }), 'login.pwd_age_days');
  assert.equal(resolvePwdAgeUnit({ daysRemaining: 2, t }), 'login.pwd_age_days');
  assert.equal(resolvePwdAgeUnit({ daysRemaining: 90, t }), 'login.pwd_age_days');
});

test('neither helper returns a bare English literal', () => {
  // Everything they return is either a key or the caller's own string.
  const out = [
    resolvePwdAgeLabel({ daysRemaining: 0, t }),
    resolvePwdAgeLabel({ daysRemaining: 5, t }),
    resolvePwdAgeUnit({ daysRemaining: 1, t }),
    resolvePwdAgeUnit({ daysRemaining: 5, t }),
  ];
  for (const s of out) assert.match(s, /^login\.pwd_age_/, `${s} is not a translation key`);
});
