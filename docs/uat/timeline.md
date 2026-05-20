# UAT Timeline — 2-day execution plan

Window: 2 working days, 4 sessions of ~3 hours each. Plan assumes a single operator (Đặng Thế Thiệp) running the scenarios with the engineer (thiepdanghd82) on call for triage. Customer-facing send only happens Day 2 AM after SCN8 PASS (per README customer artifact gate).

Total wallclock budget: ~12 hours operator + ~4 hours engineer-on-call.

**Note**: Owner Đặng Thế Thiệp wears both operator + engineer hats in current scope. Total ~16h cho 1 người trong 2 ngày → ~8h/ngày, vừa fit working hours nhưng KHÔNG có buffer cho overrun. Nếu có thể, recruit 1 backup engineer cho các slot critical (SCN5 Day 1 AM, SCN3 cross-platform, bug triage Day 2 PM).

---

## Day 1

### Day 1 — Morning (3 h) · Basic export + sheet-protection cross-platform

| Time        | Activity                                                                                                                  | Owner               | Output                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| 09:00–09:30 | Pre-flight: confirm `OPS_EXPORT_HMAC_KEY` set, preflight passes, 5 test quotes picked in [test-quotes.md](test-quotes.md) | engineer            | green light to proceed    |
| 09:30–10:00 | **SCN5** — HMAC verify round-trip (BLOCKER if it fails — halt + run HMAC recovery playbook before continuing)             | engineer            | terminal output captured  |
| 10:00–10:45 | **SCN1** — Export single quote (default settings)                                                                         | operator            | screenshots + Pass/Fail   |
| 10:45–11:15 | **SCN2** — Export after filtering Quote History                                                                           | operator            | screenshots + Pass/Fail   |
| 11:15–12:00 | **SCN3** — Sheet-protection UX cross-platform (Mac Excel + Win Excel + LibreOffice)                                       | operator + engineer | screenshots × 3 platforms |

Risk if behind schedule: cut SCN2 (low-value compared to others). Don't skip SCN3 — that's the R1 confirmation.

### Day 1 — Afternoon (3 h) · Watermark fidelity + file-size edge + Day 1 wrap

