import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_EVENT_ALLOWLIST,
  createVersionHandler,
  createClientEventHandler,
} from './clientVersionRoutes.js';

// Minimal req/res harness — express-shaped just enough to satisfy the
// handlers. Records all set() + status() + json() + end() calls for
// assertion.
function mockRes() {
  const r = {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return r;
}

test('createVersionHandler — returns version + min_supported_client + released_at', () => {
  const h = createVersionHandler({
    version: '1.5.11',
    minSupportedClient: '1.5.0',
    releasedAt: '2026-05-28T03:00:00.000Z',
  });
  const res = mockRes();
  h({}, res);
  assert.deepEqual(res.body, {
    version: '1.5.11',
    min_supported_client: '1.5.0',
    released_at: '2026-05-28T03:00:00.000Z',
  });
});

test('createVersionHandler — sets Cache-Control: no-store', () => {
  const h = createVersionHandler({
    version: '1.5.11',
    minSupportedClient: '1.5.0',
    releasedAt: '2026-05-28T03:00:00.000Z',
  });
  const res = mockRes();
  h({}, res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

// Tiny deps factory for the client-event handler tests.
function makeDeps({ user = { username: 'alice' }, token = 'tok-1' } = {}) {
  const auditCalls = [];
  const deps = {
    audit: (event, who, ip, detail) => auditCalls.push({ event, who, ip, detail }),
    getSessionUser: (t) => (t === token ? user : null),
    getTokenFromHeader: () => token,
  };
  return { deps, auditCalls };
}

test('clientEventHandler — accepts allowlisted CLIENT_UPGRADE_NUDGE_SHOWN', () => {
  const { deps, auditCalls } = makeDeps();
  const h = createClientEventHandler(deps);
  const req = {
    ip: '10.0.0.5',
    body: {
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      detail: { client_version: '1.5.10', server_version: '1.5.11', platform: 'darwin' },
    },
  };
  const res = mockRes();
  h(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'CLIENT_UPGRADE_NUDGE_SHOWN');
  assert.equal(auditCalls[0].who, 'alice');
  assert.equal(auditCalls[0].ip, '10.0.0.5');
  // Detail must be JSON.stringify'd per Lesson FIX-3.
  assert.equal(typeof auditCalls[0].detail, 'string');
  const parsed = JSON.parse(auditCalls[0].detail);
  assert.deepEqual(parsed, {
    client_version: '1.5.10',
    server_version: '1.5.11',
    platform: 'darwin',
  });
});

test('clientEventHandler — accepts CLIENT_VERSION_MATCH_AFTER_UPGRADE', () => {
  const { deps, auditCalls } = makeDeps();
  const h = createClientEventHandler(deps);
  const req = {
    ip: '10.0.0.5',
    body: {
      event: 'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
      detail: { client_version: '1.5.11', server_version: '1.5.11', platform: 'darwin' },
    },
  };
  const res = mockRes();
  h(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].event, 'CLIENT_VERSION_MATCH_AFTER_UPGRADE');
});

test('clientEventHandler — rejects event outside allowlist with 400', () => {
  const { deps, auditCalls } = makeDeps();
  const h = createClientEventHandler(deps);
  const req = {
    ip: '10.0.0.5',
    body: {
      event: 'SOMETHING_ELSE',
      detail: { foo: 'bar' },
    },
  };
  const res = mockRes();
  h(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'invalid_event' });
  // CRITICAL — must NOT call audit() for rejected events.
  assert.equal(auditCalls.length, 0);
});

test('clientEventHandler — rejects missing event field with 400', () => {
  const { deps, auditCalls } = makeDeps();
  const h = createClientEventHandler(deps);
  const res = mockRes();
  h({ body: { detail: {} } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(auditCalls.length, 0);
});

test('clientEventHandler — rejects missing/invalid detail with 400', () => {
  const { deps, auditCalls } = makeDeps();
  const h = createClientEventHandler(deps);
  // No detail
  let res = mockRes();
  h({ body: { event: 'CLIENT_UPGRADE_NUDGE_SHOWN' } }, res);
  assert.equal(res.statusCode, 400);
  // detail is array (not plain object)
  res = mockRes();
  h({ body: { event: 'CLIENT_UPGRADE_NUDGE_SHOWN', detail: [] } }, res);
  assert.equal(res.statusCode, 400);
  // detail is string
  res = mockRes();
  h({ body: { event: 'CLIENT_UPGRADE_NUDGE_SHOWN', detail: 'oops' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(auditCalls.length, 0);
});

test('clientEventHandler — rejects unauthenticated with 401', () => {
  // getSessionUser returns null
  const { deps, auditCalls } = makeDeps({ user: null });
  const h = createClientEventHandler(deps);
  const req = {
    ip: '10.0.0.5',
    body: {
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      detail: { client_version: '1.5.10', server_version: '1.5.11', platform: 'darwin' },
    },
  };
  const res = mockRes();
  h(req, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthenticated' });
  assert.equal(auditCalls.length, 0);
});

test('clientEventHandler — rejects missing token with 401', () => {
  const deps = {
    audit: () => {
      throw new Error('audit should not be called');
    },
    getSessionUser: () => null,
    getTokenFromHeader: () => null,
  };
  const h = createClientEventHandler(deps);
  const req = {
    ip: '10.0.0.5',
    body: {
      event: 'CLIENT_UPGRADE_NUDGE_SHOWN',
      detail: { client_version: '1.5.10', server_version: '1.5.11', platform: 'darwin' },
    },
  };
  const res = mockRes();
  h(req, res);
  assert.equal(res.statusCode, 401);
});

test('CLIENT_EVENT_ALLOWLIST — frozen + exactly the 2 P0 events', () => {
  assert.equal(CLIENT_EVENT_ALLOWLIST.length, 2);
  assert.ok(CLIENT_EVENT_ALLOWLIST.includes('CLIENT_UPGRADE_NUDGE_SHOWN'));
  assert.ok(CLIENT_EVENT_ALLOWLIST.includes('CLIENT_VERSION_MATCH_AFTER_UPGRADE'));
  // No CLIENT_UPGRADE_NUDGE_DOWNLOAD_CLICKED (defer P0.1)
  assert.ok(!CLIENT_EVENT_ALLOWLIST.includes('CLIENT_UPGRADE_NUDGE_DOWNLOAD_CLICKED'));
  // Frozen so future code can't push extra events via mutation.
  assert.throws(() => CLIENT_EVENT_ALLOWLIST.push('SOMETHING'));
});
