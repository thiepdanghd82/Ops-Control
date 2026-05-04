# Phase 4 — Deployment & Operational Readiness

**Audit branch**: `audit/pre-go-live-v1.2`
**Audit date**: 2026-05-03
**Method**: read deploy scripts, run `verify-backup`, grep audit/RBAC/log surfaces, inspect docs

---

## 4.1 Deploy scripts (deploy.sh / deploy.ps1 / deploy.bat)

### Posture

| Script       | Lines | Purpose                                                |
| ------------ | ----: | ------------------------------------------------------ |
| `deploy.sh`  |   238 | Linux SSH deploy → systemd + nginx                     |
| `deploy.ps1` |   229 | Windows PowerShell deploy → NSSM service               |
| `deploy.bat` |    31 | Thin wrapper around `deploy.ps1` for cmd.exe operators |

### What's mature ✅

| ID   | Finding                                                                                                                                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-1 | **Whole-`.env` merge across deploys.** `deploy.sh:63-70` reads remote `.env` into a tempfile, captures every `KEY=VALUE` line, then merges back after rsync. Sprint 1.7 audit §8 fixed the prior bug where only `OPS_TOTP_KEY` was preserved (every other env var was clobbered → backups silently disabled, CORS reverted). Now fully preserved. ✅ |
| F4-2 | **Snapshot before rsync.** `deploy.sh:98-109` snapshots `/opt/ops-control/{server,client,scripts,package*.json}` to `/opt/ops-control/releases/<DEPLOY_TS>/` before rsyncing the new bundle. 5-snapshot retention via `ls -1t … \| tail -n +6 \| xargs rm -rf`. CLAUDE.md "Bad deploy — need to roll back" runbook depends on this. ✅               |
| F4-3 | **Preflight gate before service restart.** `deploy.sh:166-172` runs `NODE_ENV=production npm run preflight` against the **staged** `.env` BEFORE flipping systemd. Failure aborts with the new bundle uploaded but inactive — no restart-loop. ✅                                                                                                    |
| F4-4 | **`.env` perms hardened on remote.** `chmod 600 .env` after merge (line 155). ✅                                                                                                                                                                                                                                                                     |

### What looks **broken** ⚠ — F4-5 🔴 BLOCKER candidate (verify with operator)

