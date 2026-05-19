# UAT Timeline — 2-day execution plan

Window: 2 working days, 4 sessions of ~3 hours each. Plan assumes a single operator (Đặng Thế Thiệp) running the scenarios with the engineer (thiepdanghd82) on call for triage. No customer in the loop until Day 1 afternoon at earliest.

Total wallclock budget: ~12 hours operator + ~4 hours engineer-on-call.

---

## Day 1

### Day 1 — Morning (3 h) · Basic export + sheet-protection cross-platform

| Time        | Activity                                                                                                                  | Owner               | Output                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- |
| 09:00–09:30 | Pre-flight: confirm `OPS_EXPORT_HMAC_KEY` set, preflight passes, 5 test quotes picked in [test-quotes.md](test-quotes.md) | engineer            | green light to proceed    |
| 09:30–10:00 | **SCN5** — HMAC verify round-trip (BLOCKER if it fails — halt + run recovery playbook before continuing)                  | engineer            | terminal output captured  |
| 10:00–10:45 | **SCN1** — Export single quote (default settings)                                                                         | operator            | screenshots + Pass/Fail   |
| 10:45–11:15 | **SCN2** — Export after filtering Quote History                                                                           | operator            | screenshots + Pass/Fail   |
| 11:15–12:00 | **SCN3** — Sheet-protection UX cross-platform (Mac Excel + Win Excel + LibreOffice)                                       | operator + engineer | screenshots × 3 platforms |

Risk if behind schedule: cut SCN2 (low-value compared to others). Don't skip SCN3 — that's the R1 confirmation.

### Day 1 — Afternoon (3 h) · Watermark fidelity + file-size edge

| Time        | Activity                                                                                                                                                           | Owner    | Output                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- |
| 13:00–13:30 | Bug triage of morning surfaces — defer all P2/P3, list P0/P1 only                                                                                                  | engineer | bug list                                |
| 13:30–14:15 | **SCN4** — Customer-variant watermark fidelity (Excel + LibreOffice + Numbers iOS)                                                                                 | operator | screenshots × 3 renderers + drift notes |
| 14:15–15:00 | **SCN6** — Large/worst-case file edge case (Cpx multi-tier full export)                                                                                            | operator | stopwatch + file size                   |
| 15:00–15:30 | Buffer / re-run a failing scenario from morning                                                                                                                    | both     | follow-up screenshots                   |
| 15:30–16:00 | First customer outreach — pick ONE customer to send Slot 1's `customer` variant to. Slack/email the cover letter from [feedback-template.md](feedback-template.md) | operator | customer agreed + file sent             |

The customer outreach is intentionally Day 1 afternoon so the customer has overnight to look at the file before the engineer's call-back on Day 2 morning.

---

## Day 2

### Day 2 — Morning (3 h) · Mobile + multi-tier matrix + customer call-back

| Time        | Activity                                                                                                                                   | Owner                                                            | Output                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 09:00–09:45 | **SCN7** — Open on iPhone / iPad (Numbers iOS) using Slot 1's customer-variant file from Day 1                                             | operator                                                         | screenshots from Numbers                                |
| 09:45–11:00 | **SCN8** — Multi-tier matrix (6 combos with Slot 4)                                                                                        | operator                                                         | 6 download captures + zip-contents verification         |
| 11:00–12:00 | **Customer call-back** — 30 min call with the recipient from Day 1 afternoon; operator fills Layer 2 feedback section verbatim during call | operator (engineer on call to listen if customer mentions a bug) | Layer 2 of [feedback-template.md](feedback-template.md) |

Day 2 morning is the most schedule-sensitive — if the customer is unavailable for the 11:00 slot, slide to 13:00 and bump the afternoon agenda by 90 minutes.

### Day 2 — Afternoon (3 h) · Feedback review + bug triage + write-up

| Time        | Activity                                                                                                                                            | Owner    | Output               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- |
| 13:00–14:00 | Layer 3 cross-cutting questions filled out together (Q-A through Q-E)                                                                               | both     | one-page UAT summary |
| 14:00–15:00 | Bug triage of all surfaces from 2 days: classify P0/P1/P2/P3, file as MES-3-FIX-<n> tickets                                                         | engineer | new backlog entries  |
| 15:00–15:30 | MVP-3 scope shaping — use Q-E + Q-D as anchors; sketch 1-2 candidate "gold path" scenarios for re-import                                            | both     | rough MVP-3 outline  |
| 15:30–16:00 | Sprint history entry — engineer writes "S-EXPORT-UAT" paragraph for CLAUDE.md, includes SHA-discipline (PR # of this docs PR + the UAT runs commit) | engineer | CLAUDE.md edit       |

---

## What halts the timeline

- **SCN5 fails** (HMAC verify on prod) → halt + run TOTP-key-style recovery playbook from CLAUDE.md. Don't proceed with customer-share until verify passes.
- **SCN1 fails** (basic export doesn't even work on prod) → halt + investigate. Likely a deploy / env / bundle drift issue.
- **Customer recipient pulls out** → fall back to operator-only validation; reschedule customer arm to a separate mini-UAT next sprint.
- **Two or more P1 bugs surface in morning** → reshuffle: cut SCN8 from afternoon, focus on P1 reproduction + fix-or-defer call.

## What does NOT halt the timeline

- **R1 / R2 cosmetic drift on LibreOffice or Numbers** — document, continue. The customer is on Excel-Windows (verified during Day 1 PM outreach call).
- **One scenario partial-fail** — note + continue; full-stop reserved for SCN5, SCN1, or ≥2 P1 bugs.
- **Network blip during export** — retry once; if persistent, switch to LAN over Wi-Fi or vice versa, file a separate infra ticket.

## Day-3 contingency

Reserved for IF Day-2 customer call-back surfaces something blocking. NOT a planned slot — only used if the customer asks a substantive question we need to investigate before we can give them a confident answer (e.g. "this Materials cost looks 30% higher than your last quote — is that right?"). Open the calculator + cross-check; reply within Day 3.

## After UAT closes

The framework expects ONE follow-up PR (single commit):

- `docs/uat/runs/<date>-export-uat.md` — actual filled-in feedback
- `4. CLAUDE OUTPUT/uat-<date>/golden.xlsx` — one verified-good xlsx as a forever-reference (per Risk R3 mitigation #3)
- One sprint-history line in CLAUDE.md (SHA-tied per Lesson 0)
- Any new MES-3-FIX-<n> tickets in the MES-3 backlog section

That follow-up PR is NOT part of this docs framework — it's the output of executing this framework.
