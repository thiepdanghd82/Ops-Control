/**
 * Kiosk pairing + JWT session service — Sprint MES-2.3.
 *
 * Two-phase auth model for shop-floor kiosks:
 *   1. Planner issues a one-shot pairing token bound to a machine_code.
 *      Token is generated as 32 random bytes, base64url-encoded for the
 *      pairing URL, sha256-hashed for storage. Raw token is returned ONCE
 *      to the planner UI (printed on the pairing card) and is never
 *      logged anywhere.
 *   2. Kiosk redeems the token at /kiosks/redeem and gets a long-lived
 *      session JWT (HS256, 12h default TTL). The pairing row is marked
 *      redeemed_at_utc + session_jti so revocation can target the session
 *      without invalidating other kiosks bound to the same machine.
 *
 * Crypto choices:
 *   - JWT: hand-rolled HS256 (HMAC-SHA256 over header.payload). The
 *     project has no jsonwebtoken dep and the spec forbids adding one;
 *     ~25 LOC of node:crypto suffices for a single algorithm + we sidestep
 *     the algorithm-confusion footguns of the broader libraries.
 *   - Pairing token: 32 random bytes (256 bits) — overkill for a 15-min
 *     TTL one-shot, but cheap and aligns with OPS_TOTP_KEY entropy.
 *   - Storage hash: sha256(token). Constant-time compare on lookup is
 *     unnecessary (lookup is by hash equality on a UNIQUE index — the DB
 *     either finds the row or doesn't; no leak via timing).
 *
 * Audit: every issue/redeem/revoke writes one audit_log row with the JTI
 * (NEVER the raw token or JWT). Caller passes an `audit({ts,event,user,
 * ip,detail})` closure (same shape MES-1.4 uses).
 *
 * Refresh window: a session JWT carries a fixed 12h TTL. The kiosk's
 * heartbeat ping calls verifySession + (if remaining TTL < 2h)
 * refreshSession to mint a new JWT in-place. This keeps active kiosks
 * alive across shift boundaries without ever bumping a kiosk that's
 * already comfortably ahead of expiry — the 2h cliff is intentional so
 * a kiosk not used for >10h naturally expires (operator must re-pair).
 */

import crypto from 'node:crypto';

const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 min — pairing card must be redeemed promptly
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h — covers a full shift
const REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000; // <2h remaining → mint a new JWT

// ── base64url helpers (RFC-4648 §5; node Buffer's 'base64url' is fine
//    on 16+ but we go through Buffer to keep the encoding explicit)
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const b64urlJson = (obj) => b64url(JSON.stringify(obj));
const fromB64url = (s) => Buffer.from(s, 'base64url');

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

const isoFromMs = (ms) => new Date(ms).toISOString();

/** @param {Buffer|string} secret */
function assertSecret(secret) {
  if (!secret || (typeof secret === 'string' && secret.length < 32)) {
    throw new Error('OPS_KIOSK_KEY missing or too short (need ≥32 chars).');
  }
}

/**
 * Sign + verify HS256 JWTs. Hand-rolled to avoid a new dep — single
 * algorithm, no header.alg=none footgun, no JWK juggling.
 */
function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const head = b64urlJson(header);
  const body = b64urlJson(payload);
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

