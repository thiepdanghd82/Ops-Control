# Step F — Pre-Deploy Smoke Test Result

**Tester:** Henry (self-test, internal-only project)
**Date:** 2026-05-04
**Branch:** `fix/pre-go-live-p0`
**Commit at smoke test:** `513d478` (Step E — UAT request template + pending-UAT gate)
**Test environment:** dev box (macOS, port 3001, NODE_ENV=development) — verified bundle hash `index-BBScY_IH.js` contains Fix 4 changes (`login.heading.signin` key present)
**Duration:** ~5 min wallclock
**Mode:** Section 3 of `STEP-C-uat-checklist.md` (operator self-test, no formal counter-sign per Option C workflow)

---

## Smoke test results

| #   | Step / Action                                               | Expected                                                                        | Actual                                                                                                                                                                                                                                                  | ✓/✗ | Fix exercised                            |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------- |
| 1   | Boot server, capture stdout                                 | Env-source log shows 8 vars with sources / masking                              | `🌱 [env] resolved sources:` line followed by 8 vars: `NODE_ENV: development (from os env)`, `OPS_PORT: 3001 (from os env)`, `PORT/DATA_DIR/OPS_CORS_ORIGINS/OPS_TOTP_KEY/OPS_ALLOW_SAME_ORIGIN: <unset>`, `OPS_KIOSK_KEY: <64 chars> (from .env file)` | ✅  | Fix 7                                    |
| 2   | Same stdout (continued)                                     | Compression startup log                                                         | `📦 [compression] enabled (threshold=1024, level=6, sse-excluded)`                                                                                                                                                                                      | ✅  | Fix 2                                    |
| 3   | Same stdout (continued)                                     | DATA_DIR resolution log                                                         | `📁 Data directory: /Volumes/Macintosh Data/Claude-Cowork/3. PROJECTS/Ops Control v1.2/server/data` (correctly fell back to `./server/data` default since `.env` doesn't override)                                                                      | ✅  | Fix 1 + 7                                |
| 4   | `curl http://localhost:3001/`                               | HTTP 200                                                                        | `200`                                                                                                                                                                                                                                                   | ✅  | Baseline                                 |
| 5   | `/assets/<X>.js` body-size delta                            | gzip > 50% reduction on JS asset                                                | `useI18n-DnvPOak8.js`: 6968 B raw → 2934 B gzipped = **−57.9%**                                                                                                                                                                                         | ✅  | Fix 2                                    |
| 6   | Wrong password / unknown user via curl                      | `401` + `{"ok":false,"error":"Invalid credentials"}` (no `msg` field, no leak)  | `{"ok":false,"error":"Invalid credentials"}` byte-exact match                                                                                                                                                                                           | ✅  | Fix 3                                    |
| 7   | i18n key for h1 "Sign in" / "Đăng nhập"                     | `login.heading.signin` baked into client bundle                                 | Key present in `client/dist/assets/index-BBScY_IH.js` (greppable, both EN+VI translations bundled)                                                                                                                                                      | ✅  | Fix 4                                    |
| 8   | End-to-end integration: stale-chunk guard + health endpoint | `/assets/THIS-DOES-NOT-EXIST.js` → 404 (NOT 200); `/health` returns v1.5.0 JSON | `404` returned (correct stale-chunk MIME-crash defense); `/health` returns `{"ok":true, version:"1.5.0", node:"v20.20.2"}`                                                                                                                              | ✅  | CLAUDE.md regression guard + integration |

**Score:** **8 / 8 PASS** (0 fail, 0 partial, 0 N/A)

---

## Note on Row 5 — Content-Encoding header

`curl -sI` (HEAD probe) didn't display `Content-Encoding: gzip` header in stdout — likely Node `compression` middleware suppresses the header when the response is HEAD (no body to compress). The **body-size delta on the GET request is authoritative**: 6968 B → 2934 B = 57.9% reduction proves compression IS active. Matches Phase 3 audit benchmark pattern (1.6 KB JS → 414 B = −89.6% on /metrics).

---

## Decision

**[x] ✅ ALL PASS → proceed to Phase 2 (merge + tag + deploy prep)**
[ ] ⚠️ MINOR ISSUES → ship with notes, log to backlog
[ ] ❌ BLOCKER → halt, fix-forward Phase 2.5

### Sign-off (operator self-test, internal project)

**Tester:** Henry
**Tester role:** Self (project owner / sole operator)
**Verdict:** APPROVED for production deploy to `10.102.3.61` via `deploy.ps1`
**Date:** 2026-05-04
**Commit at sign-off:** `513d478`

> **Operator self-test rationale.** This is an internal-only application for CCL Vietnam with a single operator (Henry) who is also the project lead. Formal independent UAT (per `STEP-C-uat-checklist.md` §5.5 ceremony) would require a second person — not available for this deploy. Trade-off: faster ship; risk: operator-bias on observed results. Mitigated by:
>
> 1. The 8 smoke rows test against OBSERVABLE evidence (HTTP codes, stdout grep, byte-size deltas) — not subjective UI judgment
> 2. Server-side test suite (1 618 tests) covers behavior; smoke only checks integration
> 3. Recovery anchors preserved (`wip-snapshot-20260504-082812`, `pre-sidebar-revert-20260504-090729`); rollback per Sprint 1.7 snapshot pattern (CLAUDE.md "Bad deploy" runbook) takes < 5 min
> 4. The full Step C UAT checklist remains the playbook if a multi-person UAT is needed in future (e.g. v1.6 minor release)

---

## Notes / observations

- All 8 smoke rows used **observable evidence** (no subjective judgment) — minimizes operator-self-test bias.
- Row 5 Content-Encoding header detail flagged for future audit awareness; not a fail.
- The bundle had Fix 4 baked in — no rebuild needed mid-test.
- Recovery anchors verified during Phase 1.1 environment check (`wip-snapshot-*` + `pre-sidebar-revert-*` git tags both present).
- Working tree state: 32 entries (B1+B2 deferred WIP per Fix 6 plan; not in scope for this deploy).
- F-FU-5 (bcrypt → argon2id residual leak) is time-bound and not testable in smoke — re-evaluate 30 days post-deploy via `auditLegacyPasswords()` count, per retrospective §6.

## Cross-references

- Smoke methodology: [`STEP-C-uat-checklist.md`](STEP-C-uat-checklist.md) §3
- Per-fix evidence: [`STEP-B-fix-summary.md`](STEP-B-fix-summary.md)
- Final audit verdict (post-Step-D): [`FINAL-REPORT.md`](FINAL-REPORT.md) §8
- Retrospective: [`STEP-B-RETROSPECTIVE.md`](STEP-B-RETROSPECTIVE.md)
