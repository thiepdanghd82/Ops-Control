/**
 * loginAnomaly.js — defensive layer on top of password+TOTP auth.
 *
 * The standard login pipeline already has:
 *   - bcrypt password verify
 *   - per-username lockout after 5/10 failures
 *   - per-IP rate limit on /api/auth/login
 *   - TOTP 2FA (mandatory for admin/sys roles)
 *
 * What it doesn't catch:
 *   1. Same user logging in concurrently from 2+ different IPs (shared
 *      credentials, or session hijack). Lateral movement signal.
 *   2. Login from an IP never seen for this user before — possible
 *      compromise, geolocation drift, VPN change, phishing pivot.
 *   3. Login at unusual hour (3am for someone who's never logged in
 *      outside business hours). Weak signal but useful with #1/#2.
 *
 * Approach: in-process tracking, in-memory state. On LOGIN_OK we
 * record the {user, ip, ts} tuple and compare against history. If
 * any heuristic trips we:
 *   - Stamp an audit event LOGIN_ANOMALY with the reason + IPs
 *   - Emit an SSE 'security.alert' event so admin clients can show a
 *     toast/banner without polling
 *   - Return the anomaly summary so the route handler can include it
 *     in the JSON response (admin client can show "⚠ login từ IP mới"
 *     to the user themselves so they notice if it wasn't them)
 *
 * Storage: per-user history is capped (LAST_N_LOGINS) — restart wipes,
 * which is fine because the audit log on disk is the source of truth
 * for forensics; this module is for live signal detection only.
 *
 * Activation: always on. The thresholds are tuned for low false-
 * positive rate so admin alert fatigue stays low.
 */

import { emitDataChange } from './eventBus.js';

const LAST_N_LOGINS = 10; // per user, in-memory ring
const CONCURRENT_WINDOW_MS = 5 * 60 * 1000; // 5 min window for "concurrent"
const NEW_IP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const UNUSUAL_HOUR_START = 22; // 22:00–06:00 = unusual
const UNUSUAL_HOUR_END = 6;

// userId → [{ ip, ts, hour }]
const _history = new Map();

function pushHistory(userId, entry) {
  const arr = _history.get(userId) || [];
  arr.push(entry);
  if (arr.length > LAST_N_LOGINS) arr.shift();
  _history.set(userId, arr);
}

function isUnusualHour(date) {
  const h = date.getHours();
  if (UNUSUAL_HOUR_START > UNUSUAL_HOUR_END) {
    return h >= UNUSUAL_HOUR_START || h < UNUSUAL_HOUR_END;
  }
  return h >= UNUSUAL_HOUR_START && h < UNUSUAL_HOUR_END;
}

/**
 * Inspect a successful login. Returns { reasons: string[], ips: string[] }.
 * Empty `reasons` means nothing notable; non-empty means at least one
 * heuristic tripped and the route handler should react.
 *
 * `username` is for audit/SSE payload — we key history by userId because
 * usernames can be renamed but IDs are stable.
 */
export function inspectLogin({ userId, username, ip, role }) {
  const now = Date.now();
  const date = new Date(now);
  const arr = _history.get(userId) || [];
  const reasons = [];
  const concurrentIps = new Set();

  // Concurrent multi-IP: any prior entry within the window from a
  // DIFFERENT IP. The new IP is in `ip`; we check arr for others.
  for (const e of arr) {
    if (now - e.ts <= CONCURRENT_WINDOW_MS && e.ip && e.ip !== ip) {
      concurrentIps.add(e.ip);
    }
  }
  if (concurrentIps.size > 0) {
    reasons.push('concurrent_multi_ip');
  }

  // New IP for this user (within 30d lookback). Empty history → first
  // login ever, NOT counted as anomaly (would fire on every new user).
  if (arr.length > 0) {
    const recentIps = new Set(arr.filter((e) => now - e.ts <= NEW_IP_LOOKBACK_MS).map((e) => e.ip));
    if (recentIps.size > 0 && !recentIps.has(ip)) {
      reasons.push('new_ip');
    }
  }

  // Unusual-hour login. Only flag if the user has prior history AND
  // none of the recent logins were in the unusual window — otherwise
  // a night-shift operator gets flagged every night.
  if (arr.length >= 3) {
    const hadUnusualBefore = arr.some((e) => isUnusualHour(new Date(e.ts)));
    if (!hadUnusualBefore && isUnusualHour(date)) {
      reasons.push('unusual_hour');
    }
  }

  // Always update history so subsequent logins compare against this one.
  pushHistory(userId, { ip, ts: now });

  if (reasons.length === 0) {
    return { reasons: [], ips: [] };
  }

  // Surface to admin clients via SSE + return to caller for JSON body.
  const payload = {
    userId,
    username,
    role,
    ip,
    reasons,
    concurrentIps: [...concurrentIps],
    ts: date.toISOString(),
  };
  try {
    emitDataChange('security.alert', payload, { audience: 'admins' });
  } catch {
    /* best-effort */
  }

  return { reasons, ips: [...concurrentIps] };
}

/**
 * Test hook — wipe in-memory state. Production restart does this
 * naturally; tests need explicit control.
 */
export function _resetLoginAnomaly() {
  _history.clear();
}

/** Test hook — read snapshot (defensive copy). */
export function _historyFor(userId) {
  const arr = _history.get(userId);
  return arr ? arr.slice() : [];
}
