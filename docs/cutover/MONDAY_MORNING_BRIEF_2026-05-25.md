# Monday Morning Brief — D-15 (2026-05-25)

> Status snapshot at start of cutover week. Lead Engineer reads this
> over coffee Monday AM. Action queue at top; context below.

---

## What you do RIGHT NOW (next 2 hours)

### Call #1 — Trần Thị Hương (backup engineer consent)

**Goal**: confirm Hương accepts backup engineer role + schedule 30-min prep session this week.

**Script** (5-7 min call):

> "Chào Hương, anh Thiệp đây. Chuyện là Ops Control v1.5.10 sẽ cutover
> ngày 09-06 tới (D-15 từ hôm nay). Plant Manager đã giao anh toàn quyền
> decision. Anh cần 1 backup engineer trên on-call cùng anh từ 08-06 đến
> 16-06 — single point of failure risk anh muốn giảm.
>
> Hương có sẵn sàng làm backup engineer không? Scope cụ thể: standby
> phone, available trong 2h call, hỗ trợ rollback nếu anh unreachable
>
> > 15 phút. KHÔNG cần deploy code mới, KHÔNG cần go/no-go decision —
> > chỉ execute runbook anh đã viết sẵn.
>
> Anh cần 30 phút walk-through repo + runbook tuần này. Hương rảnh
> sáng nào?"

**Outcomes**:

- ✅ ACCEPT → log session date in BACKUP_ENGINEER_BRIEF lines 72 + 74
- ❌ DECLINE → ping em ngay, có Plan B candidate (em đề xuất 2 names)
- 🟡 NEED TIME → ETA hôm nay 17:00 deadline, sau đó Plan B

### Call #2 — HR (Plant Manager contact)

**Goal**: fill 2 TBD placeholders in BACKUP_ENGINEER_BRIEF.md line 64

```
Plant Manager:  Phone <TBD>   Email <TBD>
```

**Ask**: "Em cần phone + email Plant Manager cho cutover incident comms.
Em là Lead Engineer Ops Control."

### Call #3 — IT/Sysadmin lead (Sysadmin contact)

**Goal**: fill 2 TBD placeholders in BACKUP_ENGINEER_BRIEF.md line 67

```
Sysadmin:       Phone <TBD>   Email <TBD>
```

**Ask**: "Cho em phone + email sysadmin phụ trách `10.102.3.61`
NSSM service `ops-control`. Em là Lead Engineer Ops Control."

### After 3 calls done — commit fill

```bash
cd "/Volumes/Macintosh Data/Claude-Cowork/3. PROJECTS/Ops Control v1.2"
# Edit BACKUP_ENGINEER_BRIEF lines 64, 67, 72, 74 với info confirm
git add docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md
git commit -m "docs(release): fill plant manager + sysadmin contacts + briefing dates"
git push origin main
```

---

## State snapshot (verified 2026-05-25 08:10 ICT)

