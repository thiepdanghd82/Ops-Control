/**
 * The product name appears in two DIFFERENT roles, and only one of them
 * was renamed. This pins the split so a future find-and-replace cannot
 * quietly cross it.
 *
 *  1. UI chrome — the name the operator reads on screen, and every
 *     reference to the PACKAGED desktop app (whose electron-builder
 *     productName is now "Quoted Module", so the install is
 *     "/Applications/Quoted Module.app"). Renamed to "Quoted Module";
 *     the earlier UI names "Ops Control" and "CCL - NPI Costing module"
 *     must not come back.
 *
 *  2. Identity — two places where "Ops Control" is not a caption but a
 *     reference to something that still carries that name:
 *       - the TOTP issuer baked into the otpauth:// URI. Authenticator
 *         apps show whatever the entry was created with, so renaming it
 *         would leave every already-enrolled operator looking at a name
 *         the app no longer uses (an orphaned entry), and the login help
 *         text that tells them to delete a stale "Ops Control" entry
 *         would be wrong;
 *       - that same login help text, which must keep matching the issuer.
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
const SELF = path.basename(fileURLToPath(import.meta.url));

const APP_NAME = 'Quoted Module';
const OLD_UI_NAME = 'CCL - NPI Costing module';
const OLD_APP_NAME = 'Ops Control';

test('UI chrome carries the new name', () => {
  const chrome = {
    '../index.html': `<title>${APP_NAME}</title>`,
    'components/Layout/Sidebar.jsx': `<span className="sidebar-app-name">${APP_NAME}</span>`,
    'hooks/useDocumentTitle.js': `const APP_SUFFIX = '${APP_NAME}';`,
    'modules/cost/tabs/AboutSection.jsx': `About — ${APP_NAME}`,
    'modules/cost/tabs/Settings.jsx': `<strong>${APP_NAME}</strong> v`,
    'components/Auth/LoginPage.jsx': `${APP_NAME} · `,
    'components/Auth/ProvisioningCard.jsx': `the ${APP_NAME} app`,
  };
  for (const [file, needle] of Object.entries(chrome)) {
    assert.ok(read(file).includes(needle), `${file} should carry the app name: ${needle}`);
  }
});

test('the previous UI name is gone from the client source', () => {
  const offenders = fs
    .readdirSync(SRC, { recursive: true })
    .filter((f) => /\.(jsx?|css|html)$/.test(f) && path.basename(f) !== SELF)
    .filter((f) => read(f).includes(OLD_UI_NAME));
  assert.deepEqual(offenders, [], `"${OLD_UI_NAME}" left in: ${offenders.join(', ')}`);
  assert.ok(!read('../index.html').includes(OLD_UI_NAME), 'index.html still has the old title');
});

test('the TOTP issuer is NOT renamed — it would orphan every enrolled authenticator', () => {
  assert.match(
    read('components/Auth/TotpEnrollment.jsx'),
    /const issuer = 'Ops Control';/,
    'renaming the issuer changes what new enrolments show, splitting them from existing ones'
  );
});

test('the login help text still names the entry the authenticator actually shows', () => {
  assert.ok(
    read('components/Auth/LoginPage.jsx').includes('Delete any "Ops Control" entry'),
    'this sentence must match the TOTP issuer above, not the UI name'
  );
});

test('references to the PACKAGED desktop app use its new productName', () => {
  // electron-builder productName is now "Quoted Module". Text pointing at
  // the app-as-a-program must match what the operator sees in /Applications
  // and the Start menu.
  for (const file of ['services/desktopBridge.js', 'i18n/domains/mes.js']) {
    const src = read(file);
    assert.ok(src.includes(APP_NAME), `${file} should name the packaged app "${APP_NAME}"`);
    assert.ok(!src.includes(OLD_APP_NAME), `${file} still names the old packaged app`);
  }
});

test('operator-facing text no longer shows the old app name', () => {
  for (const file of [
    'App.jsx',
    'components/Auth/ProvisioningCard.jsx',
    'help/content.js',
    'i18n/domains/basis.js',
    'modules/cost/tabs/AboutSection.jsx',
    'modules/cost/tabs/HardwareSection.jsx',
    'modules/cost/tabs/Settings.jsx',
    'utils/kpiDefinitions.js',
  ]) {
    const src = read(file);
    assert.ok(!src.includes(OLD_APP_NAME), `${file} still shows "${OLD_APP_NAME}"`);
    assert.ok(!src.includes(OLD_APP_NAME.toUpperCase()), `${file} still shows "OPS CONTROL"`);
  }
});

test('Help no longer tells operators to click a wordmark that was renamed', () => {
  const help = read('help/content.js');
  for (const old of [OLD_APP_NAME, OLD_UI_NAME]) {
    assert.ok(
      !help.includes(`"${old}" wordmark`),
      `stale wordmark instruction left in Help: ${old}`
    );
    assert.ok(
      !help.includes(`click chữ "${old}"`),
      `stale VI wordmark instruction left in Help: ${old}`
    );
  }
  assert.ok(help.includes(`"${APP_NAME}" wordmark`), 'Help should name the current wordmark');
  assert.ok(help.includes(`click chữ "${APP_NAME}"`), 'VI Help should name the current wordmark');
});
