/**
 * embeddedPort.test.js — the embedded server keeps one fixed port.
 *
 * Run with: node --test desktop/utils/embeddedPort.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const {
  DEFAULT_SERVER_PORT,
  resolveServerPort,
  isPortFree,
  acquireServerPort,
} = require('./embeddedPort');

test('the port is the wizard value when valid, else 3100', () => {
  assert.equal(DEFAULT_SERVER_PORT, 3100);
  assert.equal(resolveServerPort(undefined), 3100);
  assert.equal(resolveServerPort(0), 3100);
  assert.equal(resolveServerPort('abc'), 3100);
  assert.equal(resolveServerPort(80), 3100, 'privileged ports are refused');
  assert.equal(resolveServerPort(70000), 3100);
  assert.equal(resolveServerPort(4100), 4100);
  assert.equal(resolveServerPort('4200'), 4200);
});

test('isPortFree sees a port another listener holds on all interfaces', async () => {
  const holder = net.createServer();
  await new Promise((r) => holder.listen(0, '0.0.0.0', r));
  const { port } = holder.address();
  try {
    assert.equal(await isPortFree(port), false);
  } finally {
    await new Promise((r) => holder.close(r));
  }
  assert.equal(await isPortFree(port), true);
});

test('a busy port is waited on, then the same port is used', async () => {
  let calls = 0;
  const probe = async () => ++calls >= 3; // freed on the third look
  assert.equal(await acquireServerPort(3100, { probe, delayMs: 1 }), 3100);
  assert.equal(calls, 3);
});

test('a port that stays busy fails startup and never moves', async () => {
  const seen = new Set();
  const probe = async (p) => (seen.add(p), false);
  await assert.rejects(acquireServerPort(3100, { probe, attempts: 4, delayMs: 1 }), (e) => {
    assert.equal(e.code, 'EADDRINUSE');
    assert.match(e.message, /3100/);
    return true;
  });
  assert.deepEqual([...seen], [3100]);
});
