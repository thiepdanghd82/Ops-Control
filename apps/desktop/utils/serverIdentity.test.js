/**
 * serverIdentity.test.js — unit tests for the SERVER setup wizard's
 * identity helpers.
 *
 * Pure-Node tests (no Electron app context). detectLanguage() is
 * exercised here via the lazy-require fallback path (electron module
 * absent → 'en' default + log).
 *
 * Run with: node --test desktop/utils/serverIdentity.test.js
 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const si = require('./serverIdentity');

test('validateServerName: accepts 3-50 chars on charset', () => {
  assert.equal(si.validateServerName('CCL Design VN').ok, true);
  assert.equal(si.validateServerName('Ops_Server-01').ok, true);
  assert.equal(si.validateServerName('a.b').ok, true);
  assert.equal(si.validateServerName('A'.repeat(50)).ok, true);
  // Trim before check
  assert.equal(si.validateServerName('  Ops Server  ').value, 'Ops Server');
});

test('validateServerName: rejects empty / too-short / too-long / bad chars', () => {
  assert.equal(si.validateServerName('').ok, false);
  assert.equal(si.validateServerName('   ').ok, false);
  assert.equal(si.validateServerName('ab').ok, false); // < 3
  assert.equal(si.validateServerName('A'.repeat(51)).ok, false); // > 50
  assert.equal(si.validateServerName('CCL <script>').ok, false); // angle brackets
  assert.equal(si.validateServerName('foo/bar').ok, false); // slash
  assert.equal(si.validateServerName('foo@bar').ok, false); // at-sign
});

test('generateServerId: returns RFC4122 v4 UUID', () => {
  const id = si.generateServerId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // Distinct on every call
  assert.notEqual(id, si.generateServerId());
});

test('detectTimezone: returns IANA-shaped string', () => {
  const tz = si.detectTimezone();
  // IANA TZ identifier: 'UTC' or 'Region/City' (with optional sub-region)
  assert.match(tz, /^[A-Z][A-Za-z_]+(\/[A-Za-z][A-Za-z_]+(\/[A-Za-z][A-Za-z_]+)?)?$/);
});

test('detectLanguage: returns vi or en (Electron not loaded → en)', () => {
  // In plain Node test context, require('electron') throws — falls back to 'en'.
  const lang = si.detectLanguage();
  assert.ok(['vi', 'en'].includes(lang));
});

test('mergeIdentity: preserves serverId and createdAt across re-run', () => {
  const original = si.buildFreshIdentity('Original Name');
  const originalId = original.serverId;
  const originalCreated = original.createdAt;

  const merged = si.mergeIdentity(original, {
    serverName: 'New Name',
    timezone: 'America/New_York',
    language: 'en',
    // Attempting to inject a new id should be ignored
    serverId: 'attacker-injected-id',
    createdAt: '1970-01-01T00:00:00.000Z',
  });

  assert.equal(merged.serverId, originalId, 'serverId must be immutable across re-run');
  assert.equal(merged.createdAt, originalCreated, 'createdAt must be immutable');
  assert.equal(merged.serverName, 'New Name', 'serverName editable');
  assert.equal(merged.timezone, 'America/New_York', 'timezone editable');
  assert.equal(merged.language, 'en', 'language editable');
});
