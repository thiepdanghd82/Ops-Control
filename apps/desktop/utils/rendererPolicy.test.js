'use strict';
/**
 * Guards on the two permissive Electron defaults this app turns off.
 *
 * Both were open until 2026-09-20: three `shell.openExternal` call sites
 * passed whatever URL the renderer had failed to keep in-app straight to the
 * OS, and no permission handler was installed at all, so Electron granted
 * every request a page made. The windows that would suffer most are the setup
 * wizard and the first-run dialog, which still run with nodeIntegration.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isExternalUrlAllowed,
  isPermissionAllowed,
  ALLOWED_PERMISSIONS,
} = require('./rendererPolicy');

test('http and https are the only schemes handed to the OS', () => {
  assert.equal(isExternalUrlAllowed('https://ccl.example/quote'), true);
  assert.equal(isExternalUrlAllowed('http://10.102.3.61:3100/health'), true);
});

test('schemes that launch an application are refused', () => {
  // Each of these is a real OS handler, not a hypothetical: file opens Finder
  // or an app, smb mounts a share, and a custom scheme runs whatever
  // registered it.
  for (const url of [
    'file:///Applications/Calculator.app',
    'smb://10.102.1.2/Departments$',
    'ms-msdt:/id',
    'vnd.ms-search:query',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
  ]) {
    assert.equal(isExternalUrlAllowed(url), false, `${url} must not reach the OS`);
  }
});

test('garbage in does not throw and does not pass', () => {
  // will-navigate and setWindowOpenHandler hand us whatever the page had.
  for (const v of ['', 'not a url', '://', null, undefined, 42, {}, []]) {
    assert.equal(isExternalUrlAllowed(v), false, `${JSON.stringify(v)} must be refused`);
  }
});

test('clipboard WRITE is allowed — the app has 8 call sites for it', () => {
  assert.equal(isPermissionAllowed('clipboard-sanitized-write'), true);
});

test('clipboard READ is not, because nothing reads it', () => {
  // Deliberately separate from the write case: they are different permissions
  // and granting both because the word "clipboard" matches is how allowlists rot.
  assert.equal(isPermissionAllowed('clipboard-read'), false);
});

test('every permission with no caller in this app is refused', () => {
  for (const p of [
    'media',
    'geolocation',
    'notifications',
    'midi',
    'midiSysex',
    'hid',
    'serial',
    'usb',
    'display-capture',
    'openExternal',
    'fullscreen',
    'pointerLock',
    'unknown-future-permission',
  ]) {
    assert.equal(isPermissionAllowed(p), false, `${p} must be denied`);
  }
});

test('the allowlist stays one entry until someone adds a call site', () => {
  // Not decoration: the value of this policy is that it is short. If it grows,
  // the diff should have a caller in it.
  assert.deepEqual([...ALLOWED_PERMISSIONS], ['clipboard-sanitized-write']);
});
