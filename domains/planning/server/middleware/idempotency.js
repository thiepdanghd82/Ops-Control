/**
 * Idempotency middleware — Sprint MES-2.5.
 *
 * Reads the Idempotency-Key header on mutation routes, hashes the request,
 * and either:
 *   - replays the cached response byte-for-byte (same key + same hash)
 *   - returns 409 idempotency-mismatch (same key + different hash)
 *   - or wraps res.json so a successful response (2xx) gets persisted to
 *     the ledger AFTER the route handler runs. 4xx (other than the
 *     409-replay branch) and 5xx are NOT cached so a transient failure
 *     can be retried correctly.
 *
 * Key format: any non-empty string up to 255 chars. The lax check
 * accommodates older kiosks that emit non-v4 UUIDs (e.g. ULIDs); the
 * cryptographic hash provides the actual replay-safety guarantee.
 */
import { respondError } from '../lib/rfc7807.js';
import { requestHash } from '../services/idempotencyStore.js';

const MIN_KEY = 1;
const MAX_KEY = 255;

export function createIdempotencyMiddleware({ store, required = true } = {}) {
  return function idempotencyMiddleware(req, res, next) {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
      if (required) {
        return respondError(res, {
          status: 400,
          type: 'urn:ops:idempotency-required',
          detail: 'Idempotency-Key header required for mutation endpoints',
        });
      }
      return next();
    }
    if (key.length < MIN_KEY || key.length > MAX_KEY) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:idempotency-key-malformed',
        detail: `length must be ${MIN_KEY}..${MAX_KEY} chars`,
      });
    }
    const hash = requestHash(req.method, req.originalUrl, req.body);
    const cached = store.get(key);
    if (cached) {
      if (cached.request_hash !== hash) {
        return respondError(res, {
          status: 409,
          type: 'urn:ops:idempotency-mismatch',
          original_at: cached.created_at,
          new_request_hash: hash,
          detail: 'Idempotency-Key reused with a different request body',
        });
      }
      // Hash match → byte-for-byte replay. Set a header so observability
      // tools can distinguish first-write vs replay without parsing the body.
      res.setHeader('X-Idempotency-Replayed', 'true');
      return res.status(cached.status).json(cached.body);
    }

    req.idempotencyKey = key;
    const origJson = res.json.bind(res);
    res.json = function (body) {
      // Cache only successful responses (2xx). 4xx (validation failures,
      // bad-state transitions) and 5xx must NOT be cached — the kiosk
      // should be free to retry after fixing the cause.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          store.put(key, { status: res.statusCode, body, request_hash: hash });
        } catch (e) {
          // A failed put doesn't break the response — worst case, the
          // kiosk's retry runs the operation again. The service layer's
          // state-machine guards still prevent double-mutation in most
          // cases (op-no-change / op-invalid-transition translates).
          console.warn('[idempotency] put failed:', e.message);
        }
      }
      return origJson(body);
    };
    next();
  };
}
