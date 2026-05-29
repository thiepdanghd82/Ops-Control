/**
 * Simple in-memory IP rate limits for destructive + bulk write endpoints.
 *
 * Window: 10 minutes. Distinct from the login-specific limit in
 * authService.checkRateLimit (10 attempts / 60s).
 *
 * Two limiters, different thresholds:
 *  - writeRateLimit  (OPS_WRITE_RATE_MAX, default 30) — bulk import /
 *    backup. Low cadence, large payloads, catches disk-thrash abuse.
 *  - saveRateLimit   (OPS_SAVE_RATE_MAX,  default 120) — /save-all /
 *    /save-quotation. Higher cadence; users click Save routinely and
 *    the endpoint writes the whole DB each time. 12 req/min still
 *    catches runaway scripts without blocking normal editing.
 *
 * Each limiter owns its own counter map, so burning one limit doesn't
 * starve the other. Not a perfect limiter (in-memory → resets on
 * restart, one-node scope), but good enough to stop accidental spam +
 * simple abuse. Replace with Redis/leaky-bucket when you go multi-instance.
 *
 * Phase 9E.1 hardening:
 *  1. `x-forwarded-for` only trusted when Express `trust proxy` is set
 *     (index.js does `app.set('trust proxy', 1)`). Prevents a direct
 *     client from spoofing any IP via the header to bypass per-IP counts.
 *  2. Env-configured max is validated: NaN / non-positive falls back to
 *     default, so `OPS_WRITE_RATE_MAX=abc` no longer silently disables
 *     the limiter (prior bug: Number('abc')=NaN, count > NaN = false).
 *  3. Store bounded to STORE_MAX entries (LRU-by-expiry eviction on full).
 *     Prevents OOM from a botnet cycling IPs.
 *
 * Threshold semantics: `count > max` after post-increment means the
 * limiter ALLOWS exactly `max` requests per window, blocks the
 * (max+1)th. `max=30` → 30 passes, 31st returns 429. Common idiom,
 * matches nginx/haproxy behavior.
 */

const WINDOW_MS = 10 * 60 * 1000;
// Cap on unique IPs tracked per limiter. Sized for a CCL-scale site
// (~500 concurrent users × some churn headroom). Beyond this, oldest
// EXPIRED entries are evicted first, then oldest (least-recently-reset)
// live entries. For a sustained attack with > STORE_MAX unique IPs, we
// degrade to "allow" rather than OOM — upstream WAF/proxy should catch
// large-scale flood attacks anyway.
const STORE_MAX = 10_000;

function clientIp(req) {
  // Express populates req.ip correctly when `trust proxy` is set;
  // otherwise it returns req.socket.remoteAddress. This matches the
  // trust-proxy configuration and avoids header-spoofing on direct
  // connections.
  if (typeof req.ip === 'string' && req.ip) return req.ip;
  return (req.socket?.remoteAddress || 'unknown').toString();
}

function resolveMax(envName, defaultMax) {
  const raw = process.env[envName];
  if (raw == null || raw === '') return defaultMax;
  const n = Number(raw);
  // Reject NaN, Infinity, negative, zero. Without this, a typo in the
  // env var silently disabled the limiter because `count > NaN === false`.
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(
      `  ⚠️  ${envName}=${JSON.stringify(raw)} is not a positive number — using default ${defaultMax}`
    );
    return defaultMax;
  }
  return Math.floor(n);
}

function makeLimiter({ name, maxEnv, defaultMax }) {
  const store = new Map();
  const max = resolveMax(maxEnv, defaultMax);

  function evictIfFull(now) {
    if (store.size < STORE_MAX) return;
    // Pass 1: drop every expired entry (windows past resetAt).
    for (const [ip, entry] of store) {
      if (now > entry.resetAt) store.delete(ip);
      if (store.size < STORE_MAX) return;
    }
    // Pass 2: store is still full of LIVE entries — drop the oldest by
    // resetAt. Map iteration order is insertion-order, so we capture
    // the first N live entries sorted by earliest resetAt.
    const live = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDrop = Math.max(1, Math.floor(STORE_MAX * 0.1)); // prune 10%
    for (let i = 0; i < toDrop && i < live.length; i++) {
      store.delete(live[i][0]);
    }
  }

  function mw(req, res, next) {
    const ip = clientIp(req);
    const now = Date.now();
    evictIfFull(now);

    const entry = store.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + WINDOW_MS;
    }
    entry.count++;
    store.set(ip, entry);

    if (entry.count > max) {
      return res.status(429).json({
        ok: false,
        error: `Rate limit exceeded: ${max} ${name} ops per 10 min`,
        retry_after_ms: Math.max(0, entry.resetAt - now),
      });
    }
    next();
  }

  // Test hooks — let integration tests reset state / inspect size
  // without waiting 10 minutes. Not part of the public contract.
  mw._reset = () => store.clear();
  mw._storeSize = () => store.size;
  mw._max = () => max;
  return mw;
}