| Time        | Activity                                                                                                                | Owner    | Output                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- |
| 13:00–13:30 | Bug triage of morning surfaces — defer all P2/P3, list P0/P1 only                                                       | engineer | bug list                                |
| 13:30–14:15 | **SCN4** — Customer-variant watermark fidelity (Excel + LibreOffice + Numbers iOS)                                      | operator | screenshots × 3 renderers + drift notes |
| 14:15–15:00 | **SCN6** — Large/worst-case file edge case (Cpx multi-tier full export)                                                 | operator | stopwatch + file size                   |
| 15:00–15:30 | Buffer / re-run a failing scenario from morning                                                                         | both     | follow-up screenshots                   |
| 15:30–16:00 | Day 1 wrap notes + Day 2 prep (confirm customer recipient still agreed, Slack reminder for tomorrow's send window 11:30) | engineer | Day 2 readiness confirmed               |

**NO customer outreach Day 1.** Customer artifact gate (README) requires SCN6-8 P0/P1 clean before send — SCN7+8 chưa chạy nên Day 1 PM chưa được gửi file. Đẩy customer send sang Day 2 AM sau SCN8.

---

## Day 2

### Day 2 — Morning (3 h) · Mobile + multi-tier + customer send

| Time        | Activity                                                                                                                                                                              | Owner               | Output                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------- |
| 09:00–09:45 | **SCN7** — Open on iPhone / iPad (Numbers iOS) using Slot #1's customer-variant file from Day 1                                                                                       | operator            | screenshots from Numbers                        |
| 09:45–11:00 | **SCN8** — Multi-tier matrix (6 combos with Slot #4)                                                                                                                                  | operator            | 6 download captures + zip-contents verification |
| 11:00–11:30 | Gate check: SCN1-5 all PASS + SCN6-8 no P0/P1 bug → decision-maker (xem Decision Authority trong README) approve "go" via `#ops-control-uat` Slack với prefix `🟢 GO REQUEST:`        | engineer + decision-maker | go/no-go logged                           |
| 11:30–12:00 | **Customer send** (if GO approved) — Slack/email cover letter từ [feedback-template.md](feedback-template.md) + attach Slot #1 customer-variant xlsx. Notify customer: "call-back ~3h sau khi anh/chị xem" | operator            | customer agreed + file sent + ETA confirmed     |

**Halt point Day 2 AM:**
- Nếu SCN7 hoặc SCN8 phát hiện P0/P1 bug → HOLD customer send (default từ README customer gate); reschedule với decision-maker sáng Day 3
- Nếu decision-maker không approve trong 1h → HOLD theo README default policy

### Day 2 — Afternoon (3 h) · Customer call-back + feedback review + bug triage + write-up

| Time        | Activity                                                                                                                                                                                                      | Owner                                                            | Output                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 14:00–14:30 | **Customer call-back** (30 min call ~2.5h sau send) — operator fills Layer 2 feedback section verbatim during call                                                                                            | operator (engineer on call to listen if customer mentions a bug) | Layer 2 of [feedback-template.md](feedback-template.md) — saved to gitignored `docs/uat/runs/<date>/feedback.md` |
| 14:30–15:00 | Post-call: operator scans Layer 2 for blocker findings, prep brief for engineer                                                                                                                               | operator                                                         | brief summary                                           |
| 15:00–15:30 | Layer 3 cross-cutting questions filled out together (Q-A through Q-E)                                                                                                                                         | both                                                             | one-page UAT summary (anonymised)                       |
| 15:30–16:00 | Bug triage of all surfaces from 2 days: classify P0/P1/P2/P3, file as **MVP-2.1-FIX-`<n>`** tickets + capture Q-D features cho **MVP-3 backlog**. Engineer writes "S-EXPORT-UAT" paragraph cho CLAUDE.md (anonymised) | engineer                                                         | new backlog entries + CLAUDE.md edit                   |

**Halt point Day 2 PM:**
- Nếu customer không available cho 14:00 call-back → reschedule sang Day 3 AM (xem Day-3 contingency)
- Nếu Layer 2 phát hiện P0 bug (data leak / wrong data) → kích hoạt recall procedure trong README + halt Layer 3 / triage cho đến khi recall xong

---

## What halts the timeline

- **SCN5 fails** (HMAC verify on prod) → halt + run **HMAC recovery playbook** from CLAUDE.md (Section "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle"). Don't proceed with customer-share until verify passes.
- **SCN1 fails** (basic export doesn't even work on prod) → halt + investigate. Likely a deploy / env / bundle drift issue.
- **SCN6/7/8 phát hiện P0/P1** → HOLD customer send theo README customer gate; reschedule mini-UAT sau khi fix.
- **Customer recipient pulls out** → fall back to operator-only validation; reschedule customer arm to a separate mini-UAT next sprint.
- **Two or more P1 bugs surface in morning** → reshuffle: cut SCN8 from afternoon, focus on P1 reproduction + fix-or-defer call.
- **P0 leak phát hiện sau khi gửi customer** → kích hoạt recall procedure 5-step trong README. Halt mọi việc khác cho đến khi customer confirm delete.

## What does NOT halt the timeline

- **R1 / R2 cosmetic drift on LibreOffice or Numbers** — document, continue. The customer is on Excel-Windows (verified during Day 2 AM send preparation).
- **One scenario partial-fail** — note + continue; full-stop reserved for SCN5, SCN1, or ≥2 P1 bugs.
- **Network blip during export** — retry once; if persistent, switch to LAN over Wi-Fi or vice versa, file a separate infra ticket.

## Day-3 contingency

Reserved cho 2 trường hợp:

1. **Customer cần >3h review** → Day 2 PM 14:00 call-back impossible → schedule Day 3 AM call-back + Day 3 PM Layer 3 finalisation
2. **Customer call-back surfaces substantive question** → open calculator + cross-check (e.g. "this Materials cost looks 30% higher than your last quote — is that right?"); reply within Day 3

Day-3 KHÔNG planned slot mà là explicit contingency. Nếu Day 2 PM customer call-back smooth + Layer 3 xong → Day 3 KHÔNG cần.

---

## After UAT closes

The framework expects ONE follow-up PR (single commit):

- `docs/uat/runs/<date>-export-uat-summary.md` — **Layer 3 anonymised summary ONLY** (no customer names, no raw quote IDs). Layer 1 + Layer 2 raw entries stay in gitignored `docs/uat/runs/<date>/feedback.md`.
- `4. CLAUDE OUTPUT/uat-<date>/golden.xlsx` — one verified-good xlsx as a forever-reference (per Risk R3 mitigation #3)
- One sprint-history line in CLAUDE.md (SHA-tied per Lesson 0) — anonymised format: `S-EXPORT-UAT <date>: {X/8 SCN PASS}, {N} bugs ({a} P0, {b} P1, {c} P2), customer feedback: {1 line summary}, ship decision: {YES/NO/CONDITIONAL}, HMAC-FP: <8 hex chars>`
- Any new **MVP-2.1-FIX-`<n>`** tickets (bug fixes from Q-C)
- Any new **MVP-3 backlog** entries (features from Q-D)
- Confirm `.gitignore` includes `docs/uat/runs/*/feedback.md` BEFORE commit

That follow-up PR is NOT part of this docs framework — it's the output of executing this framework.
