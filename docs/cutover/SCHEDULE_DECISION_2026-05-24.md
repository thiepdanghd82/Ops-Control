# Schedule Decision — Ops Control v1.5.10 Go-Live → 2026-06-09 (Tue)

**Author**: Đặng Thế Thiệp (Lead Engineer)
**Decision date**: 2026-05-24 (Sun)
**Original go-live**: 2026-05-30 (Sat) — superseded
**Slip proposal**: 2026-06-04 (Thu) — superseded by this decision
**Final go-live**: **2026-06-09 (Tue) 06:00 ICT** — 10 calendar days from original
**Authority**: Lead Engineer self-decision (informing stakeholders, not requesting approval)

---

## 1. Supersedes notice

> **THIS DOC SUPERSEDES `docs/cutover/SLIP_PROPOSAL_2026-05-24.md`** (PR #65, squash SHA `30da9a0`).
>
> The slip proposal asked Plant Manager + Sales Lead to approve a move to 2026-06-04 (Thu). After re-reading the D-6 readiness audit findings, Lead Engineer concluded that compressing the work into 9 days still carried unacceptable overtime risk. This doc records the final self-decision to slip 5 more days to 2026-06-09 (Tue) and informs (rather than asks) stakeholders.
>
> SLIP_PROPOSAL_2026-05-24.md remains in the repo as a historical artifact — do not delete or amend it. Its §3 customer comms template is still useful but needs the date string updated (see §5 below).

---

## 2. Decision rationale

Why 2026-06-09 (Tue) instead of 2026-06-04 (Thu) per the slip proposal:

| Driver                         | 2026-06-04 (slip proposal)          | 2026-06-09 (this decision)                                        |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| Working days available         | 9 (Wed 2026-05-27 → Wed 2026-06-03) | 11 (Mon 2026-05-25 → Mon 2026-06-08)                              |
| Average daily engineering load | ~10h compressed                     | ~6-7h sustainable                                                 |
| Recovery weekends in window    | 1 (2026-05-30/31)                   | **2** (2026-05-30/31 + 2026-06-06/07)                             |
| Pre-cutover buffer             | 0 days (D-1 packed)                 | **2 days** (D-4 + D-5 light/buffer)                               |
| Cutover day of week            | Thu                                 | **Tue** — operators fresh midweek; no Mon-after-weekend confusion |
| Engineer overtime risk         | Medium-high                         | Low                                                               |

**Reference**: D-6 readiness audit `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md` (8 P0 findings, both Rollback Runbook A + B non-executable, plan 2 days behind original schedule). The audit is the trigger; this doc is the response.

**Decision authority context**: Project lead delegated cutover-date authority to Lead Engineer after the audit. Plant Manager + Sales Lead are informed via §4 notice and update their plans accordingly — they are not blocking gates.

---

## 3. Recalibrated day-by-day schedule

Engineering starts Mon 2026-05-25. PROMPT references map to the 10-prompt execution kit from the audit findings (PROMPT 1 = CI fix, PROMPT 2 = audit emit, etc. — full list in audit doc).

| D-day   | Date           | Day     | Deliverable                                                                                                                                                                                                                                                                                                                | Type                              |
| ------- | -------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| D-15    | 2026-05-25     | Mon     | **PROMPT 1** — CI Node 22 + `.env.example` adds `OPS_KIOSK_KEY` + delete `ops_test_user` from prod users.json                                                                                                                                                                                                              | Engineering                       |
| D-14    | 2026-05-26     | Tue     | **PROMPT 2** — Audit emit on `POST /api/quotes` + Library `/save-all` (closes P0-8)                                                                                                                                                                                                                                        | Engineering                       |
| D-13    | 2026-05-27     | Wed     | **PROMPT 3** — `deploy.ps1` snapshot patch + rollback drill on staging Win box (closes P1-2)                                                                                                                                                                                                                               | Engineering + Sysadmin            |
| D-12    | 2026-05-28     | Thu     | **PROMPT 5** — `docs/MIGRATION-DAY-0.md` (7-step checklist + owner-of-record per Library entity; closes P0-6)                                                                                                                                                                                                              | Engineering + Ops                 |
| D-11    | 2026-05-29     | Fri     | **PROMPT 4** — `Fallback_Quote_Manual_v1.0.xlsx` + `Fallback_WorkOrder_Manual_v1.0.xlsx` + `scripts/import-fallback-xlsx.js` + paper copies (closes P1-3)                                                                                                                                                                  | Engineering + Sales               |
| D-10    | 2026-05-30     | Sat     | **REST** — first recovery weekend                                                                                                                                                                                                                                                                                          | —                                 |
| D-9     | 2026-05-31     | Sun     | **REST**                                                                                                                                                                                                                                                                                                                   | —                                 |
| D-8     | 2026-06-01     | Mon     | **PROMPT 7** — Enable `OPS_BACKUP_SCHEDULE=1` + `OPS_BACKUP_HOUR=2` on prod + off-site (NAS or USB) + cron verify (closes P0-1, P0-2)                                                                                                                                                                                      | Sysadmin                          |
| D-7     | 2026-06-02     | Tue     | Provision remaining 13 operator accounts via Sprint 1.5 provisioning-card flow + **Sales Lead sends customer comms** (template §5) + PII inventory drafting starts                                                                                                                                                         | Engineering + Sales + Legal       |
| D-6     | 2026-06-03     | Wed     | **PROMPT 6** — 3 smoke quotes baseline: 1 Std Flexo + 1 Cpx Indigo subproduct + 1 multi-tier MOQ. Diff vs operator's pre-system Excel ≤0.5% (closes BL-4)                                                                                                                                                                  | Engineering + Operator            |
| D-5     | 2026-06-04     | Thu     | **PROMPT 8** — `docs/legal/pii-handling-vn.md` + `docs/legal/data-retention-policy.md` (closes P1-6, P1-7) + **PROMPT 9** — rebuild Win installer from v1.5.10 tag; upload both DMG + EXE + `latest*.yml` to prod `/updates/` (closes P1-4)                                                                                | Engineering + Legal               |
| D-4     | 2026-06-05     | Fri     | **Buffer day** — deploy to staging; smoke `/health` + `/ready` + `/metrics`; address any surprise findings from D-5..D-15 work                                                                                                                                                                                             | Engineering + Sysadmin            |
| D-3     | 2026-06-06     | Sat     | **REST** — second recovery weekend                                                                                                                                                                                                                                                                                         | —                                 |
| D-2     | 2026-06-07     | Sun     | **REST**                                                                                                                                                                                                                                                                                                                   | —                                 |
| D-1     | 2026-06-08     | Mon     | **PROMPT 10** — UAT SCN1-8 morning (single-tier Std/Cpx + customer variant + sheet protection + Copy→Save + TOTP + multi-tier zip + Cpx 2-SP × 2-tier + Alt-Materials toggle) + prod deploy afternoon + **refresher webinar 16:30 EN+VN simultaneous, recorded** + attendance roster signed                                | Engineering + Operator + Trainer  |
| **D-0** | **2026-06-09** | **Tue** | **GO-LIVE 06:00 ICT** — server cold-start probe, `/health` + `/ready` + `/metrics`, first quote walk-through 06:30, manual midday backup 09:00 + audit_log verify, shift change EN→remote on-call 12:00, deep probe + parallel-run review 14:00, EOS backup + Day-0 incident log commit 17:00, off-site rsync verify 22:00 | **Everyone on-site at Yen Phong** |
| D+1     | 2026-06-10     | Wed     | Parallel-run with Excel — full parallel                                                                                                                                                                                                                                                                                    | Operator + Sales                  |
| D+2     | 2026-06-11     | Thu     | Parallel-run — full parallel                                                                                                                                                                                                                                                                                               | Operator + Sales                  |
| D+3     | 2026-06-12     | Fri     | Parallel-run — full parallel                                                                                                                                                                                                                                                                                               | Operator + Sales                  |
| D+4     | 2026-06-13     | Sat     | Parallel-run — Ops Control primary, Excel shadow                                                                                                                                                                                                                                                                           | Operator                          |
| D+5     | 2026-06-14     | Sun     | Parallel-run — Ops Control primary, Excel shadow                                                                                                                                                                                                                                                                           | Operator                          |
| D+6     | 2026-06-15     | Mon     | Spot-check 20% of records                                                                                                                                                                                                                                                                                                  | Sales Lead                        |
| D+7     | 2026-06-16     | Tue     | Spot-check 20% of records + go/no-go on ending parallel-run + archive Excel masters read-only if green                                                                                                                                                                                                                     | Sales Lead + Lead Engineer        |

**Cadence**: Mon-Fri engineering blocks (5 days × 2 weeks = 10 working days + 1 buffer = 11). Weekends are REST. Tue go-live + 7-day parallel-run ends Tue 2026-06-16.

**Daily standup**: 09:00 ICT Zalo voice call D-15 through D-1; then 08:00 + 18:00 D-0 through D+7. Plant Manager kept in loop via standup.

**STASH FREEZE**: 00:00 ICT 2026-06-08 → 23:59 ICT 2026-06-10 (3-day window covers D-1 + D-0 + D+1). Verify pre-cutover: `git stash list` empty on every dev + prod box.

**Public holiday check**: No Vietnamese public holidays in window 2026-05-25 → 2026-06-16. Tết Bính Ngọ (Year of the Horse) was January 2026. Past holidays in 2026: Reunification Day 04-30, Labor Day 05-01, Hùng Kings' Festival 04 (lunar 10/3). Next major: National Day 2026-09-02 (well after parallel-run end).

---

## 4. Stakeholder notice (Zalo/email-ready)

**To**: Plant Manager, Sales Lead, Sysadmin, Backup Engineer
**Channel**: Zalo group "OpsControl GoLive 2026-06-09" + email backup
**Subject**: Schedule decision — Go-live 2026-06-09 (Tue)
**From**: Đặng Thế Thiệp, Lead Engineer
**Send**: 2026-05-24 (Sun) EOD

### 🇬🇧 English

After reviewing the D-6 readiness audit, I've decided to shift go-live from 2026-05-30 to **2026-06-09 (Tuesday)** — 10 calendar days later than the original plan and 5 days later than my earlier slip proposal. The 2026-06-04 (Thu) proposal would have compressed engineering into 9 days; 2026-06-09 gives us 11 working days at a sustainable 6-7h/day pace, 2 full weekend recovery windows, and a 2-day pre-cutover buffer for surprise debug. Tuesday go-live keeps operators fresh midweek. Please use **2026-06-09 (Tuesday)** in all forward planning — Sales Lead, please use this date in the customer comms email (template inherited from SLIP_PROPOSAL §3; date string update noted in §5 of the schedule-decision doc). Daily 09:00 standup on Zalo through D-1; full day-by-day schedule + rationale in `docs/cutover/SCHEDULE_DECISION_2026-05-24.md`. No approval needed from your side; this is to keep you in the loop. Reach out if anything blocks your part of the plan.

— Đặng Thế Thiệp, Lead Engineer

### 🇻🇳 Tiếng Việt

Sau khi rà soát audit readiness D-6, tôi quyết định dời go-live từ 2026-05-30 sang **2026-06-09 (Thứ Ba)** — chậm 10 ngày so với kế hoạch ban đầu và chậm 5 ngày so với đề xuất slip trước đó. Đề xuất 2026-06-04 (Thứ Năm) nén kỹ thuật vào 9 ngày; 2026-06-09 cho 11 ngày làm việc với nhịp bền vững 6-7h/ngày, 2 cuối tuần phục hồi đầy đủ, và 2 ngày buffer trước cutover cho debug bất ngờ. Go-live Thứ Ba giúp operator tỉnh táo giữa tuần. Vui lòng dùng ngày **2026-06-09 (Thứ Ba)** trong mọi kế hoạch sắp tới — Sales Lead, vui lòng dùng ngày này trong email comms khách hàng (mẫu kế thừa từ SLIP_PROPOSAL §3; cập nhật chuỗi ngày ghi rõ ở §5 của doc schedule-decision). Standup hàng ngày 09:00 trên Zalo từ giờ đến D-1; lịch ngày-theo-ngày + rationale đầy đủ trong `docs/cutover/SCHEDULE_DECISION_2026-05-24.md`. Không cần duyệt từ phía anh chị; thông báo để cập nhật. Liên hệ tôi nếu có gì block phần việc của anh chị.

— Đặng Thế Thiệp, Lead Engineer

---

## 5. Customer comms date update

The customer comms email template in `SLIP_PROPOSAL_2026-05-24.md` §3 has placeholder dates that reflect the superseded 2026-06-04 (Thu) target. **Sales Lead — please apply these date-string updates before sending:**

| Field            | Old (SLIP_PROPOSAL §3)                      | **New (this decision)**                                            |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| EN go-live date  | `2026-06-04 (Thursday)`                     | **`2026-06-09 (Tuesday)`**                                         |
| VN go-live date  | `2026-06-04 (Thứ Năm)`                      | **`2026-06-09 (Thứ Ba)`**                                          |
| EN slip duration | `5 days later than previously communicated` | **`10 days later than previously communicated`**                   |
| VN slip duration | `chậm 5 ngày so với thông báo trước đó`     | **`chậm 10 ngày so với thông báo trước đó`**                       |
| Send date        | `2026-05-26 (Tue)`                          | **`2026-06-02 (Tue, D-7)`** — keeps ~1-week customer-notice window |

All other comms template content (no-action-required language, sheet protection explanation, "schedule update" framing, BCC hygiene, optional top-5-customer follow-up call) remains exactly as-is in SLIP_PROPOSAL.md §3.

**Why 2026-06-02 send (not earlier)**: customer-notice window of ~1 week is the industry norm for non-disruptive format changes. Sending earlier (e.g. on the decision date 2026-05-24) gives customers too long to forget; sending later (e.g. D-3) feels rushed. D-7 (2026-06-02) is the sweet spot.

---

## 6. What's next (Lead Engineer execution checklist)

- [ ] §4 stakeholder notice posted to Zalo + emailed by 2026-05-24 EOD
- [ ] PROMPT 1 (CI Node 22 + .env.example + delete ops_test_user) starts Mon 2026-05-25 morning
- [ ] Sales Lead acknowledges customer comms date update + drafts updated email by 2026-06-01 EOD
- [ ] Sysadmin confirms D-8 backup activation availability (2026-06-01)
- [ ] Backup Engineer confirms D-8 → D+7 on-call window (2026-06-01 → 2026-06-16)
- [ ] CLAUDE.md sprint history entry `S-SCHEDULE-DECISION` added by Lead Engineer post-go-live (Lesson 0 — sprint entries describe completed work, not pre-decisional state)

---

**End of schedule decision. Companion documents**:

- `docs/cutover/SLIP_PROPOSAL_2026-05-24.md` — SUPERSEDED; historical record (PR #65, SHA `30da9a0`)
- `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md` — D-6 audit findings (PR #66, SHA `9902b59`)
- `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` — original plan; will be replaced by a recalibrated `15-DAY-CUTOVER-PLAN-20260524.md` (or similar) in a follow-up sprint
- `docs/cutover/GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` — original 8-agent audit (still load-bearing)
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — dual rollback runbook (date references need refresh post-decision)
