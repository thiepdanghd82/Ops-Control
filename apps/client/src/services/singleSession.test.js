// @ts-check
/**
 * singleSession pure-helper tests.
 * Run: node --test client/src/services/singleSession.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveInstallInfo,
  webClientId,
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
  test('hours', () => assert.equal(formatLastActivity('2026-06-05T09:00:00Z', now), '3 giờ trước'));
  test('days', () => assert.equal(formatLastActivity('2026-06-03T12:00:00Z', now), '2 ngày trước'));
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

/**
 * webClientId — every web client used to report installation_id='web'.
 *
 * Found 2026-09-11 in live data: two sessions for the same user, one from
 * 10.102.3.252 and one from localhost, both alive. findUserSessionConflict
 * (authService.js:923) skips a session whose installation_id equals the
 * caller's — "same machine is never a conflict" — so every browser in the
 * company was the same machine and the takeover prompt could never fire
 * between two web users. The single-session guarantee simply did not apply
 * to the web client.
 *
 * Two constraints shape the id, and both have teeth:
 *
 *  1. It must NOT look like a desktop fingerprint. Those are 64-hex, and
 *     licenseFleet's requireOwnMachine gates on exactly that shape. A 64-hex
 *     web id would let any browser act as a fleet machine and undo the fix
 *     from PR #105. Hence the `web-` prefix.
 *  2. It must survive `String(installationId).slice(0, 64)` in authService.
 */
describe('webClientId', () => {
  function memStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      _dump: () => Object.fromEntries(map),
    };
  }

  test('mints an id and persists it', () => {
    const s = memStorage();
    const id = webClientId(s);
    assert.ok(id.startsWith('web-'));
    assert.equal(Object.values(s._dump())[0], id, 'must be written back');
  });

  test('the same browser keeps the same id', () => {
    const s = memStorage();
    assert.equal(webClientId(s), webClientId(s));
  });

  test('two browsers get different ids — the whole point', () => {
    assert.notEqual(webClientId(memStorage()), webClientId(memStorage()));
  });

  test('never 64-hex, so it can never pass requireOwnMachine', () => {
    for (let i = 0; i < 50; i++) {
      const id = webClientId(memStorage());
      assert.ok(!/^[0-9a-f]{64}$/i.test(id), `${id} would be taken for a desktop fingerprint`);
    }
  });

  test('fits in the 64 chars authService stores', () => {
    assert.ok(webClientId(memStorage()).length <= 64);
  });

  test('a storage that throws degrades to the old constant, not to a random id', () => {
    // Private browsing, blocked site data. Returning a fresh random id every
    // page load would be worse than today: each reload would look like a new
    // machine and prompt a takeover the user cannot explain.
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.equal(webClientId(hostile), 'web');
  });

  test('a junk stored value is replaced, not trusted', () => {
    const s = memStorage({ ops_web_client_id: '' });
    const id = webClientId(s);
    assert.ok(id.startsWith('web-'));
  });

  test('no storage at all → the old constant', () => {
    assert.equal(webClientId(null), 'web');
  });
});

describe('deriveInstallInfo with a web id', () => {
  test('a desktop fingerprint still wins over the browser id', () => {
    assert.equal(deriveInstallInfo({ installationId: ID }, 'h', 'web-abc').installation_id, ID);
  });

  test('without one, the browser id is reported instead of the constant', () => {
    assert.equal(deriveInstallInfo(null, 'h', 'web-abc').installation_id, 'web-abc');
  });

  test('omitting it keeps the old behaviour', () => {
    assert.equal(deriveInstallInfo(null, 'h').installation_id, 'web');
  });
});
