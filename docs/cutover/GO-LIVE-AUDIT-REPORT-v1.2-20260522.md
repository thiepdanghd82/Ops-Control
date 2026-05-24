# Ops Control v1.5.9 — Pre-Go-Live Audit Report

**Audit date**: 2026-05-22 | **Target go-live**: 2026-05-30 (8 days) | **Site**: CCL Design Vietnam, Yen Phong factory
**Branch**: `fix/multi-tier-export-rows` (HEAD `076a844`, 3 commits ahead of `origin/main`)
**Auditor**: 8-agent parallel sweep (Security · Data · Deployment · Code Quality · Testing · Business Logic · Ops Readiness · Audit Trail)
**Reference**: prior PRR `docs/audit/FINAL-REPORT.md` (2026-05-04, verdict ✅ GO post-Step-B). This audit re-tests the post-PR-#47/#48/#49/#50/#52/#53/#54/#55 surface.

---

## EXECUTIVE SUMMARY (1 page, email-ready, bilingual)

### English — Forward to Project Lotus contractor

**Verdict: 🛑 NO-GO as of 2026-05-22.** Conditional 🟡 **GO-WITH-CONDITIONS** achievable by 2026-05-30 if the **8-Day Cutover Plan** (separate file) is executed in full. **Strategic recommendation: ship a scoped v1.5.10 (Sales + Costing + Quote Export + Kiosk-MES) on 2026-05-30; defer the Planning / Work-Orders module to v1.5.11 (1–2 weeks later).** One Planning-side calc bug (BOM scrap factor mis-mapped on 81% of rows) would cause systematic 1–15 % material-order errors if shipped as-is.

**Top 3 risks if go-live proceeds today, unchanged**:

1. **No working backup, no off-site, no documented Day-0 migration playbook.** Last SQLite backup is 18 days old (2026-05-04). The scheduler is OFF by default and no one has set `OPS_BACKUP_SCHEDULE=1` on the prod box. The "manual backup" claimed in the pre-audit briefing was not found on disk. **A disk fault, accidental admin delete, or power event on go-live week destroys data with no recovery.**
2. **CI has been red on `main` for 6+ consecutive commits since 2026-05-19, and there is NO documented UAT sign-off for the v1.5.9 surface.** Every recent merge was waved through with admin override. The only "UAT" evidence is a 2026-05-04 self-test against a pre-Export commit. Shipping to 20 operators against an unverified codebase is a defensibility hole.
3. **Operators were trained on v1.0 material (April 16); deployed system is v1.5.9** — 14 sprints of UI redesign in between (HomePage, KPI tiles, Quote Export, Alt-Materials, Layout Sync, MES Kiosk). Without a refresher webinar + cheat-sheet at each kiosk on 2026-05-29, 30–60 % of operator time on Day-0 will be spent figuring out the new UI.

**Effort to clear blockers**: ~32 engineering hours across 8 days (see 8-Day Cutover Plan). Achievable with focused execution and pre-allocated bilingual on-site support.

**What is structurally sound**: argon2id + TOTP + CSRF + HSTS + magic-byte upload validation; multi-tier export P0 fix is verified in code and tested (14 + 12 new tests); MES kiosk state machine, cascade-cancel, and key-persistence all verified CLOSED in code (CLAUDE.md backlog is stale); hybrid JSON + SQLite persistence has proper WAL + FK + optimistic locking + per-quote async lock; ~86 audit callsites covering approval transitions, quote export forensics, MES op lifecycle, kiosk pairing, backup failures, and material-set switches.

---

### Tiếng Việt — Forward cho Ban Giám đốc CCL Vietnam

**Phán quyết: 🛑 KHÔNG GO ngày 2026-05-22.** Có thể đạt 🟡 **GO CÓ ĐIỀU KIỆN** vào 2026-05-30 nếu thực hiện đầy đủ **Kế hoạch Cutover 8 ngày** (file riêng). **Khuyến nghị chiến lược: ship phạm vi hẹp v1.5.10 (Sales + Pricing + Xuất báo giá + Kiosk-MES) đúng 2026-05-30; trì hoãn module Planning / Work-Orders sang v1.5.11 (chậm 1–2 tuần).** Có 1 lỗi tính toán trong Planning (hệ số scrap BOM lấy sai cột trên 81% dòng dữ liệu) sẽ gây sai lệch 1–15 % khối lượng vật tư đặt hàng nếu lên prod ngay bây giờ.

**3 rủi ro cao nhất nếu go-live ngay hôm nay**:

1. **Không có backup chạy thật, không có off-site, không có playbook seed dữ liệu Day-0.** Backup SQLite mới nhất cách đây 18 ngày (2026-05-04). Scheduler tắt mặc định, chưa ai bật `OPS_BACKUP_SCHEDULE=1` trên máy prod. File backup tay mà briefing nói đã chạy — chúng tôi không tìm thấy trên đĩa. **Một sự cố ổ cứng, xóa nhầm bởi admin, hoặc mất điện trong tuần go-live → mất dữ liệu vĩnh viễn.**
2. **CI đỏ trên `main` 6+ commit liên tiếp từ 2026-05-19, và KHÔNG có tài liệu UAT sign-off cho bản v1.5.9.** Mọi PR gần đây đều merge bằng admin override. Bằng chứng "UAT" duy nhất là một lần self-test ngày 2026-05-04 trên commit trước-Xuất-báo-giá. Đem ra 20 operator với code chưa qua kiểm thử là lỗ hổng pháp lý.
3. **Operator được train trên tài liệu v1.0 (16 tháng 4); hệ thống deploy là v1.5.9** — giữa 2 mốc đó là 14 sprint thay đổi giao diện (HomePage, KPI tiles, Xuất báo giá, Alt-Materials, đồng bộ Layout, Kiosk MES). Nếu không có buổi refresher 30 phút EN+VN ngày 2026-05-29 + bảng cheat-sheet ép plastic tại mỗi kiosk, 30–60 % thời gian Day-0 sẽ dành cho mò giao diện thay vì làm việc thực.

