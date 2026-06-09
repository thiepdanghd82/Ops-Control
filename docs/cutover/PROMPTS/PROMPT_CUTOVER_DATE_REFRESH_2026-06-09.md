# PROMPT — Cutover doc date refresh (go-live slip 2026-06-09 → 2026-06-30)

> Date target: start 2026-06-09 (D-21), MUST land before 2026-06-16 (real D-14 — Hương walkthrough).
> Estimated effort: 60–90 min (classification + relative-date recompute + 2–4 renames + inbound-ref sweep + verify).
> Risk: MEDIUM–HIGH — these are the docs Plant Manager + operators + Backup Engineer (Hương) read to EXECUTE the cutover. A wrong date here sends people on the wrong day. Verification gates strict.
> Closes: pre-go-live audit blocker #2 (cutover doc date drift). Precedent house style: `PROMPT_PR-3_2026-05-27.md`.

---

## Context (read first — must understand before editing)

The CCL Vietnam Yen Phong go-live has slipped **twice**:

1. Original plan: **2026-05-30** (the D-6 audit / slip-proposal era docs)
2. First slip: **2026-06-09** (most operative cutover docs were written for this date)
3. **CURRENT / REAL go-live: `2026-06-30` (Tuesday)** ← canonical. Today 2026-06-09 = D-21.

Consequence: every operative cutover doc that says go-live = `2026-06-09` (and every D-N milestone derived from it) is now **21 days early**. Hương's walkthrough is dated D-14 = `2026-05-26` in the docs; the real D-14 is **`2026-06-16`** (one week from today). If not fixed, the Plant Manager and operators read the wrong calendar.

**Key arithmetic — the shift is exactly +21 days = 3 whole weeks**, so **every weekday label is unchanged** (Tue stays Tue, Mon stays Mon). This makes the recompute mechanical and low-ambiguity.

### Canonical cutover calendar (D-0 = Tue 2026-06-30)

| Milestone | OLD date (06-09 cohort) | NEW date (06-30 cohort) | Weekday |
| --------- | ----------------------- | ----------------------- | ------- |
| D-21 (today) | 2026-05-19 | **2026-06-09** | Tue |
| D-15      | 2026-05-25 | **2026-06-15** | Mon |
| D-14      | 2026-05-26 | **2026-06-16** | Tue |
| D-7       | 2026-06-02 | **2026-06-23** | Tue |
| D-6       | 2026-06-03 | **2026-06-24** | Wed |
| D-2       | 2026-06-07 | **2026-06-28** | Sun |
| D-1       | 2026-06-08 | **2026-06-29** | Mon |
| **D-0**   | **2026-06-09** | **2026-06-30** | **Tue** |
| D+1       | 2026-06-10 | **2026-07-01** | Wed |
| D+7       | 2026-06-16 | **2026-07-07** | Tue |

**Rule of thumb for ANY date you find in an operative doc**: if it belongs to the 06-09 cohort, add 21 days. Do NOT blind-`sed` — see classification + decision points below.

---

## File classification (CRITICAL — operative = fix, historical = LEAVE)

Editing a point-in-time record rewrites history. Follow `PROMPT_PR-3`'s precedent: historical audit artifacts are out of scope.

### ✅ OPERATIVE — must reflect D-0 = 2026-06-30 (FIX these)

| File | Action |
| ---- | ------ |
| `STOP_TRIGGERS_2026-06-09.md` | body dates +21; **rename → `STOP_TRIGGERS_2026-06-30.md`** |
| `BACKUP_ENGINEER_BRIEF_2026-06-09.md` | body dates +21; **rename → `BACKUP_ENGINEER_BRIEF_2026-06-30.md`** |
| `D-1_FINAL_CHECKLIST_2026-06-08.md` | body dates +21; **rename → `D-1_FINAL_CHECKLIST_2026-06-29.md`** |
| `D-1_PREFLIGHT_AUDIT_2026-06-08.md` | body dates +21; **rename → `D-1_PREFLIGHT_AUDIT_2026-06-29.md`** |
| `HUONG_WALKTHROUGH_AGENDA_D-14.md` | body dates +21 (esp. D-14 `2026-05-26`→`2026-06-16`, D-15→`2026-06-15`); **keep filename** (D-14 is a relative label) |
| `DRY_RUN_CUTOVER_D-2.md` | body dates +21 (D-2 → `2026-06-28`); keep filename |
| `WIN_EXE_FIELD_TEST_D-7.md` | body dates +21 (D-7 → `2026-06-23`); keep filename |
| `MAC_INSTALL_GUIDE.md` | body dates +21; D-6 UAT → `2026-06-24`; **Zalo group name** line ~273 (see decision D3) |
| `ROLLBACK-RUNBOOK-20260522.md` | body go-live references → `2026-06-30`; keep filename (creation date) |
| `8-DAY-CUTOVER-PLAN-20260522.md` | **READ + classify first** (see decision D2) — likely recompute window to D-7…D-0 = `2026-06-23`…`2026-06-30` |

