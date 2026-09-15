// @ts-check
/**
 * Quote export API wrapper — pure-logic tests.
 *
 * Runner: node --test src/services/quoteExportApi.test.js
 *
 * Covers the fetch wrapper without touching real network: a fake
 * fetch is injected via `fetchImpl`, and the blob-download side
 * effect is captured via `downloadImpl`. Tests focus on the contract
 * between client + server (body shape, headers, error normalization)
 * — full DOM blob download is verified manually in dev/prod.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportQuote,
  QuoteExportError,
  parseContentDisposition,
  normalizeErrorBody,
  buildExportRequestBody,
} from './quoteExportApi.js';

// ─── parseContentDisposition ────────────────────────────────────────

test('parseContentDisposition: quoted form', () => {
  assert.equal(
    parseContentDisposition('attachment; filename="Quote_RFQ-1_internal_v3.xlsx"'),
    'Quote_RFQ-1_internal_v3.xlsx'
  );
});

test('parseContentDisposition: bare token form', () => {
  assert.equal(
    parseContentDisposition('attachment; filename=Quote_simple.xlsx'),
    'Quote_simple.xlsx'
  );
});

test('parseContentDisposition: null/missing returns empty string', () => {
  assert.equal(parseContentDisposition(null), '');
  assert.equal(parseContentDisposition(undefined), '');
  assert.equal(parseContentDisposition(''), '');
});

// ─── normalizeErrorBody ────────────────────────────────────────────

test('normalizeErrorBody: RFC-7807 legacy_no_rows', () => {
  const { code, detail } = normalizeErrorBody(
    {
      type: '/errors/legacy_no_rows',
      title: 'This quote was saved before per-row tracking…',
      status: 422,
    },
    422
  );
  assert.equal(code, 'legacy_no_rows');
  assert.match(detail, /per-row tracking/);
});

test('normalizeErrorBody: legacy permission_denied shape (non-RFC)', () => {
  const { code, detail } = normalizeErrorBody(
    { error: 'permission_denied', tab: 'quote-history', required: 'read', current: 'hidden' },
    403
  );
  assert.equal(code, 'permission_denied');
  assert.match(detail, /quote-history/);
  assert.match(detail, /read/);
});

test('normalizeErrorBody: unrecognised body shape falls back to http_<status>', () => {
  const { code } = normalizeErrorBody(null, 500);
  assert.equal(code, 'http_500');
});

// ─── buildExportRequestBody ────────────────────────────────────────

test('buildExportRequestBody: passes through variant/lang/tiers + defaults format=xlsx', () => {
  assert.deepEqual(buildExportRequestBody({ variant: 'customer', lang: 'en', tiers: 'all' }), {
    variant: 'customer',
    lang: 'en',
    tiers: 'all',
    format: 'xlsx',
  });
  assert.deepEqual(
    buildExportRequestBody({ variant: 'internal', lang: 'bilingual', tiers: [0, 2] }),
    { variant: 'internal', lang: 'bilingual', tiers: [0, 2], format: 'xlsx' }
  );
});

test('buildExportRequestBody: passes through format=csv when supplied', () => {
  assert.deepEqual(
    buildExportRequestBody({ variant: 'customer', lang: 'en', tiers: 'all', format: 'csv' }),
    { variant: 'customer', lang: 'en', tiers: 'all', format: 'csv' }
  );
});

// ─── exportQuote — happy paths ─────────────────────────────────────

function makeOkResponse({
  body = new Uint8Array([1, 2, 3]),
  filename = 'Quote_test.xlsx',
  kind = 'xlsx',
} = {}) {
  const headers = new Map([['Content-Disposition', `attachment; filename="${filename}"`]]);
  if (kind === 'zip') headers.set('X-Ops-Export-Format', 'zip');
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => headers.get(k) ?? null },
    blob: async () => ({ size: body.length }),
  };
}

test('exportQuote: POST sends correct body + Content-Type + CSRF skipped when no cookie', async () => {
  let capturedUrl = null;
  let capturedInit = null;
  const downloaded = [];
  const fetchImpl = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return makeOkResponse();
  };
  const downloadImpl = (blob, name) => downloaded.push({ blob, name });

  const out = await exportQuote({
    quoteId: 42,
    variant: 'internal',
    lang: 'bilingual',
    tiers: 'all',
    fetchImpl,
    downloadImpl,
  });

  assert.equal(capturedUrl, '/api/quotes/42/export');
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers['Content-Type'], 'application/json');
  assert.equal(capturedInit.credentials, 'include');
  assert.deepEqual(JSON.parse(capturedInit.body), {
    variant: 'internal',
    lang: 'bilingual',
    tiers: 'all',
    format: 'xlsx',
  });
  assert.equal(out.kind, 'xlsx');
  assert.equal(out.filename, 'Quote_test.xlsx');
  assert.equal(out.size, 3);
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].name, 'Quote_test.xlsx');
});

// ─── Authorization header (web surface) ─────────────────────────────
//
// The Secure cookie set at login (server/utils/authCookie.js — secure:
// !!isProd, and desktop/main.js forces NODE_ENV=production) is only stored
// by a browser over HTTPS or on http://localhost. The desktop app loads
// http://127.0.0.1:3100, a secure context, so the cookie works there; a
// browser reaching the same server over http://<LAN-IP>:3100 silently
// drops it. Cookie-only auth therefore sent NO credentials on the web
// surface and the server answered 401 "Authentication required".
//
// Every other client service already sends Authorization: Bearer from
// the shared getToken() (services/api.js). These pin that this wrapper
// does too — including the sessionStorage store, which is where the
// token lives when "Remember me" is unchecked (MES-3-FIX-54's bug was
// exactly a hand-rolled fetch that only read localStorage).

/** Install fake Web Storage globals; returns a restore fn. */
function stubStorage({ local = null, session = null } = {}) {
  const prior = [];
  for (const [name, value] of [
    ['localStorage', local],
    ['sessionStorage', session],
  ]) {
    prior.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: { getItem: (k) => (k === 'ops_token' ? value : null) },
    });
  }
  return () => {
    for (const [name, desc] of prior) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete globalThis[name];
    }
  };
}