**Công sức để gỡ blocker**: ~32 giờ kỹ sư trong 8 ngày. Khả thi nếu thực hiện tập trung + bố trí sẵn người support song ngữ tại Yên Phong.

**Phần đã ổn về mặt kỹ thuật**: argon2id + TOTP + CSRF + HSTS + kiểm tra magic-byte khi upload; lỗi P0 xuất multi-tier đã fix và test (14 + 12 test mới); kiosk state machine + cascade-cancel + key-persistence đều đã CLOSED trong code (mục backlog CLAUDE.md đã lỗi thời); persistence hybrid JSON + SQLite có WAL + FK + optimistic locking + khóa async per-quote; ~86 điểm gọi audit cho approval, xuất báo giá forensic, vòng đời MES op, kiosk pairing, lỗi backup, đổi material-set.

---

## 1. SCOPE & METHODOLOGY

- **Audit window**: 90 minutes parallel + ~25 minutes synthesis.
- **Method**: 8 specialized sub-agents reading-only over `server/` + `client/src/` + `apps/kiosk/` + `domains/planning/` + `desktop/` + `scripts/` + `docs/` + repo metadata (git log, stashes, tags, branches, CI workflow YAML).
- **Out of scope (flagged "Requires runtime verification")**: actual `.env` contents, live `npm audit` against current `package-lock.json`, live CI run output, prod server config, hardware UAT execution.
- **Cross-reference**: every claim against `docs/audit/FINAL-REPORT.md` (2026-05-04 PRR) to flag deltas.

---

## 2. DOMAIN VERDICTS

| #   | Domain                      | Verdict                                                      | Top finding (P0/P1)                                                                                                                                                                |
| --- | --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Security & Secrets          | 🟡 GO-WITH-CONDITIONS                                        | `OPS_KIOSK_KEY` missing from `.env.example`; weaker boot preflight vs deploy preflight; 24 mutation routes rely on role gate alone                                                 |
| 2   | Data Integrity              | 🔴 GO-WITH-CONDITIONS (2 P0)                                 | Backup scheduler OFF + 18d stale + manual backup file not found; no Day-0 migration playbook                                                                                       |
| 3   | Deployment (3 surfaces)     | 🟡 GO-WITH-CONDITIONS                                        | `deploy.ps1` lacks snapshot before rsync (Linux `deploy.sh` has it); no fallback xlsx + import script; Windows installer 2 days older than Mac (missing P0 fix); code-signing gaps |
| 4   | Code Quality + Stash        | 🟡 GO-WITH-CONDITIONS                                        | `stash@{4}` kiosk OpDetail revert (MES-3-FIX-13) NOT in HEAD — must apply; `platform/` dir doesn't exist despite ARCHITECTURE.md claiming it                                       |
| 5   | Testing Coverage            | **🔴 NO-GO**                                                 | No UAT sign-off exists; CI red 6+ commits; MES-3-FIX-36 client-test glob still broken; `acceptOperation` contract test claimed closed but file does not exist                      |
| 6   | Business Logic              | 🟡 GO-WITH-CONDITIONS (Sales/Cost) / **🔴 NO-GO (Planning)** | BL-1 BOM scrap factor wrong on 81% of rows (15,845/19,539); no smoke-quote validation; `ops_test_user role=sys` in prod users.json                                                 |
| 7   | Operational Readiness       | **🔴 NO-GO**                                                 | Backup scheduler OFF; no off-site; training v1.0 vs deployed v1.5.9; on-call rotation undefined                                                                                    |
| 8   | Audit Trail & VN Compliance | 🟡 GO-WITH-CONDITIONS                                        | Quote save (`POST /api/quotes`) + Library `/save-all` are NOT audited; VN Decree 13/2023 PII inventory undocumented; 30-day backup retention < 5/10-year VN statutes               |

**Aggregate**: 2 hard NO-GO domains + 1 conditional NO-GO (Planning). With Planning carved out of v1.5.10 scope and the 8-day plan executed, aggregate **achievable verdict is 🟡 GO-WITH-CONDITIONS for the Sales/Costing/Kiosk surface**.

---

## 3. CONSOLIDATED P0 FINDINGS TABLE

