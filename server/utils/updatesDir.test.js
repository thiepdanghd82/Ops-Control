/**
 * updatesDir.test.js — Phase A.4 unit tests for the updates-dir
 * resolver. Pure, no I/O.
 *
 *   node --test server/utils/updatesDir.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { resolveUpdatesDir } from './updatesDir.js';

const PROJECT = '/opt/ops-control';
const DATA = '/opt/ops-control/server/data';

test('resolveUpdatesDir: default — sibling of dataDir', () => {
  const r = resolveUpdatesDir({}, DATA, PROJECT);
  assert.equal(r, path.join(DATA, '..', 'updates'));
  // Sanity: ends in /updates and is a sibling, not a child, of the data dir.
  assert.equal(path.basename(r), 'updates');
  assert.equal(path.dirname(r), path.dirname(DATA));
});

test('resolveUpdatesDir: absolute OPS_UPDATES_DIR override', () => {
  const r = resolveUpdatesDir({ OPS_UPDATES_DIR: '/var/lib/ops-updates' }, DATA, PROJECT);
  assert.equal(r, '/var/lib/ops-updates');
});

test('resolveUpdatesDir: relative OPS_UPDATES_DIR resolves against project root', () => {
  const r = resolveUpdatesDir({ OPS_UPDATES_DIR: 'updates-staging' }, DATA, PROJECT);
  assert.equal(r, path.join(PROJECT, 'updates-staging'));
  assert.ok(path.isAbsolute(r), 'relative override must resolve to an absolute path');
});