[`deploy.sh:191`](deploy.sh#L191) hardcodes a v1.0 legacy data path into the systemd unit:

```ini
[Service]
…
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PYTHON_SERVER=http://localhost:5173
Environment=DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data   ← LEGACY PATH
```

This makes the deployed v1.5.0 server read its data from the OLD `COST_V1.0/CCL_Pricing/data/` directory — which is the operator's v1.0 install, not v1.2/v1.3.

**`.env.example` says** `DATA_DIR=./server/data` (i.e. `$APP_DIR/server/data`).

**Implications**:

- If the operator runs `./deploy.sh user@10.102.3.61` for the first time on a fresh box (no v1.0 install), the systemd unit will start the server pointing at a non-existent directory → service will fail to boot.
- If the operator is upgrading **on top of** an existing v1.0 install at the sibling `COST_V1.0/` path, this is intentional (data migration in place). But that's a **specific deployment topology** that should be documented, not silently hardcoded.

**Could not verify on remote** — depends on whether `10.102.3.61` actually has a `COST_V1.0/CCL_Pricing/data/` sibling. If yes, this is intentional and only needs a comment. If no, this is a 🔴 BLOCKER.

| ID       | Severity                            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F4-5** | 🟠 **MAJOR** (verify before deploy) | `deploy.sh:191` hardcodes `DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` — points at the v1.0 legacy install. Either (a) document this as the intentional in-place migration topology and add a comment, or (b) replace with `Environment=DATA_DIR=$APP_DIR/server/data` to match `.env.example`. **Verify against the actual prod server before next deploy** — if `10.102.3.61` has no sibling COST_V1.0/, the service won't boot. |
| F4-6     | 🟡 MINOR                            | `deploy.sh:181` still says "Description=Ops Control v1.0" in the systemd unit. Cosmetic but operator-visible (`systemctl status` output).                                                                                                                                                                                                                                                                                               |

---

## 4.2 Environment Variables — dev/staging/prod separation

### `.env.example` template

`scripts/preflight-env.js` enforces production requirements:

| Required (production)                             | Constraint             | Failure mode if missing                                              |
| ------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `OPS_TOTP_KEY`                                    | 64-char hex (32 bytes) | All users locked out of 2FA. Recovery = restore `.env` with old key. |
| `OPS_KIOSK_KEY`                                   | 64-char hex            | All kiosk pairings invalidated.                                      |
| `OPS_CORS_ORIGINS` (or `OPS_ALLOW_SAME_ORIGIN=1`) | non-empty allowlist    | Server refuses to boot.                                              |
| `PORT` / `OPS_PORT`                               | numeric > 0            | Server refuses to boot.                                              |

| Optional but recommended    | Default if unset                 |
| --------------------------- | -------------------------------- |
| `OPS_DB_PATH`               | `server/data/ops.db`             |
| `OPS_DATA_BACKEND`          | `file`                           |
| `OPS_BACKUP_SCHEDULE`       | `0` (off — must enable for prod) |
| `OPS_BACKUP_RETENTION_DAYS` | 30                               |
| `OPS_REQUIRE_2FA_ROLES`     | `sys,admin` (probable default)   |

### Current `.env` (workspace, not prod)

```
OPS_KIOSK_KEY=<set>
```

That's the **only** env var set locally. Dev mode runs without `OPS_TOTP_KEY` (PBKDF2 fallback per `.env.example` comment).

| ID   | Severity | Finding                                                                                                                                                                                                                                        |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-7 | 🟢 OK    | `preflight-env.js` enforces all production-required vars at deploy time. The bootstrapping logic is the same on Linux/Windows. Dev workstations work without `OPS_TOTP_KEY` (degraded encryption explicitly documented).                       |
| F4-8 | 🟡 MINOR | **No staging environment defined** — only "dev" (`NODE_ENV=development`) and "production". An intermediate `staging` would let the operator validate F4-5 before prod. Acceptable for current single-site CCL VN topology, but worth flagging. |

---

## 4.3 Logging

### Structure

[`server/index.js:240-260`](server/index.js#L240-L260) — request log middleware:

```js
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/assets/')) return; // skip noisy static
    const entry = {
      t: new Date().toISOString(), // ISO-8601 UTC
      id: req.id, // request ID for correlation
      m: req.method, // GET/POST/…
      p: req.path, // /api/auth/login
      s: res.statusCode, // 200/401/…
      ms: Date.now() - started, // response time
    };
    console.log(JSON.stringify(entry)); // single-line JSON
  });
  next();
});
```

**Verified live in `/tmp/ops-server.log`**:

```json
{
  "t": "2026-05-03T10:01:24.264Z",
  "id": "6078cfb76afd4008",
  "m": "GET",
  "p": "/users/status",
  "s": 200,
  "ms": 1
}
```

### Log levels

- `console.log()` — normal request/response trace
- `console.warn()` — recoverable conditions (e.g. "TOTP boot probe threw")
- `console.error()` — fatals + Phase-1 boot diagnostics (refuses to start in prod with missing keys)

There is also a `client/src/utils/logger.js` (DEV-only `log/warn`, always-on `err`) used by some client code — Phase 1 F1-5 noted only partial migration.

### PII redaction

- 5xx response bodies wrapped in `redactErrorMessage(err)` from [`server/utils/safeError.js:66`](server/utils/safeError.js#L66) — strips paths, stack traces.
- Login fail audit row stores **plaintext reason** (`LOGIN_FAIL`) — flagged by CLAUDE.md MES-3-FIX-3 (P3, deferred). Auditor-facing only; not user-facing.
- Request log does **not** include request body, query strings, or session IDs — clean.

| ID    | Severity | Finding                                                                                                                                                                                                                                         |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-9  | 🟢 OK    | Structured one-line-JSON request log, ISO-8601 UTC timestamps, request-ID correlation. Request bodies and query strings are NOT logged (no PII leak via access log).                                                                            |
| F4-10 | 🟡 MINOR | 5xx bodies are redacted but the **server-side log** preserves the raw error. This is the right tradeoff (operator can debug) but consider rotating server logs onto a volume with restricted read perms (`chmod 600 /var/log/ops-control.log`). |
| F4-11 | 🟡 MINOR | `LOGIN_FAIL` audit detail still plaintext (`'bad password'` instead of `JSON.stringify({reason})`). Documented in CLAUDE.md MES-3-FIX-3. Forensic tooling that expects uniform JSON shape will flag it.                                         |

---

## 4.4 Monitoring

### Endpoints

| Endpoint       | Verified Phase 3 | Notes                                            |
| -------------- | :--------------: | ------------------------------------------------ |
| `GET /health`  |  ✅ p50 0.3 ms   | Returns uptime, version, node, pid, memory       |
| `GET /ready`   |  ✅ p50 0.2 ms   | Boolean readiness — 200 once boot probes succeed |
| `GET /metrics` |  ✅ p50 2.9 ms   | Prometheus exposition format, 50+ counters       |

### Metrics surface (sample)

```
http_requests_total{method="GET",route="/",status="2xx"} 15
http_requests_total{method="POST",route="/auth/login",status="4xx"} 1
http_requests_total{method="POST",route="/auth/login",status="2xx"} 1
http_requests_total{method="POST",route="/totp/verify",status="2xx"} 1
http_requests_total{method="GET",route="/permission-groups",status="3xx"} 7
…
```

Per-route × per-status counters. Sufficient for a Prometheus + Grafana setup.

### Alerting hooks

- **`OPS_BACKUP_WEBHOOK`** (Slack-shaped JSON) — backup-offsite.sh + backupScheduler call this on failure
- **`/api/csp-report`** — CSP violation collector wired into the prod CSP header
- **`/api/telemetry`** — client web-vitals + JS error reports (Phase 9N.3 + 10H)

| ID    | Severity | Finding                                                                                                                                                                                           |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-12 | 🟢 OK    | Health/ready/metrics endpoints are mature and verified responsive (Phase 3). Prometheus metrics shape is standard. CSP-report endpoint is wired. Backup-failure webhook is configured separately. |
| F4-13 | 🟡 MINOR | No Grafana dashboard JSON ships with the repo. Operator deploying Prometheus/Grafana for the first time has no preset. Consider checking in `docs/ops/grafana-dashboard.json`.                    |

---

## 4.5 Backup & Restore

### Backup tooling

| Component                            | Purpose                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `server/services/backupScheduler.js` | In-process daily cron. Activate with `OPS_BACKUP_SCHEDULE=1`. Default OFF for dev.   |
| `scripts/backup-offsite.sh`          | 3-2-1 rule "1 off-site" copy via rsync/scp. Companion to scheduler.                  |
| `scripts/verify-backup.js`           | Verify a snapshot is restorable. `--strict` schema-validates critical Library files. |
| `Backup & restore/Code/`             | Operator-facing restore tooling (CLAUDE.md "All data gone after a restore" runbook). |
| `Backup & restore/Data/`             | Operator backup target (dev workspace empty — production-only).                      |

### `verify-backup` run (live, on this dev workspace)

```
✓ Backup root: …/Backup & restore
✗ Missing critical file: PermissionGroups/groups.json
✗ Missing critical file: Users/users.json
✗ Missing critical file: Rate/rate_sites.json
✗ Missing critical file: MachineProfiles/profiles.json
✗ Missing critical file: QuoteHistory/quote_history.json

❌  Backup verification FAILED — 5 error(s), 0 warning(s)
```

This is **expected** on a dev workspace (the `Backup & restore/Data/` directory is empty by design; backups land here only when the operator runs the production scheduler against this path). **Not a code bug** — it is what the verifier should do when a fresh dev box has no data backup yet.

| ID    | Severity | Finding                                                                                                                                                                                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-14 | 🟢 OK    | Three-tiered backup: in-process scheduler (3 copies) + off-site rsync + verifier. CLAUDE.md "TOTP key rotation runbook" + "Bare-metal restore" + "All data gone after a restore" runbooks are all mapped to actual scripts.           |
| F4-15 | 🟡 MINOR | `verify-backup` fails fast on a dev-workspace run because the `Backup & restore/Data/` is empty. Consider adding a `--dev-mode` flag that exits 0 with a hint, OR document that this verifier should only run on prod. Not a blocker. |

### Restore drill

CLAUDE.md "Bare-metal restore" runbook has the full sequence (provision new box → rsync from off-site → restore `.env` → `npm install --production` → `npm run preflight` → `systemctl enable --now`). RPO 24h (nightly), RTO 2h hot-spare / 6h cold.

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                           |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-16 | 🟡 MINOR | Restore drill is **documented** but the audit found no record of it being **rehearsed** in the past quarter (no entry in `MAINTAINERS.md` quarterly-drill log). CLAUDE.md says "Quarterly drill: time the full sequence, fix any documentation gap revealed." — schedule one in the next 30 days. |

---

## 4.6 Rollback Plan

### `releases/<ts>/` snapshot pattern

`deploy.sh:98-109` (verified above) snapshots before every rsync, retains 5 most recent. CLAUDE.md "Bad deploy — need to roll back":

```bash
ssh user@server
sudo systemctl stop ops-control
ls /opt/ops-control/releases       # pick previous snapshot
cd /opt/ops-control
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./
sudo systemctl start ops-control
```

`server/data/` is **deliberately not versioned** — accumulates across releases.

| ID    | Severity | Finding                                                                                                                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F4-17 | 🟢 OK    | Rollback path is bounded by `deploy.sh` snapshot retention. Operator-tested runbook in CLAUDE.md. Snapshot disk fill < 1 GB at typical bundle sizes.                                                                                       |
| F4-18 | 🟡 MINOR | The rollback runbook copies subtrees with `cp -R` rather than rsync — no integrity check on the restored files. For an internal LAN ERP this is fine; if data sensitivity grows, consider `rsync -av --checksum` to detect partial copies. |

---

## 4.7 Documentation completeness

| Doc                                                                                   | Status                                     | Audience                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| `Use guide/OpsControl_GoLiveGuide_v1.2.docx`                                          | Present (~28 KB)                           | Operator                     |
| `Use guide/OpsControl_Training_EN_v1.0.xlsx`                                          | Present                                    | Trainer (English)            |
| `Use guide/OpsControl_Training_VN_v1.0.xlsx`                                          | Present                                    | Trainer (Vietnamese)         |
| `MIGRATION_GUIDE.md`                                                                  | Present, Vietnamese-language, step-by-step | IT admin                     |
| `README FIRST/{README, ARCHITECTURE, CHANGELOG, MIGRATION, RELEASE_NOTES, CLAUDE}.md` | Full set                                   | Onboarding                   |
| `docs/GO_LIVE_GUIDE.md`, `docs/GO_LIVE_READINESS.md`                                  | Present                                    | Pre-deploy checklist         |
| `docs/ENTERPRISE_HARDENING.md`                                                        | Present                                    | Sprint 11–13 hardening trail |
| `docs/SECURITY.md`                                                                    | Present                                    | Threat model                 |
| `MAINTAINERS.md`                                                                      | Present (~21 KB)                           | On-call + IT                 |

### Help system in-app

CLAUDE.md "Help system" — `client/src/help/content.js` (6 056 LOC) is the single source for in-app Help tab + Word user guide. `prebuild` hook regenerates `OpsControl_UserGuide.docx` on every `npm run build` so the offline doc shipped to operators stays fresh.

| ID    | Severity | Finding                                                                                                                                                                                                                                                    |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-19 | 🟢 OK    | Documentation is **dense** and **bilingual**. In-app Help auto-rebuilds the offline Word user guide on every prod build. Operator-facing docs cover install, migration, training, and recovery runbooks.                                                   |
| F4-20 | 🟡 MINOR | The training xlsx files are at `v1.0`, not `v1.2/v1.5`. CLAUDE.md lesson 3 ("xlsx training manuals drift from code") is the explicit acknowledgment. Update training xlsx before next operator onboarding cohort, OR retire them in favour of in-app Help. |
| F4-21 | 🟡 MINOR | `MIGRATION_GUIDE.md` references upgrading **v1.2 → v1.3**, but the repo is now `v1.5.0`. The doc claims "data layout giữ nguyên; chỉ thay binary" which may not survive intermediate schema changes (FIX-15, etc.). Refresh before next deploy.            |

---

## 4.8 RBAC enforcement

### Permission model (recap from Phase 1)

3-layer authorisation (CLAUDE.md S1-S3):

1. **Role** (`sys / admin / cost / user / viewonly`) — coarse write + admin gate. `sys` = god mode.
2. **Department** (`sales / cs / npi / …`) — informational + suggestion.
3. **Permission Group** — per-tab matrix (`hidden / read / edit`). The enforcement layer.

### Server-side enforcement

| Pattern                                  | Coverage                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `requireRole(N)` (1=viewonly … 5=sys)    | Used at module-level on `import.js` (role≥4 = admin/sys for every bulk import) |
| `requireTabAccess('tabId', mode='edit')` | Wraps tab-specific writes (rfq-tracker, sample-tracking, kiosk-admin)          |
| `requireBodyTabAccess(SAVE_ALL_TAB_MAP)` | `/api/save-all` checks every body key's tab in one shot                        |

**Coverage gaps I found**:

- `domains/planning/server/routes/operationV2.js` + `workOrderV2.js` use a **local** `requireTabAccess` shim ([`kiosksV2.js:55`](domains/planning/server/routes/kiosksV2.js#L55)) instead of importing the canonical one from `server/services/permissionService.js`. CLAUDE.md MES-3-FIX-8 (promoted P2) acknowledges this — defense-in-depth gap, not currently exploitable because role + state-machine guards still apply.

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F4-22 | 🟢 OK    | RBAC is multi-layered (role + department + permission group) with both client-gate (`<AccessGate>`) and server-side (`requireTabAccess`) enforcement. CSV-style curl bypasses the client and gets `403 permission_denied {tab, required, current}` — defense-in-depth verified in Phase 1. |
| F4-23 | 🟡 MINOR | MES-3-FIX-8: `domains/planning/server/routes/{operationV2,workOrderV2,kiosksV2}.js` use a local `requireTabAccess` shim instead of importing the canonical module. Drift risk if the canonical shape changes. Sprint+1.                                                                    |

---

## 4.9 Audit log

### Surface

- **68 `audit()` callsites** across `server/` + `domains/`.
- Storage: SQLite `audit_log` table (migrated from JSON file in v1.3 P0 per [`server/repositories/auditStore.js:5`](server/repositories/auditStore.js#L5)).
- Schema: `(ts, event, user, ip, detail)` with indexes on each (Phase 1 §1.4.2).
- Rotation: `server/services/auditRetention.js` (v1.3 P0) — daily.

### Top events captured

`BACKUP_FAILED, TOTP_ENROLLMENT_COMPLETE, QUOTE_TRASH, QUOTE_RESTORE, QUOTE_PURGE, LOGIN_FAIL, BACKUP_SCHEDULE_UPDATE, BACKUP_RUN_NOW, USER_DELETE, TOTP_VERIFY_FAIL, TOTP_SECRETS_DECRYPT_FAIL, TOTP_ROTATED, TOTP_ENROLL_REJECT, TOTP_ENROLLMENT_REQUIRED, TOTP_ENROLLED, SITES_CHANGE, SESSION_REVOKE_ADMIN, ROLE_CHANGE_REVOKE, ROLE_CHANGE, …`

Coverage spans:

- Auth (login/logout/TOTP)
- User lifecycle (create/delete/role-change)
- Permission groups (PG_CREATE/UPDATE/DELETE)
- Quote lifecycle (trash/restore/purge)
- Backup events (run_now/scheduled/failed)
- Sys recovery events (`SYS_RECOVERY` per CLAUDE.md "All admin / sys users lost access" runbook)

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                                        |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-24 | 🟢 OK    | 68 audit callsites covering all material state changes. SQLite-backed (indexed on ts/event/user) with daily retention rotation. Operator can query via `/api/audit/timeline?event=…&user=…&from=…&to=…`.                                                                                                       |
| F4-25 | 🟡 MINOR | Audit log has **no tamper-resistance** (no append-only WAL, no signature chain). A sys-role user with shell access can `DELETE FROM audit_log WHERE …`. Acceptable for an internal LAN ERP where the operator-OS-account IS the trust boundary, but document this constraint explicitly in `docs/SECURITY.md`. |

---

## 4.10 Data migration plan

### Schema versioning

- **No schema-version table.** F1-25 (Phase 1) flagged this. Migrations are forward-only via `IF NOT EXISTS` + `pragma_table_info` checks in [`server/db/init.js`](server/db/init.js).
- Down-migration path = **restore from `releases/<ts>/` snapshot** (per F4-17 above) + nightly DB backup.

### Library file → SQLite shadow

- `server/repositories/shadowWrite.js` mirrors xlsx imports into SQLite while keeping the JSON file as ground truth.
- F1-22 noted no FK from quotes → materials.code (acceptable for v1; document).

### v1.0 → v1.5 migration documented

`MIGRATION_GUIDE.md` is operator-targeted Vietnamese, step-by-step. Covers:

- Pre-flight backup
- License migration
- SERVER + CLIENT install on Apple Silicon
- Setup wizard walk-through

Per F4-21 above, the doc references v1.2→v1.3 — needs a refresh for the v1.5 jump.

| ID    | Severity | Finding                                                                                                                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F4-26 | 🟡 MINOR | No schema-version table. For internal LAN ERP this is acceptable (rollback = snapshot restore) but every schema change becomes one-way unless paired with an explicit data-preserving rewrite. Document this in `docs/MIGRATION_GUIDE.md`. |

---

## 4.11 Phase 4 Findings Summary

### Counts by severity

| Severity   |                                                                   Count |
| ---------- | ----------------------------------------------------------------------: |
| 🔴 BLOCKER | **0** (F4-5 needs verification — could become BLOCKER if path is wrong) |
| 🟠 MAJOR   |                             **1** (F4-5 systemd `DATA_DIR` legacy path) |
| 🟡 MINOR   |                                                                  **12** |
| 🟢 OK      |                                                                  **13** |

### Top action items before deploy

1. **F4-5 — verify `deploy.sh:191` `DATA_DIR=…/COST_V1.0/CCL_Pricing/data`**. If `10.102.3.61` does NOT have a sibling `COST_V1.0/CCL_Pricing/data/` directory, this becomes a 🔴 BLOCKER (service won't boot). Either fix to `$APP_DIR/server/data` or document the in-place-migration topology.
2. **F4-21 — refresh `MIGRATION_GUIDE.md`** for the v1.5 jump (currently says v1.2→v1.3).
3. **F4-16 — schedule a quarterly restore drill** (not done in past quarter per `MAINTAINERS.md`).
4. **F4-20 — refresh training xlsx** (currently v1.0).

### What looks **mature** (Phase 4 evidence)

- Whole-`.env` merge across deploys (Sprint 1.7 fix verified)
- Pre-rsync snapshot to `releases/<ts>/` with 5-snapshot retention
- Preflight gate before service restart (refuses to flip systemd if env invalid)
- Structured one-line-JSON request log with request-ID correlation; no body / query / session leak
- 5xx redaction via `safeError.js`
- Three-tiered backup: in-process scheduler + off-site rsync + verifier
- 68 audit() callsites covering all material state changes (login, TOTP, role, quote lifecycle, backup)
- SQLite-backed audit log with daily rotation + indexes for fast timeline queries
- 3-layer RBAC (role + dept + permission group) with both client gate and server-side enforcement
- Comprehensive Vietnamese-language operator docs (MIGRATION_GUIDE.md, GoLiveGuide.docx, training xlsx EN+VN)
- DR runbooks in CLAUDE.md: TOTP key rotation, admin lockout recovery, bad-deploy rollback, bare-metal restore
- Health/ready/metrics endpoints + Prometheus exposition format
- Backup-failure webhook, CSP report endpoint, client telemetry endpoint

---

## ✋ CHECKPOINT — Phase 4

Phase 4 complete. **No 🔴 BLOCKER** _yet_ — but **F4-5 needs operator verification** before next deploy (could become a BLOCKER if `10.102.3.61` lacks the sibling `COST_V1.0/CCL_Pricing/data/` directory).

Next phase is the **FINAL REPORT** (Phase 5) — consolidates all 4 phases into the `FINAL-REPORT.md` deliverable per your brief: Executive Summary, Bug Inventory table, Fix Roadmap (P0/P1/P2), Risk Matrix mermaid, Go-Live Checklist, Recommendations, Appendix.

Reply **`go phase 5`** for the final report. Or specify deeper inspection on Phase 4 first (e.g., "verify F4-5 against the prod server" — I'd need SSH access).