async function captureHeaders(storage) {
  const restore = stubStorage(storage);
  try {
    let captured = null;
    await exportQuote({
      quoteId: 7,
      variant: 'internal',
      lang: 'bilingual',
      tiers: 'all',
      fetchImpl: async (_url, init) => {
        captured = init;
        return makeOkResponse();
      },
      downloadImpl: () => {},
    });
    return captured.headers;
  } finally {
    restore();
  }
}

test('exportQuote: sends Authorization: Bearer from localStorage (web surface)', async () => {
  const headers = await captureHeaders({ local: 'tok-local' });
  assert.equal(headers.Authorization, 'Bearer tok-local');
});

test('exportQuote: reads the token from sessionStorage too (Remember-me OFF)', async () => {
  const headers = await captureHeaders({ session: 'tok-session' });
  assert.equal(headers.Authorization, 'Bearer tok-session');
});

test('exportQuote: sessionStorage wins over localStorage, matching getToken()', async () => {
  const headers = await captureHeaders({ local: 'tok-local', session: 'tok-session' });
  assert.equal(headers.Authorization, 'Bearer tok-session');
});

test('exportQuote: omits Authorization when no token is stored (cookie-only path unchanged)', async () => {
  const headers = await captureHeaders({});
  assert.ok(
    !('Authorization' in headers),
    'must not send a "Bearer null"/"Bearer undefined" header when no token exists'
  );
  // The desktop path still relies on the cookie.
  assert.equal(headers['Content-Type'], 'application/json');
});

