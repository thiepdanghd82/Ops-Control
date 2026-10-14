/**
 * PwdAgeBar — no user-visible English literal may survive in the source.
 *
 * The password-age bar is on the login screen, which is the one screen an
 * operator sees before they can change anything, so an untranslated string
 * there is the most visible kind. #288 translated the *label* by having
 * LoginPage pass `label={t('login.pwd_age_label')}`, which is why this
 * looked done — but the unit beside the number ("days") is rendered by the
 * component itself and stayed English in every locale.
 *
 * Source-level rather than render-level: this repo has no React test
 * renderer, and the failure mode is a literal in the JSX, which reading the
 * file catches exactly. Same approach as CalcLegend.lint.test.js.
 *
 * Runner: node --test src/components/Auth/PwdAgeBar.lint.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../../i18n/strings.js';
// Per-domain strings register on module load (ADR-0012); main.jsx
// side-effect-imports each at boot. Mirror that, or the login keys — which
// live in domains/security.js since #288 — look unknown. strings.lint.test.js
// owns the guard that this list matches main.jsx.
import '../../i18n/domains/basis.js';
import '../../i18n/domains/costing.js';
import '../../i18n/domains/mes.js';
import '../../i18n/domains/quality.js';
import '../../i18n/domains/sales.js';
import '../../i18n/domains/security.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, 'PwdAgeBar.jsx'), 'utf8');
const LOGIN = fs.readFileSync(path.join(HERE, 'LoginPage.jsx'), 'utf8');

/** The literals this component rendered before it was translated. */
const ENGLISH = ['Password expired', 'Password age', "'day'", "'days'"];

test('PwdAgeBar renders no hardcoded English', () => {
  const left = ENGLISH.filter((s) => SRC.includes(s));
  assert.deepEqual(left, [], `still hardcoded in PwdAgeBar.jsx: ${left.join(' · ')}`);
});

test('PwdAgeBar resolves its own text through useI18n', () => {
  assert.match(SRC, /useI18n/, 'must consume the i18n hook, not rely on a caller-passed label');
  // The keys live in pwdAgeLabel.js so the two rules can be unit-tested; the
  // component's job is to obtain `t` and hand it over.
  assert.match(SRC, /resolvePwdAgeLabel\(\{[^}]*\bt\b/, 'must pass t to the label helper');
  assert.match(SRC, /resolvePwdAgeUnit\(\{[^}]*\bt\b/, 'must pass t to the unit helper');
});

test('every key the bar resolves exists with both locales', () => {
  const helper = fs.readFileSync(path.join(HERE, 'pwdAgeLabel.js'), 'utf8');
  const keys = [...helper.matchAll(/t\(\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(
    keys.length >= 3,
    `expected the caption, the expired caption and both units, found ${keys.length}`
  );
  for (const k of keys) {
    assert.ok(STRINGS[k], `t('${k}') has no STRINGS entry`);
    assert.ok(STRINGS[k].en && STRINGS[k].vi, `${k} is missing a locale`);
  }
  assert.ok(keys.includes('login.pwd_age_expired'), 'the expired caption must be reachable');
});

test('the label key #288 already added is reused, not duplicated', () => {
  // A second key meaning "Password age" would drift from this one.
  assert.ok(STRINGS['login.pwd_age_label'], 'the #288 key must still exist');
  const agePairs = Object.entries(STRINGS).filter(([, v]) => v.en === 'Password age');
  assert.equal(
    agePairs.length,
    1,
    `"Password age" must have exactly one key, found: ${agePairs.map(([k]) => k).join(', ')}`
  );
});

test('LoginPage still passes the translated label', () => {
  assert.match(LOGIN, /label=\{t\('login\.pwd_age_label'\)\}/, '#288 wiring must not regress');
});
