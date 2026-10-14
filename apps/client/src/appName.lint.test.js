/**
 * The product name appears in two DIFFERENT roles, and only one of them
 * was renamed. This pins the split so a future find-and-replace cannot
 * quietly cross it.
 *
 *  1. UI chrome — the name the operator reads on screen. Renamed to
 *     "CCL - NPI Costing module".
 *
 *  2. Identity — three places where "Ops Control" is not a caption but a
 *     reference to something that still carries that name:
 *       - the TOTP issuer baked into the otpauth:// URI. Authenticator
 *         apps show whatever the entry was created with, so renaming it
 *         would leave every already-enrolled operator looking at a name
 *         the app no longer uses, and the login help text that tells them
 *         to delete a stale "Ops Control" entry would be wrong;
 *       - that same login help text, which must keep matching the issuer;
 *       - references to the PACKAGED desktop app, whose electron-builder
 *         productName is still "Ops Control" — it is the install path
 *         (/Applications/Ops Control.app) the LaunchAgent points at.
 *
 * Runner: node --test src/appName.lint.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const APP_NAME = 'CCL - NPI Costing module';

test('UI chrome carries the new name', () => {
  const chrome = {
    'components/Layout/Sidebar.jsx': `<span className="sidebar-app-name">${APP_NAME}</span>`,
    'hooks/useDocumentTitle.js': `const APP_SUFFIX = '${APP_NAME}';`,
    'modules/cost/tabs/AboutSection.jsx': `About — ${APP_NAME}`,
    'modules/cost/tabs/Settings.jsx': `<strong>${APP_NAME}</strong> v`,
  };
  for (const [file, needle] of Object.entries(chrome)) {
    assert.ok(read(file).includes(needle), `${file} should carry the app name: ${needle}`);
  }
});

test('the TOTP issuer is NOT renamed — it would orphan every enrolled authenticator', () => {
  assert.match(
    read('components/Auth/TotpEnrollment.jsx'),
    /const issuer = 'Ops Control';/,
    'renaming the issuer changes what new enrolments show, splitting them from existing ones'
  );
});

test('the login help text still names the entry the authenticator actually shows', () => {
  const login = read('components/Auth/LoginPage.jsx');
  assert.ok(
    login.includes('Delete any "Ops Control" entry'),
    'this sentence must match the TOTP issuer above, not the UI name'
  );
  assert.ok(
    login.includes(`${APP_NAME} · `),
    'the login card subtitle is chrome and should carry the new name'
  );
});

test('references to the PACKAGED desktop app keep its productName', () => {
  // electron-builder productName is still "Ops Control", so the install
  // path and the LaunchAgent target are unchanged. Text pointing at the
  // app-as-a-program must keep matching it.
  for (const file of ['services/desktopBridge.js', 'i18n/domains/mes.js']) {
    assert.ok(
      read(file).includes('Ops Control'),
      `${file} refers to the packaged app and must not be renamed`
    );
  }
});

test('Help no longer tells operators to click a wordmark that was renamed', () => {
  const help = read('help/content.js');
  assert.ok(!/"Ops Control" wordmark/.test(help), 'stale wordmark instruction left in Help');
  assert.ok(!/click chữ "Ops Control"/.test(help), 'stale VI wordmark instruction left in Help');
  assert.ok(help.includes(`"${APP_NAME}" wordmark`), 'Help should name the current wordmark');
});
