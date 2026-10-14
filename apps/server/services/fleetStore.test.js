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
  forgetMachine,
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
      {
        installation_id: ID_A,
        hostname: 'op3-mac',
        status: { type: 'trial', tier: 'S', isTrial: true, expires_at: '2026-06-08T00:00:00Z' },
      },
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
    const r2 = recordHeartbeat(
      dir,
      { installation_id: ID_A, hostname: 'h1' },
      '2026-06-04T00:00:00Z'
    );
    assert.equal(r2.first_seen, '2026-06-01T00:00:00Z');
    assert.equal(r2.last_seen, '2026-06-04T00:00:00Z');
  });

  test('unknown status.type coerced to "unknown"', () => {
    const r = recordHeartbeat(
      dir,
      { installation_id: ID_A, status: { type: 'hacker' } },
      '2026-06-04T00:00:00Z'
    );
    assert.equal(r.status.type, 'unknown');
  });
});

describe('fleetStore.listFleet', () => {
  test('computes days_left + pending flag, sorts by last_seen desc', () => {
    recordHeartbeat(
      dir,
      { installation_id: ID_A, hostname: 'old', status: { expires_at: '2026-07-04T00:00:00Z' } },
      '2026-06-01T00:00:00Z'
    );
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
  const lic = (id) => ({
    installation_id: id,
    tier: 'M',
    expires_at: '2027-06-09T00:00:00Z',
    signature: 'x',
  });

  test('queue → getPending returns it; list flags pending_license', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'h' }, '2026-06-04T00:00:00Z');
    queuePendingLicense(dir, lic(ID_A), '2026-06-04T00:00:00Z');
    assert.ok(getPendingForInstall(dir, ID_A));
    assert.equal(listFleet(dir).find((m) => m.installation_id === ID_A).pending_license, true);
  });

  test('queue rejects bad installation_id', () => {
    assert.throws(
      () => queuePendingLicense(dir, { installation_id: 'bad' }),
      /bad-installation-id/
    );
  });

  test('markDistributed removes from queue + appends log; false when nothing pending', () => {
    queuePendingLicense(dir, lic(ID_A), '2026-06-04T00:00:00Z');
    assert.equal(markDistributed(dir, ID_A, '2026-06-04T01:00:00Z'), true);
    assert.equal(getPendingForInstall(dir, ID_A), null);
    const log = JSON.parse(
      fs.readFileSync(path.join(dir, 'Library', 'Fleet', 'distributed-log.json'), 'utf8')
    );
    assert.equal(log[0].installation_id, ID_A);
    assert.equal(markDistributed(dir, ID_A), false); // already gone
  });
});

/**
 * days_left rounding — 2026-09-11, found on a live screenshot.
 *
 * `Math.floor((expMs - now) / 86400000)` is right for a licence that is still
 * valid: "270d" means at least 270 whole days remain, which is the cautious
 * direction. Applied to an EXPIRED licence the caution inverts — floor(-85.2)
 * is -86, and the table said "expired 86d ago" for a trial that had lapsed
 * 85.2 days earlier. One rounding rule, two opposite meanings.
 */
describe('fleetStore.listFleet — days_left rounding', () => {
  const DAY = 86400000;
  const NOW = Date.parse('2026-09-11T06:30:00.000Z');

  function seed(expiresAt) {
    recordHeartbeat(dir, {
      installation_id: ID_A,
      hostname: 'm',
      status: { type: 'real', tier: 'M', expires_at: expiresAt },
    });
    return listFleet(dir, NOW)[0].days_left;
  }

  test('a future expiry floors — 270.7 days left reads 270, never 271', () => {
    assert.equal(seed(new Date(NOW + 270.7 * DAY).toISOString()), 270);
  });

  test('a past expiry ceils — lapsed 85.2 days reads 85, not 86', () => {
    assert.equal(seed(new Date(NOW - 85.2 * DAY).toISOString()), -85);
  });

  test('the real trial row from the screenshot', () => {
    // expires_at 2026-06-18, read at 2026-09-11T06:30Z → 85.27 days elapsed.
    assert.equal(seed('2026-06-18T00:00:00.000Z'), -85);
  });

  test('an expiry inside the current day is 0, not -1', () => {
    assert.equal(seed(new Date(NOW - 0.4 * DAY).toISOString()), 0);
  });

  test('no expiry at all stays null', () => {
    recordHeartbeat(dir, { installation_id: ID_B, hostname: 'n', status: { type: 'unlicensed' } });
    const row = listFleet(dir, NOW).find((m) => m.installation_id === ID_B);
    assert.equal(row.days_left, null);
  });
});

/**
 * forgetMachine — the fleet table only ever grew.
 *
 * A decommissioned machine, a re-imaged one, or a trial install from months
 * ago stayed in the list forever; the operator screenshot that prompted this
 * had a nameless trial row last seen three months earlier. The table exists to
 * answer "which machines need a licence", and every dead row dilutes it.
 */
describe('fleetStore.forgetMachine', () => {
  test('removes the machine and reports it', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'gone' });
    recordHeartbeat(dir, { installation_id: ID_B, hostname: 'stays' });

    const r = forgetMachine(dir, ID_A);

    assert.equal(r.removed, true);
    assert.equal(r.had_pending, false);
    assert.deepEqual(
      listFleet(dir).map((m) => m.hostname),
      ['stays']
    );
  });

  test('a queued licence is dropped with the machine, and SAID so', () => {
    // Silently discarding an offline-signed licence would be worse than
    // refusing: the operator must be told, so the UI can warn before asking.
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'gone' });
    queuePendingLicense(dir, { installation_id: ID_A, tier: 'M' });

    const r = forgetMachine(dir, ID_A);

    assert.equal(r.removed, true);
    assert.equal(r.had_pending, true, 'the caller must be able to warn about this');
    assert.equal(getPendingForInstall(dir, ID_A), null, 'the queue entry must be gone too');
  });

  test('forgetting an unknown machine is not an error, just false', () => {
    const r = forgetMachine(dir, ID_B);
    assert.equal(r.removed, false);
    assert.equal(r.had_pending, false);
  });

  test('a malformed id is refused rather than treated as a key', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'keep' });
    assert.throws(() => forgetMachine(dir, 'nope'), /bad-installation-id/);
    assert.equal(listFleet(dir).length, 1, 'nothing may be removed on a bad id');
  });

  test('the distribution log is left alone — it is the audit trail', () => {
    recordHeartbeat(dir, { installation_id: ID_A, hostname: 'gone' });
    queuePendingLicense(dir, { installation_id: ID_A, tier: 'M' });
    markDistributed(dir, ID_A);

    forgetMachine(dir, ID_A);

    const log = JSON.parse(
      fs.readFileSync(path.join(dir, 'Library', 'Fleet', 'distributed-log.json'), 'utf8')
    );
    assert.equal(log.length, 1, 'forgetting a machine must not erase what was delivered to it');
  });
});
