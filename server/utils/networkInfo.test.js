/**
 * networkInfo.test.js — Phase A.2 unit tests.
 *
 *   node --test server/utils/networkInfo.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listLanIPv4, pickServerUrl, prefRank } from './networkInfo.js';

test('prefRank: ethernet < wifi < generic < virtual', () => {
  assert.equal(prefRank('en0'), 0);
  assert.equal(prefRank('eth0'), 0);
  assert.equal(prefRank('wlan0'), 1);
  assert.equal(prefRank('wlp3s0'), 1);
  assert.equal(prefRank('lo0'), 5); // generic / unknown prefix
  assert.equal(prefRank('bridge100'), 9);
  assert.equal(prefRank('utun0'), 9);
  assert.equal(prefRank('docker0'), 9);
});

test('listLanIPv4: skips internal + IPv6, returns IPv4 only', () => {
  const fake = () => ({
    en0: [
      { family: 'IPv4', address: '10.102.3.61', netmask: '255.255.255.0', internal: false },
      { family: 'IPv6', address: 'fe80::1', netmask: '...', internal: false },
    ],
    lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
  });
  const list = listLanIPv4(fake);
  assert.equal(list.length, 1);
  assert.equal(list[0].iface, 'en0');
  assert.equal(list[0].address, '10.102.3.61');
});

test('listLanIPv4: sorts ethernet ahead of wifi ahead of virtual', () => {
  const fake = () => ({
    bridge100: [
      { family: 'IPv4', address: '192.168.64.1', netmask: '255.255.255.0', internal: false },
    ],
    wlan0: [{ family: 'IPv4', address: '192.168.1.50', netmask: '255.255.255.0', internal: false }],
    en0: [{ family: 'IPv4', address: '10.102.3.61', netmask: '255.255.255.0', internal: false }],
  });
  const list = listLanIPv4(fake);
  assert.equal(list.length, 3);
  assert.equal(list[0].iface, 'en0');
  assert.equal(list[1].iface, 'wlan0');
  assert.equal(list[2].iface, 'bridge100');
});

test('pickServerUrl: returns http://<top-iface>:<port> or null', () => {
  const fake = () => ({
    en0: [{ family: 'IPv4', address: '10.102.3.61', netmask: '255.255.255.0', internal: false }],
  });
  assert.equal(pickServerUrl(3000, fake), 'http://10.102.3.61:3000');
  assert.equal(
    pickServerUrl(3000, () => ({})),
    null,
    'returns null when no LAN ip'
  );
});
