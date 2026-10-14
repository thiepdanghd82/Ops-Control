import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_AFTER_MS,
  getClientVersionBadge,
  groupClientVersionEventsByUser,
} from './clientVersionBadge.js';

const NOW = Date.parse('2026-05-28T12:00:00.000Z');
const RECENT = '2026-05-28T11:00:00.000Z'; // 1h ago
const ONE_DAY_AGO = '2026-05-27T12:00:00.000Z';
const EIGHT_DAYS_AGO = '2026-05-20T11:00:00.000Z';

test('STALE_AFTER_MS = 7 days', () => {
  assert.equal(STALE_AFTER_MS, 7 * 24 * 60 * 60 * 1000);
});

test('no events → gray', () => {
  const r = getClientVersionBadge([], '1.5.11', NOW);
  assert.equal(r.kind, 'gray');
  assert.equal(r.client_version, null);
});

test('only MATCH event with version === current server → green', () => {
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
        ts: RECENT,
        client_version: '1.5.11',
        server_version: '1.5.11',
      },
    ],
    '1.5.11',
    NOW
  );
  assert.equal(r.kind, 'green');
  assert.equal(r.client_version, '1.5.11');
});

test('MATCH event but server has since bumped → orange', () => {
  // User matched at 1.5.11; server has moved to 1.5.12 — they are now
  // outdated again but haven't opened the app since the bump.
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
        ts: RECENT,
        client_version: '1.5.11',
        server_version: '1.5.11',
      },
    ],
    '1.5.12',
    NOW
  );
  assert.equal(r.kind, 'orange');
  assert.equal(r.client_version, '1.5.11');
  // Current server is the source-of-truth field for the "what should
  // you be on" half of the comparison.
  assert.equal(r.server_version, '1.5.12');
});

test('only NUDGE_SHOWN event → orange', () => {
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
        ts: RECENT,
        client_version: '1.5.10',
        server_version: '1.5.11',
      },
    ],
    '1.5.11',
    NOW
  );
  assert.equal(r.kind, 'orange');
  assert.equal(r.client_version, '1.5.10');
  assert.equal(r.server_version, '1.5.11');
});

test('latest event > 7 days old → gray', () => {
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
        ts: EIGHT_DAYS_AGO,
        client_version: '1.5.11',
        server_version: '1.5.11',
      },
    ],
    '1.5.11',
    NOW
  );
  assert.equal(r.kind, 'gray');
  // Still surface the last-known version so admin can see "8 days ago
  // they were on X" rather than blank.
  assert.equal(r.client_version, '1.5.11');
});

test('mixed events — picks latest by ts', () => {
  // NUDGE older, MATCH newer — should follow MATCH.
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
        ts: ONE_DAY_AGO,
        client_version: '1.5.10',
        server_version: '1.5.11',
      },
      {
        event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
        ts: RECENT,
        client_version: '1.5.11',
        server_version: '1.5.11',
      },
    ],
    '1.5.11',
    NOW
  );
  assert.equal(r.kind, 'green');
});

test('mixed events — MATCH older than NUDGE → orange', () => {
  // The opposite ordering: user matched briefly, then a newer server
  // bump produced a fresh nudge that's the latest.
  const r = getClientVersionBadge(
    [
      {
        event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
        ts: ONE_DAY_AGO,
        client_version: '1.5.11',
        server_version: '1.5.11',
      },
      {
        event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
        ts: RECENT,
        client_version: '1.5.11',
        server_version: '1.5.12',
      },
    ],
    '1.5.12',
    NOW
  );
  assert.equal(r.kind, 'orange');
  assert.equal(r.client_version, '1.5.11');
  assert.equal(r.server_version, '1.5.12');
});

test('groupClientVersionEventsByUser — happy path', () => {
  const rows = [
    {
      ts: RECENT,
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      user: 'alice',
      detail: '{"client_version":"1.5.10","server_version":"1.5.11","platform":"darwin"}',
    },
    {
      ts: ONE_DAY_AGO,
      event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
      user: 'bob',
      detail: '{"client_version":"1.5.11","server_version":"1.5.11","platform":"win"}',
    },
  ];
  const map = groupClientVersionEventsByUser(rows);
  assert.equal(map.size, 2);
  assert.equal(map.get('alice').length, 1);
  assert.equal(map.get('alice')[0].client_version, '1.5.10');
  assert.equal(map.get('bob')[0].client_version, '1.5.11');
});

test('groupClientVersionEventsByUser — detail can be pre-parsed object', () => {
  // Server may JSON.parse before sending; helper accepts either form.
  const rows = [
    {
      ts: RECENT,
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      user: 'alice',
      detail: { client_version: '1.5.10', server_version: '1.5.11', platform: 'darwin' },
    },
  ];
  const map = groupClientVersionEventsByUser(rows);
  assert.equal(map.get('alice').length, 1);
});

test('groupClientVersionEventsByUser — malformed detail JSON is skipped silently', () => {
  const rows = [
    { ts: RECENT, event: 'CLIENT_UPGRADE_NUDGE_SHOWN', user: 'alice', detail: 'NOT JSON' },
    {
      ts: RECENT,
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      user: 'bob',
      detail: '{"client_version":"1.5.10","server_version":"1.5.11","platform":"darwin"}',
    },
  ];
  const map = groupClientVersionEventsByUser(rows);
  assert.equal(map.size, 1);
  assert.equal(map.has('alice'), false);
  assert.equal(map.has('bob'), true);
});

test('groupClientVersionEventsByUser — empty + non-array inputs', () => {
  assert.equal(groupClientVersionEventsByUser(null).size, 0);
  assert.equal(groupClientVersionEventsByUser(undefined).size, 0);
  assert.equal(groupClientVersionEventsByUser([]).size, 0);
});

test('groupClientVersionEventsByUser — rows missing required fields are skipped', () => {
  const rows = [
    { ts: RECENT, event: 'CLIENT_UPGRADE_NUDGE_SHOWN', user: null, detail: '{}' }, // no user
    { ts: null, event: 'CLIENT_UPGRADE_NUDGE_SHOWN', user: 'alice', detail: '{}' }, // no ts
    { ts: RECENT, event: 'CLIENT_UPGRADE_NUDGE_SHOWN', user: 'alice', detail: '{}' }, // no client_version
  ];
  const map = groupClientVersionEventsByUser(rows);
  assert.equal(map.size, 0);
});
