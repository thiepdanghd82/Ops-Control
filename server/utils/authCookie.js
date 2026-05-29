/**
 * Auth cookie helpers — Phase 9H.
 *
 * We ship TWO cookies for cookie-based auth:
 *   ops_session  — httpOnly, Secure (prod), SameSite=Strict, ~8h TTL
 *                  Contains the session token; only the server can read.
 *                  Immune to JS/XSS token theft.
 *   ops_csrf     — NOT httpOnly (JS reads it), SameSite=Strict, same TTL
 *                  Random per-session token. Client copies the value
 *                  into an `X-CSRF-Token` header on state-changing
 *                  requests. Because a cross-origin page can't read
 *                  the cookie (SameSite), and can't set the header
 *                  (Fetch API same-origin policy), a forged request
 *                  fails the double-submit check.
 *
 * Rollout strategy: additive. The login endpoint still returns the
 * token in the JSON body (legacy clients keep working); NEW clients
 * that set `credentials: 'include'` pick up the cookies automatically
 * and send the CSRF header. Both paths are accepted by the session
 * lookup.
 *
 * Why no cookie-parser dep: Express 4 has res.cookie() built-in; for
 * READING request cookies we parse the header manually — it's ~10
 * lines and keeps the zero-dep middleware philosophy.
 */
import crypto from 'crypto';

export const SESSION_COOKIE = 'ops_session';
export const CSRF_COOKIE = 'ops_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h — matches default SESSION_TTL
// Sprint 1.6 — "Remember me" checkbox extends both server-side TTL and the
// cookie Max-Age to 30 days. Tied here so the cookie expires together with
// the session it represents (browser drop happens at the same moment the
// server would invalidate the token anyway).
export const REMEMBER_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d

/**
 * Parse the `Cookie` header into a flat { name: value } object.
 * Values are URI-decoded. Unknown / malformed pairs are skipped.
 */
export function parseCookies(req) {
  const header = req && req.headers && req.headers.cookie;
  if (typeof header !== 'string' || header.length === 0) return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Generate a fresh CSRF token — 16 random bytes, base64url-encoded.
 * Length ~22 chars; enough entropy to stop brute force while staying
 * shorter than the session token.
 */
export function generateCsrfToken() {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Set both auth cookies on login success. `isProd` gates the Secure
 * flag — localhost dev must stay on http:// so we can't require it
 * globally. `sameSite: 'strict'` is the strongest CSRF protection;
 * fall back to 'lax' only if you need cross-site OAuth-style flows
 * (Ops Control doesn't).
 */
export function setAuthCookies(res, { sessionToken, csrfToken, isProd, maxAgeMs }) {
  // Sprint 1.6 — caller passes maxAgeMs computed from the session TTL so
  // cookie + session expire together. Falls back to the 8h default for
  // legacy call sites that don't yet thread the parameter through.
  const cookieMaxAge = maxAgeMs || COOKIE_MAX_AGE_MS;
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: !!isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: cookieMaxAge,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    // NOT httpOnly — client JS reads this to echo into the header.
    httpOnly: false,
    secure: !!isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: cookieMaxAge,
  });
}

/** Clear both cookies. Used on logout. */
export function clearAuthCookies(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

/**
 * Read the session token from (1) cookie OR (2) Authorization header.
 * Cookie takes precedence so new clients gradually retire the
 * localStorage-based token path. Returns { token, source } where
 * source is 'cookie' | 'header' | 'none' — callers use it to decide
 * whether to enforce CSRF.
 */
export function readSessionToken(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE];
  if (cookieToken) return { token: cookieToken, source: 'cookie' };

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return { token: auth.slice(7).trim(), source: 'header' };
  }
  return { token: null, source: 'none' };
}

/**
 * CSRF double-submit check. Returns `{ ok: true }` when:
 *   - request used header auth (CSRF not applicable; pre-9H contract)
 *   - OR request method is safe (GET/HEAD/OPTIONS)
 *   - OR cookie-auth + X-CSRF-Token header matches ops_csrf cookie
 *
 * Returns `{ ok: false, reason }` otherwise. Callers decide the
 * status code — typically 403 for a hard rejection.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function checkCsrf(req) {
  if (SAFE_METHODS.has(req.method)) return { ok: true };

  const { source } = readSessionToken(req);
  if (source !== 'cookie') {
    // Header-auth (legacy Authorization: Bearer) is not vulnerable to
    // CSRF because browsers don't auto-attach Authorization headers to
    // cross-origin requests. Skip the check for back-compat.
    return { ok: true, reason: 'header-auth-skip' };
  }

  const cookies = parseCookies(req);
  const cookieVal = cookies[CSRF_COOKIE];
  const headerVal = req.headers[CSRF_HEADER];
  if (!cookieVal) return { ok: false, reason: 'missing_csrf_cookie' };
  if (!headerVal) return { ok: false, reason: 'missing_csrf_header' };
  if (String(headerVal) !== String(cookieVal)) {
    return { ok: false, reason: 'csrf_mismatch' };
  }
  return { ok: true };
}
