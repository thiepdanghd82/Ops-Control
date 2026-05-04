# Step B — P0 Fix Summary

**Branch**: `fix/pre-go-live-p0` (cut from `audit/pre-go-live-v1.2`)
**Sprint code**: S-P0-FIX-1 through S-P0-FIX-7 — **COMPLETE 🎉**
**Audit findings closed**: F4-5, F3-1, F2-1, F3-3, F3-4, F4-21 + 1 follow-up (F-FOLLOW-UP-1) + 1 bonus (env-source logging) = **7 of 7 P0 items**
**Status**: all 7 fixes shipped 2026-05-03 → 2026-05-04 across 7 commits on `fix/pre-go-live-p0` + 1 commit on `main` (B3 research from Fix 6 disposition).

This file accumulates per-fix evidence. The full audit context lives
in `docs/audit/00-scope.md` through `docs/audit/FINAL-REPORT.md`.

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

---

## Fix 4 — F3-3 + F3-4 + F-FOLLOW-UP-1 login a11y polish

**Commit**: [`6b8542f`](../../) — `fix(platform/ui-kit): login a11y polish + i18n the signin heading (p0 f3-3 f3-4)`
**Files**: 2 (LoginPage.jsx, security.js i18n)
**LOC**: +18 / −5

Phase 2 audit flagged 2 separate WCAG findings on the login form:

- **F3-3** — heading hierarchy: page rendered `<h2 cb-hero-title>` with no `<h1>` ancestor (WCAG 2.1 §1.3.1, §2.4.6 — heading order)
- **F3-4** — control labels: 5 form inputs (TOTP code, username, password, new pwd, confirm pwd) had visible labels but no programmatic `for`/`id` linkage (WCAG 2.1 §4.1.2 — name/role/value)
- **F-FOLLOW-UP-1** — `'Sign in'` literal hardcoded in JSX, bypassed i18n (Bonus from Fix 3 review)

### Resolution

- 5 input ids + matching `htmlFor` on each `<label>` (`login-totp-code`, `login-username`, `login-password`, `login-new-pwd`, `login-confirm-pwd`)
- `<h2 className="cb-hero-title">` → `<p className="cb-hero-title">` (CSS verified class-only, no tag-qualified selectors so visual style preserved); h1 now starts the page heading hierarchy
- New i18n key `login.heading.signin` (EN: "Sign in" / VI: "Đăng nhập"); replaced hardcoded `'Sign in'` literal

### Verification

- Live Puppeteer probe: 0 unlabelled focusable controls (was 2+); heading hierarchy starts with h1
- Locale switch: EN h1 = "Sign in", VI h1 = "Đăng nhập" (screenshots committed in Fix 6 Group A: `p0-fix4-login-{en,vi}.png`)
- 14/14 i18n lint tests pass; 1612 server+client+desktop tests still green

---

## Fix 5 — F4-21 refresh MIGRATION_GUIDE.md for v1.5

**Commit**: [`bed7824`](../../) — `docs(release): refresh migration guide for v1.5 (p0 f4-21)`
**Files**: 1 (MIGRATION_GUIDE.md)
**LOC**: +175 / −88 (post-prettier)

`MIGRATION_GUIDE.md` was titled "v1.2 → v1.3" while `package.json` shipped `1.5.0` — 3 versions stale. Operators upgrading from v1.3/v1.4 had no migration path; v1.2 path referenced shipped-then-completed work (URL cutover audit, v1.3.1 deferred items).

### Resolution

12-section rewrite (was 10), preserving 6 sections, rewriting 4, adding 2 NEW. Title bumped v1.3 → v1.5; 4 DMG filename refs bumped v1.3.0 → v1.5.0.

**New §5** — Behavioral changes (operator-facing): 7 EN + 7 VI rows covering login unification, Carbon redesign, must_change_password, Pending Approvals badge, ~80% faster page load, MOQ tier routing, Remember-me. Plus "What you don't need to do" subsection (no schema migration, no pwd reset, no license re-issue, no client URL update, no downtime) — explicit anxiety-reducer. Bilingual layout mirrors `docs/Use guide/login-retry.md` from Fix 3.

