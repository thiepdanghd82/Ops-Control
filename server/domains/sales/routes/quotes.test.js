// @ts-check
/**
 * Quotes router — factory contract tests.
 *
 * The real router has heavy deps (versioning, audit, eventbus,
 * permission groups). Tests use stub closures over an in-memory
 * "fake quote store" array so each test is hermetic.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createQuotesRouter } from './quotes.js';

class FakeVersionConflictError extends Error {
  constructor(actualVersion, current) {
    super('version conflict');
    this.actualVersion = actualVersion;
    this.current = current;
  }
}

let store; // in-memory quote array
let nextId;
let auditEvents;
let dataChangeEvents;

beforeEach(() => {
  store = [];
  nextId = 1;
  auditEvents = [];
  dataChangeEvents = [];
});

function buildApp({ tabAccess = 'edit' } = {}) {
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'unauth' });
    req.user = { user: { username: 'tester', role }, role };
    next();
  };
  const router = createQuotesRouter({
    auth: stubAuth,
    canWrite: (u) => (u?.user?.role || u?.role) !== 'viewonly',
    isSys: (u) => (u?.user?.role || u?.role) === 'sys',
    upsertQuote: async (q) => {
      if (q.id == null) {
        const created = { ...q, id: nextId++, _version: 1 };
        store.push(created);
        return created;
      }
      const idx = store.findIndex((x) => x.id === q.id);
      if (idx === -1) {
        const created = { ...q, _version: 1 };
        store.push(created);
        return created;
      }
      const merged = { ...store[idx], ...q, _version: (store[idx]._version || 0) + 1 };
      store[idx] = merged;
      return merged;
    },
    getQuoteById: (id) => store.find((q) => q.id === id) || null,
    loadQuotes: () => store.slice(),
    saveQuotes: (qs) => { store.length = 0; store.push(...qs); },
    VersionConflictError: FakeVersionConflictError,
    resolveTabAccess: () => tabAccess,
    emitDataChange: (event, data) => { dataChangeEvents.push({ event, data }); },
    audit: (action, user, ip, detail) => { auditEvents.push({ action, user, ip, detail }); },
    clientIp: () => '127.0.0.1',
    logErr: () => {},
    redactErrorMessage: (err) => err.message,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/sales/quotes', router);
  return app;
}

async function request(app, opts) {
  const { method = 'GET', path, headers = {}, body } = opts;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

describe('quotes router — POST /', () => {
  test('unauth → 401', async () => {
    const r = await request(buildApp(), { method: 'POST', path: '/api/sales/quotes', body: {} });
    assert.equal(r.status, 401);
  });

  test('viewonly → 403', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotes',
      headers: { 'x-test-role': 'viewonly' },
      body: { type: 'standard' },
    });
    assert.equal(r.status, 403);
  });

  test('non-object body → 400', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotes',
      headers: { 'x-test-role': 'user' },
      body: ['array'],
    });
    assert.equal(r.status, 400);
  });

  test('permission group hides standard → 403', async () => {
    const r = await request(buildApp({ tabAccess: 'hidden' }), {
      method: 'POST',
      path: '/api/sales/quotes',
      headers: { 'x-test-role': 'user' },
      body: { type: 'standard' },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'permission_denied');
  });

  test('happy path → assigns id, emits event', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/sales/quotes',
      headers: { 'x-test-role': 'user' },
      body: { type: 'standard', customer: 'CCL' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.id, 1);
    assert.equal(r.body.quote._version, 1);
    assert.equal(dataChangeEvents.length, 1);
    assert.equal(dataChangeEvents[0].event, 'quote.saved');
  });

  test('strips client-supplied id on POST', async () => {
    const app = buildApp();
    const r = await request(app, {
      method: 'POST',
      path: '/api/sales/quotes',
      headers: { 'x-test-role': 'user' },
      body: { id: 999, type: 'standard' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.id, 1);  // server-assigned, not 999
  });
});

describe('quotes router — PATCH /:id', () => {
  test('id non-numeric → 400', async () => {
    const r = await request(buildApp(), {
      method: 'PATCH',
      path: '/api/sales/quotes/abc',
      headers: { 'x-test-role': 'user' },
      body: { customer: 'X' },
    });
    assert.equal(r.status, 400);
  });

  test('happy path increments version', async () => {
    const app = buildApp();
    // seed a quote
    store.push({ id: 5, type: 'standard', customer: 'A', _version: 1 });
    const r = await request(app, {
      method: 'PATCH',
      path: '/api/sales/quotes/5',
      headers: { 'x-test-role': 'user' },
      body: { customer: 'B' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.customer, 'B');
    assert.equal(r.body.quote._version, 2);
  });
});

describe('quotes router — DELETE /:id', () => {
  test('soft-delete: 404 when not found', async () => {
    const r = await request(buildApp(), {
      method: 'DELETE',
      path: '/api/sales/quotes/99',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 404);
  });

  test('soft-delete: sets deleted_at + audit', async () => {
    const app = buildApp();
    store.push({ id: 7, type: 'standard', _version: 1 });
    const r = await request(app, {
      method: 'DELETE',
      path: '/api/sales/quotes/7',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.quote.deleted_at);
    assert.equal(r.body.quote.deleted_by, 'tester');
    assert.equal(auditEvents[0].action, 'QUOTE_TRASH');
  });

  test('purge=1 by non-sys → 403', async () => {
    const app = buildApp();
    store.push({ id: 8, type: 'standard', _version: 1 });
    const r = await request(app, {
      method: 'DELETE',
      path: '/api/sales/quotes/8?purge=1',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(r.status, 403);
  });

  test('purge=1 by sys → row removed + audit QUOTE_PURGE', async () => {
    const app = buildApp();
    store.push({ id: 9, type: 'standard', _version: 1 });
    const r = await request(app, {
      method: 'DELETE',
      path: '/api/sales/quotes/9?purge=1',
      headers: { 'x-test-role': 'sys' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.purged, true);
    assert.equal(store.length, 0);
    assert.equal(auditEvents[0].action, 'QUOTE_PURGE');
  });
});

describe('quotes router — POST /:id/restore', () => {
  test('404 when quote missing', async () => {
    const r = await request(buildApp(), {
      method: 'POST',
      path: '/api/sales/quotes/99/restore',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 404);
  });

  test('clears deleted_at + audit QUOTE_RESTORE', async () => {
    const app = buildApp();
    store.push({
      id: 10, type: 'standard', _version: 2,
      deleted_at: '2026-04-29T00:00:00Z', deleted_by: 'someone',
    });
    const r = await request(app, {
      method: 'POST',
      path: '/api/sales/quotes/10/restore',
      headers: { 'x-test-role': 'user' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.deleted_at, null);
    assert.equal(r.body.quote.restored_by, 'tester');
    assert.equal(auditEvents[0].action, 'QUOTE_RESTORE');
  });
});
