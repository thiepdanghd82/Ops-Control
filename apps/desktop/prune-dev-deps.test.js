'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneDevDeps, findBrokenDeps } = require('./prune-dev-deps.js');

function makePkg(appDir, rel, deps = {}) {
  const dir = path.join(appDir, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: rel, dependencies: deps })
  );
}

function makeApp() {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-dev-deps-'));
  fs.mkdirSync(path.join(appDir, 'server'));
  makePkg(appDir, 'node_modules/express', { debug: '*' });
  makePkg(appDir, 'node_modules/debug');
  makePkg(appDir, 'node_modules/eslint', { debug: '*', espree: '*' });
  makePkg(appDir, 'node_modules/espree');
  makePkg(appDir, 'node_modules/@scope/devtool');
  makePkg(appDir, 'node_modules/express/node_modules/nested-dev');
  makePkg(appDir, 'node_modules/eslint/node_modules/inner');
  makePkg(appDir, 'node_modules/native-overlay', { 'native-helper': '*' });
  makePkg(appDir, 'node_modules/native-overlay/node_modules/native-helper');
  return appDir;
}

const lock = {
  packages: {
    '': { name: 'root' },
    'node_modules/express': {},
    'node_modules/debug': {},
    'node_modules/eslint': { dev: true },
    'node_modules/espree': { dev: true },
    'node_modules/@scope/devtool': { dev: true },
    'node_modules/express/node_modules/nested-dev': { dev: true },
    'node_modules/eslint/node_modules/inner': { dev: true },
    // a dev path inside the protected native overlay must survive
    'node_modules/native-overlay/node_modules/native-helper': { dev: true },
  },
};

test('removes exactly the lock dev paths, keeps prod and protected overlays', () => {
  const appDir = makeApp();
  const removed = pruneDevDeps({
    appDir,
    lock,
    rootDependencies: ['express'],
    protectedPaths: ['node_modules/native-overlay'],
  });
  assert.deepEqual(removed, [
    'node_modules/@scope/devtool',
    'node_modules/eslint',
    'node_modules/espree',
    'node_modules/express/node_modules/nested-dev',
  ]);
  for (const kept of ['express', 'debug', 'native-overlay/node_modules/native-helper']) {
    assert.ok(fs.existsSync(path.join(appDir, 'node_modules', kept, 'package.json')), kept);
  }
  for (const gone of ['eslint', 'espree', '@scope/devtool', 'express/node_modules/nested-dev']) {
    assert.ok(!fs.existsSync(path.join(appDir, 'node_modules', gone)), gone);
  }
  assert.ok(!fs.existsSync(path.join(appDir, '.prune-dev-deps-stash')));
  assert.equal(findBrokenDeps(appDir, ['express']).size, 0);
});

test('refuses to prune — and restores everything — when a prod package needs a dev-marked one', () => {
  const appDir = makeApp();
  const badLock = {
    packages: { ...lock.packages, 'node_modules/debug': { dev: true } }, // express needs debug
  };
  assert.throws(
    () => pruneDevDeps({ appDir, lock: badLock, rootDependencies: ['express'] }),
    /would break .*node_modules\/express -> debug/s
  );
  for (const back of ['eslint', 'espree', 'debug', '@scope/devtool']) {
    assert.ok(fs.existsSync(path.join(appDir, 'node_modules', back, 'package.json')), back);
  }
  assert.ok(!fs.existsSync(path.join(appDir, '.prune-dev-deps-stash')));
});

test('refuses to prune a root dependency the server imports', () => {
  const appDir = makeApp();
  const badLock = { packages: { ...lock.packages, 'node_modules/express': { dev: true } } };
  assert.throws(
    () => pruneDevDeps({ appDir, lock: badLock, rootDependencies: ['express'] }),
    /\(server\) -> express/
  );
  assert.ok(fs.existsSync(path.join(appDir, 'node_modules/express/package.json')));
});

test('a resolution already broken before pruning does not fail the build', () => {
  const appDir = makeApp();
  makePkg(appDir, 'node_modules/needs-missing', { 'not-installed': '*' });
  const removed = pruneDevDeps({
    appDir,
    lock,
    rootDependencies: ['express'],
    protectedPaths: ['node_modules/native-overlay'],
  });
  assert.ok(removed.includes('node_modules/eslint'));
  assert.deepEqual(
    [...findBrokenDeps(appDir, [])],
    ['node_modules/needs-missing -> not-installed']
  );
});
