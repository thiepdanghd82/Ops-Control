# Production Readiness Audit (PRR) — Ops Control v1.5.0

**Audit branch**: `audit/pre-go-live-v1.2`
**Audit window**: 2026-05-03
**Auditor**: Senior QA / Tech Lead / DevOps Architect
**Target**: Ops Control root v1.5.0 (Web + Desktop + Kiosk PWA + Planning domain)

---

## 1. Executive Summary

| Metric                           |                                                               Value |
| -------------------------------- | ------------------------------------------------------------------: |
| Source files audited             |                                                                 439 |
| API endpoints inspected          |                                                                 238 |
| Tests executed (all pass)        |                                             **1 618** (post-Step-B) |
| Reference business case verified | ✅ `30032013-0075` matches user expected output (5.84 m² / 77.87 m) |
| 🔴 BLOCKER findings              |                                                               **0** |
| 🟠 MAJOR findings                |                                    **8** (3 P0-resolved 2026-05-04) |
| 🟡 MINOR findings                |                                   **24** (4 P0-resolved 2026-05-04) |
| 🟢 OK / positive evidence        |                                                              **30** |
| **Total findings**               |                                                              **62** |

### Verdict (post-Step-B, 2026-05-04): ✅ **GO**

> **Status update.** All 7 P0 items closed across `fix/pre-go-live-p0` commits `e75cac9` → `5fc6268` (+ `970163a` on `main` for B3 research from Fix 6 disposition). Step B summary: `docs/audit/STEP-B-fix-summary.md`. Test count: 1 602 → **1 618** (+16; 0 regressions). Pre-fix verdict (⚠ GO WITH CONDITIONS) is kept below for historical context.

#### Pre-Step-B verdict (historical, 2026-05-03): ⚠ GO WITH CONDITIONS

The codebase is **structurally sound** (zero CVEs across 3 packages, zero circular deps across 511 files, zero hardcoded credentials, zero SQL-injection / XSS surface, mature auth + CSRF + headers, gold-standard SPA cache strategy, comprehensive bilingual operator docs, three-tiered backup, 68 audit callsites). The reference test case for the planning module passes exactly.

What gated the go-live decision was a **small handful of fix-able items** — all closed in Step B (see §3 below):

### Top 3 risks (all CLOSED in Step B)

1. **F4-5 — `deploy.sh:191` hardcoded v1.0 legacy `DATA_DIR` path.** ✅ Closed in `e75cac9` (Fix 1). Step A established prod is Windows + uses deploy.ps1 (no leak), making this dormant in current production but real for any future Linux deploy. Removed the stale Environment line + bumped all 3 deploy script headers v1.0 → v1.2. Plus Fix 7 (`5fc6268`) added env-source startup logging so the next F4-5-style incident is diagnosable from `grep '🌱' boot.log` alone.
2. **F3-1 — Express `compression()` middleware not applied.** ✅ Closed in `6a63421` (Fix 2). Mounted `compression()` between security-headers and request-log middleware with defensive SSE filter. Verified 419 KB JS / 102 KB CSS → ~80 % reduction on the wire (e.g. AdminMetrics-\*.js bundle 9 871 B → 3 221 B = −67 %).
3. **F2-1 — Login API leaked username existence.** ✅ Closed in `6568eef` (Fix 3, OWASP ASVS V4.0 §6.2.4). All 3 credentials-failure branches now return byte-identical `401 + {ok:false, error:"Invalid credentials"}`. Lockout (Branch C) preserves `Retry-After` HTTP header per RFC 7231 §7.1.3 but drops body field. Timing equalised via argon2id dummy hash — Δ p95 0.6 ms (was ~370 ms).

All seven P0 items completed in 7 commits over a single workday (2026-05-03 18:01 → 2026-05-04 09:02). Verdict upgraded to ✅ **GO**.

---

## 2. Bug Inventory

> Severity: 🔴 BLOCKER · 🟠 MAJOR · 🟡 MINOR · 🟢 positive evidence (not listed below — see per-phase reports).

