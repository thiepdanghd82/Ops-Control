/**
 * configFileMode.test.js — ops-control-config.json stays owner-only.
 *
 * The electron-store file holds totpKey, kioskKey and exportHmacKey. conf
 * (electron-store's backend) writes it 0666 by default and rewrites it on
 * every set, so a one-off chmod is undone by the next write. main.js passes
 * configFileMode: 0o600 and chmods an existing file at startup; this test
 * proves the installed conf honours the option on every write and that
 * main.js still sets both.
 *
 * Run with: node --test desktop/utils/configFileMode.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The conf that electron-store itself loads. It lives only in
// apps/desktop/node_modules, which root `npm test` may run without (CI
// installs desktop deps in a later step), so the behaviour check skips then
// and the source check below still runs.
function loadConf() {
  try {
    const storeDir = path.dirname(require.resolve('electron-store'));
    return require(require.resolve('conf', { paths: [storeDir] }));
  } catch {
    return null;
  }
}
const Conf = loadConf();

const skip =
  process.platform === 'win32'
    ? 'POSIX file modes only'
    : !Conf && 'apps/desktop dependencies not installed';

test('conf writes the store 0600 on create and on every later write', { skip }, () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-conf-mode-'));
  try {
    const store = new Conf({ cwd, configName: 'ops-control-config', configFileMode: 0o600 });
    store.set('totpKey', 'x'.repeat(64));
    assert.equal(fs.statSync(store.path).mode & 0o777, 0o600);
    // A file an older build left world-writable is replaced on the next write.
    fs.chmodSync(store.path, 0o666);
    store.set('kioskKey', 'y'.repeat(64));
    assert.equal(fs.statSync(store.path).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('main.js opens the store owner-only and tightens an existing file', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const ctor = src.match(/new Store\(\{[\s\S]*?\n\}\);/);
  assert.ok(ctor, 'new Store({...}) not found in main.js');
  assert.match(ctor[0], /configFileMode:\s*0o600/);
  assert.match(src, /fs\.chmodSync\(store\.path,\s*0o600\)/);
});
