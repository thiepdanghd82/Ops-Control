# UAT Feedback Template

Two-layer feedback collection: operator (technical, per-scenario) and
customer (single high-signal question + free text). Both feed MVP-3
scope.

Copy the relevant section into a new dated file under `docs/uat/runs/`
when UAT actually executes (e.g. `docs/uat/runs/2026-05-22-export-uat.md`).

**Placeholder convention**: fields the operator fills in are marked
`<fill in>`. Don't use bare underscores — prettier converts them to
horizontal rules.

---

## Layer 1 — Operator feedback (per scenario)

One block per scenario. Skip scenarios that didn't run.

### SCN`<n>` — `<scenario title>`

- **Outcome**: Pass / Fail / Pass with caveats
- **Time on scenario**: `<minutes>`
- **Hardware used**: `<Mac model / Windows machine / iPad / Linux box>`
- **Software versions**: `<Excel build / LibreOffice version / Numbers iOS version>`

**Steps that worked smoothly**:

- (1-3 bullets)

**Steps that felt slow / awkward / confusing**:

- (UX friction — not necessarily bugs)

**Bugs surfaced**:

- (if any — full stub already in uat-export-flow.md)

**Operator notes (free-text)**:

> (e.g. "Sheet protection dialog wording on Win Excel 365 says 'protected' clearly but Mac Excel says 'on a protected sheet' — slightly less obvious. Operator opinion: rewording isn't worth a fix.")

**Screenshots captured**: list filenames (saved under `docs/uat/runs/<date>/screenshots/<file>.png` — operator copies the per-scenario screenshots referenced in uat-export-flow.md into this per-run folder)

---

## Layer 2 — Customer feedback (one survey per customer recipient)

Send this short form to the customer alongside the exported xlsx. ONE
customer per UAT run is sufficient — we're not gathering statistics,
we're gathering signal.

### Cover letter (Vietnamese, operator can re-translate)

> Anh/chị thân mến,
>
> Đây là file báo giá thử nghiệm hệ thống mới của bên em. File này
> tạo tự động từ hệ thống (thay vì làm tay bằng Excel như cũ).
>
> Nhờ anh/chị xem qua giúp 3 điểm:
>
> 1. **Mở file có vấn đề gì không?** (không mở được, báo lỗi, hiện
>    cảnh báo virus, v.v.)
> 2. **Thông tin trong file có đủ để anh/chị quyết định không?**
>    Có cần bổ sung field nào không?
> 3. **Có chỗ nào nhìn lạ / khó đọc / sai số liệu so với báo giá
>    trước đây của bên em không?**
>
> Em sẽ gọi điện 30 phút sau khi anh/chị xem để hỏi lại nhanh, đỡ
> mất công gõ. Cám ơn anh/chị nhiều.

### Customer response capture (operator fills during the phone call)

- **Customer name** (internal-only, NOT shared back — store ONLY in gitignored feedback.md): `<fill in>`
- **Quote ID sent**: `<fill in>` (slot #1 / #2 / #3 / #4 / #5 — per test-quotes.md)
- **Variant sent**: Customer copy
- **Date sent**: `<fill in>`
- **Date called back**: `<fill in>`
- **Spreadsheet app customer used**: `<Excel for Windows / Mac / LibreOffice / Numbers / "they didn't say">`

#### Q1 — Open issues

- [ ] Opened without any issue
- [ ] Opened but with a warning (capture warning text below)
- [ ] Could not open

Notes:

> `<fill in>`

#### Q2 — Sufficient information

- [ ] Yes, can quote on this without follow-up
- [ ] Mostly yes, but missing: `<fill in>`
- [ ] No, would need additional info: `<fill in>`

Free text (anything customer specifically mentioned wanting):

> `<fill in>`

#### Q3 — Anything looks odd?

- [ ] Looks normal / matches expectations
- [ ] Looks different from previous quotes but not a problem (note what): `<fill in>`
- [ ] Looks wrong (capture below)

Free text:

> `<fill in>`

#### Bonus — customer-volunteered observations

> (Anything the customer said that wasn't in Q1-Q3. Often the most useful signal.)

---

## Layer 3 — Cross-cutting questions to answer at the end of UAT

These are the questions that decide MVP-3 scope. Fill in after Day 2
wrap-up.

### Q-A: Is the Customer Copy variant ready to share without a cover letter?

- [ ] Yes — file opens cleanly + customer can read everything they need
- [ ] No, but a one-line cover note ("This is read-only — request edits by reply") is enough
- [ ] No — needs more work before any customer-facing use

Reasoning:

> `<fill in>`

### Q-B: What's the single biggest gap operators feel between this xlsx and their hand-built Excel quotes?

> `<fill in>`

### Q-C: Of the bugs surfaced during UAT, which 1-3 are blocking customer share (P0-P1 severity)?

List only **P0** (data wrong/leaked) or **P1** (UX confusion that would cause customer to re-quote).
P2/P3 belong in Q-D backlog discussion, not here.

1. `<fill in>` — severity, 1-line description
2. `<fill in>` — severity, 1-line description
3. `<fill in>` — severity, 1-line description

### Q-D: What features did the customer say they wanted that we don't have?

> (Each one is a candidate for MVP-3 backlog. Don't promise; just capture.)

### Q-E: For MVP-3 (re-import + apply), which scenario should be the gold-path test?

> (Best answered by looking at the customer's volunteered observations in Layer 2. If they said "I'd love to mark my preferred MOQ tier and send it back", THAT'S the gold path.)

---

## What to do with this feedback after UAT

1. Layer 1 + Layer 2 raw entries → save dưới `docs/uat/runs/<date>/feedback.md`.
   **MANDATORY gitignore** — file contains customer PII (name, quote details, free-text responses).
   Add `docs/uat/runs/*/feedback.md` to `.gitignore` BEFORE committing UAT outputs.
   Only Layer 3 summary (anonymised) gets committed to git.
2. Layer 3 answers → summarize in 1-paragraph note appended to CLAUDE.md sprint history under "S-EXPORT-UAT" (anonymised — no customer names, no raw quote IDs)
3. Each Layer 3 / Q-C bug → file as MVP-2.1-FIX-`<n>` with severity per triage mapping (P0 halt · P1 fix-before-customer-send · P2 fix-MVP-2.1 · P3 defer-MVP-3)
4. Each Layer 3 / Q-D feature → add to MVP-3 backlog with effort estimate
5. Schedule a 30-minute MVP-3 kickoff using Q-E as the agenda anchor

## Anti-patterns to avoid

- **Don't argue with the customer's "looks odd"** — capture it verbatim. They may be wrong about the math but right about the perception, and perception is what causes a re-quote phone call.
- **Don't aggregate Layer 2 across multiple customers** — n=1 is fine for UAT, n=2-3 is great, n>5 starts to need real survey design.
- **Don't let UAT turn into bug-fix sprint mid-session** — collect, triage at the end. Mid-session debugging eats the whole window.
- **Don't commit raw feedback.md to git** — customer PII risk (per R4 in risk-register.md). Only commit Layer 3 anonymised summary.