| ID        | Sev | Module       | Description                                                                                                                                                                         | File : Line                                                                                                                                         | Repro                                                                                                             | Effort                            | Owner         |
| --------- | --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------- |
| **F4-5**  | 🟠⚠ | Deploy       | systemd unit hardcodes `DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` (v1.0 legacy path). May break boot on fresh box.                                                           | [`deploy.sh:191`](deploy.sh#L191)                                                                                                                   | SSH `10.102.3.61`; `ls -la /opt/ops-control/../COST_V1.0/CCL_Pricing/data` — if missing, current deploy is broken | 5 min                             | DevOps        |
| **F3-1**  | 🟠  | Server       | Express `compression()` middleware not applied. 419 KB JS + 102 KB CSS go over wire raw.                                                                                            | [`server/index.js`](server/index.js)                                                                                                                | `grep -n compression server/index.js` returns empty                                                               | 5 min                             | BE            |
| **F2-1**  | 🟠  | Auth         | Login API distinguishes "Username not found" vs "Incorrect password" → user enumeration                                                                                             | [`server/services/authService.js`](server/services/authService.js)                                                                                  | `curl -X POST /api/auth/login` with bad name vs wrong password → different `msg`                                  | 5 min                             | BE / Security |
| **F3-8**  | 🟠  | Planning UI  | BOM Explosion is O(orders × bomRows). 5 k orders → 1.9 s, 10 k → 7.6 s.                                                                                                             | [`BOMExplosion.jsx:107-109`](client/src/modules/planning/tabs/BOMExplosion.jsx#L107)                                                                | Run `/tmp/bom-bench.mjs` (in audit appendix)                                                                      | 10 min                            | FE            |
| **F2-3**  | 🟠  | Planning     | BOM scrap-column ambiguity: code reads col 7 (`Component Scrap`=1.125) ignoring IFS-canonical col 8 (`Scrap Factor (%)`=3). Math correct vs user reference but undocumented choice. | [`BOMExplosion.jsx:119`](client/src/modules/planning/tabs/BOMExplosion.jsx#L119) + [`shadowWrite.js:40-41`](server/repositories/shadowWrite.js#L40) | Math reproduction in `/tmp/bom-math-check.mjs`                                                                    | 30 min (doc + delete dead column) | BE+Doc        |
| **F1-14** | 🟠  | Server       | Express 4.22 → 5.x not migrated (4.x in LTS but planning required).                                                                                                                 | [`package.json`](package.json)                                                                                                                      | `npm outdated express`                                                                                            | 1 sprint                          | BE            |
| **F1-1**  | 🟠  | Code Quality | 87 root + 10 client ESLint errors. 63 root = env-config in puppeteer scripts (one-flag fix); 10 client = real bugs incl. 3 React-19 lint from this branch's WIP.                    | Multiple                                                                                                                                            | `npx eslint .` from root and client                                                                               | 2 h                               | FE+BE         |
| **F0-1**  | 🟠  | Test Tooling | Jest `coverageThreshold` 70/60/70/70 is dead config — `testPathIgnorePatterns` excludes every source dir. Real coverage never measured.                                             | [`package.json` `jest.testPathIgnorePatterns`](package.json)                                                                                        | `node -e "console.log(require('./package.json').jest.testPathIgnorePatterns)"`                                    | 1 day (migrate to c8)             | DevOps        |
| F0-2      | 🟡  | Workspace    | Sub-package version drift: root 1.5.0 / client 1.3.0 / desktop 1.3.0 / kiosk 0.1.0                                                                                                  | All `package.json`                                                                                                                                  | `head -3` each                                                                                                    | 30 min (release-please)           | Release       |
| F0-3      | 🟡  | Desktop      | `desktop/` pins better-sqlite3 ^11.3 while server pins ^12.9                                                                                                                        | `desktop/package.json`                                                                                                                              | `npm outdated` in desktop                                                                                         | 30 min                            | Desktop       |
| F0-4      | 🟡  | Code Quality | 6 source files > 2 000 LOC (Sprint-12 backlog already known)                                                                                                                        | `costApi.js` 2913, `Settings.jsx` 2265, `PrintAreaCalc.jsx` 2087, etc.                                                                              | `wc -l`                                                                                                           | Sprint+1                          | FE/BE         |
| F0-6      | 🟡  | Branch State | 27 modified + 9 untracked files from prior UI redesign — audit covered working tree, not tagged HEAD                                                                                | `git status`                                                                                                                                        | already verified                                                                                                  | (commit before deploy)            | Dev           |
| F1-5      | 🟡  | Code Quality | 66 raw `console.*` in src; Sprint-10 P2-4 logger migration incomplete                                                                                                               | Multiple                                                                                                                                            | `grep -rn console.log src`                                                                                        | 1-2 h                             | FE+BE         |
| F1-15     | 🟡  | Auth         | `bcryptjs` legacy fallback could bump to v3                                                                                                                                         | [`authService.js:291`](server/services/authService.js#L291)                                                                                         | `npm outdated bcryptjs`                                                                                           | 30 min                            | BE            |
| F1-16     | 🟡  | Desktop      | `electron-store` 3 majors behind                                                                                                                                                    | `desktop/package.json`                                                                                                                              | `npm outdated electron-store`                                                                                     | 1 h                               | Desktop       |
| F1-17     | 🟡  | Code Quality | ESLint version drift: root v10, client v9                                                                                                                                           | `eslint.config.js`                                                                                                                                  | `npm ls eslint`                                                                                                   | 30 min                            | DevOps        |
| F1-22     | 🟡  | DB           | No FK from quotes' material refs back to `materials.code`                                                                                                                           | [`schema.sql`](server/db/schema.sql)                                                                                                                | grep schema                                                                                                       | 2 h (read-time integrity check)   | BE            |
| F1-25     | 🟡  | DB           | No down-migration framework; rollback = snapshot restore                                                                                                                            | [`server/db/init.js`](server/db/init.js)                                                                                                            | review                                                                                                            | 1 sprint (knex/prisma)            | BE            |
| F2-12     | 🟡  | Logging      | Server emits ISO-8601 UTC; client renders local. Document the operator/SSH timezone semantics.                                                                                      | n/a                                                                                                                                                 | grep `toISOString`                                                                                                | 30 min (doc)                      | DevOps        |
| F3-3      | 🟡  | A11y         | 3 focusable login-page controls without programmatic label                                                                                                                          | login page                                                                                                                                          | Puppeteer a11y scan                                                                                               | 30 min                            | FE            |
| F3-4      | 🟡  | A11y         | Heading hierarchy inverted on login page (`<h2>` before `<h1>`)                                                                                                                     | [`LoginPage.jsx`](client/src/components/Auth/LoginPage.jsx)                                                                                         | inspect DOM                                                                                                       | 15 min                            | FE            |
| F3-10     | 🟡  | Test Tooling | No formal load-test tool (k6/artillery) installed                                                                                                                                   | n/a                                                                                                                                                 | `which k6`                                                                                                        | 1 h (one-time k6 run)             | DevOps        |
| F4-6      | 🟡  | Deploy       | systemd unit Description still says "Ops Control v1.0"                                                                                                                              | [`deploy.sh:181`](deploy.sh#L181)                                                                                                                   | inspect                                                                                                           | 1 min                             | DevOps        |
| F4-8      | 🟡  | Env          | No staging environment defined (only dev + prod)                                                                                                                                    | n/a                                                                                                                                                 | review                                                                                                            | 1 sprint                          | DevOps        |
| F4-10     | 🟡  | Logging      | Server-side log file should have restricted read perms                                                                                                                              | `/var/log/ops-control.log`                                                                                                                          | `ls -la` on host                                                                                                  | 5 min                             | DevOps        |
| F4-11     | 🟡  | Audit        | `LOGIN_FAIL` audit detail still plaintext (CLAUDE.md MES-3-FIX-3)                                                                                                                   | grep `LOGIN_FAIL`                                                                                                                                   | review                                                                                                            | 30 min                            | BE            |
| F4-13     | 🟡  | Monitoring   | No Grafana dashboard JSON ships with repo                                                                                                                                           | n/a                                                                                                                                                 | `ls docs/ops/`                                                                                                    | 1 day                             | DevOps        |
| F4-15     | 🟡  | Backup       | `verify-backup` fails fast on dev workspace (no `--dev-mode` flag)                                                                                                                  | [`scripts/verify-backup.js`](scripts/verify-backup.js)                                                                                              | run it                                                                                                            | 30 min                            | DevOps        |
| F4-16     | 🟡  | DR           | No quarterly restore drill rehearsed in past 90 days                                                                                                                                | `MAINTAINERS.md`                                                                                                                                    | check log                                                                                                         | (schedule)                        | DevOps        |
| F4-18     | 🟡  | Deploy       | Rollback runbook uses `cp -R` not `rsync --checksum`                                                                                                                                | CLAUDE.md runbook                                                                                                                                   | review                                                                                                            | 15 min (doc)                      | DevOps        |
| F4-20     | 🟡  | Docs         | Training xlsx still pinned at v1.0 (CLAUDE.md lesson 3)                                                                                                                             | `Use guide/*.xlsx`                                                                                                                                  | inspect                                                                                                           | 1 sprint or retire                | Trainer       |
| F4-21     | 🟡  | Docs         | `MIGRATION_GUIDE.md` references v1.2→v1.3 but repo is v1.5                                                                                                                          | `MIGRATION_GUIDE.md`                                                                                                                                | inspect                                                                                                           | 1 h                               | Doc           |
| F4-23     | 🟡  | RBAC         | Planning routes use local `requireTabAccess` shim instead of canonical (CLAUDE.md MES-3-FIX-8)                                                                                      | `domains/planning/server/routes/{operationV2,workOrderV2,kiosksV2}.js`                                                                              | grep                                                                                                              | 30 min                            | BE            |
| F4-25     | 🟡  | Audit        | No tamper-resistance on audit log (no append-only, no chain)                                                                                                                        | `audit_log` table                                                                                                                                   | review                                                                                                            | (doc + WORM volume)               | Security      |
| F4-26     | 🟡  | DB           | No schema-version table                                                                                                                                                             | [`server/db/init.js`](server/db/init.js)                                                                                                            | review                                                                                                            | 1 sprint                          | BE            |

> Phase 0 finding F0-5 (exceptional comment hygiene — only 2 TODOs across 439 files) is positive evidence and not listed in the bug table.

---

## 3. Fix Roadmap

### 🔴 P0 — Must fix before go-live (≤ 1 day) — **ALL CLOSED 2026-05-04 ✅**

| Status | ID         | Action                                                                                                                                                                                                                                                                | Closed in             |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| ✅     | **F4-5**   | Removed `Environment=DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` from `deploy.sh` systemd unit; `.env` now drives `DATA_DIR` (default `./server/data`). Headers v1.0 → v1.2 across deploy.sh / deploy.ps1 / deploy.bat.                                          | `e75cac9`             |
| ✅     | **F3-1**   | Mounted `compression()` (threshold=1024, level=6, SSE-excluded) in `server/index.js`. Verified: AdminMetrics-\*.js 9 871 B → 3 221 B (−67 %). Login page total ~2.6 MB → ~520 KB (≈80 % reduction).                                                                   | `6a63421`             |
| ✅     | **F2-1**   | All 3 credentials-failure branches return byte-identical `401 + {ok:false, error:"Invalid credentials"}` per OWASP ASVS V4.0 §6.2.4. Timing equalised via argon2id dummy hash (Δ p95 0.6 ms vs prior ~370 ms leak). Lockout `Retry-After` header preserved.           | `6568eef`             |
| ✅     | F3-3, F3-4 | 5 input id/htmlFor pairs added; `<h2 cb-hero-title>` → `<p cb-hero-title>` so h1 starts heading hierarchy. Plus F-FOLLOW-UP-1: hardcoded `'Sign in'` literal replaced with `t('login.heading.signin')` (new EN/VI key).                                               | `6b8542f`             |
| ✅     | F4-21      | `MIGRATION_GUIDE.md` rewritten v1.2→v1.3 → v1.2→v1.5. 12 sections (was 10); +175 / −88 LOC. New §5 Behavioral changes (EN+VI + "What you don't need to do"), new §9 Feature flags, rewritten §10 Rollback (snapshot pattern from Sprint 1.7).                         | `bed7824`             |
| ✅     | F0-6       | WIP triaged into 4 groups: A (verify screenshots) committed `d48afa8`, B3 (ERPAG research) committed `970163a` on main, B1+B2 deferred for dedicated review with 3-layer recovery (git tag + tarball + git stash). Full report: `docs/audit/FIX-6-CLASSIFICATION.md`. | `d48afa8` + `970163a` |
| ✅     | (bonus)    | Env-var provenance startup logging (`server/utils/envSources.js`). Closes the F4-5 root-cause class — operator can now `grep '🌱' boot.log` to see whether DATA_DIR came from os env vs .env vs <unset> vs <empty>.                                                   | `5fc6268`             |

**Actual P0 effort: 7 commits across 15h wallclock (2026-05-03 18:01 → 2026-05-04 09:02). +1 919 net LOC (3 195 ins / 1 276 del). +16 tests added (10 from Fix 3, 6 from Fix 7). 0 regressions.**

> Step B summary report with per-fix evidence: `docs/audit/STEP-B-fix-summary.md`.

### 🟠 P1 — Fix in Sprint 1 after go-live (1 sprint = ~2 weeks)

| ETA      | ID        | Action                                                                                                                                      | Owner   |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 10 min   | **F3-8**  | Add `useMemo(Map<parentPn → []>)` index to `BOMExplosion.jsx`. Drops 10k-order time from 7.6s → ~200ms.                                     | FE      |
| 30 min   | **F2-3**  | Document scrap-column choice in `Use guide/`. Either delete unused `scrap_pct` column from `shadowWrite.js:41` or wire it.                  | BE+Doc  |
| 1 sprint | **F1-14** | Migrate Express 4.22 → 5.x. Breaking changes documented at expressjs.com migration guide.                                                   | BE      |
| 2 h      | **F1-1**  | Fix the 87 root + 10 client ESLint errors. 63 root are env-config nits in puppeteer scripts (single fix).                                   | FE+BE   |
| 1-2 h    | F1-5      | Complete `utils/logger.js` migration — 66 raw `console.*` callsites.                                                                        | FE+BE   |
| 30 min   | F1-15     | Bump `bcryptjs` 2.4.3 → 3.0.3.                                                                                                              | BE      |
| 1 h      | F1-16     | Bump `electron-store` 8.2 → 11.0 (review API changes).                                                                                      | Desktop |
| 30 min   | F1-17     | Align ESLint to v10 across root + client + kiosk.                                                                                           | DevOps  |
| 30 min   | F0-3      | Align `better-sqlite3` constraint between desktop (^11.3) and server (^12.9). Both currently install 12.9 in desktop tree (lockfile drift). | Desktop |
| 30 min   | F0-2      | Bump client / desktop / kiosk `package.json` versions to match root 1.5.0.                                                                  | Release |
| 1 sprint | F4-23     | Replace planning local `requireTabAccess` shim with canonical import (MES-3-FIX-8).                                                         | BE      |
| 30 min   | F4-11     | `LOGIN_FAIL` audit detail → `JSON.stringify({reason})` (MES-3-FIX-3).                                                                       | BE      |
| 1 day    | F0-1      | Migrate from Jest's vacuous coverage threshold to `c8` over `node --test` runners. Wire into CI.                                            | DevOps  |
| 30 min   | F4-15     | Add `--dev-mode` flag to `verify-backup` so it exits 0 with a hint on dev workspace.                                                        | DevOps  |
| 30 min   | F2-12     | Document timezone semantics (server UTC, client toLocaleString) in `docs/SECURITY.md` or `MAINTAINERS.md`.                                  | Doc     |
| 1 day    | F4-13     | Build a default Grafana dashboard JSON, ship in `docs/ops/`.                                                                                | DevOps  |
| 1 h      | F3-10     | Run a one-time k6 load test (50 VUs × 2 min) against staging.                                                                               | DevOps  |

### 🟡 P2 — Backlog (Sprint 2+ or longer)

| ETA      | ID           | Action                                                                                                    | Owner    |
| -------- | ------------ | --------------------------------------------------------------------------------------------------------- | -------- |
| Sprint+1 | F0-4         | Sprint 12 component-size refactor (PrintAreaCalc, Settings, etc. — already in MES-3.5 backlog).           | FE       |
| Sprint+1 | F1-22        | Add read-time integrity check for material-code references in quotes.                                     | BE       |
| Sprint+2 | F1-25, F4-26 | Introduce schema-version table + down-migration framework (knex/prisma).                                  | BE       |
| Sprint+1 | F4-25        | Document audit-log tamper-resistance constraint in `docs/SECURITY.md`. Optionally migrate to WORM volume. | Security |
| Sprint+1 | F4-8         | Stand up a staging environment between dev and production.                                                | DevOps   |
| Sprint+1 | F4-16        | Schedule + execute first quarterly restore drill. Update `MAINTAINERS.md` with results.                   | DevOps   |
| Sprint+1 | F4-20        | Refresh training xlsx for v1.5 OR retire in favour of in-app Help.                                        | Trainer  |
| 5 min    | F4-6         | Update systemd unit description from "Ops Control v1.0" to v1.5.                                          | DevOps   |
| 5 min    | F4-10        | `chmod 600` on production log file.                                                                       | DevOps   |
| 15 min   | F4-18        | Update CLAUDE.md rollback runbook to use `rsync --checksum` instead of `cp -R`.                           | Doc      |

---

## 4. Risk Matrix

```mermaid
quadrantChart
    title Top 10 risks — Likelihood × Impact
    x-axis Low Likelihood --> High Likelihood
    y-axis Low Impact --> High Impact
    quadrant-1 Critical (act first)
    quadrant-2 High Impact (plan)
    quadrant-3 Watch
    quadrant-4 Quick Wins
    F4-5 DATA_DIR legacy: [0.6, 0.95]
    F3-1 No compression: [0.95, 0.55]
    F2-1 User enumeration: [0.55, 0.65]
    F3-8 BOM O(N²): [0.30, 0.75]
    F2-3 Scrap col ambiguity: [0.20, 0.55]
    F1-14 Express 4 EOL: [0.35, 0.45]
    F1-1 ESLint debt: [0.85, 0.20]
    F0-1 Coverage dead config: [0.85, 0.30]
    F4-25 Audit log tamper: [0.15, 0.55]
    F1-25 No down-migration: [0.30, 0.60]
```

**Reading the matrix**:

- Top-right (Critical): F4-5 sits high-impact / mid-high-likelihood — addressed by P0.
- Top-left (High Impact, Low Likelihood): F3-8, F1-25, F2-3, F4-25 — plan in P1/P2.
- Bottom-right (Quick Wins): F3-1, F1-1, F0-1 — fast fixes for visible improvements.
- Bottom-left (Watch): F2-3, F1-14 — defer with documentation.

---

## 5. Go-Live Checklist

Tick each item before pressing deploy. Date / signer / evidence link mandatory.

### Pre-deploy code & config (P0)

- [ ] **F4-5** verified — `DATA_DIR` path exists on prod or `deploy.sh:191` updated
- [ ] **F3-1** — `compression()` added; `curl -H 'Accept-Encoding: gzip'` confirms `Content-Encoding: gzip`
- [ ] **F2-1** — Login error messages unified to `"Invalid credentials"`
- [ ] **F3-3 / F3-4** — Login a11y: aria-labels added; H1 promoted ahead of H2
- [ ] **F4-21** — `MIGRATION_GUIDE.md` refreshed for v1.5
- [ ] WIP committed/squashed; `git status` clean
- [ ] All 1 602 tests still green after the P0 changes
- [ ] `npm run build` rebuilds without errors
- [ ] `npm run preflight` passes with `NODE_ENV=production`

### Pre-deploy ops

- [ ] Off-site backup target reachable (`scripts/backup-offsite.sh` dry-run)
- [ ] Latest backup verified with `npm run verify-backup --strict`
- [ ] Operator notified of maintenance window via Slack/Teams
- [ ] `OPS_TOTP_KEY` value confirmed against the prod `.env` backup (CLAUDE.md "TOTP key rotation" runbook)
- [ ] `OPS_KIOSK_KEY` value confirmed
- [ ] `OPS_CORS_ORIGINS` reflects current LAN allowlist
- [ ] `OPS_BACKUP_SCHEDULE=1` on prod (in-process scheduler enabled)

### Deploy

- [ ] `./deploy.sh user@10.102.3.61` runs to completion (exit 0)
- [ ] `releases/<ts>/` snapshot created on prod
- [ ] `journalctl -u ops-control -n 30` shows clean boot incl. "🔐 TOTP boot probe OK"
- [ ] `curl http://10.102.3.61:3000/health` returns 200 with v1.5.0
- [ ] `curl http://10.102.3.61:3000/ready` returns 200
- [ ] Stale-chunk guard: `curl http://10.102.3.61:3000/assets/THIS-DOES-NOT-EXIST.js` returns 404 (NOT 200)

### Post-deploy smoke

- [ ] Operator reload current session (Cmd+R) — no console errors, all tabs render
- [ ] Login flow works with existing user
- [ ] Pricing (Std) calculator opens, calc completes, save+reload roundtrip
- [ ] Order Entry opens; FG sync test — UAT walkthrough
- [ ] BOM Explosion shows reference part `30032013-0075` correctly (Width=75, Linear M=77.87, Required=5.84 m²)
- [ ] Pending Approvals count badge in sidebar matches landing-page card badge
- [ ] Quote save → audit log row appears in `/api/audit/timeline`
- [ ] Permission gate: a `viewonly` user gets the read-only banner on calc tabs

### Post-deploy ops

- [ ] First-night backup ran successfully (`/var/log/ops-control.log` for "✅ backup complete")
- [ ] `OPS_BACKUP_WEBHOOK` not triggered (no failure alert)
- [ ] `/metrics` shows traffic across normal endpoints
- [ ] Schedule a 30-day quarterly restore drill (F4-16)

---

## 6. Recommendations

### Quick wins (under 1 day, big visible value)

1. **Add `compression()` middleware** (F3-1, 5 min) — immediate ~70 % network reduction on every page load.
2. **Generic login error message** (F2-1, 5 min) — close OWASP-flagged vector with no UX downside.
3. **BOM Map index** (F3-8, 10 min) — prevents UI freeze if order volume grows.
4. **Refresh `MIGRATION_GUIDE.md`** (F4-21, 1 h) — operator-facing doc accuracy.
5. **Login page a11y polish** (F3-3+F3-4, 30 min) — screen-reader passes cleanly.
6. **Fix the 10 client ESLint errors** (F1-1 client portion, 1 h) — including 3 React-19 lint errors introduced in this branch's WIP.

### Strategic improvements (Sprint 1–2)

1. **Migrate to c8 coverage** (F0-1) — replaces dead Jest threshold with real metric over `node --test`.
2. **Express 4 → 5** (F1-14) — Express 5 LTS, modernised Promise-aware route handlers.
3. **Standing staging environment** (F4-8) — would have caught F4-5 before this audit.
4. **Schema-version table + down-migration framework** (F1-25 + F4-26) — turns one-way ALTER TABLE into reversible migrations.
5. **Grafana dashboard JSON** (F4-13) — operator deploys monitoring with a one-shot import.
6. **Quarterly restore drill** (F4-16) — converts documented runbook into rehearsed muscle memory.

### Tech debt to address (CLAUDE.md acknowledged, audit reconfirms)

1. Sprint 12 component-size refactor (CLAUDE.md "Known operational risks") — `PrintAreaCalc.jsx` 2 087 LOC, `Settings.jsx` 2 265 LOC.
2. costApi.js extraction (`docs/COSTAPI_EXTRACTION_ROADMAP.md`) — 2 913-LOC route file.
3. Inline-style migration (296 ESLint warnings, top-5 file allowlist) — Sprint+1 deferred.
4. MES-3.5 backlog (CLAUDE.md): KIOSK-008 happy-path Playwright fix, RFC-7807 compliance (FIX-1), audit detail JSON normalisation (FIX-3), planning local-shim consolidation (FIX-8 / F4-23 here), Help system refresh for MES-1/2 v2 (FIX-10), groups.json idempotent migration (KIOSK-006b).

### Anti-patterns to STOP doing

- Don't add new `console.log()` in src code — use `utils/logger.js` (F1-5).
- Don't add new inline `style={{...}}` — ESLint rule blocks new sites; existing offenders are gated by file-allowlist (F1-2).
- Don't bypass commitlint with `--no-verify` — the project's commit-message convention enforces type+scope.
- Don't write the `audit(phase-X)` commit prefix the brief uses; commitlint rejects it. Use `docs:` instead.

---

## 7. Appendix

### 7.1 Tool versions

| Tool           | Version                             | Source                                  |
| -------------- | ----------------------------------- | --------------------------------------- |
| Node.js        | v20.20.2                            | (server runtime)                        |
| npm            | (bundled with Node)                 |                                         |
| React          | 19.2.4                              | client + kiosk                          |
| Vite           | 8.0.4                               | client + kiosk                          |
| Express        | 4.22.1 (latest 5.2.1)               | server                                  |
| better-sqlite3 | 12.9.0                              | server (desktop pinned 11.3 — F0-3)     |
| Electron       | 41.3.0                              | desktop                                 |
| Jest           | 29.7.0                              | (vacuous — F0-1)                        |
| Playwright     | 1.55.0                              | kiosk e2e (KIOSK-008 known red)         |
| ESLint         | 10.2.1 root / 9.39.4 client (F1-17) |                                         |
| Prettier       | 3.8.3                               |                                         |
| Husky          | 9.1.7                               |                                         |
| commitlint     | 20.5.2                              | (rejected `audit(phase-X)` — see notes) |

### 7.2 Environment

| Item                     | Value                                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| OS                       | Darwin 25.4.0 (macOS)                                                          |
| Working dir              | `/Volumes/Macintosh Data/Claude-Cowork/3. PROJECTS/Ops Control v1.2`           |
| Server during audit      | localhost:3000 (prod build, current WIP bundle)                                |
| Audit branch base        | `feature/order-entry-fg-sync-and-import` @ `0aacb3c`                           |
| Audit branch HEAD        | `audit/pre-go-live-v1.2` @ `bed60a1` (Phase 4) → `<this commit>` (Phase 5)     |
| Auth status during audit | unauthenticated (no `demo` user; CLAUDE.md self-check.mjs harness assumes one) |

### 7.3 Test data used

| Dataset                 | Source                                                                              |                Rows |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------: |
| IFS Inventory           | `server/data/Library/IFS_Inventory/inventory_data.js`                               |               8 696 |
| Mfg Structures          | `server/data/Library/Manufacturing_Structures/mfg_structures_data.js`               |              19 539 |
| Distinct parent parts   | derived                                                                             |               5 996 |
| Reference test case     | Component `30032013-0075`, parent `80640087`, QPA 0.01155, scrap 1.125, width 75 mm |               1 row |
| Synthetic BOM benchmark | `/tmp/bom-bench.mjs`                                                                | 100 / 1k / 5k / 10k |

### 7.4 Reproducible benchmarks

All scripts kept in `/tmp/` during the audit:

- `/tmp/api-timing.mjs` — endpoint p50/p95/p99 timing (200 reqs each)
- `/tmp/api-timing-2.mjs` — login throttle bimodal verification
- `/tmp/bom-bench.mjs` — BOM Explosion algorithmic complexity
- `/tmp/bom-math-check.mjs` — reference test case math reproduction
- `/tmp/db-bench.mjs` — DB query timing on real Library data
- `/tmp/concurrency.mjs` — 200-parallel `/health` load test

These are throwaway scripts (not checked into the repo) but the per-phase reports include the inputs/outputs verbatim so the numbers are reproducible. To re-run, copy the script content from the corresponding phase report's relevant subsection.

### 7.5 Screenshot index

| File                                    | Phase   | What it shows                                                                                   |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `docs/audit/screenshots/login-page.png` | Phase 2 | Login page captured via Puppeteer (375 KB). Headers verified incl. CSP/HSTS/Permissions-Policy. |

### 7.6 Per-phase reports (committed history)

| Phase                                  | Report                                             | Commit        |
| -------------------------------------- | -------------------------------------------------- | ------------- |
| 0 — Discovery & Scope                  | [`00-scope.md`](./00-scope.md)                     | `d96451e`     |
| 1 — Static Code Audit                  | [`01-static-audit.md`](./01-static-audit.md)       | `8a108e2`     |
| 2 — Functional Testing                 | [`02-functional-test.md`](./02-functional-test.md) | `ff76b86`     |
| 3 — Performance & Scalability          | [`03-performance.md`](./03-performance.md)         | `7932a5b`     |
| 4 — Deployment & Operational Readiness | [`04-deployment.md`](./04-deployment.md)           | `bed60a1`     |
| 5 — Final Report                       | this file                                          | (this commit) |

### 7.7 Process notes

1. **Auto mode**: the user invoked `/audit` with explicit "checkpoint per phase" gates AND auto-mode active. Auto-mode applied within each phase (continuous execution); checkpoints were honoured between phases.
2. **Commit message format**: the brief specified `audit(phase-X): <summary>` prefix. Project commitlint rejects this (`audit` is not in the allowed type list). Adapted to `docs:` per the project's `commitlint.config.js` and called out in commit bodies.
3. **Read-only audit**: per "KHÔNG sửa code trong lúc audit" rule, no source files were modified during this audit. Findings reference current state.
4. **No interactive Browser Agent**: this environment does not expose a `browser_action`-style tool. Phase 2 used Puppeteer-core (already installed) for screenshot capture and a code-level audit of authenticated UI flows. Operator UAT remains required for end-to-end UI verification — explicitly listed in §2.4 of [`02-functional-test.md`](./02-functional-test.md).

---

## 8. Sign-off

**Verdict: ✅ GO — pending Step C UAT sign-off** (upgraded from ⚠ GO WITH CONDITIONS on 2026-05-04 after Step B closure).

> **Pre-merge gate.** The branch `fix/pre-go-live-p0` is held off `main` until operator-side UAT (per [`STEP-C-uat-checklist.md`](STEP-C-uat-checklist.md)) returns a tester sign-off + tech-lead counter-sign per §6 of that checklist. Step B verified on the dev box; UAT verifies on the actual deploy target. They are two distinct checks. Operator request template: [`STEP-E-uat-request-template.md`](STEP-E-uat-request-template.md).
>
> On UAT pass: merge `fix/pre-go-live-p0` → `main` (`--no-ff` to preserve audit history) + version bump (decision deferred to post-UAT — patch `v1.5.1` if no functional regressions surface, minor `v1.6.0` if UAT scope changes warrant it).
>
> On UAT fail: file UAT Issue Report (§5.4 of checklist) → fix forward on the same branch (Fix 8+) → re-UAT only the failing scenarios → then merge.

All 7 P0 items in §3 are completed and verified. Step D re-run (2026-05-04) confirmed:

- **1 618 / 1 618 tests pass, 0 fail** (1 014 server + 594 client + 8 desktop license + 2 desktop manifest).
- Live repro probes: env-source log fires correctly, compression on `/assets/*` confirmed (−67 % on a real bundle), unified 401 + "Invalid credentials" for both wrong-pw and unknown-user paths, stale-chunk 404 guard intact.
- Hidden-findings registry (4 items surfaced during Step B) recorded in `docs/audit/STEP-B-fix-summary.md`; 3 closed, 1 time-bound for re-evaluation 30 days post-deploy.

### Commit range

`fix/pre-go-live-p0`: `f8c6b9f` (STEP A verify) → `5fc6268` (Fix 7) — 8 commits.
`main`: `970163a` (B3 research disposition from Fix 6).

### Recovery anchors preserved

- `wip-snapshot-20260504-082812` git tag (pre-Fix-6 working tree)
- `pre-sidebar-revert-20260504-090729` git tag (pre-sidebar-revert state)
- `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB filesystem backup of all 42 WIP entries)

### Evidence preserved

- The audit branch `audit/pre-go-live-v1.2` and the working `fix/pre-go-live-p0` branch hold the full per-phase + per-fix history.
- Findings are tagged with stable IDs (`F0-1` … `F4-26`) so the operator can track each through the bug-tracker / Linear / GitHub Issues.
- Per-fix evidence: `docs/audit/STEP-B-fix-summary.md`.
- WIP triage record: `docs/audit/FIX-6-CLASSIFICATION.md`.
- Visual verify artifacts: `docs/audit/screenshots/p0-{f2-1,fix4}-*.png`.

**End of audit. ✅ Cleared for go-live.**