export const writeRateLimit = makeLimiter({
  name: 'write',
  maxEnv: 'OPS_WRITE_RATE_MAX',
  defaultMax: 30,
});

// Sprint 1.7 — TOTP brute-force defence. /totp/verify previously had no
// limiter, so a logged-in attacker (or a stolen pre-auth session) could
// hammer the 6-digit OTP space at network speed (10⁶ → ~hours per user).
// 8 attempts / 60s default — enough headroom for a typo-prone operator
// retyping a code, low enough to keep brute-force impractical. Override
// via OPS_TOTP_RATE_MAX. Same limiter applied to /totp/enroll + change-pwd.
export const totpVerifyRateLimit = makeLimiter({
  name: 'totp',
  maxEnv: 'OPS_TOTP_RATE_MAX',
  defaultMax: 8,
});

export const saveRateLimit = makeLimiter({
  name: 'save',
  maxEnv: 'OPS_SAVE_RATE_MAX',
  defaultMax: 120,
});

// Chat send — per-IP cap on message POSTs. Generous because a typing
// conversation averages 10-20 msg/min; we only care about stopping
// bots / runaway scripts. 30/min = 300/10min default.
export const chatSendRateLimit = makeLimiter({
  name: 'chat',
  maxEnv: 'OPS_CHAT_RATE_MAX',
  defaultMax: 300,
});

// ─────────────────────────────────────────────────────────────────────
// v1.3 P0 — Per-USER rate limit (keyed by req.user.id thay vì IP).
//
// Why: Trong môi trường LAN office, 20 user có thể share cùng NAT/proxy
// → tất cả share chung quota per-IP → user thứ 13 trong cùng phút bị 429
// dù mới save 1 quote. Per-user rate limit giải quyết bằng cách track
// counter per req.user.id (set bởi authMiddleware).
//
// Behavior:
//   - Nếu req.user.id tồn tại → dùng nó làm key
//   - Nếu không có (e.g. unauthenticated request) → fall back to IP
//     để tránh bypass auth
//   - Window 10 min giống IP limiter
//
// Default 60/user/10min (= 6/min/user) — đủ cho power user, vẫn chặn
// runaway script. Override qua OPS_USER_SAVE_RATE_MAX.
// ─────────────────────────────────────────────────────────────────────
function makeUserLimiter({ name, maxEnv, defaultMax }) {
  const store = new Map();
  const max = resolveMax(maxEnv, defaultMax);

  function evictIfFull(now) {
    if (store.size < STORE_MAX) return;
    for (const [k, entry] of store) {
      if (now > entry.resetAt) store.delete(k);
      if (store.size < STORE_MAX) return;
    }
    const live = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDrop = Math.max(1, Math.floor(STORE_MAX * 0.1));
    for (let i = 0; i < toDrop && i < live.length; i++) {
      store.delete(live[i][0]);
    }
  }

  function mw(req, res, next) {
    // Key preference: user.id > user.username > IP fallback
    const u = req.user?.user || req.user;
    const userKey = u?.id != null ? `u:${u.id}` : u?.username ? `u:${u.username}` : null;
    const key = userKey || `ip:${clientIp(req)}`;

    const now = Date.now();
    evictIfFull(now);
    const entry = store.get(key) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + WINDOW_MS;
    }
    entry.count++;
    store.set(key, entry);

    if (entry.count > max) {
      return res.status(429).json({
        ok: false,
        error: `Rate limit exceeded: ${max} ${name} ops per 10 min per user`,
        retry_after_ms: Math.max(0, entry.resetAt - now),
        scope: userKey ? 'user' : 'ip',
      });
    }
    next();
  }

  mw._reset = () => store.clear();
  mw._storeSize = () => store.size;
  mw._max = () => max;
  return mw;
}

// 60 saves / user / 10 min = 6 saves/min — generous for normal editing,
// catches runaway scripts. Apply on save endpoints AFTER authMiddleware.
export const userSaveRateLimit = makeUserLimiter({
  name: 'user-save',
  maxEnv: 'OPS_USER_SAVE_RATE_MAX',
  defaultMax: 60,
});

// 30 writes / user / 10 min — for bulk imports, library updates, etc.
export const userWriteRateLimit = makeUserLimiter({
  name: 'user-write',
  maxEnv: 'OPS_USER_WRITE_RATE_MAX',
  defaultMax: 30,
});

// Chat edit/delete — lower cap because genuine usage should be a
// handful per session ("typo fix" + "oops wrong channel"). A script
// hammering these is either testing our 15-min window or probing
// for authz bugs, neither of which needs to run fast. 60/10min.
export const chatEditRateLimit = makeLimiter({
  name: 'chat-edit',
  maxEnv: 'OPS_CHAT_EDIT_RATE_MAX',
  defaultMax: 60,
});
