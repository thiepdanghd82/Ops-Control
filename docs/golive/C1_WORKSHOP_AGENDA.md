# C-1 WORKSHOP AGENDA — Path A (3h live session)

## Stakeholder scope-lock workshop · Buổi khóa scope cùng stakeholder

**Deadline · Hạn**: 2026-06-26 (D-65) — **TOP SCHEDULE RISK**
**Format · Hình thức**: In-person OR video call, ~3 hours
**Owner · Chủ trì**: Henry Đặng Thế Thiệp
**Pre-read (send 24-48h ahead) · Tài liệu đọc trước (gửi trước 24-48h)**:

1. `docs/golive/SCOPE_LOCK_v1.6.md` — the document being signed
2. `docs/golive/DEFERRAL_ROADMAP.md` — what OUT items become
3. `docs/golive/STAKEHOLDER_QUESTIONS.md` — 7 blocking questions

**Output target · Mục tiêu đầu ra**: Signed `SCOPE_LOCK_v1.6.md` + 7 answers captured in `C1_DECISION_LOG.md`.

---

## 🕐 Minute-by-minute agenda · Lịch trình chi tiết

| Time · Giờ | Block · Phần                                                                                                 | Owner · Người dẫn               | Output · Đầu ra                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------- |
| 0:00-0:05  | **Opening** · Welcome + workshop purpose (scope-lock cho v1.6 go-live 2026-08-30)                            | Henry                           | Stakeholder hiểu mục đích buổi họp                |
| 0:05-0:15  | **Context recap** · Read SCOPE_LOCK IN/OUT matrix aloud; stakeholder asks clarifications                     | Henry                           | Common understanding of proposed scope            |
| 0:15-0:30  | **Q1 — CCL Design = Hai Duong-only OR multi-site global?**                                                   | Henry asks, stakeholder answers | Binding decision logged in C1_DECISION_LOG        |
| 0:30-0:45  | **Q2 — "Hybrid" definition** (rsync backup / cloud BI / web access / SaaS)                                   | Henry asks, stakeholder answers | Binding decision logged                           |
| 0:45-1:00  | **Q3 — 20-year retention basis** (legal/compliance vs business)                                              | Henry asks, stakeholder answers | Binding decision (drives R10-R12 scope)           |
| 1:00-1:10  | **Break**                                                                                                    | —                               | —                                                 |
| 1:10-1:20  | **Q4 — "15 user" interpretation** (concurrent / provisioned / shift turnover)                                | Henry asks, stakeholder answers | Confirm fleet capacity sufficient                 |
| 1:20-1:30  | **Q5 — Tech stack confirmation** (React/Electron/SQLite — any pre-v1.6 change?)                              | Henry asks, stakeholder answers | Lock stack                                        |
| 1:30-1:40  | **Q6 — Integration scope** (SAP/printer/scale/email)                                                         | Henry asks, stakeholder answers | Confirm IN/OUT per item                           |
| 1:40-2:00  | **Q7 — 🚨 THE GATE — Mac-only acceptance**                                                                   | Henry asks, stakeholder answers | YES → continue / NO → escalate to ESCALATION PATH |
| 2:00-2:15  | **DEFERRAL_ROADMAP walkthrough** — show stakeholder OUT items aren't cancelled, just dated to Q4-2026 / 2027 | Henry                           | Stakeholder sees commitment to future scope       |
| 2:15-2:35  | **Open Q&A** — surface hidden assumptions, edge cases, unstated expectations                                 | Stakeholder leads               | Net-new risks captured                            |
| 2:35-2:50  | **Decision review** — read every Q1-Q7 answer back to stakeholder, confirm wording in DECISION_LOG           | Henry                           | No misinterpretation                              |
| 2:50-3:00  | **Sign SCOPE_LOCK_v1.6.md** — 3 signatures (Stakeholder + Henry + Hương witness)                             | All                             | ✅ C-1 CLOSED                                     |

---

## 🎯 Henry's facilitation rules · Quy tắc dẫn dắt