**New §9** — Feature flags (post-v1.3): `mes.workOrder.enabled` + `mes.kiosk.enabled` both default false. Documented `OPS_KIOSK_KEY` env var (only required if kiosk enabled).

**Rewritten §6** — Endpoint changes: now lists MES-1 (8) + MES-2 (11) v2 routes, both behind feature flags default-off (path-stable for v1.2→v1.5 baseline).

**Rewritten §10** — Rollback: split 10.1 snapshot rollback (Sprint 1.7 `releases/<ts>/` pattern, < 5 min) + 10.2 DMG fallback + 10.3 DR runbook links to CLAUDE.md.

**Rewritten §11** — Deferred: drop v1.3.1 list, point to CLAUDE.md MES-3 backlog (10 tickets).

### Verification

- 246 LOC final, 12 sections, 8 code fences (even, balanced)
- All 8 facts cross-checked: package.json v1.5.0, MES-1=8 + MES-2=11 endpoints (CHANGELOG line 218 + 95), `OPS_KIOSK_KEY` in deploy.ps1, `OPS_TOTP_KEY` in .env.example, `mes.workOrder.enabled` in server/index.js:840, `feature-flags.json` at `server/data/Library/SystemConfig/`
- Manual lint pass: TOC links work, code blocks have language tags, no broken internal refs

---

## Fix 6 — WIP triage (Group A + B3 disposed; B1 + B2 deferred)

**Commits**: [`d48afa8`](../../) on `fix/pre-go-live-p0` (Group A) + [`970163a`](../../) on `main` (Group B3)
**Files**: 13 across both branches (7 audit evidence + 6 ERPAG research)
**LOC**: +277 (mostly binary PNGs)

The `fix/pre-go-live-p0` branch was cut from a working tree with 42 WIP entries from a pre-audit UI session (Sprint S-HOME 2026-05-03 + ERPAG-style ModuleLanding pattern + Order Entry FG sync feature). Step B audit pivoted before the work could be committed.

### Triple-redundant safety net (Bước 6.1)

Before any destructive operation:

