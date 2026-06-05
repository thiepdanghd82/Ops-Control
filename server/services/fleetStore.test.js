/**
 * fleetStore unit tests — heartbeat / list / queue / distribute, JSON-backed.
 * Run: node --test server/services/fleetStore.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  recordHeartbeat,
  listFleet,
  queuePendingLicense,
  getPendingForInstall,
  markDistributed,
} from './fleetStore.js';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-fleet-'));
});

describe('fleetStore.recordHeartbeat', () => {
  test('records + sanitizes status, persists JSON', () => {
    const rec = recordHeartbeat(
      dir,
      { installation_id: ID_A, hostname: 'op3-mac', status: { type: 'trial', tier: 'S', isTrial: true, expires_at: '2026-06-08T00:00:00Z' } },
      '2026-06-04T00:00:00Z'
    );
    assert.equal(rec.installation_id, ID_A);
    assert.equal(rec.status.type, 'trial');
    assert.equal(rec.status.isTrial, true);
    assert.ok(fs.existsSync(path.join(dir, 'Library', 'Fleet', 'heartbeats.json')));
  });

  test('rejects malformed installation_id', () => {
    assert.throws(() => recordHeartbeat(dir, { installation_id: 'nope' }), /bad-installation-id/);
  });

  test('preserves first_seen across heartbeats, updates last_seen', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'h1' }, '2026-06-01T00:00:00Z');
    const r2 = recordHeartbeat(dir, { installation_id: ID_A, hostname: 'h1' }, '2026-06-04T00:00:00Z');
    assert.equal(r2.first_seen, '2026-06-01T00:00:00Z');
    assert.equal(r2.last_seen, '2026-06-04T00:00:00Z');
  });

  test('unknown status.type coerced to "unknown"', () => {
    const r = recordHeartbeat(dir, { installation_id: ID_A, status: { type: 'hacker' } }, '2026-06-04T00:00:00Z');
    assert.equal(r.status.type, 'unknown');
  });
});

describe('fleetStore.listFleet', () => {
  test('computes days_left + pending flag, sorts by last_seen desc', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'old', status: { expires_at: '2026-07-04T00:00:00Z' } }, '2026-06-01T00:00:00Z');
    recordHeartbeat(dir, { installation_id: ID_B, hostname: 'new' }, '2026-06-03T00:00:00Z');
    const now = new Date('2026-06-04T00:00:00Z').getTime();
    const list = listFleet(dir, now);
    assert.equal(list.length, 2);
    assert.equal(list[0].installation_id, ID_B); // newer last_seen first
    const a = list.find((m) => m.installation_id === ID_A);
    assert.equal(a.days_left, 30);
    assert.equal(a.pending_license, false);
  });

  test('empty fleet → []', () => {
    assert.deepEqual(listFleet(dir), []);
  });
});

describe('fleetStore queue + distribute', () => {
  const lic = (id) => ({ installation_id: id, tier: 'M', expires_at: '2027-06-09T00:00:00Z', signature: 'x' });

  test('queue → getPending returns it; list flags pending_license', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'h' }, '2026-06-04T00:00:00Z');
    queuePendingLicense(dir, lic(ID_A), '2026-06-04T00:00:00Z');
    assert.ok(getPendingForInstall(dir, ID_A));
    assert.equal(listFleet(dir).find((m) => m.installation_id === ID_A).pending_license, true);
  });

  test('queue rejects bad installation_id', () => {
    assert.throws(() => queuePendingLicense(dir, { installation_id: 'bad' }), /bad-installation-id/);
  });

  test('markDistributed removes from queue + appends log; false when nothing pending', () => {
    queuePendingLicense(dir, lic(ID_A), '2026-06-04T00:00:00Z');
    assert.equal(markDistributed(dir, ID_A, '2026-06-04T01:00:00Z'), true);
    assert.equal(getPendingForInstall(dir, ID_A), null);
    const log = JSON.parse(fs.readFileSync(path.join(dir, 'Library', 'Fleet', 'distributed-log.json'), 'utf8'));
    assert.equal(log[0].installation_id, ID_A);
    assert.equal(markDistributed(dir, ID_A), false); // already gone
  });
});
