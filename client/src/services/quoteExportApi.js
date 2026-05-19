// @ts-check
/**
 * Quote export API client wrapper.
 *
 * Wraps POST /api/quotes/:id/export — the server endpoint defined in
 * server/routes/quoteExport.js. Returns a Blob on success and throws
 * QuoteExportError with a discriminator code on failure.
 *
 * Why a dedicated wrapper instead of services/api.js request():
 *   - request() parses res.json(); we need res.blob() for the xlsx/zip body.
 *   - Server returns RFC-7807 JSON (or a legacy permission_denied shape)
 *     on error — caller needs the `type` discriminator to pick the right
 *     i18n message ('legacy_no_rows' vs 'no_snapshot' vs 'permission').
 *   - Filename comes from Content-Disposition; saving it as the download
 *     name is the operator-visible artifact.
 *
 * CSRF: same readCsrfCookie() pattern as services/api.js + planning/v2/api.js
 * (MES-3-FIX-9 dedup ticket). Inlined here rather than touching services/api.js
 * to keep PR scope tight.
 */

const BASE_URL = ''; // same-origin; matches services/api.js
const CSRF_COOKIE = 'ops_csrf';

function readCsrfCookie() {
  if (typeof document === 'undefined') return '';
  const raw = document.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return '';
}

/**
 * Error envelope for quote-export failures.
 *
 * `code` mirrors the server's RFC-7807 `type` slug stripped of the
 * `/errors/` prefix (e.g. `legacy_no_rows`, `no_snapshot`, `permission_denied`)
 * so callers can switch on it for i18n message routing. `detail` is the
 * server's human-readable explanation; surface it in toasts.
 *
 * Special codes:
 *   - 'NETWORK' — fetch threw (offline, CORS, DNS, etc.)
 *   - 'ABORT'   — caller aborted via AbortSignal (modal closed mid-fetch)
 */
export class QuoteExportError extends Error {
  /**
   * @param {string} code
   * @param {string} detail
   * @param {number} [status]
   */
  constructor(code, detail, status) {
    super(detail || code);
    this.name = 'QuoteExportError';
    this.code = code;
    this.detail = detail;
    this.status = status || 0;
  }
}

/**
 * Parse `Content-Disposition` header → filename.
 *
 * Handles both `filename="quoted"` and bare `filename=token` forms.
 * Server's sanitize() strips Vietnamese diacritics + special chars, so
 * the value is plain ASCII — no RFC 5987 decode needed (MVP-1 contract).
 *
 * @param {string|null|undefined} header
 * @returns {string}  parsed filename, or empty string if absent/unparseable
 */
export function parseContentDisposition(header) {
  if (!header || typeof header !== 'string') return '';
  // Prefer filename="..."; fall back to filename=token
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted) return quoted[1];
  const bare = header.match(/filename=([^;]+)/i);
  if (bare) return bare[1].trim();
  return '';
}

/**
 * Trigger a browser download of `blob` as `filename` via a temp anchor.
 *
 * Returns the temp object URL so callers can revoke it after the click
 * has resolved (Firefox needs the URL alive while the download is
 * being initiated — revoke too early and the download cancels).
 *
 * Exposed for tests; in normal use, `exportQuote()` calls it internally.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {Document} [doc]
 * @returns {string}  the temp object URL
 */
export function triggerBlobDownload(blob, filename, doc = document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers ignore the download attr if the anchor isn't in DOM.
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  // Revoke async — see fn comment above.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return url;
}

/**
 * Extract a stable discriminator code from the server's error response.
 *
 * Server returns two shapes:
 *   1. RFC-7807 (most errors):  `{ type: '/errors/legacy_no_rows', title, status }`
 *   2. Legacy permission gate:  `{ error: 'permission_denied', tab, required, current }`
 *
 * We normalize both into `{ code, detail }`. The 403 legacy shape never
 * carries a title — synthesize one from the `tab` field so the toast
 * isn't blank.
 *
 * @param {any} body
 * @param {number} status
 * @returns {{code: string, detail: string}}
 */
export function normalizeErrorBody(body, status) {
  if (body && typeof body === 'object') {
    // RFC-7807
    if (typeof body.type === 'string' && body.type.startsWith('/errors/')) {
      const code = body.type.slice('/errors/'.length);
      const detail = typeof body.title === 'string' ? body.title : '';
      return { code, detail };
    }
    // Legacy permission_denied
    if (body.error === 'permission_denied') {
      return {
        code: 'permission_denied',
        detail: `Permission denied for tab '${body.tab || 'quote-history'}' (required: ${body.required || 'read'})`,
      };
    }
    // Generic fallback — surface whatever the server sent.
    if (typeof body.error === 'string') {
      return { code: body.error, detail: body.message || body.error };
    }
  }
  return { code: 'http_' + status, detail: `HTTP ${status}` };
}

/**
 * Build the request body for POST /api/quotes/:id/export.
 *
 * `tiers` is either the string 'all' or an array of 0-based tier
 * indices (matching `enumerateTiers()` output on the server). The
 * client-side modal collects checkbox state then collapses to one of
 * the two shapes here.
 *
 * @param {{variant: 'customer'|'internal', lang: 'en'|'vi'|'bilingual', tiers: 'all'|number[]}} opts
 */
export function buildExportRequestBody(opts) {
  return {
    variant: opts.variant,
    lang: opts.lang,
    tiers: opts.tiers,
  };
}

/**
 * POST /api/quotes/:id/export and return parsed download metadata.
 *
 * Side effect: on success, triggers a browser download of the blob.
 * Returns { kind, filename, size } so the caller can show a toast.
 *
 * @param {object} args
 * @param {number} args.quoteId
 * @param {'customer'|'internal'} args.variant
 * @param {'en'|'vi'|'bilingual'} args.lang
 * @param {'all'|number[]} args.tiers
 * @param {AbortSignal} [args.signal]   for cancel-on-modal-close
 * @param {typeof fetch} [args.fetchImpl]   injection for tests
 * @param {(blob: Blob, name: string) => void} [args.downloadImpl]   ditto
 * @returns {Promise<{kind: 'xlsx'|'zip', filename: string, size: number}>}
 * @throws {QuoteExportError}
 */
export async function exportQuote(args) {
  const {
    quoteId,
    variant,
    lang,
    tiers,
    signal,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
    downloadImpl = triggerBlobDownload,
  } = args;
  if (!fetchImpl) {
    throw new QuoteExportError('NETWORK', 'fetch API not available');
  }
  if (!Number.isFinite(quoteId)) {
    throw new QuoteExportError('bad_id', 'quoteId must be a number');
  }

  const csrf = readCsrfCookie();
  const headers = {
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  };

  let res;
  try {
    res = await fetchImpl(`${BASE_URL}/api/quotes/${quoteId}/export`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(buildExportRequestBody({ variant, lang, tiers })),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new QuoteExportError('ABORT', 'Export cancelled');
    }
    throw new QuoteExportError('NETWORK', err?.message || 'network error');
  }

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // Server returned non-JSON (HTML error page, plain text) — fall through.
    }
    const { code, detail } = normalizeErrorBody(body, res.status);
    throw new QuoteExportError(code, detail, res.status);
  }

  const blob = await res.blob();
  const filename =
    parseContentDisposition(res.headers.get('Content-Disposition')) || `quote-${quoteId}-export`;
  const kind = res.headers.get('X-Ops-Export-Format') === 'zip' ? 'zip' : 'xlsx';

  downloadImpl(blob, filename);

  return { kind, filename, size: blob.size };
}
