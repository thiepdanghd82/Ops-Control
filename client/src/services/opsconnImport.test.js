/**
 * opsconnImport tests — run with:
 *   node --test src/services/opsconnImport.test.js
 *
 * Coverage matrix (A.3a D2):
 *   (a) HARD kind check     — tests 1, 2
 *   (b) HARD schema version — tests 1, 3
 *   (c) HARD url validity   — tests 1, 4, 5, 6
 *   (d) SOFT UUID warning   — tests 1, 7
 *   plus: optional-field defaults (8) and JSON parse failure (9)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsconn } from './opsconnImport.js';

const validUuid = 'a1b2c3d4-e5f6-4789-9abc-def012345678';

function makeValidOpsconn(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'ops-connection-profile',
    exportedAt: '2026-05-04T01:00:00.000Z',
    exportedBy: 'admin@example.com',
    server: {
      name: 'Production',
      id: validUuid,
      url: 'http://10.102.3.61:3000',
      language: 'en',
      timezone: 'Asia/Ho_Chi_Minh',
      ...overrides,
    },
  });
}

test('parseOpsconn: valid v1 file → ok=true with profile populated', () => {
  const r = parseOpsconn(makeValidOpsconn());
  assert.equal(r.ok, true);
  assert.equal(r.profile.name, 'Production');
  assert.equal(r.profile.id, validUuid);
  assert.equal(r.profile.url, 'http://10.102.3.61:3000');
  assert.equal(r.profile.language, 'en');
  assert.equal(r.profile.timezone, 'Asia/Ho_Chi_Minh');
  assert.equal(r.profile.exportedBy, 'admin@example.com');
  assert.deepEqual(r.warnings, []);
});

test('parseOpsconn: wrong kind → ok=false, error mentions kind', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    kind: 'something-else',
    server: { url: 'http://x:3000' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, false);
  assert.match(r.error, /kind/i);
});

test('parseOpsconn: unsupported schema version → ok=false', () => {
  const raw = JSON.stringify({
    schemaVersion: 99,
    kind: 'ops-connection-profile',
    server: { url: 'http://x:3000' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, false);
  assert.match(r.error, /schema version/i);
  assert.match(r.error, /99/);
});

test('parseOpsconn: missing server.url → ok=false', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    kind: 'ops-connection-profile',
    server: { name: 'No URL Server' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, false);
  assert.match(r.error, /server\.url/i);
});

test('parseOpsconn: malformed URL → ok=false', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    kind: 'ops-connection-profile',
    server: { url: 'not-a-url' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, false);
  assert.match(r.error, /Malformed|http/i);
});

test('parseOpsconn: non-http(s) protocol → ok=false', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    kind: 'ops-connection-profile',
    server: { url: 'ftp://example.com/file' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, false);
  assert.match(r.error, /http/i);
});

test('parseOpsconn: malformed UUID → ok=true with warning', () => {
  const r = parseOpsconn(makeValidOpsconn({ id: 'legacy-id-not-uuid' }));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /UUID/i);
  assert.equal(r.profile.id, 'legacy-id-not-uuid');
});

test('parseOpsconn: missing optional fields → ok=true with sensible defaults', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    kind: 'ops-connection-profile',
    server: { url: 'https://ops.example.com' },
  });
  const r = parseOpsconn(raw);
  assert.equal(r.ok, true);
  assert.equal(r.profile.name, 'Imported Server');
  assert.equal(r.profile.id, null);
  assert.equal(r.profile.language, 'en');
  assert.equal(r.profile.timezone, 'UTC');
  assert.equal(r.profile.exportedBy, null);
  assert.equal(r.profile.exportedAt, null);
});

test('parseOpsconn: corrupted JSON → ok=false, error mentions JSON', () => {
  const r = parseOpsconn('{ not valid json');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/i);
});