1. **Read every question verbatim from STAKEHOLDER_QUESTIONS.md** — don't paraphrase. Stakeholder needs to hear the exact options.
2. **Capture every answer in real time** — open `C1_DECISION_LOG.md` on a laptop; type as stakeholder speaks. Don't trust memory.
3. **If Q7 = NO Mac-only** — DO NOT try to negotiate scope additions on the fly. Pause workshop, escalate to ESCALATION PATH (`SCOPE_LOCK_v1.6.md` §⚠️) — counter-proposal: dời go-live 2027-Q1. Stakeholder gets 1 week to reconsider.
4. **If stakeholder asks for time to consult** — do NOT push for sign-off in-session. Schedule follow-up within 3 days (still hits D-65). Pause workshop, send DECISION_LOG draft for review.
5. **If Q1-Q3 answers contradict SCOPE_LOCK assumptions significantly** — pause, declare scope-lock VOID per §🚨 CONDITIONS, schedule re-draft session within 7 days.

---

## ⚠️ Red-flag escalations during workshop · Cờ đỏ cần leo thang

| Trigger · Tình huống                             | Action · Hành động                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 = "global multi-site, expected in v1.6"       | Escalate immediately. v1.6 = pilot; multi-site requires SAP + license fleet (Q2-2027). Counter-propose: pilot stays Hai Duong-only, multi-site rollout becomes 2027-Q2 separate sprint. |
| Q2 = "full SaaS multi-tenant rewrite"            | Escalate. 1 engineer / 10 weeks = NOT feasible. Counter-propose: dời go-live 2027-Q1 OR ship v1.6 Mac-pilot first, SaaS as 2027 program.                                                |
| Q6 = "SAP integration MUST in v1.6"              | Escalate. ~3 month SAP CO-PC feasibility minimum. Counter-propose: defer to 2027-Q1; ship xlsx export as v1.6 manual workaround.                                                        |
| Q7 = "Must include Windows in v1.6"              | Negotiate: S-WIN-PORT bundles into v1.6 → D-0 slips to 2026-09-15 minimum, OR Mac-only pilot 2026-08-30 + Win in 2026-Q4. Pick one.                                                     |
| Stakeholder unwilling to sign at end of workshop | Send DECISION_LOG via email + 48h response deadline. Switch to **Path B async sign-off** (`C1_ASYNC_SIGNOFF.md`).                                                                       |

---

## ✍️ Materials checklist before workshop · Vật tư trước buổi họp

- [ ] Laptop với SCOPE_LOCK_v1.6.md + DEFERRAL_ROADMAP.md + STAKEHOLDER_QUESTIONS.md + C1_DECISION_LOG.md open
- [ ] Printed copy of SCOPE_LOCK_v1.6.md (signature page) — 3 copies (Stakeholder + Henry + Hương)
- [ ] Pen × 3
- [ ] Pre-mortem briefing for Henry's own reference (`C1_PRE_MORTEM.md`)
- [ ] Coffee / water / snacks (3h is long)
- [ ] If video call: Zoom/Teams link sent 24h prior, with all 3 pre-read PDFs attached

---

## Post-workshop · Sau buổi họp (within 4h)

1. Update `C1_DECISION_LOG.md` with final signed-off answers + scan/photo of SCOPE_LOCK signatures
2. Update `project_golive` memory: C-1 status DONE + capture any scope-impacting answers
3. Decide post-C-1 engineering reopen scope (per Re-evaluation recommendation: audit-chain wiring OR M-3 React infra, depending on workshop outcome)
4. Notify Hương + sales team via Zalo/Teams: scope locked, freeze lifted, training session 2026-08-23 confirmed
5. If workshop did NOT close (red flag triggered), file follow-up tickets + escalate to project_golive memory IMMEDIATELY (don't sit on it overnight)

## Cross-reference

- `docs/golive/SCOPE_LOCK_v1.6.md` — document being signed
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — 7 questions in detail
- `docs/golive/DEFERRAL_ROADMAP.md` — quarter-by-quarter OUT timeline
- `docs/golive/C1_DECISION_LOG.md` — capture template (use during workshop)
- `docs/golive/C1_PRE_MORTEM.md` — 3 outcome scenarios + counter-actions
- `docs/golive/C1_ASYNC_SIGNOFF.md` — Path B fallback if workshop unschedulable
