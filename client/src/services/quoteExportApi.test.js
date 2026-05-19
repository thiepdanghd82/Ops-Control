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

test('buildExportRequestBody: passes through variant/lang/tiers verbatim', () => {
  assert.deepEqual(buildExportRequestBody({ variant: 'customer', lang: 'en', tiers: 'all' }), {
    variant: 'customer',
    lang: 'en',
    tiers: 'all',
  });
  assert.deepEqual(
    buildExportRequestBody({ variant: 'internal', lang: 'bilingual', tiers: [0, 2] }),
    { variant: 'internal', lang: 'bilingual', tiers: [0, 2] }
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
  });
  assert.equal(out.kind, 'xlsx');
  assert.equal(out.filename, 'Quote_test.xlsx');
  assert.equal(out.size, 3);
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].name, 'Quote_test.xlsx');
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
