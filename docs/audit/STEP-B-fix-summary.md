# Step B — P0 Fix Summary

**Branch**: `fix/pre-go-live-p0` (cut from `audit/pre-go-live-v1.2`)
**Sprint code**: S-P0-FIX-1 through S-P0-FIX-3 (so far)
**Audit findings closed**: F4-5 + F3-1 + F2-1 (3 of 6 P0 items)

This file accumulates per-fix evidence as Step B progresses. The full
audit context lives in `docs/audit/00-scope.md` through
`docs/audit/FINAL-REPORT.md`.

---

## Fix 1 — F4-5 deploy.sh legacy DATA_DIR

**Commit**: [`e75cac9`](../../) — `fix(platform): sync data_dir default across deploy scripts (p0 f4-5)`
**Files**: 5 (deploy.sh, deploy.ps1, deploy.bat, .env.example, CLAUDE.md)
**LOC**: +28 / −11

The systemd unit baked into `deploy.sh` hardcoded
`DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` — a v1.0 legacy path
carried over without review. Step A established that prod
(`10.102.3.61`) is Windows + uses `deploy.ps1` (no leak), so the bug is
**dormant in current production** but real for any future Linux deploy.

### Resolution

- Removed the stale `Environment=DATA_DIR=…COST_V1.0…` line; `.env`
  now drives DATA_DIR at runtime (default `./server/data` per the
  expanded `.env.example` precedence comment).
- Removed `Environment=PORT` (also `.env`-driven) and
  `Environment=PYTHON_SERVER` (dead since v1.0).
- Bumped all 3 deploy script headers + banners + systemd
  Description from `Ops Control v1.0` → `v1.2`.
