/**
 * etag.js — strong ETag helper for read-only API endpoints.
 *
 * Sprint 1.7h Phase 1 — perf optimization for the heavy library tabs
 * (IFS Inventory 2.8 MB, Mfg Structures 6 MB, Routing Ops 16 MB).
 * Without ETags every tab switch re-downloads + re-parses the full
 * dataset. With ETags the second visit sends `If-None-Match: <hash>`
 * and the server responds 304 in ~5 ms — no body, no parse, instant.
 *
 * Algorithm: sha256 of the JSON body (first 16 bytes of digest, base64url).
 * Strong because the hash changes on any content change. We DON'T fall
 * back to weak ETags; that would make integrity guarantees fuzzy.
 *
 * Caching strategy: `Cache-Control: private, max-age=0, must-revalidate`
 * — the browser MUST revalidate every request, but a 304 response is
 * essentially free. Compatible with the existing client `fetch()` which
 * defaults to the browser HTTP cache.
 *
 * Usage:
 *   import { sendJsonWithEtag } from '../utils/etag.js';
 *   router.get('/inventory', (req, res) => {
 *     const data = repo.listInventoryAll();
 *     sendJsonWithEtag(req, res, data);
 *   });
 */
import crypto from 'crypto';

/**
 * Compute strong ETag for a JSON-serializable payload.
 * Returns the quoted etag string (`"<hash>"`) per RFC 7232.
 */
export function computeJsonEtag(data) {
  const json = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(json).digest('base64url');
  return `"${hash.slice(0, 22)}"`;
}

/**
 * Send a JSON payload with strong ETag + 304 short-circuit.
 *
 * - Computes the ETag from `data`.
 * - Compares against `If-None-Match` (handles single + comma-separated lists).
 * - If match → 304 with ETag + Cache-Control headers, NO body.
 * - Else → 200 with ETag + Cache-Control + JSON body.
 *
 * Note: stringifies once for the hash AND once for the body. For a 16 MB
 * payload that's still ~50 ms total — but compared to the network transfer
 * the savings are huge. For tighter perf, cache the (hash, json) pair
 * upstream when the underlying file mtime hasn't changed.
 */
export function sendJsonWithEtag(req, res, data) {
  const etag = computeJsonEtag(data);
  // Always set the headers so the browser caches them on 200 + 304 alike.
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

  const ifNoneMatch = req.headers['if-none-match'] || '';
  // Header may carry multiple ETags ("a, b, c") — match any.
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    res.status(304).end();
    return;
  }
  res.json(data);
}