| #    | Severity | Domain                    | Finding                                                                                                                                                                                                                                                        | Location                                                                                                                                        | Recommendation                                                                                                                                                                                         | Effort                 | 8-day path                                                     | Mitigation                                                                                                                                  | Post-launch                                                        |
| ---- | -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0-1 | 🔴 P0    | Data                      | Backup scheduler OFF; no persisted config; 18d stale; no `npm run backup:run`; no UI heartbeat; manual backup claimed in briefing NOT found at `server/data/Backup/SQLite/manual-*.db`                                                                         | `server/services/backupScheduler.js:71-87,309-311`; `server/index.js:1213-1219`; `package.json` scripts block                                   | Set `OPS_BACKUP_SCHEDULE=1 OPS_BACKUP_HOUR=2 OPS_BACKUP_RETENTION_DAYS=30 OPS_AUDIT_RETENTION=1` in prod `.env`; add `backup:run` npm script; Day-0 manual run; verify file lands                      | 2h                     | **D-1 (must)**                                                 | Host-level `sqlite3 .backup` cron until automated                                                                                           | UI badge + manual "Run now" button + alert when `lastRun > 26h`    |
| P0-2 | 🔴 P0    | Ops                       | No off-site backup configured (`OPS_OFFSITE_TARGET` unset); IBM 3-2-1 fails                                                                                                                                                                                    | `scripts/backup-offsite.sh` exists, never invoked                                                                                               | Provision NAS or USB external; cron `30 2 * * *`; verify rsync round-trip                                                                                                                              | 4h                     | **D-2**                                                        | Manual USB copy of `Backup/` daily until cron lives                                                                                         | Quarterly restore drill                                            |
| P0-3 | 🔴 P0    | Testing                   | UAT sign-off DOES NOT EXIST for v1.5.9. `docs/uat/runs/` directory missing; zero "signoff" files; pre-audit "Hardware UAT DONE" claim unsubstantiated                                                                                                          | `docs/uat/` — framework only, no run                                                                                                            | Execute the UAT framework end-to-end with Đặng Thế Thiệp; produce `docs/uat/runs/2026-05-2X-export-uat-summary.md`                                                                                     | 1 day                  | **D-3 to D-5**                                                 | Truncate scope to in-app smoke (existing `scripts/help/self-check.mjs`) + capture 3 smoke quote outputs for diff vs Excel                   | Recurring UAT before every minor release                           |
| P0-4 | 🔴 P0    | Testing                   | CI red on `main` 6+ consecutive commits since 2026-05-19. 4/7 jobs fail. Every recent merge admin-overridden                                                                                                                                                   | `.github/workflows/ci.yml` runs 26144971184, 26078194688, 26078163286, 26148158693, 26148398600, 26148672360                                    | Bump CI `node-version: '20'` → `'24'` (fixes MES-3-FIX-36 glob trap); add `cd apps/kiosk && npm ci` before kiosk vitest leg; `npm run fix` for 122 lint errors + manually address 5-10 real bugs       | 4h                     | **D-1**                                                        | None — CI signal is the safety net; without it the audit verdict has no automated reinforcement                                             | Set up CI matrix Node 20 + 24 to prevent regression                |
| P0-5 | 🔴 P0    | Biz Logic (Planning only) | BOM scrap factor mis-mapped: BOMExplosion + MaterialCheck + WorkOrderPrintable read `Component Scrap` (col 6) instead of canonical IFS `Scrap Factor (%)` (col 7). 81% of BOM rows (15,845/19,539) diverge. Material orders 1-15% off                          | `client/src/modules/planning/tabs/BOMExplosion.jsx:82`; `MaterialCheck.jsx:62`; `WorkOrderPrintable.jsx:193`; `client/src/utils/fieldMap.js:12` | Add `componentScrapFactor` alias mapping; switch 3 callsites; preserve `componentScrap` as separate display field; unit test                                                                           | 4h (~50 LOC + 1 test)  | **DEFER PLANNING to v1.5.11** — too risky to ship un-validated | Sales-only v1.5.10 ships clean; Planning sits behind feature flag until BL-1 closed                                                         | File MES-3-FIX-42; column-divergence canary test                   |
| P0-6 | 🔴 P0    | Data + Biz                | No documented Day-0 migration playbook + no smoke-quote validation. calcEngine has been refactored 8 times in 4 months (FIX-32/33/34/40 + alt-materials 3-PR + MVP-1.5)                                                                                        | `docs/` (file absent); `Data for import/data/Library/*` exists as 1:1 mirror of runtime                                                         | Write `docs/MIGRATION-DAY-0.md` (7-step checklist + owner-of-record per entity + sign-off form); build 3 smoke quotes with expected output snapshots from pre-system Excel                             | 8h                     | **D-2 to D-4**                                                 | Rsync-only path is mechanically correct; risk is unverified data quality                                                                    | Boot-time schema validation extension; recurring smoke quote suite |
| P0-7 | 🔴 P0    | Ops                       | Training material v1.0 (Apr 16) vs deployed v1.5.9 — 14 sprints of UI drift (HomePage, KPI tiles, Quote Export button, Alt-Materials toggle, Layout Sync, ResponsiveCSS, MES Kiosk)                                                                            | `Use guide/OpsControl_Training_*.xlsx`; `Use guide/OpsControl_GoLiveGuide_v1.2.docx`                                                            | Mandatory 30-min refresher webinar 2026-05-29 16:30 EN+VN simultaneous + recorded; regenerate `OpsControl_UserGuide.docx` via `scripts/help/build-user-guide.mjs`; laminated cheat-sheet at each kiosk | 6h                     | **D-7**                                                        | Engineer hand-walks operators through changed screens during parallel run week                                                              | Quarterly training refresh tied to minor version                   |
| P0-8 | 🔴 P0    | Audit                     | Quote create/update (`POST /api/quotes`) bypasses `audit()`. Library `/save-all` (Materials, Rates, DDL, Finance, MachineProfiles) bypasses `audit()`. Only SSE `emitDataChange` is emitted. Operator cannot answer "who changed material cost on 2026-05-22?" | `server/routes/costApi.js:2317-2358`; `server/routes/costApi.js:1851-2167`                                                                      | Add `audit('QUOTE_SAVE', cu.username, ip, JSON.stringify({id, type, version, label}))` post-`upsertQuote`; add per-key audit emit inside `/save-all` success branch                                    | 3h (~30 LOC + 3 tests) | **D-1 to D-2**                                                 | quote_versions table at `schema.sql:146` already captures state snapshots with `state_hash` — forensic recovery possible via backup diffing | v1.5.10 — add detailed before/after diff                           |