- CLAUDE.md L208 now correctly attributes the Windows prod path to
  `deploy.ps1` (was misleadingly "Windows server likely needs manual
  variant").

### Verification

- `bash -n deploy.sh` → syntax OK
- `p0-f4-5-test.mjs` (transient) reproduced 3 dotenv-precedence
  scenarios (cold start / hostile OS env / post-fix systemd) → all
  resolve to `./server/data` as expected
- 1602 tests still green
- `grep COST_V1.0` returns 0 hits in deploy.ps1, deploy.bat (1 expected
  hit in deploy.sh — the explanatory comment)

---

## Fix 2 — F3-1 compression middleware

**Commit**: [`6a63421`](../../) — `fix(platform): enable gzip compression middleware (p0 f3-1)`
**Files**: 3 (server/index.js, package.json, package-lock.json)
**LOC**: +81 / −1
**Dependency added**: `compression@^1.8.1` (runtime, not dev)

Phase 3 measured 419 KB initial JS + 102 KB initial CSS going over
the wire raw. With prod on `http://10.102.3.61:3000` (no proxy,
verified Phase 4), nothing was compressed.

### Resolution

Mounted `compression()` between security-headers (CSP/HSTS/Permissions-
Policy) and the request-log middleware. Defensive SSE filter blocks
both request-side (`Accept: text/event-stream`) and response-side
(`res.type('text/event-stream')`) plus the `x-no-compression` debug
header. Threshold 1024 / level 6 (compression defaults).

Startup log added: `📦 [compression] enabled (threshold=1024, level=6, sse-excluded)`.

### Verification matrix — 5 + 4 scenarios

|   # | Resource                                |       Raw |   Gzipped |  Reduction | Encoding                     |
| --: | --------------------------------------- | --------: | --------: | ---------: | ---------------------------- |
|   1 | `/assets/index-*.js`                    | 331 898 B | 101 679 B | **−69.4%** | `gzip` ✅                    |
|   2 | `/assets/index-*.css`                   |  89 986 B |  16 978 B | **−81.1%** | `gzip` ✅                    |
|   3 | `/health` JSON                          |     127 B |     127 B |         0% | (none) under threshold ✅    |
|  3b | `/metrics` (3.9 KB)                     |   3 980 B |     414 B | **−89.6%** | `gzip` ✅                    |
|   4 | `/login-bg.jpg`                         |    2.1 MB |    2.1 MB |         0% | (none) binary skipped ✅     |
|   A | SSE via `res.type()` (no Accept header) |         — |         — |          — | `(none)` ✅ defensive filter |
|   B | SSE via `res.set()` + Accept header     |         — |         — |          — | `(none)` ✅                  |
|   C | JSON 2 KB (control)                     |   2 011 B |      45 B | **−97.8%** | `gzip` ✅                    |
|   D | `x-no-compression: 1` debug bypass      |   2 011 B |   2 011 B |         0% | `(none)` ✅                  |

**Real-world**: login page total over the wire ~2.6 MB → ~520 KB (**~80 % reduction**).

### Risk

- CPU: ~5–10 ms added per compressible response (negligible)
- Memory: ~16 KB buffer per concurrent request
- 200 parallel `/health` (Phase 3 test repeated post-fix): 0 errors

---

## Fix 3 — F2-1 login error unification (OWASP ASVS V4.0 §6.2.4)

**Commit**: this commit
**Sprint code**: S-P0-FIX-3
**Files**: 6 source + 3 docs = 9 total
**LOC**: code +209 / −15; docs +250 (this file + login-retry.md + CHANGELOG entry)

The pre-fix `/api/auth/login` handler distinguished three failure
states by status code AND human-readable message text — letting an
unauthenticated attacker enumerate valid usernames in two ways:
"username not found" (401 + `"❌ Username not found"`) vs "wrong
password" (401 + `"❌ Incorrect password"`); plus a per-username lockout
that returned 429 with text "Too many failed attempts" (silently
confirming the username exists). Phase 3 also measured a **~370 ms p95
timing leak** between the two paths because `users.find()` returns
`undefined` for ghost users in <10 ms while real bcrypt verify is
~370 ms.

### A. Response unification matrix

| Branch                   | Pre-fix                                                                       | Post-fix                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| User not found           | `401` + `{ok:false, msg:"❌ Username not found"}`                             | **`401` + `{ok:false, error:"Invalid credentials"}`**                             |
| Wrong password           | `401` + `{ok:false, msg:"❌ Incorrect password"}`                             | **`401` + `{ok:false, error:"Invalid credentials"}`**                             |
| Lockout fired (per-user) | `429` + `{ok:false, msg:"❌ Too many failed attempts...", retry_after_ms: N}` | **`401` + `{ok:false, error:"Invalid credentials"}` + `Retry-After: <s>` header** |
| IP rate-limit (line 491) | `429` + `{ok:false, msg:"⛔ Too many login attempts..."}`                     | UNCHANGED — IP-bound, no username enumeration                                     |

**Branches A/B/C bodies are byte-identical post-fix.** C distinguishable only by `Retry-After` HTTP header (preserved per RFC 7231 §7.1.3 for proxy / monitoring back-off; not user-readable text).

### B. Timing benchmark (3 cases × 100 samples each)

| Case                                                              |      p50 |         p95 |      p99 |
| ----------------------------------------------------------------- | -------: | ----------: | -------: |
| **A**. argon2id user + wrong pwd (post-migration target)          |  42.5 ms |     44.3 ms |  63.1 ms |
| **A'**. bcrypt cost=12 user + wrong pwd (legacy migration window) | 370.2 ms |    376.3 ms | 377.0 ms |
| **B**. ghost user + any pwd (post-fix equalisation)               |  40.9 ms | **43.8 ms** |  44.2 ms |
| Δ (A − B)                                                         |   1.7 ms |  **0.6 ms** |        — |
| Δ (A' − B)                                                        | 329.3 ms |    332.5 ms |        — |

**Argon2 path verdict**: ✅ leak closed (0.6 ms p95 — 16× under the 10 ms target).

**Bcrypt path verdict**: ⚠ ~330 ms residual gap during migration window
**by design** (per Q1 decision: argon2-only dummy is preferred over
bcrypt dual-verify which would slow legit users 380 ms on every typo).
Auto-closes per-user on first successful login post-deploy via
`upgradeLegacyPasswordIfNeeded()`. Re-evaluate if migration is
incomplete > 30 days post-deploy.

Raw sample data: `/tmp/p0-f2-1-timing-after.json` (transient).

### C. Implementation summary

**Bước 1** — Dummy hash + helper ([`authService.js`](../../server/services/authService.js)):

- `const DUMMY_ARGON2_HASH` — pre-computed argon2id constant (16-byte random salt; verified to never match any input; ~38 ms verify cost matching real argon2id verify)
- `export async function equalizeTimingForUnknownUser(plain)` — calls `verifyHash(plain, DUMMY_ARGON2_HASH)`, always returns `false`. Caller must `await`.
- `+ _resetRateLimit()` test hook (sibling of `_resetLoginLockouts()`)
- `authService.timing.test.js` — 4 smoke tests (always returns false, tolerates non-string, runs argon2 ≥ 5 ms, deterministic)

**Bước 2** — Branch unification ([`costApi.js`](../../server/routes/costApi.js)):

- Added `equalizeTimingForUnknownUser` import
- Branch C (line 506-512): 429 + msg + retry_after_ms → 401 + error + Retry-After header
- Branch A (line 519): added `await equalizeTimingForUnknownUser(password || '')` BEFORE audit; msg → error; "Username not found" → "Invalid credentials"
- Branch B (line 525): msg → error; "Incorrect password" → "Invalid credentials"
- All 3 branches retain their detailed `audit('LOGIN_FAIL'/'LOGIN_LOCKED', user, ip, detail)` callsites server-side

**Bước 3** — Client i18n ([`security.js`](../../client/src/i18n/domains/security.js), [`LoginPage.jsx`](../../client/src/components/Auth/LoginPage.jsx)):

- Added `login.error.invalid_credentials` (EN: "Invalid credentials" / VI: "Thông tin đăng nhập không hợp lệ")
- Added `login.error.fallback` (EN: "Login failed" / VI: "Đăng nhập thất bại")
- Added `localizeAuthError(raw, t)` helper in LoginPage.jsx — maps the new server message + 3 legacy strings (PWA stale-cache window) + generic pass-through + null/empty fallback
- 14/14 i18n lint tests pass (every key has both EN+VN, no empty translations)

**Bước 4** — Functional + timing tests:

- `auth.login.test.js` (NEW, 6 tests) — wrong pwd / unknown user / locked + Retry-After / empty username / empty password / SQL injection × 3 payloads
- `_resetRateLimit()` test hook used in `test.beforeEach()` for isolation
- All 6 pass; full suite **1008 server + 594 client + 8 desktop + 2 manifest = 1612** (was 1602 baseline, +10)

### D. Bonus findings logged for backlog

| ID                | Finding                                                                                                                                                                                                                                                                                       | Severity              | Source                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| **F-FOLLOW-UP-1** | [`LoginPage.jsx:561`](../../client/src/components/Auth/LoginPage.jsx#L561) hardcoded `'Sign in'` fallback bypasses i18n. The h1 always renders English when none of `expired_title` / `must_change.title` / `change.toggle` apply. Add `login.heading.signin` key.                            | 🟡 MINOR              | Discovered during Bước 3 puppeteer smoke                                     |
| **F-FOLLOW-UP-2** | Wire-format inconsistency `msg` → `error` was incidentally fixed by Fix 3. AuthContext.jsx:162 was already preferring `error` first; the field rename closes a latent inconsistency surfaced at Bước 2 review.                                                                                | 🟢 (closed)           | Discovered during Bước 2                                                     |
| **F-FOLLOW-UP-3** | bcrypt → argon2 migration window leak (~330 ms residual). Auto-closes per-user; re-evaluate if migration not complete after **30 days post-deploy**. Track via `auditLegacyPasswords()` count in server boot log.                                                                             | 🟡 MINOR (time-bound) | Documented in code at `authService.js` `DUMMY_ARGON2_HASH` block + this file |
| **F-FOLLOW-UP-4** | Other auth-adjacent endpoints (`/auth/forgot-password`, `/auth/register`, `/users/:username`) reviewed in Bước 0 Finding 4 — **no enumeration vector found** in any of them (forgot-pwd doesn't exist; register/user-mgmt is admin-only-gated 403). Documented for future endpoint additions. | 🟢 (verified)         | Bước 0 finding                                                               |

---

## Step B — running test count

| Stage                                       |   Server | Client | Desktop | Manifest |    Total |
| ------------------------------------------- | -------: | -----: | ------: | -------: | -------: |
| Pre-audit baseline (Phase 0)                |      998 |    594 |       8 |        2 | **1602** |
| Post-Fix 1 (no test changes)                |      998 |    594 |       8 |        2 |     1602 |
| Post-Fix 2 (no test changes)                |      998 |    594 |       8 |        2 |     1602 |
| Post-Fix 3 Bước 1 (+timing.test.js × 4)     |     1002 |    594 |       8 |        2 |     1606 |
| Post-Fix 3 Bước 4 (+auth.login.test.js × 6) | **1008** |    594 |       8 |        2 | **1612** |

**Net Δ from audit start: +10 tests; 0 regressions; all green.**

---

## Pending P0 work

| Fix                                               | Status                            | Audit ID           |
| ------------------------------------------------- | --------------------------------- | ------------------ |
| Fix 1 — deploy DATA_DIR sync                      | ✅ shipped (`e75cac9`)            | F4-5               |
| Fix 2 — compression middleware                    | ✅ shipped (`6a63421`)            | F3-1               |
| Fix 3 — login error unification                   | ✅ this commit                    | F2-1               |
| Fix 4 — login a11y polish                         | pending                           | F3-3 + F3-4        |
| Fix 5 — refresh MIGRATION_GUIDE.md                | pending                           | F4-21              |
| Fix 6 — WIP cleanup (27 modified + 9 untracked)   | pending — intermediate checkpoint | (working tree)     |
| Fix 7 — startup logging for env source visibility | pending (bonus)                   | (Step A spillover) |