| Item            | State                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| HEAD            | `0681703` on `main` + `origin/main` synced                                                       |
| Tag             | `v1.5.10` at `f33d5c8` (PR #76)                                                                  |
| Working tree    | Clean (no uncommitted)                                                                           |
| Mac DMG         | `desktop/dist-electron/OpsControl-Server-v1.5.10-mac-arm64.dmg` (180 MB, built 2026-05-24 05:24) |
| Win EXE         | ❌ NOT BUILT (CI workflow trigger gap — pending Windows host)                                    |
| Backup engineer | ✅ NAMED (Trần Thị Hương), ⏳ pending phone consent                                              |

---

## Work completed (24h prior — Sunday 2026-05-24)

### PRs merged (5)

- PR #74 — Backup scheduler activation + off-site config + TOTP exclude
- PR #75 — PII handling policy + data retention policy (Decree 13/2023 compliance)
- PR #76 — Smoke quote baseline template (BL-4 framework) + **tag v1.5.10**
- PR #77 — D-1 orchestration scaffolds (UAT + checklist + preflight)
- PR #78 — STOP triggers + backup engineer brief (D-1 discipline)

### Local commit (1 — Monday 08:10)

- `0681703` — Backup engineer name + contact (huongtt@cclind.com)

---

## Pending blockers (need someone other than Lead Engineer)

### Blocker 1 — Win EXE build (P0)

**Owner**: Lead Engineer with Windows host access
**ETA**: D-7 latest (2026-06-02 Tuesday) to leave buffer
**Workaround if blocked**: Mac SERVER + Mac CLIENT only at first
go-live, Win CLIENT in D+1..D+7 patch

### Blocker 2 — Sysadmin Part B backup activation (P0)

**Owner**: Sysadmin (TBD per Call #3 above)
**Task**: SSH to prod `10.102.3.61`, run preflight, activate
`OPS_BACKUP_SCHEDULE=daily` cron per `docs/MIGRATION-DAY-0.md`
**ETA**: D-1 night (2026-06-08) for first backup landed
**STOP trigger**: T5 fires if no `server/data/Backup/SQLite/*.db`
file <24h old by D-0 morning

### Blocker 3 — Delete `ops_test_user` on prod (P1, Issue #69)

**Owner**: Sysadmin (same as above)
**Task**: Edit `server/data/Library/Users/users.json` on prod box
to remove `ops_test_user` entry (file gitignored — must edit on prod)
**ETA**: D-1 same window as Blocker 2

---

## STOP_TRIGGERS review queue

**Status**: ⏳ Lead Engineer has NOT explicitly signed AGREE/DISAGREE
on the 11 triggers. Em đã walk through 6 technical + 3 operational +
2 compliance triggers Sunday night. Trigger anh cần re-review tỉnh táo:

- **T5** (backup tối D-1): nếu Blocker 2 chưa close kịp Sunday → T5 fire → HALT.
- **O2** (stress sleep test): self-binding chính anh, weight về authority.
- **O3** (operator confidence <14/20 = 70%): có muốn lower threshold?

**Action**: anh đọc `docs/cutover/STOP_TRIGGERS_2026-06-09.md` lần
2 tỉnh táo, reply em "AGREE all 11" hoặc "đổi T#X". Em log decision
trail vào sign-off section.

---

## Cutover countdown — D-15 ahead

```
Today  Tue  Wed  Thu  Fri  Sat  Sun  Mon  Tue  Wed  Thu  Fri  Sat  Sun  Mon
D-15   D-14 D-13 D-12 D-11 D-10 D-9  D-8  D-7  D-6  D-5  D-4  D-3  D-2  D-1  D-0
05-25  26   27   28   29   30   31   06-01 02  03   04   05   06   07   08   09
                                                                              ▲
                                                                          GO-LIVE
```

### Key milestones this week (D-15 → D-9)

| Day  | Date  | Owner     | Milestone                                  |
| ---- | ----- | --------- | ------------------------------------------ |
| D-15 | 05-25 | Lead      | Backup engineer phone calls (this brief)   |
| D-14 | 05-26 | Lead      | STOP triggers sign-off + Hương 30-min prep |
| D-13 | 05-27 | Sysadmin  | SSH access confirmed for Hương             |
| D-12 | 05-28 | Lead      | Win EXE build attempt #1 (Windows host)    |
| D-11 | 05-29 | Lead      | Smoke quote fill session (PROMPT 6 scope)  |
| D-10 | 05-30 | Operators | Refresher webinar #1 (60 ops, 2 sessions)  |
| D-9  | 05-31 | (buffer)  | Catch-up day                               |

### Critical path next 2 weeks (D-8 → D-0)

- **D-8 Mon 06-01**: Internal dry-run on staging
- **D-7 Tue 06-02**: Win EXE deadline OR commit to Mac-only first
- **D-6 Wed 06-03**: External UAT day 1 (operators fill 3 baseline quotes)
- **D-5 Thu 06-04**: External UAT day 2 (engineer fill same 3 quotes)
- **D-4 Fri 06-05**: UAT delta analysis + fix sprint
- **D-3 Sat 06-06**: Disaster recovery drill (rollback rehearsal)
- **D-2 Sun 06-07**: REST DAY (no production work — Lead Engineer recovery)
- **D-1 Mon 06-08**: Final preflight + refresher webinar #2 + go/no-go meeting
- **D-0 Tue 06-09**: 06:00 ICT — GO-LIVE WINDOW OPEN

---

## What to ping em about (priority order)

1. **HIGH** — Hương phone call outcome (ACCEPT / DECLINE / NEED TIME)
2. **HIGH** — STOP triggers sign-off (AGREE all 11 / changes)
3. **MED** — Plant Manager + Sysadmin contact info captured
4. **MED** — Win EXE build plan (today or schedule for later this week)
5. **LOW** — Smoke quote session scheduling (D-11 default, can shift)

Em đợi anh ping với outcome Call #1 trước. Sau đó execute theo
priority queue.

---

**Companion docs**:

- `docs/cutover/STOP_TRIGGERS_2026-06-09.md` — 11 triggers awaiting sign-off
- `docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md` — Hương onboarding pack
- `docs/cutover/SCHEDULE_DECISION_2026-05-24.md` — go-live date authority
- `docs/cutover/D-1_FINAL_CHECKLIST_2026-06-08.md` — 12-point go/no-go
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B
