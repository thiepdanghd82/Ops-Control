import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LS_COLLAPSED_KEY,
  LS_LAST_MISMATCH_KEY,
  mapPlatform,
  decideIndicatorMode,
  detectUpgradeTransition,
} from './clientUpdateState.js';

test('mapPlatform — darwin/win32/linux/unknown', () => {
  assert.equal(mapPlatform('darwin'), 'mac');
  assert.equal(mapPlatform('win32'), 'win');
  assert.equal(mapPlatform('linux'), 'linux');
  assert.equal(mapPlatform('freebsd'), 'unknown');
  assert.equal(mapPlatform(undefined), 'unknown');
  assert.equal(mapPlatform(null), 'unknown');
  assert.equal(mapPlatform(''), 'unknown');
});

test('decideIndicatorMode — versions match → hidden', () => {
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: '1.5.10',
    collapsedForVersion: null,
  });
  assert.deepEqual(r, { mismatch: false, mode: 'hidden' });
});

test('decideIndicatorMode — versions match, ignore stale collapse flag', () => {
  // Edge case: collapse flag for an older server version is in LS but
  // versions now match. Should still be hidden.
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: '1.5.10',
    collapsedForVersion: '1.5.9',
  });
  assert.deepEqual(r, { mismatch: false, mode: 'hidden' });
});

test('decideIndicatorMode — server unreachable (no serverVersion) → hidden', () => {
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: null,
    collapsedForVersion: null,
  });
  assert.deepEqual(r, { mismatch: false, mode: 'hidden' });
});

test('decideIndicatorMode — clientVersion missing (no VITE define) → hidden', () => {
  const r = decideIndicatorMode({
    clientVersion: undefined,
    serverVersion: '1.5.11',
    collapsedForVersion: null,
  });
  assert.deepEqual(r, { mismatch: false, mode: 'hidden' });
});

test('decideIndicatorMode — mismatch, no collapse → banner', () => {
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: '1.5.11',
    collapsedForVersion: null,
  });
  assert.deepEqual(r, { mismatch: true, mode: 'banner' });
});

test('decideIndicatorMode — mismatch, collapsed for current server version → chip', () => {
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: '1.5.11',
    collapsedForVersion: '1.5.11',
  });
  assert.deepEqual(r, { mismatch: true, mode: 'chip' });
});

test('decideIndicatorMode — mismatch, collapsed for OLDER server version → banner (re-expand)', () => {
  // Operator collapsed for 1.5.11, server has now bumped to 1.5.12.
  // Banner should re-expand to nag for the new version.
  const r = decideIndicatorMode({
    clientVersion: '1.5.10',
    serverVersion: '1.5.12',
    collapsedForVersion: '1.5.11',
  });
  assert.deepEqual(r, { mismatch: true, mode: 'banner' });
});

test('detectUpgradeTransition — fires on match-after-prior-mismatch (common upgrade case)', () => {
  // Common case: prior session client=1.5.10, server=1.5.11 → LS stores
  // serverVersion '1.5.11'. Operator installs new client (1.5.11). New
  // session: client=1.5.11, server=1.5.11. Helper fires.
  const r = detectUpgradeTransition({
    clientVersion: '1.5.11',
    serverVersion: '1.5.11',
    lastMismatchServerVersion: '1.5.11',
  });
  assert.equal(r, true);
});

test('detectUpgradeTransition — fires on rollback-to-old-client scenario too', () => {
  // Rare: prior session client=1.5.10, server=1.5.11 → LS stores '1.5.11'.
  // Lead rolls back server to 1.5.10. New session: client=1.5.10,
  // server=1.5.10. Helper still fires (no way to distinguish at LS
  // level), but audit detail will record client_version='1.5.10'
  // + server_version='1.5.10' so reviewers can spot the unusual
  // mismatch between recorded LS server (1.5.11) and current pair.
  const r = detectUpgradeTransition({
    clientVersion: '1.5.10',
    serverVersion: '1.5.10',
    lastMismatchServerVersion: '1.5.11',
  });
  assert.equal(r, true);
});

test('detectUpgradeTransition — no prior mismatch record → false (clean install)', () => {
  // First-ever launch with matching versions — no upgrade transition,
  // operator is just a fresh install.
  const r = detectUpgradeTransition({
    clientVersion: '1.5.11',
    serverVersion: '1.5.11',
    lastMismatchServerVersion: null,
  });
  assert.equal(r, false);
});

test('detectUpgradeTransition — still in mismatch (versions differ) → false', () => {
  const r = detectUpgradeTransition({
    clientVersion: '1.5.10',
    serverVersion: '1.5.11',
    lastMismatchServerVersion: '1.5.11',
  });
  assert.equal(r, false);
});

test('detectUpgradeTransition — empty string lastMismatch is treated as absent', () => {
  // localStorage could in theory return '' for a key that was set to
  // empty. Treat as no record (no prior mismatch persisted).
  const r = detectUpgradeTransition({
    clientVersion: '1.5.11',
    serverVersion: '1.5.11',
    lastMismatchServerVersion: '',
  });
  assert.equal(r, false);
});

test('detectUpgradeTransition — missing versions → false', () => {
  // Defensive: if fetch failed or VITE inject missing, helper must not
  // claim an upgrade happened.
  assert.equal(
    detectUpgradeTransition({
      clientVersion: null,
      serverVersion: '1.5.11',
      lastMismatchServerVersion: '1.5.11',
    }),
    false
  );
  assert.equal(
    detectUpgradeTransition({
      clientVersion: '1.5.11',
      serverVersion: null,
      lastMismatchServerVersion: '1.5.11',
    }),
    false
  );
});

test('LS key constants — stable + namespaced', () => {
  assert.equal(LS_COLLAPSED_KEY, 'update-indicator:collapsed-for-version');
  assert.equal(LS_LAST_MISMATCH_KEY, 'update-indicator:last-mismatch-server-version');
});