function verifyJwt(token, secret) {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [head, body, sig] = parts;
  let header;
  try {
    header = JSON.parse(fromB64url(head).toString('utf-8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { ok: false, reason: 'bad-alg' };
  }
  const expected = b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  // Constant-time compare: timingSafeEqual requires equal-length buffers,
  // so we compare lengths first to avoid throwing on short/long sigs.
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad-signature' };
  }
  let claims;
  try {
    claims = JSON.parse(fromB64url(body).toString('utf-8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (claims.kind !== 'kiosk') {
    return { ok: false, reason: 'wrong-kind' };
  }
  return { ok: true, claims };
}

/**
 * @param {{ secret: string, audit: (row: { ts, event, user, ip, detail })=>void,
 *           pairingTtlMs?: number, sessionTtlMs?: number, refreshWindowMs?: number,
 *           now?: () => number }} deps
 */
export function createKioskTokenService(deps) {
  const { secret, audit } = deps;
  assertSecret(secret);
  const pairingTtl = deps.pairingTtlMs ?? PAIRING_TTL_MS;
  const sessionTtl = deps.sessionTtlMs ?? SESSION_TTL_MS;
  const refreshWindow = deps.refreshWindowMs ?? REFRESH_WINDOW_MS;
  const now = deps.now ?? (() => Date.now());

  /**
   * Issue a one-shot pairing token. Caller passes the open db handle so
   * the route can wrap the broader request in its own transaction if
   * needed; we still wrap our own write in db.transaction() for
   * atomicity of the row + audit.
   */
  function issuePairing(machineCode, issuedByUserId, db) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(rawToken);
    const issuedAt = now();
    const expiresAt = issuedAt + pairingTtl;
    let id;
    db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO kiosk_pairing
             (token_hash, machine_code, issued_by_user_id, issued_at_utc, expires_at_utc)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(tokenHash, machineCode, issuedByUserId, isoFromMs(issuedAt), isoFromMs(expiresAt));
      id = Number(r.lastInsertRowid);
      audit({
        ts: isoFromMs(issuedAt),
        event: 'KIOSK_PAIR_ISSUE',
        user: String(issuedByUserId),
        ip: '-',
        detail: JSON.stringify({ pairing_id: id, machine_code: machineCode }),
      });
    })();
    return {
      id,
      token: rawToken, // returned ONCE — caller renders to pairing card and discards
      pairing_url: `/kiosk/pair?t=${rawToken}`,
      expires_at: isoFromMs(expiresAt),
    };
  }

  /**
   * Redeem a pairing token → mint a session JWT. Idempotency is NOT
   * provided here: a token is one-shot. A second redeem of the same
   * token returns kiosk-token-invalid (already-redeemed branch).
   */
  function redeem(rawToken, db) {
    if (typeof rawToken !== 'string' || rawToken.length < 16) {
      return { ok: false, reason: 'malformed' };
    }
    const tokenHash = sha256Hex(rawToken);
    const row = db.prepare('SELECT * FROM kiosk_pairing WHERE token_hash = ?').get(tokenHash);
    if (!row) return { ok: false, reason: 'unknown' };
    if (row.revoked_at_utc) return { ok: false, reason: 'revoked' };
    if (row.redeemed_at_utc) return { ok: false, reason: 'already-redeemed' };
    if (Date.parse(row.expires_at_utc) < now()) return { ok: false, reason: 'expired' };

    const jti = crypto.randomBytes(16).toString('hex');
    const issuedAt = now();
    const expiresAt = issuedAt + sessionTtl;
    const claims = {
      jti,
      machine_code: row.machine_code,
      kind: 'kiosk',
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor(expiresAt / 1000),
    };
    const sessionJwt = signJwt(claims, secret);

    db.transaction(() => {
      db.prepare(
        `UPDATE kiosk_pairing SET redeemed_at_utc = ?, session_jti = ?, last_seen_at_utc = ?
         WHERE id = ?`
      ).run(isoFromMs(issuedAt), jti, isoFromMs(issuedAt), row.id);
      audit({
        ts: isoFromMs(issuedAt),
        event: 'KIOSK_PAIR_REDEEM',
        user: '-', // caller is the kiosk (no user); pairing_id ties back to issuer
        ip: '-',
        detail: JSON.stringify({ pairing_id: row.id, machine_code: row.machine_code, jti }),
      });
    })();

    return {
      ok: true,
      session_jwt: sessionJwt,
      machine_code: row.machine_code,
      expires_at: isoFromMs(expiresAt),
      jti,
    };
  }

  /** Verify a session JWT. Pure: no DB hit (revocation is checked on demand by callers). */
  function verifySession(jwt) {
    return verifyJwt(jwt, secret);
  }

  /**
   * Mint a fresh JWT iff the current claims have <REFRESH_WINDOW_MS
   * remaining. Returns `null` (= "no refresh needed") otherwise so the
   * caller can keep using the token they have.
   */
  function refreshSession(claims) {
    if (!claims || typeof claims.exp !== 'number') return null;
    const remainingMs = claims.exp * 1000 - now();
    if (remainingMs >= refreshWindow) return null;
    const issuedAt = now();
    const expiresAt = issuedAt + sessionTtl;
    return signJwt(
      {
        jti: claims.jti,
        machine_code: claims.machine_code,
        kind: 'kiosk',
        iat: Math.floor(issuedAt / 1000),
        exp: Math.floor(expiresAt / 1000),
      },
      secret
    );
  }

  /** Revoke a pairing by id. Used by sys role to cut a kiosk's session. */
  function revoke(pairingId, db, revokerUserId) {
    const row = db
      .prepare('SELECT id, machine_code, session_jti FROM kiosk_pairing WHERE id = ?')
      .get(pairingId);
    if (!row) return { ok: false, reason: 'not-found' };
    const ts = isoFromMs(now());
    db.transaction(() => {
      db.prepare('UPDATE kiosk_pairing SET revoked_at_utc = ? WHERE id = ?').run(ts, pairingId);
      audit({
        ts,
        event: 'KIOSK_REVOKE',
        user: String(revokerUserId),
        ip: '-',
        detail: JSON.stringify({
          pairing_id: pairingId,
          machine_code: row.machine_code,
          jti: row.session_jti || null,
        }),
      });
    })();
    return { ok: true };
  }

  return { issuePairing, redeem, verifySession, refreshSession, revoke };
}

// Exposed for unit-test use ONLY — production call sites go through createKioskTokenService.
export const __test = { signJwt, verifyJwt, sha256Hex };
