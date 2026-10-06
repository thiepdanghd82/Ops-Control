/**
 * trustProxy — which peers may set the client IP through X-Forwarded-For
 * (2026-10-06).
 *
 * The server set `trust proxy` to 1 — "trust the first hop" — while LAN
 * clients reach it directly, with no proxy in front: on the desktop SERVER
 * box (:3100) and on the NSSM install (:3000). So any client could write its
 * own X-Forwarded-For and Express took it as req.ip, which forges the IP in
 * the audit log and slips the per-IP rate limits. Only a proxy on the same
 * machine (deploy.sh's optional nginx, proxy_pass to 127.0.0.1) should be
 * believed.
 *
 * Express resolves req.ip as proxyaddr(req, app.get('trust proxy fn')), so
 * these tests take the trust function from an Express app set the same way
 * and call proxy-addr with fake requests.
 *
 *   node --test server/utils/trustProxy.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import proxyaddr from 'proxy-addr';
import { TRUST_PROXY } from './trustProxy.js';

// What Express computes for req.ip, with the trust function it builds.
const trust = express().set('trust proxy', TRUST_PROXY).get('trust proxy fn');
const reqIp = (peer, xff) =>
  proxyaddr(
    { connection: { remoteAddress: peer }, headers: xff ? { 'x-forwarded-for': xff } : {} },
    trust
  );

test('a LAN client connecting directly cannot set its own IP', () => {
  assert.equal(reqIp('10.102.3.60', '203.0.113.77'), '10.102.3.60');
});

test('a LAN client written as an IPv4-mapped IPv6 address cannot either', () => {
  assert.equal(reqIp('::ffff:10.102.3.60', '203.0.113.77'), '::ffff:10.102.3.60');
});

test('a proxy on the same machine passes the real client IP through', () => {
  assert.equal(reqIp('127.0.0.1', '10.102.3.60'), '10.102.3.60');
  assert.equal(reqIp('::1', '10.102.3.60'), '10.102.3.60');
  assert.equal(reqIp('::ffff:127.0.0.1', '10.102.3.60'), '10.102.3.60');
});

test('without the header every client reads as its own socket address', () => {
  assert.equal(reqIp('10.102.3.60'), '10.102.3.60');
  assert.equal(reqIp('127.0.0.1'), '127.0.0.1');
});

test('the server applies TRUST_PROXY, not a hop count of its own', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(path.join(here, '..', 'index.js'), 'utf8');
  assert.match(index, /app\.set\('trust proxy', TRUST_PROXY\)/);
  assert.doesNotMatch(index, /app\.set\('trust proxy', (\d+|true)\)/);
});
