/**
 * Auth Service — ported from Python server.py
 * In-memory sessions, bcrypt password hashing, TOTP, rate limiting
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteFileSync } from './atomicWrite.js';
import { escapeCsvCell } from '../utils/csvSafe.js';

// ── Configuration ──
const SESSION_TTL = 28800; // 8 hours — default when remember=false
// Sprint 1.6 — "Remember me" checkbox extends the TTL to 30 days. Tied
// here so createSession + cookie maxAge stay in sync.
const REMEMBER_SESSION_TTL = 30 * 24 * 60 * 60; // 30 days
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60; // seconds
const MAX_AUDIT_LOG = 500;
const ONLINE_TTL = 90; // seconds

// ── In-memory stores ──
const _sessions = new Map();
const _rateLimit = new Map();
const _auditLog = [];
const _onlineUsers = new Map();

// ── Paths ──
let LIB_DIR = '';
let USERS_DIR = '';
let DATA_DIR = '';

export function init(dataDir) {
  DATA_DIR = dataDir;
  LIB_DIR = path.join(dataDir, 'Library');
  USERS_DIR = path.join(LIB_DIR, 'Users');
  // Ensure directories exist
  for (const d of [
    USERS_DIR,
    path.join(LIB_DIR, 'QuoteHistory'),
    path.join(LIB_DIR, 'SummarizeDB'),
    path.join(LIB_DIR, 'MaterialCost'),
    path.join(LIB_DIR, 'Rate'),
    path.join(LIB_DIR, 'Rate', 'backups'),
    path.join(LIB_DIR, 'DDL'),
    path.join(LIB_DIR, 'DDL', 'backups'),
    path.join(LIB_DIR, 'RFQTracker'),
    path.join(LIB_DIR, 'SampleTracking'),
    path.join(LIB_DIR, 'Finance'),
    path.join(LIB_DIR, 'InkCalc'),
    path.join(dataDir, 'Products layout'),
    path.join(dataDir, 'Backup', 'Data'),
    path.join(dataDir, 'Backup', 'Code'),
    path.join(LIB_DIR, 'ReleasedQuotation'),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
  // Session restore on boot — gated by OPS_PERSIST_SESSIONS.
  //
  // Default behavior (flag unset or !=1): DO NOT restore. Every server
  // restart forces a fresh login. This matches operator expectation
  // for a locally-deployed ERP and gives admins a cheap "kick all
  // sessions" primitive (just bounce the process). We still WRITE
  // sessions.json during runtime for post-mortem/audit use, but never
  // read it back on start.
  //
  // Legacy behavior (flag=1): hydrate active sessions from disk so a
  // rolling deploy doesn't log everyone out mid-work. Suitable for a
  // multi-user production with patched-in-place deployments.
  if (process.env.OPS_PERSIST_SESSIONS === '1') {
    // Deprecation notice — this flag is legacy. New deployments should
    // leave it unset; every restart should force fresh login. Kept as
    // an opt-in for blue/green rolling deploys that can't tolerate a
    // short re-auth storm.
    console.warn(
      '  ⚠️  OPS_PERSIST_SESSIONS=1 is DEPRECATED — sessions will survive restart, which weakens the "bounce to kick all sessions" primitive. Prefer leaving this unset.'
    );
    try {
      const fp = sessionsPath();
      if (fs.existsSync(fp)) {
        const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (raw && typeof raw === 'object') {
          const nowSec = Date.now() / 1000;
          // Hard cap: reject sessions older than 24h regardless of
          // their stored expires_at. Defends against (a) clock skew
          // that made a long-expired session look live, and (b) a
          // manual file copy trying to smuggle in old tokens after
          // a secret rotation. Tunable via OPS_SESSION_MAX_AGE_SEC.
          const maxAgeSec = Number(process.env.OPS_SESSION_MAX_AGE_SEC) || 24 * 60 * 60;
          const ageFloor = nowSec - maxAgeSec;
          let loaded = 0,
            rejected = 0;
          for (const [tok, sess] of Object.entries(raw)) {
            if (!sess || typeof sess !== 'object') continue;
            if (sess.expires_at <= nowSec) continue;
            // Reject if created_at missing OR older than max age.
            // Missing created_at on legacy records → treat as stale.
            const createdAt = Number(sess.created_at);
            if (!Number.isFinite(createdAt) || createdAt < ageFloor) {
              rejected++;
              continue;
            }
            _sessions.set(tok, sess);
            loaded++;
          }
          if (loaded > 0)
            console.log(
              `  🔓  Restored ${loaded} active session(s) from disk (OPS_PERSIST_SESSIONS=1)`
            );
          if (rejected > 0)
            console.log(`  🚫  Rejected ${rejected} session(s) older than max-age (${maxAgeSec}s)`);
        }
      }
    } catch (err) {
      console.warn('  ⚠️  Failed to restore sessions:', err.message);
    }
  } else {
    // Wipe sessions.json at boot so a stale file can't surface old
    // tokens via a subsequent flag flip or manual copy.
    try {
      const fp = sessionsPath();
      if (fs.existsSync(fp)) fs.writeFileSync(fp, '{}');
    } catch {
      /* non-fatal */
    }
    console.log('  🔒  Sessions not restored from disk — login required on every start');
  }
  // Hydrate audit log from disk so restart doesn't blank it.
  try {
    const fp = path.join(USERS_DIR, 'audit_log.json');
    if (fs.existsSync(fp)) {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const e of raw.slice(-MAX_AUDIT_LOG)) _auditLog.push(e);
        if (_auditLog.length > 0)
          console.log(
            `  📋  Restored ${_auditLog.length} audit entr${_auditLog.length === 1 ? 'y' : 'ies'} from disk`
          );
      }
    }
  } catch (err) {
    console.warn('  ⚠️  Failed to restore audit log:', err.message);
  }
  // Validate users.json shape at boot — catches file corruption early
  // instead of silently serving a broken login flow.
  try {
    const fp = path.join(USERS_DIR, 'users.json');
    if (fs.existsSync(fp)) {
      const users = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (!Array.isArray(users)) {
        console.warn('  ⚠️  users.json is not an array — auth will fail until fixed');
      } else {
        const ids = new Set();
        const usernames = new Set();
        let bad = 0;
        for (const u of users) {
          if (
            !u ||
            typeof u !== 'object' ||
            typeof u.id !== 'number' ||
            typeof u.username !== 'string'
          )
            bad++;
          else {
            if (ids.has(u.id)) console.warn(`  ⚠️  duplicate user id=${u.id} in users.json`);
            if (usernames.has(u.username.toLowerCase()))
              console.warn(`  ⚠️  duplicate username "${u.username}" in users.json`);
            ids.add(u.id);
            usernames.add(u.username.toLowerCase());
          }
        }
        if (bad > 0) console.warn(`  ⚠️  users.json has ${bad} malformed record(s)`);
        const sysCount = users.filter((u) => u && u.role === 'sys').length;
        if (sysCount === 0)
          console.warn('  ⚠️  No sys-role user exists — recovery will require manual file edit');
      }
    }
  } catch (err) {
    console.warn('  ⚠️  users.json integrity check failed:', err.message);
  }
  // Start session cleanup. unref() so the timer doesn't keep the event
  // loop alive — without it, tests that boot the app never exit because
  // the interval runs forever. In production the http listener is
  // what keeps the process alive, so unref'ing this timer is a no-op.
  setInterval(cleanupSessions, 600000).unref(); // every 10 min
}