test('exportQuote: survives an environment with no Web Storage at all', async () => {
  // Private mode / blocked site data / a sandboxed context: reading storage
  // throws. getToken() must return null rather than throw out of the request,
  // so the export still goes out and falls back to the cookie.
  const prior = ['localStorage', 'sessionStorage'].map((n) => [
    n,
    Object.getOwnPropertyDescriptor(globalThis, n),
  ]);
  for (const [n] of prior) {
    Object.defineProperty(globalThis, n, {
      configurable: true,
      get() {
        throw new Error('site data blocked');
      },
    });
  }
  try {
    let captured = null;
    await exportQuote({
      quoteId: 7,
      variant: 'internal',
      lang: 'bilingual',
      tiers: 'all',
      fetchImpl: async (_url, init) => {
        captured = init;
        return makeOkResponse();
      },
      downloadImpl: () => {},
    });
    assert.ok(!('Authorization' in captured.headers));
    assert.equal(captured.credentials, 'include');
  } finally {
    for (const [n, d] of prior) {
      if (d) Object.defineProperty(globalThis, n, d);
      else delete globalThis[n];
    }
  }
});

test('exportQuote: multi-tier zip response sets kind=zip via X-Ops-Export-Format', async () => {
  const fetchImpl = async () => makeOkResponse({ filename: 'Quote_RFQ-1_all.zip', kind: 'zip' });
  const downloadImpl = () => {};
  const out = await exportQuote({
    quoteId: 7,
    variant: 'customer',
    lang: 'en',
    tiers: [0, 1, 2],
    fetchImpl,
    downloadImpl,
  });
  assert.equal(out.kind, 'zip');
  assert.equal(out.filename, 'Quote_RFQ-1_all.zip');
});

// ─── exportQuote — error paths ─────────────────────────────────────

test('exportQuote: 422 legacy_no_rows → QuoteExportError(code=legacy_no_rows)', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 422,
    headers: { get: () => null },
    json: async () => ({
      type: '/errors/legacy_no_rows',
      title: 'This quote was saved before per-row tracking was added.',
      status: 422,
    }),
  });
  await assert.rejects(
    () =>
      exportQuote({
        quoteId: 1,
        variant: 'customer',
        lang: 'en',
        tiers: 'all',
        fetchImpl,
        downloadImpl: () => {},
      }),
    (err) =>
      err instanceof QuoteExportError &&
      err.code === 'legacy_no_rows' &&
      err.status === 422 &&
      /per-row/.test(err.detail)
  );
});

test('exportQuote: 403 permission_denied (legacy shape) → QuoteExportError(code=permission_denied)', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    headers: { get: () => null },
    json: async () => ({
      error: 'permission_denied',
      tab: 'quote-history',
      required: 'read',
      current: 'hidden',
    }),
  });
  await assert.rejects(
    () =>
      exportQuote({
        quoteId: 1,
        variant: 'customer',
        lang: 'en',
        tiers: 'all',
        fetchImpl,
        downloadImpl: () => {},
      }),
    (err) =>
      err instanceof QuoteExportError && err.code === 'permission_denied' && err.status === 403
  );
});

test('exportQuote: fetch throw → QuoteExportError(code=NETWORK)', async () => {
  const fetchImpl = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    () =>
      exportQuote({
        quoteId: 1,
        variant: 'internal',
        lang: 'en',
        tiers: 'all',
        fetchImpl,
        downloadImpl: () => {},
      }),
    (err) => err instanceof QuoteExportError && err.code === 'NETWORK' && /fetch/i.test(err.detail)
  );
});

test('exportQuote: AbortError → QuoteExportError(code=ABORT)', async () => {
  const fetchImpl = async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  };
  await assert.rejects(
    () =>
      exportQuote({
        quoteId: 1,
        variant: 'internal',
        lang: 'en',
        tiers: 'all',
        fetchImpl,
        downloadImpl: () => {},
      }),
    (err) => err instanceof QuoteExportError && err.code === 'ABORT'
  );
});

test('exportQuote: bad quoteId rejected before fetch', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return makeOkResponse();
  };
  await assert.rejects(
    () =>
      exportQuote({
        // @ts-expect-error — exercise the runtime guard
        quoteId: 'abc',
        variant: 'internal',
        lang: 'en',
        tiers: 'all',
        fetchImpl,
        downloadImpl: () => {},
      }),
    (err) => err instanceof QuoteExportError && err.code === 'bad_id'
  );
  assert.equal(called, false, 'fetch must not run when quoteId is invalid');
});
