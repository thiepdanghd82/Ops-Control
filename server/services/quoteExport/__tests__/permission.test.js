// @ts-check
/**
 * Route-level tests — stub deps, exercise the router with supertest-
 * lite-style raw express. We mount the factory into a fresh Express
 * app and use node's http for the round-trip.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createQuoteExportRouter } from '../../../routes/quoteExport.js';

function makeFixtureQuote() {
  return {
    id: 1,
    label: 'RFQ-P',
    _version: 1,
    state: {
      rfq_number: 'RFQ-P',
      end_cu: 'X',
      moq: 100,
      annual_qty: 1000,
      selling_price: 1,
      active_moq_idx: 0,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 100,
      materials_main: [],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: [],
    },
    result: {
      sp: 1,
      s_ttl: 0.5,
      gm: 0.5,
      rows: { materials_main: [], materials_alt: [], inks: [], processes: [] },
    },
  };
}

function buildApp(opts = {}) {
  const app = express();
  app.use(express.json());
  let auditCalls = [];
  const deps = {
    auth: (req, _res, next) => {
      req.user = opts.user ?? { username: 'tester' };
      next();
    },
    getQuoteById: (id) =>
      opts.quote && (id === opts.quote.id || opts.lookupAny) ? opts.quote : null,
    resolveTabAccess: () => opts.access ?? 'read',
    audit: (...args) => {
      auditCalls.push(args);
    },
    clientIp: () => '127.0.0.1',
    logErr: () => {},
    redactErrorMessage: (e) => String(e.message || e),
  };
  app.use('/api/quotes', createQuoteExportRouter(deps));
  return { app, auditCalls };
}

function request({ app, method = 'POST', path, body }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data ? Buffer.byteLength(data) : 0,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
          });
        }
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (data) req.write(data);
      req.end();
    });
  });
}

// ── happy path ────────────────────────────────────────────────

test('route: read access can export → 200 with xlsx Content-Type', async () => {
  const { app, auditCalls } = buildApp({ access: 'read', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'internal', lang: 'en' },
  });
  assert.equal(res.status, 200);
  assert.match(
    res.headers['content-type'],
    /vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
  );
  assert.match(res.headers['content-disposition'], /attachment; filename="Quote_/);
  assert.ok(res.body.length > 5000);
  assert.equal(auditCalls.length, 1, 'audit must be emitted');
  assert.equal(auditCalls[0][0], 'QUOTE_EXPORT');
});

test('route: edit access can also export', async () => {
  const { app } = buildApp({ access: 'edit', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'customer', lang: 'vi' },
  });
  assert.equal(res.status, 200);
});

test('route: hidden access → 403 permission_denied', async () => {
  const { app } = buildApp({ access: 'hidden', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'internal', lang: 'en' },
  });
  assert.equal(res.status, 403);
  const json = JSON.parse(res.body.toString('utf8'));
  assert.equal(json.error, 'permission_denied');
});

test('route: missing variant → 400 with field=variant', async () => {
  const { app } = buildApp({ access: 'read', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { lang: 'en' },
  });
  assert.equal(res.status, 400);
  const json = JSON.parse(res.body.toString('utf8'));
  assert.equal(json.field, 'variant');
});

test('route: quote not found → 404', async () => {
  const { app } = buildApp({ access: 'read', quote: null });
  const res = await request({
    app,
    path: '/api/quotes/999/export',
    body: { variant: 'internal' },
  });
  assert.equal(res.status, 404);
});

test('route: quote without result → 422 no-snapshot', async () => {
  const q = makeFixtureQuote();
  delete q.result;
  const { app } = buildApp({ access: 'read', quote: q, lookupAny: true });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'internal' },
  });
  assert.equal(res.status, 422);
  const json = JSON.parse(res.body.toString('utf8'));
  assert.match(json.type, /no-snapshot/);
});

test('route: non-numeric id → 400 bad-id', async () => {
  const { app } = buildApp({ access: 'read', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/abc/export',
    body: { variant: 'internal' },
  });
  assert.equal(res.status, 400);
});

test('route: bad lang → 400', async () => {
  const { app } = buildApp({ access: 'read', quote: makeFixtureQuote() });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'internal', lang: 'jp' },
  });
  assert.equal(res.status, 400);
});

test('route: multi-tier → X-Ops-Export-Format: zip header set', async () => {
  const q = makeFixtureQuote();
  q.state.extra_moqs = [{ moq: 500, eau: 5000, selling_price: 0.9 }];
  const { app } = buildApp({ access: 'read', quote: q });
  const res = await request({
    app,
    path: '/api/quotes/1/export',
    body: { variant: 'internal', lang: 'en', tiers: 'all' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/zip');
  assert.equal(res.headers['x-ops-export-format'], 'zip');
});