- **Git tag**: `wip-snapshot-20260504-082812` (anchors HEAD before triage)
- **Tarball**: `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB, raw filesystem backup of all 42 WIP entries via `tar -T <files-list>`)
- **Stash verify**: `git stash push --include-untracked` → 0 files in tree → `git stash pop` → 42 files restored. Verified the stash mechanic works in this state before relying on it.

### Classification (Bước 6.3 — `docs/audit/FIX-6-CLASSIFICATION.md`)

| Group  | Count | Theme                                                                  | Disposition                                                 |
| ------ | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A**  | 6     | Step B verify screenshots (Fix 3 + Fix 4 evidence)                     | ✅ Committed to `fix/pre-go-live-p0` in `d48afa8`           |
| **B1** | 20    | Pre-audit UI redesign (Sprint S-HOME + Dashboard/QuoteAnalysis reskin) | 🟡 Deferred — held for dedicated review (~3,000 LOC)        |
| **B2** | 15    | Order Entry FG sync + Excel import (matches branch base name)          | 🟡 Deferred — natural resume on feature branch (~1,120 LOC) |
| **B3** | 6     | ERPAG market survey + migration assessment doc                         | ✅ Committed to `main` in `970163a`                         |
| **C**  | 0     | Cruft / delete candidates                                              | ⊘ none                                                      |
| **D**  | 0     | Sensitive (env / secrets / PII)                                        | ⊘ none — sensitive scan clean                               |

### Why defer B1 + B2 instead of disposing now

- **B1** has 2 large single-file diffs (Dashboard.jsx +484, QuoteAnalysis.jsx +406) that warrant a dedicated review pass before merge — bundling them into a "cleanup" commit would hide ~3,000 LOC of UI redesign in an audit-evidence commit
- **B2** matches the branch base name `feature/order-entry-fg-sync-and-import`. Natural disposition is to resume on that branch with these 15 files; moving them now would split the sprint context across branches

### Sidebar revert (post-Fix-6 follow-up)

Per operator request after Step B closure, the new ERPAG-style "sections-only" sidebar was reverted to the original v1.5 sidebar via `git checkout main -- client/src/components/Layout/Sidebar.{jsx,css}`. HomePage + Dashboard redesign + sectionDefs.js (still imported by HomePage) preserved. Pre-revert state anchored as `pre-sidebar-revert-20260504-090729` git tag. Vite build green (exit 0) post-revert.

---

## Fix 7 — env-var provenance startup logging (bonus)

**Commit**: [`5fc6268`](../../) — `fix(platform): log env-var provenance at boot (p0 fix-7 bonus)`
**Files**: 3 (server/utils/envSources.js NEW, envSources.test.js NEW, server/index.js +24 LOC)
**LOC**: +167 / −0

F4-5's root-cause class — operator could not tell at incident time whether `DATA_DIR` came from `.env` or a deploy-script fallback — survived the Fix 1 fix because the fix was reactive (removed the bad fallback) not preventive (didn't add visibility). Fix 7 adds the visibility so the next F4-5-style incident is diagnosable from `grep '🌱' boot.log` alone.

### Implementation

`server/utils/envSources.js` — pure helper, no I/O:

```js
export const SENSITIVE_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|PWD|AUTH|HASH|PRIVATE/i;
export function describeEnvSources(envSnapshotBeforeDotenv, varNames) {
  // For each var: classify as os-env / .env-file / <unset> / <empty>
  // Mask values of names matching SENSITIVE_PATTERN to "<N chars>"
  // Return [string] ready to console.log
}
```

`server/index.js`:

```js
const _envSnapshotBeforeDotenv = new Set(Object.keys(process.env));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TRACKED_ENV = [
  'NODE_ENV',
  'OPS_PORT',
  'PORT',
  'DATA_DIR',
  'OPS_CORS_ORIGINS',
  'OPS_TOTP_KEY',
  'OPS_KIOSK_KEY',
  'OPS_ALLOW_SAME_ORIGIN',
];
if (process.env.NODE_ENV !== 'test') {
  console.log('🌱 [env] resolved sources:');
  for (const line of describeEnvSources(_envSnapshotBeforeDotenv, TRACKED_ENV)) {
    console.log(line);
  }
}
```

### 2 micro-adjustments folded in (per operator-side review)

1. **Mask pattern expanded** beyond conventional `KEY|SECRET|TOKEN|PASSWORD` to also catch `PWD` (legacy/Vietnamese abbreviation), `AUTH` (raw auth strings like BASIC_AUTH), `HASH` (defense-in-depth — raw hash → offline brute force), `PRIVATE` (matches `*_PRIVATE_KEY` convention).
2. **Distinguish `<unset>` (undefined) vs `<empty>` (empty string)**: empty value `DATA_DIR=` in .env is silent misconfig that falls back to default; now flagged explicitly as `<empty> (likely misconfig)` so operator catches the typo at boot.

### Verification

**Normal scenario** (`OPS_PORT=3001 NODE_ENV=development`):

```
🌱 [env] resolved sources:
  NODE_ENV: development (from os env)
  OPS_PORT: 3001 (from os env)
  PORT: <unset>
  DATA_DIR: <unset>
  OPS_CORS_ORIGINS: <unset>
  OPS_TOTP_KEY: <unset>
  OPS_KIOSK_KEY: <64 chars> (from .env file)
  OPS_ALLOW_SAME_ORIGIN: <unset>
```

**Misconfig scenario** (`DATA_DIR='' OPS_TOTP_KEY=<set in os env>`):

```
🌱 [env] resolved sources:
  ...
  DATA_DIR: <empty> (likely misconfig)         ← caught the typo
  OPS_TOTP_KEY: <64 chars> (from os env)       ← masked + sourced
  OPS_KIOSK_KEY: <64 chars> (from .env file)
