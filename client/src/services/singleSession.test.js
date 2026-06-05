// @ts-check
/**
 * singleSession pure-helper tests.
 * Run: node --test client/src/services/singleSession.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveInstallInfo,
  formatLastActivity,
  registerDraftProvider,
  captureDraft,
  saveRevokedDraft,
  loadRevokedDraft,
  clearRevokedDraft,
  snapshotDraftOnRevoke,
} from './singleSession.js';

const ID = 'a'.repeat(64);

function fakeStorage() {
  const m = new Map();
  return {
    setItem: (k, v) => m.set(k, String(v)),
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

describe('deriveInstallInfo', () => {
  test('valid 64-hex id + hostname', () => {
    assert.deepEqual(deriveInstallInfo({ installationId: ID, hostname: 'Mac-A' }), {
      installation_id: ID,
      hostname: 'Mac-A',
    });
  });
  test('non-hex / missing → web', () => {
    assert.deepEqual(deriveInstallInfo({ installationId: 'short' }, 'host1'), {
      installation_id: 'web',
      hostname: 'host1',
    });
    assert.equal(deriveInstallInfo(null, 'web').installation_id, 'web');
  });
  test('hostname clamped to 120', () => {
    const out = deriveInstallInfo({ installationId: ID, hostname: 'x'.repeat(200) });
    assert.equal(out.hostname.length, 120);
  });
});

describe('formatLastActivity', () => {
  const now = Date.parse('2026-06-05T12:00:00Z');
  test('seconds → vừa xong', () =>
    assert.equal(formatLastActivity('2026-06-05T11:59:30Z', now), 'vừa xong'));
  test('minutes', () =>
    assert.equal(formatLastActivity('2026-06-05T11:45:00Z', now), '15 phút trước'));
  test('hours', () =>
    assert.equal(formatLastActivity('2026-06-05T09:00:00Z', now), '3 giờ trước'));
  test('days', () =>
    assert.equal(formatLastActivity('2026-06-03T12:00:00Z', now), '2 ngày trước'));
  test('bad input → empty', () => assert.equal(formatLastActivity('nope', now), ''));
});

describe('draft snapshot', () => {
  test('save / load / clear round-trip', () => {
    const s = fakeStorage();
    assert.equal(saveRevokedDraft({ rfq: 'R1', value: 42 }, s), true);
    const got = loadRevokedDraft(s);
    assert.equal(got.draft.rfq, 'R1');
    assert.ok(got.saved_at);
    clearRevokedDraft(s);
    assert.equal(loadRevokedDraft(s), null);
  });
  test('null draft not saved', () => {
    const s = fakeStorage();
    assert.equal(saveRevokedDraft(null, s), false);
    assert.equal(loadRevokedDraft(s), null);
  });
  test('registerDraftProvider + captureDraft + snapshotDraftOnRevoke', () => {
    const s = fakeStorage();
    const unregister = registerDraftProvider(() => ({ quote: 'in-progress' }));
    assert.deepEqual(captureDraft(), { quote: 'in-progress' });
    assert.equal(snapshotDraftOnRevoke(s), true);
    assert.equal(loadRevokedDraft(s).draft.quote, 'in-progress');
    unregister();
    assert.equal(captureDraft(), null);
    assert.equal(snapshotDraftOnRevoke(s), false); // nothing to capture now
  });
  test('provider that throws → captureDraft null (no crash)', () => {
    registerDraftProvider(() => {
      throw new Error('boom');
    });
    assert.equal(captureDraft(), null);
    registerDraftProvider(null);
  });
});