function sessionsPath() {
  return path.join(USERS_DIR, 'sessions.json');
}

// Debounced session persistence — write at most once every 2s. Called
// whenever _sessions changes. Individual write is atomic; contention is
// safe because every write contains the full current state.
//
// Phase 9G.3 — added `persistSessionsNow` for cases where durability
// must be immediate (logout, token revoke). Without it, a server crash
// within the 2-s debounce window would resurrect a logged-out session
// at next boot — a small but real security gap.
let _sessionWriteTimer = null;
function flushSessionsSync() {
  if (!USERS_DIR) return;
  try {
    const obj = {};
    for (const [tok, sess] of _sessions) obj[tok] = sess;
    atomicWriteFileSync(sessionsPath(), JSON.stringify(obj));
  } catch (err) {
    console.warn('  ⚠️  Failed to persist sessions:', err.message);
  }
}
export function persistSessions() {
  if (!USERS_DIR) return;
  if (_sessionWriteTimer) return;
  _sessionWriteTimer = setTimeout(() => {
    /* keep default ref — pending flush should delay exit by ≤2s */
    _sessionWriteTimer = null;
    flushSessionsSync();
  }, 2000);
}
/** Force immediate sync write; cancels any pending debounced timer. */
export function persistSessionsNow() {
  if (_sessionWriteTimer) {
    clearTimeout(_sessionWriteTimer);
    _sessionWriteTimer = null;
  }
  flushSessionsSync();
}

export function getDataDir() {
  return DATA_DIR;
}
export function getLibDir() {
  return LIB_DIR;
}

// ═══════════════════════════════════════════════════════════════
// PASSWORD HELPERS
// ═══════════════════════════════════════════════════════════════

/** Replicate JavaScript authHash() for legacy password compat */
function jsHash(pwd) {
  const s = 'ccl_2024_' + pwd;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (31 * h + s.charCodeAt(i)) | 0; // signed 32-bit
  }
  const hU = h >>> 0; // unsigned
  if (hU === 0) return '0';
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  let r = '';
  let n = hU;
  while (n > 0) {
    r = digits[n % 36] + r;
    n = Math.floor(n / 36);
  }
  return r;
}

/* v1.3 P1.1 — argon2id is now the canonical password hash.
 *
 * Migration ladder (silent, transparent to user):
 *   legacy jsHash  ───►  bcrypt (v1.2)   ───►  argon2id (v1.3)
 *
 * checkPassword() detects format from the hash prefix and verifies
 * accordingly. After ANY successful login, upgradeLegacyPasswordIfNeeded()
 * rehashes the password with argon2id and clears stale fields. Within
 * one login cycle a v1.2 user becomes v1.3-shaped.
 *
 * argon2id parameters tuned for CCL hardware (2026 M-series / Xeon
 * Skylake): m=65536 (64 MiB), t=3, p=4. ≈80 ms/hash, ≥4× harder than
 * bcrypt cost 12 against ASIC + GPU attack. OWASP top recommendation.
 */
let argon2Lib = null;
let bcryptLib = null;

async function loadArgon2() {
  if (argon2Lib) return argon2Lib;
  try {
    argon2Lib = await import('argon2');
    argon2Lib = argon2Lib.default || argon2Lib;
  } catch {
    console.warn('  ⚠️  argon2 not found — falling back to bcrypt only');
  }
  return argon2Lib;
}

async function loadBcrypt() {
  // Kept for backward-compat verify of existing $2a$/$2b$ hashes only.
  // New hashes always use argon2id.
  if (bcryptLib) return bcryptLib;
  try {
    bcryptLib = await import('bcryptjs');
    bcryptLib = bcryptLib.default || bcryptLib;
  } catch {
    console.warn('  ⚠️  bcryptjs not found — legacy hashes unverifiable');
  }
  return bcryptLib;
}