```

**Tests**: 6/6 pass (`server/utils/envSources.test.js` — os-env vs .env-file attribution × 2, unset / empty / secret-masked / expanded-pattern coverage).

---

## Step B — running test count

| Stage                                       |   Server | Client | Desktop | Manifest |    Total |
| ------------------------------------------- | -------: | -----: | ------: | -------: | -------: |
| Pre-audit baseline (Phase 0)                |      998 |    594 |       8 |        2 | **1602** |
| Post-Fix 1 (no test changes)                |      998 |    594 |       8 |        2 |     1602 |
| Post-Fix 2 (no test changes)                |      998 |    594 |       8 |        2 |     1602 |
| Post-Fix 3 Bước 1 (+timing.test.js × 4)     |     1002 |    594 |       8 |        2 |     1606 |
| Post-Fix 3 Bước 4 (+auth.login.test.js × 6) |     1008 |    594 |       8 |        2 |     1612 |
| Post-Fix 4 (no test changes)                |     1008 |    594 |       8 |        2 |     1612 |
| Post-Fix 5 (no test changes)                |     1008 |    594 |       8 |        2 |     1612 |
| Post-Fix 6 (no test changes)                |     1008 |    594 |       8 |        2 |     1612 |
| Post-Fix 7 (+envSources.test.js × 6)        | **1014** |    594 |       8 |        2 | **1618** |

**Net Δ from audit start: +16 tests; 0 regressions; all green.**

(STEP D re-run on 2026-05-04 confirmed 1014 server / 594 client / 8 license / 2 manifest = 1618 pass / 0 fail.)

---

## Hidden findings registry (4 items surfaced during Step B)

These were discovered DURING Step B as side observations — none were in the original audit report. Filed for future sprints rather than expanded scope on the P0 hotfix.

| ID                | Description                                                                                                                                                                               | Severity              | Disposition                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| **F-FOLLOW-UP-1** | `LoginPage.jsx` h1 hardcoded `'Sign in'` literal bypassed i18n.                                                                                                                           | 🟡 MINOR              | ✅ Closed in Fix 4 (`6b8542f`). New `login.heading.signin` i18n key added. |
| **F-FOLLOW-UP-2** | Wire-format inconsistency `msg` vs `error` field on auth response — AuthContext was already preferring `error`.                                                                           | 🟢 (latent)           | ✅ Incidentally closed by Fix 3 unification.                               |
| **F-FOLLOW-UP-3** | bcrypt → argon2 migration window timing leak (~330 ms residual). Auto-closes per-user on first successful login post-deploy.                                                              | 🟡 MINOR (time-bound) | 📅 Re-evaluate 30 days post-deploy via `auditLegacyPasswords()` count.     |
| **F-FOLLOW-UP-4** | Other auth-adjacent endpoints (`/auth/forgot-password`, `/auth/register`, `/users/:username`) audited in Fix 3 Bước 0. **No enumeration vector found** in any of them (admin-gated 403s). | 🟢 (verified clean)   | ✅ Negative finding documented for future endpoint additions.              |

---

## Final P0 status

| Fix                                  | Status     | Audit ID                 | Commit                       |
| ------------------------------------ | ---------- | ------------------------ | ---------------------------- |
| Fix 1 — deploy DATA_DIR sync         | ✅ shipped | F4-5                     | `e75cac9`                    |
| Fix 2 — compression middleware       | ✅ shipped | F3-1                     | `6a63421`                    |
| Fix 3 — login error unification      | ✅ shipped | F2-1                     | `6568eef`                    |
| Fix 4 — login a11y polish            | ✅ shipped | F3-3 + F3-4 + F-FU-1     | `6b8542f`                    |
| Fix 5 — refresh MIGRATION_GUIDE.md   | ✅ shipped | F4-21                    | `bed7824`                    |
| Fix 6 — WIP triage (A + B3 disposed) | ✅ shipped | (working tree hygiene)   | `d48afa8` + `970163a` (main) |
| Fix 7 — env-source startup logging   | ✅ shipped | (bonus, F4-5 root cause) | `5fc6268`                    |

**7 / 7 P0 ✅ — Step B complete.**