### 🛑 HISTORICAL — DO NOT EDIT (frozen point-in-time records)

- `READINESS_AUDIT_D-6_2026-05-24.md` (D-6 audit when go-live was 2026-05-30)
- `SLIP_PROPOSAL_2026-05-24.md`
- `SCHEDULE_DECISION_2026-05-24.md`
- `MONDAY_MORNING_BRIEF_2026-05-25.md`
- `SYSADMIN_DISCOVERY_NOTE_2026-05-25.md` (forensic, retention indefinite — BINDING record)
- `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md`
- `PROMPTS/*` (the prompt artifacts themselves, including this file)
- `templates/*`

---

## Decision points (resolve with Lead Engineer BEFORE editing, or apply the default)

- **D1 — Renames vs banner-only.** Renaming `*_2026-06-09.md` → `*_2026-06-30.md` is cleaner for operators but creates **dangling references in HISTORICAL docs** (e.g. `SYSADMIN_DISCOVERY_NOTE` cites `STOP_TRIGGERS_2026-06-09.md`). Default: **DO rename** the 4 date-stamped operative files via `git mv` (preserves history); update inbound refs in OPERATIVE docs only; **leave historical-doc refs as-is** (archival-correct for their era). Also add to each renamed file a one-line header note: `> Renamed from *_2026-06-09 after go-live slip to 2026-06-30 (see this prompt).`
- **D2 — `8-DAY-CUTOVER-PLAN-20260522.md` + `ROLLBACK-RUNBOOK-20260522.md` filename dates.** `20260522` = creation date (2026-05-22). Keep the filenames; only fix go-live/D-N references in the BODY. If the 8-day plan's internal calendar is the live one, recompute its window to `2026-06-23`…`2026-06-30`. If it reads as superseded, add a top banner pointing at the canonical calendar instead of rewriting.
- **D3 — Zalo group name** (`MAC_INSTALL_GUIDE.md:273`: `Zalo group "OpsControl GoLive 2026-06-09"`). The doc must match the **real** Zalo group name. If the live group is already named with `2026-06-09`, either rename the actual group OR keep the doc string matching reality and add `(go-live moved to 2026-06-30)`. **Confirm the real group name with Lead Engineer** before changing — do not invent a name operators can't find.

**Universal banner** — prepend to the TOP of every OPERATIVE file (under the H1):

```markdown
> ⚠️ **GO-LIVE: 2026-06-30 (Tue).** Earlier drafts said 2026-06-09 — that date is SUPERSEDED. All D-N milestones below are relative to D-0 = 2026-06-30.
```

---

## Procedure