---

## 4. CONSOLIDATED P1 FINDINGS TABLE

| #     | Sev   | Domain   | Finding                                                                                                                                                                                                               | Location                                                        | Recommendation                                                                                                                                                                  | Effort                | 8-day path            | Mitigation                                                                    |
| ----- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------- | ----------------------------------------------------------------------------- |
| P1-1  | 🟠 P1 | Code Q   | `stash@{4}` kiosk OpDetail optimistic-revert (MES-3-FIX-13) NOT in HEAD; failed dispatch orphans kiosk UI requiring tablet reboot                                                                                     | `apps/kiosk/src/routes/OpDetail.jsx:86-98`                      | Cherry-pick stash@{4} kiosk hunk to hotfix branch; run kiosk vitest; ship in v1.5.10                                                                                            | 1h                    | **D-1**               | Operator workaround: re-tap dispatch from kiosk home                          |
| P1-2  | 🟠 P1 | Deploy   | `deploy.ps1` does NOT snapshot to `releases/<ts>/` before rsync. Linux `deploy.sh` does. Bad deploy on prod (Windows) = no automated rollback                                                                         | `deploy.ps1:140-150`                                            | Add `robocopy` snapshot block mirroring `deploy.sh` (5-snapshot retention)                                                                                                      | 2h (~30 LOC)          | **D-5**               | Manual `robocopy` snapshot before each deploy + drill on staging              |
| P1-3  | 🟠 P1 | Deploy   | No `scripts/import-fallback-xlsx.js` + no `Fallback_Quote_Manual_v1.0.xlsx` / `Fallback_WorkOrder_Manual_v1.0.xlsx`. Outage forcing fallback to Excel = supervisor re-keys manually for hours = data-entry error risk | (no file)                                                       | Create 2 xlsx templates on `\\server\OpsControl\Fallback\`; write import script                                                                                                 | 6h                    | **D-6**               | Manual re-key documented in operational fallback runbook                      |
| P1-4  | 🟠 P1 | Deploy   | Windows installer (`latest.yml` dated 2026-05-18) is OLDER than Mac (`latest-mac.yml` dated 2026-05-20). 16 of 20 operators are on Windows — they would ship WITHOUT the multi-tier export P0 fix                     | `desktop/dist-electron/latest.yml` vs `latest-mac.yml`          | Rebuild Windows installer from v1.5.10 tag; re-upload `latest.yml`                                                                                                              | 2h                    | **D-7**               | Do not deploy old Win installer to factory                                    |
| P1-5  | 🟠 P1 | Biz      | Only 7 user accounts seeded; target is 20 operators per go-live brief. `ops_test_user role=sys` is in prod users.json — god-mode backdoor                                                                             | `server/data/Library/Users/users.json`                          | Provision remaining 13 accounts via Sprint 1.5 provisioning-card flow; DELETE `ops_test_user` before cutover                                                                    | 3h                    | **D-5**               | Disable `ops_test_user` immediately; lock prod login to known whitelist       |
| P1-6  | 🟠 P1 | Audit    | VN Decree 13/2023 PII handling undocumented. `state.end_cu`, `state.direct_cu`, `state.npi_owner`, `state.sale_owner` carry personal/legal-person data                                                                | `docs/SECURITY.md` lacks PII section                            | Create `docs/legal/pii-handling-vn.md`: PII inventory, retention, access controls, data-subject contact                                                                         | 4h (legal review)     | **D-3 to D-5**        | Internal LAN only; no third-party data sharing; permission-group enforcement  |
| P1-7  | 🟠 P1 | Audit    | 30-day backup retention < 5/10-year VN accounting (Law on Accounting Art. 41) + product-liability (Civil Code 608/2015) statutes                                                                                      | `server/utils/backupPath.js:281` `OPS_BACKUP_RETENTION_DAYS=30` | Document `docs/legal/data-retention-policy.md` with 10-yr scope for cost/quote + 5-yr for production; procure cold-archive media (LTO tape / S3 Glacier) within 30 days post-GL | 4h docs + procurement | **D-4 to D-6** (docs) | Audit retention scheduler already keeps 12 months gzip archive                |
| P1-8  | 🟠 P1 | Ops      | Library tarball INCLUDES `Users/totp_secrets.enc` despite inline comment claiming "Skip Users folder"; restore on new TOTP key bricks all 2FA                                                                         | `server/services/backupScheduler.js:124-129`                    | Add `--exclude='Library/Users/totp_secrets*'` to tar command OR document that restore requires same `OPS_TOTP_KEY` (currently CLAUDE.md does — but enforcement gap remains)     | 1h                    | **D-3**               | Print + safe-store `OPS_TOTP_KEY` in factory safe                             |
| P1-9  | 🟠 P1 | Ops      | On-call rotation undefined (solo project, no second engineer briefed)                                                                                                                                                 | n/a                                                             | Identify backup engineer; brief on recovery playbook; share Zalo group                                                                                                          | 2h                    | **D-4**               | Lead engineer mobile + factory IT contact on cheat sheet                      |
| P1-10 | 🟠 P1 | Ops      | No documented sign-off from Yen Phong plant manager on go-live date + Excel-fallback policy                                                                                                                           | n/a                                                             | Email sign-off by D-2                                                                                                                                                           | 1h                    | **D-5**               | Verbal confirmation recorded in conference call                               |
| P1-11 | 🟠 P1 | Security | `.env.example` missing `OPS_KIOSK_KEY` (only TOTP + HMAC + CORS documented). Preflight refuses prod boot; fresh deploy fails with no doc on how to generate                                                           | `.env.example`                                                  | Append `OPS_KIOSK_KEY=` block mirroring TOTP block                                                                                                                              | 5 min                 | **D-1**               | `openssl rand -hex 32` + add to `.env` manually                               |
| P1-12 | 🟠 P1 | Audit    | Daily audit-retention scheduler GATED on `OPS_AUDIT_RETENTION=1` (default OFF); active audit DB grows unbounded unless explicitly enabled                                                                             | `server/services/auditRetention.js:187`                         | Set `OPS_AUDIT_RETENTION=1` in prod `.env` (already bundled in P0-1)                                                                                                            | 1 line                | **D-1**               | DB-backed (not flat); 73K rows / year is tolerable for year 1                 |
| P1-13 | 🟠 P1 | Biz      | No documented provenance for staged Library data (which IFS extract, when, who validated). Runtime = staging mirror — drift risk between releases                                                                     | `Data for import/`, `MAINTAINERS.md` (missing entry)            | Add `Data for import/README.md` with IFS extract date + source query + columns expected + engineer who validated                                                                | 1h                    | **D-2**               | Pin current `server/data/Library/` snapshot to git tag `data-seed-2026-05-30` |

---

## 5. P2/P3 SELECTED FINDINGS (post-go-live cleanup)

(Full list is in agent transcripts; below are the items operators should know about.)

| #     | Sev   | Domain   | Finding                                                                                                                                                                   | Recommendation                                                                                  |
| ----- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P2-1  | 🟡 P2 | Security | 18+6 mutation routes in `domains/planning/server/routes/*V2.js` + kiosk mutation routes rely on `requireRole` only, no `requireTabAccess` (MES-3-FIX-8 carryover)         | Add `requireTabAccess('work-orders')` after each `requireRole(2)`; close MES-3-FIX-8 in v1.5.11 |
| P2-2  | 🟡 P2 | Security | Kiosk mutation routes (start/pause/resume/complete/scan) lack per-machine ownership check — kiosk A can act on kiosk B's op if it knows the op_id                         | Add `validateOpBelongsToKiosk(req.params.id, req.kiosk.machine_code)`; ship in v1.5.11          |
| P2-3  | 🟡 P2 | Data     | `upsertQuote` rewrites entire 3 MB `quote_history.json` (68k lines) on every save under 20 concurrent operators → write amplification + filesystem-cache pressure         | Flip `OPS_DATA_BACKEND=sqlite` after 14-day parity (Sprint 7.4 pre-wired); deferred to week-4   |
| P2-4  | 🟡 P2 | Data     | calcEngine uses native float; multi-tier rollups can drift cents over many MOQs (VAT calc `total_s * 0.15` rounds at display only)                                        | Sprint+ rewrite to integer-VND or Big.js; out of scope for go-live                              |
| P2-5  | 🟡 P2 | Data     | `process.env.TZ` not set anywhere; Yen Phong is Asia/Ho_Chi_Minh (UTC+7). UTC storage correct but display drifts on host with mis-set tz                                  | Add `TZ=Asia/Ho_Chi_Minh` to prod `.env` (bundled in D-1)                                       |
| P2-6  | 🟡 P2 | Data     | Soft-delete only on quotes. Materials/Rate/MachineProfiles/RFQ/Sample/Users hard-delete — VN 7-year retention gap                                                         | Sprint+ extend soft-delete                                                                      |
| P2-7  | 🟡 P2 | Deploy   | Code-signing: `verifyUpdateCodeSignature: false` (Win) + `hardenedRuntime: false` + `gatekeeperAssess: false` (Mac). Every operator sees "unidentified developer" warning | LAN-only update URL + operator training "only accept update prompt from in-app"                 |
| P2-8  | 🟡 P2 | Deploy   | `/updates/` static dir resolved at `C:\opt\ops-control\updates` does NOT exist by default → auto-updater silently 404s                                                    | `mkdir` during D-1 deploy + add to `deploy.ps1`                                                 |
| P2-9  | 🟡 P2 | Deploy   | No Caddy/IIS reverse proxy on Windows prod; HTTPS not provisioned; kiosk PWA SW may fail on HTTP-only                                                                     | Run `scripts/setup-https-caddy.sh` on D-4 (Linux) — Windows equivalent deferred                 |
| P2-10 | 🟡 P2 | Code Q   | LOC mega-files growing not shrinking: `Settings.jsx` 2265→3007 (+33%), `PrintAreaCalc.jsx` 2087→2783 (+33%); `costApi.js` flat at 3738                                    | Schedule Sprint 12b immediately post-go-live                                                    |
| P2-11 | 🟡 P2 | Code Q   | `platform/` directory does NOT exist despite `README FIRST/ARCHITECTURE.md` claiming it — new contributors will write code in `platform/auth/` that no router knows       | Pin a 1-paragraph drift notice on README before go-live (XS effort)                             |
| P2-12 | 🟡 P2 | Testing  | Jest `testPathIgnorePatterns` excludes EVERY source dir → `coverageThreshold` 70/60/70/70 is dead config. Real coverage is unknowable                                     | Reactivate coverage in sprint+1; out of scope for go-live                                       |
| P2-13 | 🟡 P2 | Audit    | `audit_log` SQLite has no tamper-evidence (hash chain). Sys-role with shell can `UPDATE audit_log` without detection                                                      | Sprint+ — add `prev_hash` column + INSERT trigger                                               |
| P2-14 | 🟡 P2 | Audit    | `DELETE /api/auth/users/:id` is HARD-delete; orphans audit `user` field                                                                                                   | Switch to soft-delete + 30-day grace; v1.5.11                                                   |

---

## 6. GO-LIVE DECISION MATRIX

| Criterion                                  | Required | Current (2026-05-22)                                   | Target (2026-05-29 EOD)                                 | Pass / Fail                                  |
| ------------------------------------------ | -------- | ------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| Zero P0 blockers                           | 0        | **8 P0**                                               | 0 (after 8-day plan)                                    | 🔴 FAIL today / 🟡 ACHIEVABLE                |
| Backup tested in last 7 days               | Yes      | No (18 days)                                           | Yes (D-1 manual run + D-4 cron verify)                  | 🔴 FAIL / 🟡 ACHIEVABLE                      |
| Rollback plan documented + tested          | Yes      | Doc exists in CLAUDE.md; `deploy.ps1` snapshot missing | Doc + Windows snapshot patch + drill on staging         | 🟠 PARTIAL / 🟡 ACHIEVABLE                   |
| All P0 security findings resolved          | Yes      | 1 P0 (audit emit gap) + 1 P1 (.env.example)            | 0 P0; P1 closed                                         | 🟠 PARTIAL / 🟡 ACHIEVABLE                   |
| Smoke test pass on production env          | Yes      | Never run on v1.5.9                                    | Yes on D-7 staging dry-run                              | 🔴 FAIL / 🟡 ACHIEVABLE                      |
| On-call rotation defined                   | Yes      | Solo, undefined                                        | 2-person bilingual (D-4 brief)                          | 🔴 FAIL / 🟡 ACHIEVABLE                      |
| Hardware UAT signed off by operator        | Yes      | NO EVIDENCE EXISTS                                     | `docs/uat/runs/2026-05-2X.md` produced                  | **🔴 FAIL today** / 🟡 ACHIEVABLE D-3 to D-5 |
| Audit trail covers all critical entities   | Yes      | Quote save + Library save NOT audited                  | Both close in D-1 to D-2                                | 🟠 PARTIAL / 🟡 ACHIEVABLE                   |
| CI green on `main`                         | Yes      | 6+ red commits                                         | D-1 fixes + green from D-2 onward                       | 🔴 FAIL / 🟡 ACHIEVABLE                      |
| Training material matches deployed version | Yes      | v1.0 vs v1.5.9 (14 sprint drift)                       | Webinar D-7 + cheat sheets + regenerated UserGuide.docx | 🔴 FAIL / 🟡 ACHIEVABLE                      |
| Customer-facing comms sent                 | Yes      | Not sent                                               | Sales lead sends D-4 (2026-05-26)                       | 🟠 PARTIAL / 🟡 ACHIEVABLE                   |
| Plant manager sign-off                     | Yes      | Not received                                           | Email by D-2 (2026-05-28)                               | 🟠 PARTIAL / 🟡 ACHIEVABLE                   |

**Overall posture today**: **🔴 NO-GO** — 8 of 12 criteria fail.
**Achievable posture by 2026-05-29 EOD** (with scoped v1.5.10 ship + Planning deferred): **🟡 GO-WITH-CONDITIONS**.

---

## 7. CONDITIONAL GO-LIVE PLAN — Strategic Recommendation

### Recommended scope decision

**Ship v1.5.10 on 2026-05-30** with the following modules **ON**:

- ✅ Sales (RFQ Tracker, Quote History, Quote Analysis, Formal Quotation)
- ✅ Costing (Standard, Complex, Print Area, Ink, Design Tools, Multi-tier Export — the just-fixed P0)
- ✅ Library (Materials, Rates, DDL, Finance, MachineProfiles — read-mostly)
- ✅ Sample Tracking
- ✅ Kiosk MES (Operations dispatch + start/pause/resume/complete) — close MES-3-FIX-13 first via stash@{4}
- ✅ Auth + Permission Groups + Audit + Backup + Settings

**Defer to v1.5.11** (2 weeks):

- ⏸️ Planning (Work Orders, BOM Explosion, Material Check, Capacity, Order Entry) — gated behind feature flag `OPS_FEATURE_PLANNING=0` until BL-1 BOM scrap factor fix lands and is hardware-tested

### Why scope-down

| Risk                             | If Planning ships 2026-05-30                                                     | If Planning deferred to v1.5.11                                         |
| -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Material orders 1-15% off (BL-1) | Systematic error across 81% of BOM rows × 20 operators × hundreds of orders/week | Zero exposure                                                           |
| Operator confusion               | Two modules to retrain at once                                                   | One module to retrain; Planning gets dedicated training in v1.5.11 prep |
| Cutover blast radius             | Whole-system failure if any sub-module breaks                                    | Sales-only failure mode; Planning UI hidden                             |
| Engineering load D-1 to D-0      | All hands on Planning bugs while shipping Sales                                  | Focused Sales/Cost smoke + 1 P0 (multi-tier export)                     |

### Mitigations per remaining P0 (24-72h within plan)

| P0                      | Owner               | Mitigation steps                                                                                                | Re-audit checkpoint                                          |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| P0-1 Backup             | Sysadmin            | `.env` update + `npm run backup:run` D-1 manual; verify D-4 cron fires                                          | D-4 EOD: `ls server/data/Backup/SQLite/` shows file <24h old |
| P0-2 Off-site           | Sysadmin            | Provision USB drive or NAS; cron at 02:30 D-2                                                                   | D-4 EOD: verify rsync round-trip                             |
| P0-3 UAT                | Engineer + Operator | Execute `docs/uat/uat-export-flow.md` scenarios; sign + commit `docs/uat/runs/2026-05-2X-export-uat-summary.md` | D-5 EOD: artifact committed                                  |
| P0-4 CI green           | Engineer            | Bump Node to 24 in `.github/workflows/ci.yml`; add kiosk `npm ci`; `npm run fix`                                | D-1 EOD: green CI on `fix/multi-tier-export-rows` PR         |
| P0-5 BOM scrap          | Engineer            | DEFER Planning module; ship Sales-only                                                                          | n/a — out of v1.5.10 scope                                   |
| P0-6 Migration playbook | Engineer + Ops      | Write `docs/MIGRATION-DAY-0.md` + 3 smoke quotes                                                                | D-4 EOD: doc committed                                       |
| P0-7 Training drift     | Trainer + Ops       | Webinar D-7 + cheat sheets + regenerate UserGuide.docx                                                          | D-7 EOD: attendance roster captured                          |
| P0-8 Audit emit gap     | Engineer            | Add audit() to quote save + library save                                                                        | D-2 EOD: tests pass + audit_log shows test rows              |

See **8-DAY-CUTOVER-PLAN-20260522.md** for sequenced day-by-day actions.

---

## 8. POST GO-LIVE WATCH LIST (first 72 hours)

### Day-0 metrics to monitor (2026-05-30, hourly check)

| Metric                      | Source                                                 | Alert threshold                     | Action                                                   |
| --------------------------- | ------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------- |
| `/health` HTTP 200          | `curl http://10.102.3.61:3000/health`                  | non-200 for 60s                     | Page lead engineer; if 5 min, prep fallback              |
| `/ready` SQLite probe       | `/ready` JSON                                          | `db_ok=false`                       | Investigate SQLite file or filesystem; restart if needed |
| 5xx rate                    | `/metrics` Prometheus                                  | >0.5% of total requests             | Tail `journalctl -u ops-control` for stack trace         |
| Active session count        | `/metrics` `active_sessions_total`                     | Expected ramp 5→20 by 09:00         | If below 10, check kiosk pairings + auth issues          |
| Backup last-run             | `/api/admin/backup/status` (or `audit_log` `BACKUP_*`) | `lastRun.startedAt > 26h`           | Force-trigger `npm run backup:run`                       |
| Failed login rate           | `audit_log` `LOGIN_FAIL` per minute                    | >5/min from single IP               | Lockout should auto-engage; verify                       |
| Multi-tier export errors    | server stderr                                          | Any 500 on `/api/quotes/:id/export` | Captures email-to-customer risk; halt exports            |
| Kiosk queue depth           | `apps/kiosk` IndexedDB `evicted_count` LS              | Any non-zero                        | Operator may have lost scans; verbal verify              |
| Disk free at `server/data/` | `df -h`                                                | <20% free                           | Prune backups manually; investigate growth               |

### Daily check-ins (Day-1, Day-2, Day-3)

- **08:00**: Sysadmin SSH check `/health`, last backup, disk, audit_log row count
- **12:00**: Lead engineer + on-floor engineer 15-min sync — pain points + workarounds
- **18:00**: End-of-shift retro with sales lead — any quotes that "didn't compute right"; diff Excel parallel-run records
- **22:00**: Verify off-site rsync completed (audit + log)

### Stakeholder communication

- Day-1 EOD: send progress email to plant manager + project sponsor (templates in cutover plan)
- Day-3 EOD: send Day-3 report — incidents, resolutions, parallel-run discrepancies
- Day-7 EOD: send go/no-go decision on ending parallel-run + transitioning to single-source

---

## 9. APPENDIX A — Full sub-agent reports

Per-agent detailed findings preserved in the audit run transcripts. The 8 agents covered:

1. **Security & Secrets** — `.env.example` gaps; boot vs deploy preflight; planning route RBAC; kiosk per-machine ownership; SQL injection; XSS; file upload; CVE; dep versions.
2. **Data Integrity** — backup scheduler wiring + gate + manual backup search; SQLite schema + migrations + FK + WAL; tx boundaries; numeric precision; tz; soft-delete; Library data seed + migration scripts.
3. **Deployment (3 surfaces)** — web (deploy.sh/ps1/bat + NSSM); desktop (Electron + auto-update + license + ABI overlays + code-signing); kiosk PWA (SW + bearer pairing + offline queue).
4. **Code Quality + Stash** — all 6 stashes audited + disposition; LOC outliers (mega-files); ESLint health; dead code; worktrees; architectural drift; test orchestration.
5. **Testing Coverage** — UAT framework + sign-off evidence search; test inventory; CI pipeline health; critical path coverage matrix; smoke test plan.
6. **Business Logic + Initial Seed** — multi-tier export P0 verification; calcEngine; MES kiosk readiness (KIOSK-003 + 008 + 015b VERIFIED CLOSED); printing physics; BOM scrap; Library data provenance + smoke quote.
7. **Operational Readiness** — logging; perf; pagination; concurrent users; DR (RPO/RTO actual vs target); parallel run; cutover staffing; comms; training drift.
8. **Audit Trail + VN Compliance** — audit coverage matrix per entity; Decree 13/2023 PII; VAT integration (N/A); product-liability + accounting retention; tamper-evidence; access control.

## 10. APPENDIX B — Reference files cited

Key code/config files referenced across the audit (all paths relative to project root):

- `server/index.js` (server entry, boot preflight, scheduler wiring)
- `server/routes/costApi.js` (3,738 LOC — quote + user + perms + library)
- `server/routes/shared.js` (2,720 LOC — RFQ + sample + approval)
- `server/routes/quoteExport.js` (export entrypoint)
- `server/services/quoteExport/tierRows.js` (multi-tier P0 fix)
- `server/services/quoteExport/index.js` (sheet builders)
- `server/services/backupScheduler.js` (scheduler — default OFF)
- `server/services/authService.js` (audit() emit point)
- `server/services/auditRetention.js` (rotation — default OFF)
- `server/services/librarySchema.js` (Sprint 11 P0-1 hardening)
- `server/services/permissionService.js` (RBAC enforcement)
- `server/db/schema.sql` (audit_log + quote_versions + work_order)
- `server/db/connection.js` (WAL + FK PRAGMA)
- `server/middleware/auth.js`, `middleware/rateLimit.js`, `middleware/validate.js`
- `domains/planning/server/routes/operationV2.js` + `workOrderV2.js` + `kiosksV2.js`
- `domains/planning/server/services/workOrderService.js` (cancel cascade VERIFIED)
- `domains/planning/server/services/kioskTokenService.js`
- `apps/kiosk/src/routes/OpDetail.jsx` (state machine — Pause-in-SETUP NOT a bug; stash@{4} revert NOT in HEAD)
- `apps/kiosk/public/sw.js` (service worker)
- `client/src/services/calcEngine.js` (pricing — DO NOT recompute server-side)
- `client/src/services/gallusEngine.js` (printing physics; bleed_mm + lane gap + K-aware)
- `client/src/services/printTypeUtils.js`, `layoutFieldSync.js` (FIX-32/33)
- `client/src/utils/fieldMap.js:12` (BOM scrap factor — BL-1 P0)
- `client/src/modules/planning/tabs/BOMExplosion.jsx:82` (BL-1 P0)
- `desktop/main.js` (Electron entry, loadUserEnv VERIFIED IN HEAD per `dedff4a`)
- `desktop/package.json` (asarUnpack + extraResources overlays VERIFIED for 3 native modules)
- `scripts/preflight-env.js` (deploy-gate; 3 required keys)
- `scripts/help/self-check.mjs` (smoke harness)
- `scripts/smoke-runtime.sh` (curl pack — predates MVP-1/2)
- `.github/workflows/ci.yml` (Node-20 pin causing client-test glob failure)
- `deploy.sh` (Linux — snapshot at L107) / `deploy.ps1` (Windows — NO snapshot, P1)
- `Use guide/OpsControl_Training_*.xlsx` (v1.0, Apr 16 — training drift)
- `docs/uat/` (framework only — no runs)
- `docs/audit/FINAL-REPORT.md` (2026-05-04 PRR, post-Step-B ✅ GO)
- `Data for import/data/Library/*` (1:1 mirror of runtime — provenance gap)

## 11. APPENDIX C — Requires runtime verification (pass to ops team)

Items the static audit could NOT verify; must be confirmed on the actual prod box / operator hardware before declaring GO:

1. `.env` on prod contains all 3 required keys (`OPS_TOTP_KEY`, `OPS_KIOSK_KEY`, `OPS_EXPORT_HMAC_KEY`) at exactly 64 hex chars, mode 0600
2. `npm audit --audit-level=high --omit=dev` clean on current `package-lock.json`
3. `curl -X POST /api/quotes/1` without CSRF cookie → 403 `csrf_failed`
4. 11 failed logins from one IP → lockout engages per `authService.js:920-924`
5. `/health` returns no PII / env leakage
6. NSSM service installed on `10.102.3.61` (`nssm status ops-control` = `SERVICE_RUNNING`)
7. `OPS_BACKUP_SCHEDULE=1` actually firing — `ls server/data/Backup/SQLite/` shows file <24h old
8. HMAC-FP `9edaa455` matches operator `OPS_EXPORT_HMAC_KEY` (CLAUDE.md S-EXPORT-UAT-SETUP)
9. DMG opens on fresh Mac without Apple Developer ID (right-click → Open workaround required?)
10. Auto-updater check — install v1.5.9, bump v1.5.10 on `/updates/`, confirm dialog fires
11. Kiosk pair flow end-to-end (planner issues card → kiosk QR → redeem → JWT → first `/dispatch`)
12. Port 3000 open in Windows Firewall + ACL from operator subnet
13. `scripts/help/self-check.mjs` 12/12 smoke pass against v1.5.9 bundle
14. Yen Phong server clock + TZ set correctly (backup scheduler computes 02:00 LOCAL)
15. Disk space at `server/data/` ≥ 10 GB free (30-day retention × N MB × growth)
16. NSSM/systemd auto-restart policy works (deliberate `kill -9` test)
17. VPN credentials + SSH key auth working under realistic factory firewall to off-site target
18. `audit_log` row count >0 after first operator login
19. File perms `-rw-------` on `ops.db` + `users.json` + `totp_secrets.enc`
20. `ops_test_user` deleted from prod `users.json` (P1-5)
21. Multi-tier zip generated post-deploy: crack 4 xlsx, confirm Materials!E5 differs MOQ1 vs MOQ2 (proves dedff4a fix end-to-end)
22. Refresher webinar attendance roster captured (Vietnamese labor-law due-diligence)
23. Plant manager sign-off email received by 2026-05-28
24. 20 user accounts exist with correct `permission_group_id` + `must_change_password=true`

---

**End of Audit Report. Companion documents:**

- `8-DAY-CUTOVER-PLAN-20260522.md` — sequenced day-by-day actions with owners
- `ROLLBACK-RUNBOOK-20260522.md` — dual runbook (software v1.5.x + operational fallback to manual Excel), bilingual VN+EN
