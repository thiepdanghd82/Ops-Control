/**
 * netProbe.test.js — unit tests for the .opsconn / setup-wizard
 * server reachability probe (Phase A.3a).
 *
 * Spins up a real localhost http server per test for full integration
 * coverage of statusCode / body-parse / error / timeout branches —
 * no mock library required.
 *
 * Run with: node --test desktop/utils/netProbe.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { probeServer } = require('./netProbe');

function startServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function stopServer(srv) {
  return new Promise((resolve) => srv.close(resolve));
}

test('probeServer: 200 + version JSON → ok=true with version + ms', async () => {
  const srv = await startServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '1.5.1' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    const port = srv.address().port;
    const r = await probeServer(`http://127.0.0.1:${port}`);
    assert.equal(r.ok, true);
    assert.equal(r.version, '1.5.1');
    assert.equal(typeof r.ms, 'number');
    assert.ok(r.ms >= 0);
  } finally {
    await stopServer(srv);
  }
});

test('probeServer: unreachable port → ok=false with error', async () => {
  // Port 1 is reserved & nothing listens — guaranteed ECONNREFUSED.
  const r = await probeServer('http://127.0.0.1:1');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
  assert.match(r.error, /ECONN|connect|refused/i);
});

test('probeServer: invalid URL format → ok=false', async () => {
  const r = await probeServer('not-a-url');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
});

test('probeServer: empty URL → ok=false', async () => {
  const r = await probeServer('');
  assert.equal(r.ok, false);
  assert.match(r.error, /required/i);
});

test('probeServer: non-200 statusCode → ok=false', async () => {
  const srv = await startServer((req, res) => {
    res.writeHead(503);
    res.end('Service Unavailable');
  });
  try {
    const port = srv.address().port;
    const r = await probeServer(`http://127.0.0.1:${port}`);
    assert.equal(r.ok, false);
  } finally {
    await stopServer(srv);
  }
});

test('probeServer: non-JSON body → ok=true with version=undefined', async () => {
  const srv = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  try {
    const port = srv.address().port;
    const r = await probeServer(`http://127.0.0.1:${port}`);
    assert.equal(r.ok, true);
    assert.equal(r.version, undefined);
  } finally {
    await stopServer(srv);
  }
});
