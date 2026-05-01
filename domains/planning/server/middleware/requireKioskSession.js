/**
 * Kiosk-session auth middleware — Sprint MES-2.5.
 *
 * Reads `Authorization: Bearer <jwt>`, verifies via kioskTokenService
 * (pure HMAC-SHA256, no DB on the verify path), then enforces revocation
 * via an indexed DB lookup with a 30 s positive-result cache (Option B
 * from the MES-2.5 plan).
 *
 * Why Option B (per-request DB check w/ 30 s cache) over A (verify-only)
 * or C (mutations-only): operationally a sys admin who revokes a kiosk
 * wants the device dead within 30 s, not 12 h (= JWT TTL). The DB hit is
 * a single-row SELECT on the indexed session_jti column (idx_kiosk_pairing
 * _jti), so the worst-case cost is microseconds. The 30 s cache amortises
 * a busy kiosk's heartbeat traffic to ~1 SELECT per minute per device.
 *
 * Refresh: when remaining TTL < 2 h (refresh window from MES-2.3),
 * a fresh JWT is minted and returned via the X-Kiosk-Session-Refresh
 * header. The OLD jti remains valid until natural exp (≤2 h hence) so
 * an in-flight retry doesn't break; the kiosk is expected to swap the
 * JWT on its next request and the old one ages out.
 */
import { respondError } from '../lib/rfc7807.js';

export function createRequireKioskSession({
  kioskService,
  db,
  revocationCacheMs = 30_000,
  now = () => Date.now(),
} = {}) {
  // Positive cache only: a jti seen as VALID is cached for 30 s; a jti
  // seen as REVOKED is NOT cached, so a sys admin's revoke takes effect
  // on the very next request (worst case: 30 s if cached just before).
  const validUntil = new Map();

  const revocationStmt = db.prepare(
    `SELECT 1 AS x FROM kiosk_pairing
     WHERE session_jti = ? AND revoked_at_utc IS NULL`
  );

  function isLive(jti) {
    const cachedExp = validUntil.get(jti);
    if (cachedExp && cachedExp > now()) return true;
    const row = revocationStmt.get(jti);
    if (row) {
      validUntil.set(jti, now() + revocationCacheMs);
      return true;
    }
    validUntil.delete(jti);
    return false;
  }

  return function requireKioskSession(req, res, next) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return respondError(res, {
        status: 401,
        type: 'urn:ops:kiosk-session-invalid',
        reason: 'missing-bearer',
      });
    }
    const jwt = auth.slice(7).trim();
    const v = kioskService.verifySession(jwt);
    if (!v.ok) {
      return respondError(res, {
        status: 401,
        type: 'urn:ops:kiosk-session-invalid',
        reason: v.reason,
      });
    }
    if (!isLive(v.claims.jti)) {
      return respondError(res, {
        status: 401,
        type: 'urn:ops:kiosk-session-invalid',
        reason: 'revoked',
      });
    }
    req.kioskSession = {
      jti: v.claims.jti,
      machine_code: v.claims.machine_code,
      exp: v.claims.exp,
    };
    // Refresh window: <2 h left on the JWT → mint a fresh one, advertise
    // via header. kiosks update their stored JWT on the next request;
    // the old jti stays valid until exp so any in-flight retry is safe.
    const refreshed = kioskService.refreshSession(v.claims);
    if (refreshed) res.setHeader('X-Kiosk-Session-Refresh', refreshed);
    next();
  };
}
