// @ts-check
/**
 * fleetHeartbeat + licenseFleetView pure-helper tests.
 * Run: node --test client/src/services/fleetHeartbeat.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStatus,
  buildHeartbeatPayload,
  statusBadge,
  formatDaysLeft,
  shortId,
  buildExportRequest,
  exportRequestFilename,
} from './licenseFleetView.js';

const ID = 'a1b2c3d4e5f60718' + '0'.repeat(48);

describe('deriveStatus', () => {
  test('real license', () => {
    assert.deepEqual(deriveStatus({ hasLicense: true, valid: true, tier: 'M', expires_at: '2027-06-09T00:00:00Z' }), {
      type: 'real',
      tier: 'M',
      expires_at: '2027-06-09T00:00:00Z',
      isTrial: false,
    });
  });
  test('trial', () => {
    assert.equal(deriveStatus({ hasLicense: true, isTrial: true, tier: 'S' }).type, 'trial');
  });
  test('unlicensed wins', () => {
    assert.equal(deriveStatus({ isUnlicensed: true }).type, 'unlicensed');
  });
  test('invalid license', () => {
    assert.equal(deriveStatus({ hasLicense: true, valid: false }).type, 'invalid');
  });
  test('no license', () => {
    assert.equal(deriveStatus({}).type, 'none');
  });
  test('garbage tier coerced to null', () => {
    assert.equal(deriveStatus({ hasLicense: true, tier: 'Z' }).tier, null);
  });
});

describe('buildHeartbeatPayload', () => {
  test('valid id → payload', () => {
    const p = buildHeartbeatPayload({ installationId: ID, hostname: 'op-mac', isTrial: true, hasLicense: true });
    assert.equal(p.installation_id, ID);
    assert.equal(p.hostname, 'op-mac');
    assert.equal(p.status.type, 'trial');
  });
  test('bad id → null (caller skips)', () => {
    assert.equal(buildHeartbeatPayload({ installationId: 'short' }), null);
    assert.equal(buildHeartbeatPayload({}), null);
  });
});

describe('statusBadge', () => {
  test('trial → bad', () => assert.equal(statusBadge({ status: { type: 'trial' } }).tone, 'bad'));
  test('unlicensed → bad', () => assert.equal(statusBadge({ status: { type: 'unlicensed' } }).tone, 'bad'));
  test('real expired → bad', () =>
    assert.equal(statusBadge({ status: { type: 'real' }, days_left: -3 }).tone, 'bad'));
  test('real expiring <30d → warn', () =>
    assert.equal(statusBadge({ status: { type: 'real' }, days_left: 10 }).tone, 'warn'));
  test('real healthy → good', () =>
    assert.equal(statusBadge({ status: { type: 'real' }, days_left: 300 }).tone, 'good'));
});

describe('view helpers', () => {
  test('formatDaysLeft', () => {
    assert.equal(formatDaysLeft(5), '5d');
    assert.equal(formatDaysLeft(-2), 'expired 2d ago');
    assert.equal(formatDaysLeft(null), '—');
  });
  test('shortId', () => {
    assert.equal(shortId(ID), 'a1b2c3d4…0000');
    assert.equal(shortId(''), '—');
  });
  test('buildExportRequest', () => {
    const r = buildExportRequest({ installation_id: ID, hostname: 'op-mac' }, '2026-06-04T00:00:00Z');
    assert.deepEqual(r, { installation_id: ID, hostname: 'op-mac', requested_at: '2026-06-04T00:00:00Z' });
  });
  test('exportRequestFilename sanitizes', () => {
    assert.match(exportRequestFilename({ hostname: 'op mac/3', installation_id: ID }), /^license-request-opmac3-a1b2c3d4_0000\.json$/);
  });
});
