/**
 * LoginPage contract regression gate (Sprint 40 — Carbon redesign).
 *
 * The Phase-10N refactor explicitly blocked form submission from both
 * the Enter key (via onKeyDown preventDefault) and the button (via
 * type="button" + custom onClick). That killed the keyboard-muscle
 * path every daily user relied on — "type password, press Enter, get
 * in". Sprint 40 restored the native form submit contract; this test
 * locks it so a future "clever" refactor can't silently re-break it.
 *
 * Class names migrated from .login-* to .cb-* during the Carbon
 * redesign (split-screen hero + Carbon card). The contract is the
 * same — submit button must stay type="submit", form must wire
 * onSubmit to handleLogin/handleTOTP, and no onKeyDown may swallow
 * Enter — the selectors just track the new markup.
 *
 * Pure source-text scan — no React DOM needed. Matches the style
 * of src/utils/noRawParseFloat.lint.test.js.
 *
 * Runner: node --test src/components/Auth/LoginPage.lint.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, 'LoginPage.jsx'), 'utf-8');

test('LoginPage: submit button declared as type="submit" (Enter + click both work)', () => {
  // Find every primary submit button — the .cb-btn class on the main
  // login form (and the TOTP form). Both must be type="submit".
  const matches = [...SRC.matchAll(/<button\s+[^>]*className="cb-btn"[^>]*>/gs)];
  assert.ok(matches.length >= 1, 'cb-btn button not found in LoginPage.jsx');
  for (const m of matches) {
    const snippet = m[0];
    // Must NOT be type="button" (the Phase 10N regression).
    assert.ok(!/type="button"/.test(snippet),
      'cb-btn must not be type="button" — breaks Enter + form semantics');
    // Must be type="submit" so browser's implicit Enter-submit picks it up.
    assert.ok(/type="submit"/.test(snippet),
      'cb-btn must be type="submit" so pressing Enter inside any input submits the form');
  }
});

test('LoginPage: form onSubmit wired to handleLogin (not a no-op preventDefault)', () => {
  // Two forms in LoginPage: the main login form (cb-card) wires handleLogin,
  // the TOTP form (login-form) wires handleTOTP. We verify both contracts:
  //   - Main login form binds handleLogin (the Phase-10N regression site)
  //   - TOTP form binds handleTOTP (pre-existing — guarded here for free)
  // And globally: no form.onSubmit may be a bare preventDefault no-op.
  assert.ok(/onSubmit=\{handleLogin\}/.test(SRC),
    'somewhere in LoginPage.jsx, the main form must bind onSubmit={handleLogin}');
  assert.ok(/onSubmit=\{handleTOTP\}/.test(SRC),
    'TOTP form must still bind onSubmit={handleTOTP}');
  assert.ok(!/onSubmit=\{\s*e\s*=>\s*e\.preventDefault\(\)\s*\}/.test(SRC),
    'no form.onSubmit may be a bare `e => e.preventDefault()` no-op — that kills every submit path');
});

test('LoginPage: no onKeyDown handler that blocks Enter on input elements', () => {
  // The Phase 10N regression used this exact pattern:
  //   onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }}
  // Guard against any revival across the whole file — both the Carbon
  // login form (cb-card) and the TOTP form must remain Enter-friendly.
  assert.ok(!/onKeyDown[\s\S]{0,200}?Enter[\s\S]{0,200}?preventDefault/.test(SRC),
    'LoginPage must not block Enter via onKeyDown — the browser\'s implicit form submit is the intended keyboard path');
});
