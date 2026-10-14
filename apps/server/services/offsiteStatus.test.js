/**
 * offsiteStatus — the verdict Settings → Backup shows for the off-site mirror.
 *   node --test server/services/offsiteStatus.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOffsiteHealth, STALE_AFTER_HOURS } from './offsiteStatus.js';

const NOW = Date.parse('2026-09-16T10:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

test('no status file at all → not configured, not a failure', () => {
  const r = resolveOffsiteHealth(null, NOW);
  assert.equal(r.tone, 'none');
  assert.equal(r.reason, 'not_configured');
});

test('a recent success is healthy', () => {
  const r = resolveOffsiteHealth(
    { last_ok_at: hoursAgo(2), last_run_at: hoursAgo(2), last_run_state: 'ok', dest: '/m' },
    NOW
  );
  assert.equal(r.tone, 'ok');
  assert.ok(r.ageHours < 3);
  assert.equal(r.dest, '/m');
});

test('running forever without ever succeeding is BAD, not a warning', () => {
  // The real shape of the 84-day outage: every run on time, every run a SKIP.
  const r = resolveOffsiteHealth(
    {
      last_run_at: hoursAgo(0.1),
      last_run_state: 'skip',
      last_ok_at: null,
      detail: 'share not mounted',
    },
    NOW
  );
  assert.equal(r.tone, 'bad', 'a punctual job that has never worked must not read as healthy');
  assert.equal(r.reason, 'never_succeeded');
  assert.equal(r.detail, 'share not mounted');
});

test('a success older than the staleness window warns', () => {
  const r = resolveOffsiteHealth({ last_ok_at: hoursAgo(STALE_AFTER_HOURS + 1) }, NOW);
  assert.equal(r.tone, 'warn');
  assert.equal(r.reason, 'stale');
});

test('just inside the window is still ok', () => {
  const r = resolveOffsiteHealth(
    { last_ok_at: hoursAgo(STALE_AFTER_HOURS - 1), last_run_state: 'ok' },
    NOW
  );
  assert.equal(r.tone, 'ok');
});

test('fresh mirror but the latest attempt failed → warn, not ok', () => {
  const r = resolveOffsiteHealth(
    { last_ok_at: hoursAgo(1), last_run_at: hoursAgo(0.1), last_run_state: 'error' },
    NOW
  );
  assert.equal(r.tone, 'warn');
  assert.equal(r.reason, 'last_run_failed');
});

test('a garbled timestamp is bad, never silently ok', () => {
  const r = resolveOffsiteHealth({ last_ok_at: 'yesterday-ish' }, NOW);
  assert.equal(r.tone, 'bad');
  assert.equal(r.reason, 'unreadable_timestamp');
});

test('a future timestamp clamps to 0 rather than going negative', () => {
  const r = resolveOffsiteHealth({ last_ok_at: hoursAgo(-5), last_run_state: 'ok' }, NOW);
  assert.equal(r.ageHours, 0);
  assert.equal(r.tone, 'ok');
});