1. `git checkout main && git pull --ff-only` (start clean on latest).
2. New branch: `docs/cutover-date-refresh` (squash-merge, like all cutover doc PRs).
3. Apply the banner + `+21` date recompute to each OPERATIVE file. Work file-by-file; after each, re-grep that file for any residual 06-09-cohort date.
4. `git mv` the 4 renames (D1 default); update inbound refs in operative docs (`grep -rl` the old filenames under `docs/cutover/`, fix only operative hits).
5. Resolve D2 + D3 (or leave a `TODO(lead-engineer)` inline if Henry hasn't answered — do NOT guess the Zalo name).
6. Run ALL verification greps below — every one must pass.
7. Commit (pre-baked message), push, open PR, `--admin` squash-merge (CI red is pre-existing — see note), `--delete-branch`.
8. Write the Deliverable Report.

> **CI note**: main CI has 2 PRE-EXISTING red checks (Lint+format = react-compiler violations; Server tests = Node-22 gap) unrelated to docs. A docs-only PR will not regress the green checks (client tests / commit messages / vuln scan). Admin-squash-merge is the established pattern.

---

## Verification (must ALL pass before merge)

```bash
cd "$(git rev-parse --show-toplevel)"

# 1. NO operative doc still presents 2026-06-09 as the go-live / D-0 date.
#    (Historical docs are allowed to keep it; restrict the grep to operative files.)
grep -rn "2026-06-09" docs/cutover/STOP_TRIGGERS_2026-06-30.md \
  docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-30.md \
  docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md \
  docs/cutover/DRY_RUN_CUTOVER_D-2.md \
  docs/cutover/MAC_INSTALL_GUIDE.md \
  docs/cutover/D-1_FINAL_CHECKLIST_2026-06-29.md \
  docs/cutover/D-1_PREFLIGHT_AUDIT_2026-06-29.md \
  docs/cutover/WIN_EXE_FIELD_TEST_D-7.md 2>/dev/null
# Expected: 0 lines (except an intentional "superseded 2026-06-09" mention in the banner)

# 2. Real go-live date now present in operative docs
grep -rl "2026-06-30" docs/cutover/ | wc -l        # Expected: ≥ 8

# 3. Hương walkthrough shows REAL D-14
grep -n "2026-06-16" docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md   # Expected: ≥1 (D-14)
grep -n "2026-05-26" docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md   # Expected: 0

# 4. Renames done; old operative filenames gone
ls docs/cutover/STOP_TRIGGERS_2026-06-09.md 2>/dev/null            # Expected: not found
ls docs/cutover/STOP_TRIGGERS_2026-06-30.md                       # Expected: exists

# 5. No OPERATIVE doc links a renamed file by its OLD name
grep -rn "STOP_TRIGGERS_2026-06-09\|BACKUP_ENGINEER_BRIEF_2026-06-09\|D-1_FINAL_CHECKLIST_2026-06-08\|D-1_PREFLIGHT_AUDIT_2026-06-08" \
  docs/cutover/DRY_RUN_CUTOVER_D-2.md docs/cutover/MAC_INSTALL_GUIDE.md \
  docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md docs/cutover/ROLLBACK-RUNBOOK-20260522.md 2>/dev/null
# Expected: 0 lines

# 6. Historical docs untouched
git diff --name-only origin/main | grep -E "READINESS_AUDIT_D-6|SLIP_PROPOSAL|SCHEDULE_DECISION|MONDAY_MORNING_BRIEF|SYSADMIN_DISCOVERY_NOTE|GO-LIVE-AUDIT-REPORT"
# Expected: 0 lines (none of these changed)

# 7. No stray old-cohort milestone dates left in operative docs
grep -rnE "2026-05-2[56]|2026-06-0[2378]" docs/cutover/*.md | grep -vE "READINESS_AUDIT|SLIP_PROPOSAL|SCHEDULE_DECISION|MONDAY_MORNING|SYSADMIN_DISCOVERY|GO-LIVE-AUDIT|superseded|Renamed from"
# Expected: 0 lines (eyeball any hit — must be an intentional historical citation)

# 8. Prettier clean (husky lint-staged runs on .md)
npx prettier --check "docs/cutover/**/*.md"

git status --short
```

---

## Commit message (pre-baked — commitlint-clean)

```
docs(release): refresh cutover docs for go-live slip to 2026-06-30

Go-live moved 2026-06-09 to 2026-06-30 (Tue); shift all operative cutover
milestones +21 days (weekday labels unchanged). Add superseded-date banner
to each operative doc. Rename the 4 date-stamped operative files to the new
D-0/D-1 dates and update inbound references. Historical audit records
(D-6 readiness, slip proposal, schedule decision, sysadmin discovery)
left intact as point-in-time evidence.

Real D-14 (Huong walkthrough) corrected to 2026-06-16. Doc-only, no code.
```

> Scope `release` is in the enum (precedent: PR #83 `docs(release)`). If commitlint rejects, fall back to `docs:` with no scope. Wrap body ≤120 chars; blank line before any trailer; no Closes/PR/FIX trailers in body (MES-3-FIX-25). End with the standard `Co-Authored-By:` trailer.

---

## Deliverable Report (reply to Lead Engineer after merge)

```
Cutover Date Refresh — Deliverable Report

1. PR + final SHA
2. Files changed (operative) + renames (old → new), with date-shift summary
3. Verification: all 8 grep gates ✅ (paste the 0/expected results)
4. Decisions applied: D1 (renames), D2 (8-day plan / rollback), D3 (Zalo name)
5. Pending Lead Engineer: <anything you left as TODO — esp. Zalo group name if unconfirmed>
6. Historical docs confirmed untouched (gate #6)
```

---

## Self-check before PR

- [ ] Banner added to ALL operative docs
- [ ] Every operative date shifted +21 (weekday preserved); spot-check 3 files by hand
- [ ] 4 renames via `git mv` (history preserved) + header note added
- [ ] Inbound refs to old filenames fixed in operative docs only
- [ ] Historical docs show 0 diff (gate #6)
- [ ] D3 Zalo group name confirmed with Lead Engineer (or left as explicit TODO — NOT guessed)
- [ ] All 8 verification gates pass
- [ ] Commitlint validates; prettier clean
- [ ] Squash-merge `--admin --delete-branch`

If ANY gate fails OR a date looks off → halt, ping Lead Engineer, do NOT force-merge.
