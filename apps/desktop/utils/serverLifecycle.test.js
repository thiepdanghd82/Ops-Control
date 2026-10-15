/**
 * serverLifecycle.test.js — the SERVER build's server lives as long as the
 * app: closing it stops the server, and a stuck server is not left behind.
 *
 * Run with: node --test desktop/utils/serverLifecycle.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { shouldQuitOnAllWindowsClosed, stopChildProcess } = require('./serverLifecycle');

const q = (o) => shouldQuitOnAllWindowsClosed({ startupDone: true, ...o });

test('closing the last window quits the SERVER build on macOS too', () => {
  assert.equal(q({ platform: 'darwin', buildRole: 'server' }), true);
  assert.equal(q({ platform: 'win32', buildRole: 'server' }), true);
  assert.equal(q({ platform: 'win32', buildRole: 'client' }), true);
});

test('on macOS a thin CLIENT keeps the Dock; one running an embedded server quits', () => {
  assert.equal(q({ platform: 'darwin', buildRole: 'client' }), false);
  assert.equal(q({ platform: 'darwin', buildRole: 'client', hasEmbeddedServer: true }), true);
});

test('wizard / first-run windows closing mid-startup never quit, on any platform', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    assert.equal(
      shouldQuitOnAllWindowsClosed({ platform, buildRole: 'server', startupDone: false }),
      false,
      platform
    );
  }
});

const ready = (cp) => new Promise((r) => setTimeout(r, 150, cp));
const child = (code, ipc = false) =>
  spawn(process.execPath, ['-e', code], {
    stdio: ipc ? ['ignore', 'ignore', 'ignore', 'ipc'] : 'ignore',
  });

test('a child with an IPC channel is asked to stop through it, not killed', async () => {
  // Exits 0 on disconnect; would exit 9 if it got SIGTERM instead.
  const cp = await ready(
    child(
      'process.on("disconnect",()=>process.exit(0));process.on("SIGTERM",()=>process.exit(9));setInterval(()=>{},1e3)',
      true
    )
  );
  const r = await stopChildProcess(cp, { graceMs: 2000 });
  assert.equal(r.via, 'ipc');
  assert.equal(r.code, 0);
  assert.equal(r.forced, false);
});

test('without a channel a server that honours SIGTERM is stopped gracefully (POSIX)', async () => {
  const cp = await ready(
    child('process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1e3)')
  );
  const r = await stopChildProcess(cp, { graceMs: 2000, platform: 'darwin' });
  assert.equal(r.via, 'SIGTERM');
  assert.equal(r.forced, false);
  assert.equal(r.code, 0);
});

test('a server that ignores the request is killed, not left running', async () => {
  const cp = await ready(child('process.on("SIGTERM",()=>{});setInterval(()=>{},1e3)'));
  const r = await stopChildProcess(cp, { graceMs: 300, killMs: 2000, platform: 'darwin' });
  assert.equal(r.exited, true);
  assert.equal(r.forced, true);
  assert.equal(r.signal, 'SIGKILL');
});

test('an already-exited server resolves at once', async () => {
  const cp = child('process.exit(0)');
  await new Promise((r) => cp.once('exit', r));
  assert.deepEqual(await stopChildProcess(cp), { alreadyExited: true, forced: false });
  assert.deepEqual(await stopChildProcess(null), { alreadyExited: true, forced: false });
});