const ARGON2_OPTS = {
  type: 2, // argon2id (timing- and side-channel-resistant)
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export async function bcryptHash(plain) {
  // Name kept for ABI compat with v1.2 callers (server/index.js,
  // changePassword, createUser); now produces an argon2id hash.
  const a = await loadArgon2();
  if (a) return a.hash(plain, ARGON2_OPTS);
  // Last-resort fallback if argon2 native binding failed to load
  // (e.g., dev workstation without rebuild). Degrades to bcryptjs.
  const bc = await loadBcrypt();
  if (!bc) return null;
  const cost = Math.max(10, Math.min(15, Number(process.env.OPS_BCRYPT_COST) || 12));
  return bc.hashSync(plain, cost);
}

function isArgonHash(h) {
  return typeof h === 'string' && h.startsWith('$argon2');
}
function isBcryptHash(h) {
  return typeof h === 'string' && /^\$2[aby]\$/.test(h);
}

async function verifyHash(plain, hashed) {
  if (!hashed) return false;
  if (isArgonHash(hashed)) {
    const a = await loadArgon2();
    if (!a) return false;
    try {
      return await a.verify(hashed, plain);
    } catch {
      return false;
    }
  }
  if (isBcryptHash(hashed)) {
    const bc = await loadBcrypt();
    if (!bc) return false;
    try {
      return bc.compareSync(plain, hashed);
    } catch {
      return false;
    }
  }
  return false;
}

export async function checkPassword(user, plain) {
  const pwdBcrypt = user.pwd_bcrypt || '';
  if (pwdBcrypt) return verifyHash(plain, pwdBcrypt);
  // Legacy 32-bit non-crypto hash — one-time use, immediately upgraded.
  return (user.pwd || '') === jsHash(plain);
}

/**
 * v1.3 password migration ladder. Called from the login success path
 * after `checkPassword` returns true with the verified plaintext. Silent
 * to the user, idempotent under concurrent logins.
 *
 *   legacy jsHash       ─►  argon2id   (was bcrypt in v1.2)
 *   $2a$/$2b$ bcrypt    ─►  argon2id   (NEW in v1.3)
 *   $argon2id           ─►  no-op
 *
 * Hash is computed OUTSIDE the file lock — argon2 is CPU heavy
 * (≈80 ms) and doesn't need exclusive access. Only read-modify-write
 * is serialised.
 */
export async function upgradeLegacyPasswordIfNeeded(userId, plain) {
  try {
    let upgradedUsername = null;
    let upgradedFrom = null;
    let newHash = null;
    await updateUsers(async (users) => {
      const idx = users.findIndex((u) => Number(u.id) === Number(userId));
      if (idx === -1) return;
      const u = users[idx];
      if (isArgonHash(u.pwd_bcrypt)) return; // already on the canonical hash
      // Hash outside the lock by deferring; here we just decide.
      if (!newHash) {
        newHash = await bcryptHash(String(plain)); // produces argon2id (Sprint v1.3)
        if (!newHash) return;
      }
      upgradedFrom = isBcryptHash(u.pwd_bcrypt) ? 'bcrypt' : u.pwd ? 'legacy-jsHash' : 'unknown';
      users[idx] = { ...u, pwd_bcrypt: newHash };
      delete users[idx].pwd;
      upgradedUsername = u.username;
    });
    if (upgradedUsername) {
      console.log(`  🔐  rehashed ${upgradedFrom} → argon2id for user ${upgradedUsername}`);
      return true;
    }
    return false;
  } catch (e) {
    console.warn(`  ⚠️   password rehash failed:`, e.message);
    return false;
  }
}

/**
 * Password age policy (Phase 10L). ERP deploys expect enforced
 * rotation — default is 90 days, override with env. The login screen
 * surfaces a colored bar (green / orange / red) based on the ratio
 * of days remaining to the full window so users can tell at a glance
 * whether a change is overdue.
 */
export function pwdMaxAgeDays() {
  const raw = Number(process.env.OPS_PWD_MAX_AGE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

/**
 * Compute days-remaining / ratio for a given user record. Robust to
 * missing `lastPwdChange` (legacy users) — those are treated as
 * "never changed" i.e. full age elapsed, urging rotation.
 */
export function computePwdAge(user) {
  const maxDays = pwdMaxAgeDays();
  const max_age_days = maxDays;
  const last = user && user.lastPwdChange ? Date.parse(user.lastPwdChange) : NaN;
  const now = Date.now();
  let days_elapsed;
  if (!Number.isFinite(last)) {
    // Unknown → assume the password is as old as the max window.
    days_elapsed = maxDays;
  } else {
    days_elapsed = Math.max(0, Math.floor((now - last) / 86400000));
  }
  const days_remaining = Math.max(0, maxDays - days_elapsed);
  const ratio_remaining = Math.max(0, Math.min(1, days_remaining / maxDays));
  return { days_elapsed, days_remaining, max_age_days, ratio_remaining };
}

/**
 * Username-only lookup for the login screen's days-remaining bar.
 * Returns null if the username isn't found (keeps the bar hidden
 * rather than confirming the name exists). Deliberately NO
 * authentication — this leaks "how old is that user's password"
 * which is acceptable for an internal ERP. If privacy becomes a
 * concern, require the password too and validate before returning.
 */
export function pwdAgeForUsername(username) {
  const name = String(username || '')
    .trim()
    .toLowerCase();
  if (!name) return null;
  try {
    const users = loadUsers();
    const user = users.find((u) => String(u.username).toLowerCase() === name);
    if (!user) return null;
    return computePwdAge(user);
  } catch {
    return null;
  }
}

/**
 * Boot-time audit: count how many users are still on the legacy hash
 * so ops can see at a glance whether migration is complete. Logged
 * once at startup; operators should aim for zero.
 */
export function auditLegacyPasswords() {
  try {
    const users = loadUsers();
    const legacy = users.filter((u) => !u.pwd_bcrypt && u.pwd).map((u) => u.username);
    if (legacy.length > 0) {
      console.warn(`  ⚠️   ${legacy.length} user(s) still on legacy jsHash: ${legacy.join(', ')}`);
      console.warn(`       They will auto-upgrade to bcrypt on their next login.`);
    }
    return legacy.length;
  } catch {
    return -1;
  }
}

// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function usersPath() {
  return path.join(USERS_DIR, 'users.json');
}

export function loadUsers() {
  const fp = usersPath();
  if (!fs.existsSync(fp)) {
    // First-run seed.
    //
    // v1.3 hardening: every install gets its OWN random password (was
    // a deterministic compile-time string — anyone who decompiled one
    // installer could log into every fresh CCL deploy). The password
    // is written to a sidecar README + still echoed to the console so
    // packaged-Electron and headless installs both have a way to find
    // it. must_change_password=true forces a rotation on first login;
    // v1.3 server enforces that flag (login response carries it; UI
    // redirects to the change-password screen before any data loads).
    const defaultPwd = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    console.log(`\n  ${'='.repeat(55)}`);
    console.log(`  🔑  DEFAULT ADMIN ACCOUNT (first-run seed — random)`);
    console.log(`  Username : Administrator`);
    console.log(`  Password : ${defaultPwd}`);
    console.log(`  ⚠️   CHANGE THIS PASSWORD on first login!`);
    console.log(`  ${'='.repeat(55)}\n`);
    const defaultUsers = [
      {
        id: 1,
        username: 'Administrator',
        role: 'sys',
        pwd: jsHash(defaultPwd),
        lastPwdChange: new Date().toISOString(),
        must_change_password: true,
        permissions: { canDeleteQuote: true },
        full_name: 'Administrator',
        english_name: 'Administrator',
        id_no: '',
        email: '',
        phone: '',
      },
    ];
    saveUsers(defaultUsers);
    // Sidecar README so the operator finds the default credential even
    // if they never see the console (packaged Electron, Windows service).
    try {
      const readmePath = path.join(USERS_DIR, 'README_FIRST_LOGIN.txt');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(
          readmePath,
          `Ops Control — First-run admin credential (per-install RANDOM)
================================================================

This file was created the first time the server started and no
users.json existed. The password below is unique to this install
and was randomly generated. Use it to log in once, then DELETE
this file after you've changed the admin password.

   Username : Administrator
   Password : ${defaultPwd}

Steps after first login:
  1. The server forces a password change immediately
     (must_change_password=true) — set a strong new password
  2. Settings → Account Control → create personal users
  3. Delete this file (README_FIRST_LOGIN.txt)
`,
          'utf-8'
        );
      }
    } catch {
      /* non-fatal */
    }
    return defaultUsers;
  }
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

export function saveUsers(users) {
  atomicWriteFileSync(usersPath(), JSON.stringify(users, null, 2));
}

/**
 * Race-safe read-modify-write for users.json.
 *
 * Why: the raw pattern `const users = loadUsers(); mutate(users); saveUsers(users);`
 * loses updates under concurrency — two simultaneous profile/password
 * writes each see the same snapshot and the second save overwrites the
 * first one's change. This helper serializes them behind `withLock('users')`
 * (in-process mutex + best-effort file lock from asyncLock.js).
 *
 * The `mutator` receives the live array and may mutate in place OR return
 * a new array. If it returns a falsy value the original array is saved.
 * The mutator MAY be async — `withLock` awaits it.
 *
 * Callers that just READ should keep using loadUsers(); this helper is
 * for any path that writes.
 *
 *   await updateUsers(users => {
 *     const u = users.find(x => x.id === myId);
 *     u.email = newEmail;
 *   });
 */
export async function updateUsers(mutator) {
  // Lazy-import to avoid a circular `authService → asyncLock → … → authService`
  // hazard at cold boot. The module is tiny; cost of dynamic import is
  // amortized across every usersWrite after the first.
  const { withLock } = await import('../utils/asyncLock.js');
  return withLock('users', async () => {
    const users = loadUsers();
    const maybeReplacement = await mutator(users);
    const toSave = Array.isArray(maybeReplacement) ? maybeReplacement : users;
    saveUsers(toSave);
    return toSave;
  });
}

export function findUserById(uid) {
  return loadUsers().find((u) => u.id === uid) || null;
}

export function userPublic(u) {
  if (!u) return null;
  const { pwd, pwd_bcrypt, ...pub } = u;
  return pub;
}

// ═══════════════════════════════════════════════════════════════
// ROLE SYSTEM
// ═══════════════════════════════════════════════════════════════

const ROLE_LEVELS = { sys: 5, admin: 4, cost: 3, user: 2, viewonly: 1 };
const VALID_ROLES = ['sys', 'admin', 'cost', 'user', 'viewonly'];

export function roleLevel(u) {
  return ROLE_LEVELS[(u || {}).role] || 0;
}

export function isSys(u) {
  return roleLevel(u) >= 5;
}
export function isAdminPlus(u) {
  return roleLevel(u) >= 4;
}
export function canWrite(u) {
  return roleLevel(u) >= 2;
}

/**
 * Route-level writer gate — one-line replacement for the pattern
 *
 *   const cu = getSessionUser(getTokenFromHeader(req));
 *   if (!cu) return res.status(401).json({ error: 'Unauthorized' });
 *   if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
 *
 * repeated across ~20 mutating routes. Returns the session user when
 * the caller is authenticated AND not view-only; otherwise SENDS the
 * rejection response and returns null. Call sites:
 *
 *   const cu = requireWriter(req, res);
 *   if (!cu) return; // response already sent
 *
 * Centralizing this fixes a consistency bug (some routes rejected
 * viewonly, some didn't) and makes adding future role checks one
 * place to edit.
 */
export function requireWriter(req, res) {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (cu.role === 'viewonly') {
    res.status(403).json({ ok: false, msg: 'View Only' });
    return null;
  }
  return cu;
}

export { VALID_ROLES, ROLE_LEVELS };

// ═══════════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════════

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(
  userId,
  { ttl, remember = false, totpVerified = true, totpEnrollmentPending = false } = {}
) {
  if (!ttl) {
    // Resolution order: explicit ttl arg > per-user override > remember-me extension > default 8h.
    // Per-user session_ttl wins over the remember flag because it's an
    // admin-set policy (eg. shared kiosk capped to 1h) — operator's
    // "remember me" preference shouldn't override that lockdown.
    const user = findUserById(userId);
    ttl = user?.session_ttl || (remember ? REMEMBER_SESSION_TTL : SESSION_TTL);
  }
  const tok = genToken();
  const nowSec = Date.now() / 1000;
  _sessions.set(tok, {
    user_id: userId,
    // created_at lets the boot-time max-age check reject stale sessions
    // from a tampered/stolen sessions.json file. Writes that omit it
    // are treated as legacy and rejected on restore (fail-closed).
    created_at: nowSec,
    expires_at: nowSec + ttl,
    ttl,
    totp_verified: totpVerified,
    // totp_enrollment_pending: user MUST set up 2FA before full app
    // access. Set when role requires TOTP but no secret file entry
    // exists. Session can ONLY call /api/totp/secret (first enrollment)
    // + /api/totp/verify (to finalize). getSessionUser() still rejects
    // until totp_verified=true.
    totp_enrollment_pending: totpEnrollmentPending,
  });
  persistSessions();
  return tok;
}

// ── Role-based 2FA policy ──────────────────────────────────────────
// Reads OPS_REQUIRE_2FA_ROLES env var (comma-separated) with a safe
// default of "sys,admin". Lets operators broaden policy without code
// changes (e.g. OPS_REQUIRE_2FA_ROLES=sys,admin,cost).
export function isRoleRequiringTotp(role) {
  if (!role) return false;
  // ?? not || — an explicit empty string OPS_REQUIRE_2FA_ROMES="" means
  // "no roles require TOTP" (used by tests). Using || would fall back
  // to the default and accidentally enforce TOTP in the test harness.
  const raw = (process.env.OPS_REQUIRE_2FA_ROLES ?? 'sys,admin').trim();
  const required = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return required.includes(String(role).toLowerCase());
}

// Computed decision: must THIS user have TOTP?
//   1. Role is in OPS_REQUIRE_2FA_ROLES (deployment-wide policy), OR
//   2. Per-user flag user.totp_required === true (admin UI override).
// Explicit false on the user cannot disable the role policy — that's
// by design (ERP compliance: "sys users must have 2FA, no exceptions").
export function userMustHaveTotp(user) {
  if (!user) return false;
  if (user.totp_required === true) return true;
  return isRoleRequiringTotp(user.role);
}

export function getSessionUser(token) {
  if (!token) return null;
  const s = _sessions.get(token);
  if (!s) return null;
  if (Date.now() / 1000 > s.expires_at) {
    _sessions.delete(token);
    return null;
  }
  if (!s.totp_verified) return null;
  return findUserById(s.user_id);
}

export function getPreauthSession(token) {
  if (!token) return [null, null];
  const s = _sessions.get(token);
  if (!s) return [null, null];
  if (Date.now() / 1000 > s.expires_at) {
    _sessions.delete(token);
    return [null, null];
  }
  return [s, findUserById(s.user_id)];
}

export function deleteSession(token) {
  _sessions.delete(token);
  // Phase 9G.3 — durability over batching: logout should survive an
  // immediate crash. persistSessionsNow() flushes synchronously.
  persistSessionsNow();
}

/**
 * Return a redacted list of active sessions for sys-admin inspection.
 * Hides tokens (shows only a short prefix). Includes expiry + TOTP status.
 */
export function listActiveSessions() {
  const now = Date.now() / 1000;
  const rows = [];
  for (const [tok, sess] of _sessions) {
    if (sess.expires_at <= now) continue;
    const user = findUserById(sess.user_id);
    rows.push({
      token_prefix: tok.slice(0, 8),
      user_id: sess.user_id,
      username: user?.username || '?',
      role: user?.role || '?',
      expires_at: new Date(sess.expires_at * 1000).toISOString(),
      totp_verified: !!sess.totp_verified,
    });
  }
  return rows;
}

/**
 * Revoke every active session for a given user_id. Called after password
 * change/reset so stolen/cached tokens stop working. The user will be
 * forced to re-login with the new password.
 *
 * Pass `exceptToken` to preserve one session (the current one, so a user
 * who changes their own password doesn't get kicked out mid-flow).
 *
 * Returns the number of sessions killed.
 */
export function revokeSessionsForUser(userId, exceptToken = null) {
  let killed = 0;
  for (const [tok, sess] of _sessions) {
    if (sess.user_id === userId && tok !== exceptToken) {
      _sessions.delete(tok);
      killed++;
    }
  }
  // Phase 9G.3 — force-revoke (password reset / role change) must be
  // durable across a crash; use the sync variant.
  if (killed > 0) persistSessionsNow();
  return killed;
}

function cleanupSessions() {
  const now = Date.now() / 1000;
  let count = 0;
  for (const [tok, s] of _sessions) {
    if (s.expires_at < now) {
      _sessions.delete(tok);
      count++;
    }
  }
  if (count > 0) {
    console.log(`  🧹  Cleaned ${count} expired sessions`);
    persistSessions();
  }
}

/**
 * Read the session token from request cookies OR Authorization header.
 * Name retained as `getTokenFromHeader` for back-compat with existing
 * consumers; the behavior is now cookie-first (Phase 9H) with header
 * fallback. Callers that need to know which path was used should
 * import `readSessionToken` from utils/authCookie directly.
 */
export function getTokenFromHeader(req) {
  // Inline the two-step lookup to avoid circular imports (authCookie
  // utility is a leaf; services/authService is mid-tier). The logic
  // mirrors readSessionToken() in utils/authCookie.js — keep them in
  // sync if either changes.
  const cookieHeader = (req.headers && req.headers.cookie) || '';
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const k = part.slice(0, eq).trim();
      if (k === 'ops_session') {
        const v = part.slice(eq + 1).trim();
        try {
          return decodeURIComponent(v) || null;
        } catch {
          return v || null;
        }
      }
    }
  }
  const auth = (req.headers && req.headers.authorization) || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════

export function checkRateLimit(ip) {
  const now = Date.now() / 1000;
  const entry = _rateLimit.get(ip);
  if (!entry || now - entry.window_start > RATE_LIMIT_WINDOW) {
    _rateLimit.set(ip, { count: 1, window_start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── Per-username login lockout (Phase 10H) ───
// Per-IP limit (above) is cheap but can't distinguish "one attacker
// brute-forcing user X" from "20 users legitimately logging in from
// corporate NAT". This layer tracks failed attempts per-username and
// escalates the block window: 5 fails → 5 min; 10 fails → 30 min.
// Successful login clears the counter.
//
// Stored in-memory only (Map) — the numbers are advisory, and a
// restart gives users a clean slate, which is the desired behavior
// after ops investigates an incident.
const _loginFails = new Map(); // username (lc) → { count, locked_until }
const LOGIN_FAIL_THRESHOLD_SOFT = 5; // → 5-min block
const LOGIN_FAIL_THRESHOLD_HARD = 10; // → 30-min block
const LOGIN_LOCK_SOFT_MS = 5 * 60 * 1000;
const LOGIN_LOCK_HARD_MS = 30 * 60 * 1000;
// Cap on unique usernames tracked — without this, an attacker can
// cycle through random usernames (all invalid) and bloat the Map
// until the process OOMs. When full, we evict entries whose lockout
// has expired first, then the oldest (least-recently-failed) live
// entries. 10k is generous for CCL's ~500-user base.
const LOGIN_FAIL_MAX_ENTRIES = 10_000;

function evictLoginFailsIfFull() {
  if (_loginFails.size < LOGIN_FAIL_MAX_ENTRIES) return;
  const now = Date.now();
  // Pass 1: drop entries whose lockout (if any) has expired AND have
  // <SOFT count — they're effectively "cleared" already.
  for (const [k, e] of _loginFails) {
    const expired = !e.locked_until || now >= e.locked_until;
    if (expired && e.count < LOGIN_FAIL_THRESHOLD_SOFT) _loginFails.delete(k);
    if (_loginFails.size < LOGIN_FAIL_MAX_ENTRIES) return;
  }
  // Pass 2: prune oldest 10% by insertion order (Map iteration order
  // is insertion order in JS). Cheaper than a full LRU and sufficient
  // for this defensive cap.
  const toDrop = Math.max(1, Math.floor(LOGIN_FAIL_MAX_ENTRIES * 0.1));
  let dropped = 0;
  for (const k of _loginFails.keys()) {
    if (dropped >= toDrop) break;
    _loginFails.delete(k);
    dropped++;
  }
}

/**
 * Returns `{ allowed: true }` if the username can attempt login now,
 * or `{ allowed: false, retry_after_ms }` if they're locked out.
 * Call this BEFORE bcrypt verification (it's the cheap path).
 */
export function checkLoginLockout(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase();
  if (!key) return { allowed: true };
  const entry = _loginFails.get(key);
  if (!entry) return { allowed: true };
  const now = Date.now();
  if (entry.locked_until && now < entry.locked_until) {
    return { allowed: false, retry_after_ms: entry.locked_until - now };
  }
  return { allowed: true };
}

/** Record a failed login. Escalates the lockout window at thresholds. */
export function recordLoginFailure(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase();
  if (!key) return;
  const now = Date.now();
  // Evict BEFORE set() so a flood of unique usernames (attacker trying
  // to OOM us via the Map) can't grow it beyond the cap.
  evictLoginFailsIfFull();
  const entry = _loginFails.get(key) || { count: 0, locked_until: 0 };
  entry.count++;
  if (entry.count >= LOGIN_FAIL_THRESHOLD_HARD) {
    entry.locked_until = now + LOGIN_LOCK_HARD_MS;
  } else if (entry.count >= LOGIN_FAIL_THRESHOLD_SOFT) {
    entry.locked_until = now + LOGIN_LOCK_SOFT_MS;
  }
  _loginFails.set(key, entry);
}

/** Clear failure state on successful login. */
export function clearLoginFailures(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase();
  if (!key) return;
  _loginFails.delete(key);
}

/** Test hook — reset all lockout state. */
export function _resetLoginLockouts() {
  _loginFails.clear();
}
/** Test hook — current tracked-usernames count. */
export function _loginFailsSize() {
  return _loginFails.size;
}
/** Test hook — cap exposed for assertions. */
export const _LOGIN_FAIL_MAX_ENTRIES = LOGIN_FAIL_MAX_ENTRIES;

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════

function auditPath() {
  return USERS_DIR ? path.join(USERS_DIR, 'audit_log.json') : null;
}

let _auditWriteTimer = null;
function persistAuditLog() {
  if (!USERS_DIR) return;
  if (_auditWriteTimer) return;
  _auditWriteTimer = setTimeout(() => {
    _auditWriteTimer = null;
    try {
      atomicWriteFileSync(auditPath(), JSON.stringify(_auditLog));
    } catch (err) {
      console.warn('  ⚠️  Failed to persist audit log:', err.message);
    }
  }, 2000);
}

export function audit(event, user = '-', ip = '-', detail = '') {
  const row = {
    ts: new Date().toISOString(),
    event,
    user,
    ip,
    detail,
  };
  // Sprint 30: dual-write to SQLite via fail-open async path. The
  // in-memory ring + file fallback still capture the entry even if
  // the DB is missing or the import fails.
  _auditDualWrite(row);
  _auditLog.push(row);
  if (_auditLog.length > MAX_AUDIT_LOG) _auditLog.shift();
  persistAuditLog();
}

let _auditStoreModule = null;
function _auditDualWrite(row) {
  if (_auditStoreModule === false) return; // cached failure
  if (_auditStoreModule && _auditStoreModule.appendAudit) {
    try {
      _auditStoreModule.appendAudit(row);
    } catch {
      /* fail-open */
    }
    return;
  }
  // Lazy-load on first audit call. Swallows import failures so a
  // legacy deploy without the new module keeps working.
  import('../repositories/auditStore.js')
    .then((mod) => {
      _auditStoreModule = mod;
      try {
        mod.appendAudit(row);
      } catch {
        /* fail-open */
      }
    })
    .catch(() => {
      _auditStoreModule = false;
    });
}

/**
 * Return the tail of the audit log (most-recent first). Sprint 30:
 * prefer SQLite when available (no 500-row cap, supports filters);
 * fall back to in-memory ring when SQLite is cold / unavailable.
 *
 * @param {number} [limit=200]
 * @param {{ event?: string, user?: string }} [filter]
 */
export function getAuditLog(limit = 200, filter = {}) {
  const n = Math.max(1, Math.min(limit, 10000));
  // Try SQLite first — synchronous require via cached module.
  if (_auditStoreModule && _auditStoreModule.tailAudit) {
    const rows = _auditStoreModule.tailAudit(n, filter);
    if (rows && rows.length) return rows;
  }
  // Fallback: in-memory (filter client-side).
  let rows = _auditLog.slice().reverse();
  if (filter.event) rows = rows.filter((r) => r.event === filter.event);
  if (filter.user) rows = rows.filter((r) => r.user === filter.user);
  return rows.slice(0, Math.min(n, MAX_AUDIT_LOG));
}

// ═══════════════════════════════════════════════════════════════
// ONLINE PRESENCE
// ═══════════════════════════════════════════════════════════════

export function markOnline(userId, username, role) {
  _onlineUsers.set(userId, { username, role, last_seen: Date.now() / 1000 });
}

export function markOffline(userId) {
  _onlineUsers.delete(userId);
}

export function getOnlineStatus() {
  const now = Date.now() / 1000;
  const users = loadUsers();
  return users
    .map((u) => {
      const presence = _onlineUsers.get(u.id) || {};
      const lastSeen = presence.last_seen || 0;
      return {
        id: u.id,
        username: u.username,
        role: u.role || 'user',
        full_name: u.full_name || u.english_name || '',
        online: now - lastSeen < ONLINE_TTL,
        last_seen: lastSeen ? new Date(lastSeen * 1000).toISOString() : null,
      };
    })
    .sort((a, b) =>
      a.online === b.online ? a.username.localeCompare(b.username) : a.online ? -1 : 1
    );
}

// ═══════════════════════════════════════════════════════════════
// TOTP
// ═══════════════════════════════════════════════════════════════

function totpSecretsPath() {
  return path.join(USERS_DIR, 'totp_secrets.enc');
}

function getAdminHashBytes() {
  const users = loadUsers();
  let admin = users.find(
    (u) => ['sys', 'admin'].includes(u.role) && u.username === 'Administrator'
  );
  if (!admin) admin = users.find((u) => ['sys', 'admin'].includes(u.role));
  return Buffer.from((admin?.pwd || '') + '_totp_v1', 'utf-8');
}

function totpDeriveKey(adminKeyBytes, salt) {
  return crypto.pbkdf2Sync(adminKeyBytes, salt, 100000, 32, 'sha256');
}

// ── v1 (legacy) XOR + HMAC-SHA256 ────────────────────────────────────
function xorStream(data, key) {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 32) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(i));
    const ks = crypto
      .createHash('sha256')
      .update(Buffer.concat([key, counter]))
      .digest();
    for (let j = 0; j < 32 && i + j < data.length; j++) {
      out[i + j] = data[i + j] ^ ks[j];
    }
  }
  return out;
}

function loadV1(enc) {
  const adminKb = getAdminHashBytes();
  const salt = Buffer.from(enc.salt, 'base64');
  const nonce = Buffer.from(enc.nonce, 'base64');
  const mac = Buffer.from(enc.mac, 'base64');
  const ct = Buffer.from(enc.data, 'base64');
  const key = totpDeriveKey(adminKb, Buffer.concat([salt, nonce]));
  const expectedMac = crypto.createHmac('sha256', key).update(ct).digest();
  if (mac.length !== expectedMac.length || !crypto.timingSafeEqual(mac, expectedMac)) {
    throw new Error('v1 HMAC mismatch');
  }
  return JSON.parse(xorStream(ct, key).toString('utf-8'));
}

// ── v2 (current) ChaCha20-Poly1305 AEAD via Node crypto ─────────────
// Master key preference:
//   1. OPS_TOTP_KEY env var (hex, 32 bytes = 64 hex chars). Recommended.
//   2. Derived from admin hash (backwards compat only, weak if pw is).
//      This path exists so a fresh deploy without setting OPS_TOTP_KEY
//      still works — ops can migrate to the env-var key later by
//      re-saving the secrets file.
// Both derivation paths produce a 32-byte key; nonce is 12 bytes random
// per save, auth tag is 16 bytes. AEAD prevents XOR/keystream attacks.
function getV2MasterKey() {
  const envKey = process.env.OPS_TOTP_KEY || '';
  if (envKey.length >= 64) {
    try {
      const k = Buffer.from(envKey.slice(0, 64), 'hex');
      if (k.length === 32) return k;
    } catch {
      /* fall through */
    }
  }
  // Fallback: derive from admin hash. Keeps deploy-without-setup working.
  const adminKb = getAdminHashBytes();
  return crypto.pbkdf2Sync(
    adminKb,
    Buffer.from('ops-totp-v2-kdf-salt', 'utf-8'),
    200000,
    32,
    'sha256'
  );
}

function loadV2(enc) {
  const key = getV2MasterKey();
  const nonce = Buffer.from(enc.nonce, 'base64');
  const ct = Buffer.from(enc.data, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  // Optional AAD: binds the version + salt so ciphertext from v1 cannot
  // be replayed as v2.
  if (enc.aad) decipher.setAAD(Buffer.from(enc.aad, 'base64'));
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(plaintext.toString('utf-8'));
}

function saveV2(secretsDict) {
  const key = getV2MasterKey();
  const nonce = crypto.randomBytes(12);
  const aad = Buffer.from('ops-totp-v2', 'utf-8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(secretsDict), 'utf-8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 2,
    alg: 'aes-256-gcm',
    nonce: nonce.toString('base64'),
    data: ct.toString('base64'),
    tag: tag.toString('base64'),
    aad: aad.toString('base64'),
  };
}

// ── v3 (current) adds a key fingerprint so we can distinguish
//    "wrong OPS_TOTP_KEY" from "file truly corrupt" at load time.
//    Fingerprint = first 16 bytes of HMAC-SHA256(key, 'ops-totp-fp-v1').
//    That's a one-way derivation — publishing it doesn't leak the key
//    (HMAC with a fixed label is pre-image-resistant) — but it lets us
//    compare a new key against what the file was written with. ─────────
function keyFingerprint(key) {
  return crypto.createHmac('sha256', key).update('ops-totp-fp-v1').digest().subarray(0, 16);
}

function saveV3(secretsDict) {
  const key = getV2MasterKey(); // same key derivation as v2
  const nonce = crypto.randomBytes(12);
  const aad = Buffer.from('ops-totp-v3', 'utf-8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(secretsDict), 'utf-8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 3,
    alg: 'aes-256-gcm',
    fp: keyFingerprint(key).toString('base64'),
    nonce: nonce.toString('base64'),
    data: ct.toString('base64'),
    tag: tag.toString('base64'),
    aad: aad.toString('base64'),
  };
}

// Distinct error classes so the caller can surface the right message
// (admin actionable) instead of lumping all failures together.
export class TotpWrongKeyError extends Error {
  constructor() {
    super('TOTP key does not match the one used to encrypt the file');
    this.code = 'TOTP_WRONG_KEY';
  }
}
export class TotpCorruptError extends Error {
  constructor(msg) {
    super(`TOTP file corrupt: ${msg}`);
    this.code = 'TOTP_CORRUPT';
  }
}

function loadV3(enc) {
  const key = getV2MasterKey();
  // Cheap pre-check: compare the key fingerprint before trying AEAD.
  // If mismatch, we know this is a KEY issue (not random corruption).
  if (enc.fp) {
    const expectedFp = keyFingerprint(key).toString('base64');
    if (expectedFp !== enc.fp) throw new TotpWrongKeyError();
  }
  try {
    const nonce = Buffer.from(enc.nonce, 'base64');
    const ct = Buffer.from(enc.data, 'base64');
    const tag = Buffer.from(enc.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    if (enc.aad) decipher.setAAD(Buffer.from(enc.aad, 'base64'));
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plaintext.toString('utf-8'));
  } catch (e) {
    // Fingerprint matched but AEAD failed → bit-rot / truncation / tampering.
    throw new TotpCorruptError(e.message);
  }
}

// Public: expose the current key's fingerprint so /health and the
// reset-totp CLI can compare. 16-byte hex is short enough to log.
export function getTotpKeyFingerprint() {
  try {
    return keyFingerprint(getV2MasterKey()).toString('hex');
  } catch {
    return null;
  }
}

// Sprint 40: fail-CLOSED sentinel. When the TOTP secrets file exists
// but can't be decrypted (HMAC mismatch, AEAD tag fail, bad key),
// loadTotpSecrets USED to return `{}` — silently treating every user
// as "no 2FA enrolled". That turned a key-rotation mistake (or the
// Sprint-38 pwd cleanup that broke v1 key derivation) into a full
// 2FA bypass: login handler saw `hasTotp=false` and issued sessions
// with `totpVerified=true`.
//
// Now: on decrypt failure we return a marker the caller recognizes.
// The /auth/login path forces `totpVerified=false` when this marker
// is present, so even users without 2FA cannot log in — fail-secure —
// until the operator fixes the file/key. The TOTP verify endpoint
// will also reject (no secret to compare against), surfacing the
// outage cleanly instead of masking it.
export const TOTP_DECRYPT_FAILED_MARKER = Symbol.for('ops.totp.decrypt_failed');

export function isTotpSecretsUnavailable(dict) {
  return !!dict && dict[TOTP_DECRYPT_FAILED_MARKER] === true;
}

export function loadTotpSecrets() {
  const fp = totpSecretsPath();
  if (!fs.existsSync(fp)) return {};
  try {
    const enc = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    // Version-aware read. Default to v1 if header missing (legacy files).
    const version = Number.isFinite(enc.v) ? enc.v : 1;
    if (version === 3) return loadV3(enc);
    if (version === 2) return loadV2(enc);
    if (version === 1) return loadV1(enc);
    throw new Error(`Unknown TOTP file version: ${version}`);
  } catch (e) {
    // Distinguish recoverable (wrong key — old key exists somewhere)
    // from non-recoverable (file corrupt — need backup / reset). Loud
    // message per case so the ops runbook can pick the right action.
    if (e?.code === 'TOTP_WRONG_KEY') {
      console.error(
        `  🔑  TOTP secrets WRONG KEY: the OPS_TOTP_KEY in .env does not match the one used to encrypt ${fp}. Either restore the old key, or run: npm run reset-totp`
      );
    } else if (e?.code === 'TOTP_CORRUPT') {
      console.error(
        `  💥  TOTP secrets CORRUPT: ${e.message}. Restore from backup or run: npm run reset-totp`
      );
    } else {
      console.error(
        `  🚨  TOTP secrets decrypt FAILED: ${e.message}. Login will fail-secure (all users forced through TOTP) until resolved.`
      );
    }
    audit('TOTP_SECRETS_DECRYPT_FAIL', '-', '-', `${e?.code || 'UNKNOWN'}: ${e?.message || e}`);
    return { [TOTP_DECRYPT_FAILED_MARKER]: true };
  }
}

export function saveTotpSecrets(secretsDict) {
  // All new writes use v3 (AEAD + key fingerprint). Legacy v1/v2 files
  // migrate transparently on the next save — users don't re-enroll.
  const enc = saveV3(secretsDict);
  atomicWriteFileSync(totpSecretsPath(), JSON.stringify(enc, null, 2));
}

/**
 * Race-safe read-modify-write for totp_secrets.enc. See `updateUsers`
 * for the rationale. Critical because two admins rotating each other's
 * secrets at the same second could otherwise clobber one rotation.
 *
 *   await updateTotpSecrets(secs => {
 *     secs[username] = newBase32Secret;
 *   });
 */
export async function updateTotpSecrets(mutator) {
  const { withLock } = await import('../utils/asyncLock.js');
  return withLock('totp_secrets', async () => {
    const secs = loadTotpSecrets();
    // Refuse to write when the file is unavailable (fail-closed marker) —
    // otherwise a "save" during decrypt outage would quietly replace an
    // undecryptable-but-recoverable file with a FRESH encrypted one that
    // no longer contains the real secrets.
    if (isTotpSecretsUnavailable(secs)) {
      throw new Error('TOTP secrets file is unavailable; refusing to write');
    }
    const replacement = await mutator(secs);
    const toSave = replacement && typeof replacement === 'object' ? replacement : secs;
    saveTotpSecrets(toSave);
    return toSave;
  });
}

export function totpVerify(secretB32, token) {
  if (!secretB32) return false;
  try {
    const cleaned = secretB32.toUpperCase().replace(/[\s-]/g, '');
    // Manual base32 decode (Node.js doesn't support base32 natively)
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const c of cleaned) {
      const idx = base32Chars.indexOf(c);
      if (idx < 0) return false;
      bits += idx.toString(2).padStart(5, '0');
    }
    const keyBytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    const keyBuf = Buffer.from(keyBytes);

    const t = String(token || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(t)) return false;
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (let w = -2; w <= 2; w++) {
      const msg = Buffer.alloc(8);
      msg.writeBigUInt64BE(BigInt(counter + w));
      const h = crypto.createHmac('sha1', keyBuf).update(msg).digest();
      const off = h[19] & 0xf;
      const n = (h.readUInt32BE(off) & 0x7fffffff) % 1000000;
      if (String(n).padStart(6, '0') === t) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════

export function safeFn(n) {
  const cleaned = (n || '')
    .replace(/[^\w\s.-]/g, '_')
    .trim()
    .substring(0, 200);
  // Defense-in-depth: `..`, `.`, and bare-dot sequences survive the
  // regex above (the dot char class keeps them). `path.join(root, '..')`
  // then resolves OUTSIDE the jail. Reject dot-only names so every
  // callsite stays inside its intended directory without needing to
  // remember a jail assertion.
  if (cleaned === '' || /^\.+$/.test(cleaned)) return '_';
  return cleaned;
}

const SITE_CSV_KEYS = {
  VN: 'VN',
  '41 RDC': '41RDC',
  '41 Flexo': '41Flexo',
  '55 site': '55site',
  '49 site': '49site',
  '54 site': '54site',
  India: 'India',
};

export function siteToCsvKey(site) {
  return SITE_CSV_KEYS[site] || site.replace(/[^\w]/g, '');
}

// CSV helpers
// Prefixes CSV formula chars (=+-@) with an apostrophe so cells holding
// user-supplied strings like "=HYPERLINK(...)" can't execute when opened
// in Excel. Delegates to `escapeCsvCell` in csvSafe.js (which also
// handles RFC 4180 quoting for commas/quotes/newlines) so every CSV
// emitter in this codebase — Dashboard streamer + these downloads —
// shares one escape policy. Line endings are CRLF to match Excel.
export function toCsvBytes(headers, rows) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf-8');
}

export function tryNum(v, isInt = false) {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (isNaN(n)) return null;
  return isInt ? Math.floor(n) : n;
}
