# C-1 DECISION LOG — Scope-lock workshop capture

## Template · Mẫu ghi quyết định

**Purpose · Mục đích**: Capture stakeholder's binding answers to 7 questions during/after C-1 workshop. This document, once filled + signed, becomes the authoritative record alongside `SCOPE_LOCK_v1.6.md`.

**When to use · Khi nào dùng**: During Path A (workshop, fill in real-time on laptop) OR after Path B (transcribe email reply into this format).

---

## Meta · Thông tin chung

| Field · Trường                           | Value · Giá trị                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Workshop date · Ngày workshop            | **********\_\_\_********** (target ≤ 2026-06-26)                                                                                            |
| Format · Hình thức                       | [ ] Path A live (in-person)<br>[ ] Path A live (video call)<br>[ ] Path B async (email response)<br>[ ] Path B silence-clause (no response) |
| Stakeholder name · Tên stakeholder       | **********\_\_\_**********                                                                                                                  |
| Stakeholder title · Chức vụ              | **********\_\_\_**********                                                                                                                  |
| Henry attended · Henry tham dự           | [ ] Yes [ ] No                                                                                                                              |
| Hương attended · Hương tham dự (witness) | [ ] Yes [ ] No                                                                                                                              |
| Duration · Thời lượng (if Path A)        | \_\_\_\_ hours                                                                                                                              |
| Workshop output · Kết quả buổi           | [ ] SIGNED · [ ] PENDING · [ ] ESCALATED                                                                                                    |

---

## Q1 — CCL Design scope · Phạm vi CCL Design

**Question**: Hai Duong-only OR multi-site global?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                   | Selected? | Impact captured                                             |
| ------------------------ | --------- | ----------------------------------------------------------- |
| (a) Hai Duong-only pilot | [ ]       | SCOPE_LOCK unchanged                                        |
| (b) Multi-site global    | [ ]       | S-WIN-PORT, SAP M-2, multi-site rollout escalate to roadmap |

**Notes**: **********************\_\_\_\_**********************

---

## Q2 — "Hybrid" definition · Định nghĩa "Hybrid"

**Question**: Off-site backup / Cloud BI / Web access / SaaS rewrite?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                                | Selected? | Impact captured                          |
| ------------------------------------- | --------- | ---------------------------------------- |
| A. Off-site backup (already in scope) | [ ]       | DEFERRAL_ROADMAP confirms rsync = Hybrid |
| B. Cloud BI dashboard                 | [ ]       | File S-HYBRID-BI, Q2-2027 estimate       |
| C. Cloud web access                   | [ ]       | Escalate S-WEB-FIRST to Q1-2027          |
| D. SaaS multi-tenant rewrite          | [ ]       | ⚠️ Counter-propose dời go-live           |

**Notes**: **********************\_\_\_\_**********************

---

## Q3 — 20-year retention basis · Cơ sở lưu trữ 20 năm

**Question**: Legal/compliance OR business requirement?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                   | Selected? | Impact on R1-R12 retention controls                                     |
| ------------------------ | --------- | ----------------------------------------------------------------------- |
| (a) Legal/compliance     | [ ]       | R11 legal hold + R12 RFC 3161 timestamp MANDATORY in 2027 roadmap as P1 |
| (b) Business requirement | [ ]       | R8-R12 stay at 2027-Q1-Q3 estimates, defer R11+R12 indefinitely         |
| (c) Both                 | [ ]       | (a) holds                                                               |

**Notes**: **********************\_\_\_\_**********************

---

## Q4 — "15 users" interpretation · Diễn giải "15 user"

**Question**: 15 concurrent / 15 provisioned / 15 named × 3 shifts?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                        | Selected? | Architecture impact                                     |
| ----------------------------- | --------- | ------------------------------------------------------- |
| (a) 15 concurrent peak        | [ ]       | No scaling concern                                      |
| (b) 15 provisioned (peak 5-7) | [ ]       | No scaling concern                                      |
| (c) ~45 accounts × shifts     | [ ]       | Audit attribution + license fleet capacity check needed |

**Notes**: **********************\_\_\_\_**********************

---

## Q5 — Tech stack confirmation · Xác nhận tech stack

**Question**: Any pre-v1.6 stack change requested?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                                                            | Selected? | Impact                                                          |
| ----------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| No change (React/Electron/SQLite/argon2/TOTP/husky as documented) | [ ]       | Stack locked through v1.6                                       |
| Yes — specify in notes                                            | [ ]       | ⚠️ Counter-propose: dời go-live; stack change not feasible D-71 |

**Notes (if YES)**: ******************\_\_\_\_******************

---

## Q6 — Integration scope · Phạm vi tích hợp

**Question**: SAP / Printer / Scale-barcode / Customer email — IN or OUT for v1.6?

| Integration               | IN  | OUT | Impact if IN                                              |
| ------------------------- | --- | --- | --------------------------------------------------------- |
| SAP / ERP                 | []  | []  | ⚠️ Counter-propose dời go-live (M-2 ~3 month feasibility) |
| Printer (xlsx, ZPL)       | []  | []  | File S-ZEBRA-INTEGRATION ~2 sprints, P2 post-go-live      |
| Scale / barcode / RFID    | []  | []  | Defer to MES-3+ unless critical                           |
| Customer email automation | []  | []  | Defer to post-go-live operator-driven feature             |

**Notes**: **********************\_\_\_\_**********************

---

## Q7 — 🚨 THE GATE — Mac-only acceptance · Chấp nhận Mac-only

**Question**: Stakeholder accepts v1.6 ships Mac-only (Windows deferred Q4-2026)?
**Stakeholder answer · Stakeholder trả lời**: ************\_\_\_************

| Option                               | Selected? | Schedule impact                                            |
| ------------------------------------ | --------- | ---------------------------------------------------------- |
| (a) Yes — Mac only v1.6, Win Q4-2026 | [ ]       | ✅ Current plan preserved; D-0 = 2026-08-30                |
| (b) No — must include Win in v1.6    | [ ]       | ⚠️ D-0 slips to 2026-09-15 minimum (S-WIN-PORT ~2 sprints) |
| (c) Mac + read-only web for managers | [ ]       | S-WEB-FIRST simplified Q3-2026; adds risk to D-0           |

**Notes**: **********************\_\_\_\_**********************

---

## ✍️ Signatures · Chữ ký

By signing below, stakeholder confirms answers above are binding for Ops Control v1.6 scope-lock. SCOPE_LOCK_v1.6.md is hereby signed under the conditions stated.

> Bằng chữ ký dưới đây, stakeholder xác nhận các câu trả lời trên ràng buộc cho scope-lock Ops Control v1.6. SCOPE_LOCK_v1.6.md được ký theo điều kiện đã nêu.

| Role · Vai trò            | Name · Tên             | Signature · Chữ ký     | Date · Ngày |
| ------------------------- | ---------------------- | ---------------------- | ----------- |
| Stakeholder (CCL Design)  | ********\_\_\_******** | ********\_\_\_******** | ****\_****  |
| Engineering Lead          | Henry Đặng Thế Thiệp   | ********\_\_\_******** | ****\_****  |
| Backup Engineer (witness) | Hương                  | ********\_\_\_******** | ****\_****  |

---

## 📊 Workshop outcome summary · Tóm tắt kết quả

> Henry fills this in within 4 hours after workshop closes · Henry điền trong vòng 4h sau khi workshop kết thúc

| Metric · Chỉ số                             | Value                                                            |
| ------------------------------------------- | ---------------------------------------------------------------- |
| All 7 answers match RECOMMENDED?            | [ ] Yes [ ] No                                                   |
| Any answer triggered ESCALATION PATH?       | [ ] Yes [ ] No (which: \_\_\_\_)                                 |
| Net new risks surfaced during open Q&A?     | [ ] Yes [ ] No (list: \_\_\_\_)                                  |
| SCOPE_LOCK_v1.6.md signed by all 3 parties? | [ ] Yes [ ] No                                                   |
| C-1 status post-workshop                    | [ ] CLOSED · [ ] CLOSED-WITH-NOTES · [ ] PENDING · [ ] ESCALATED |
| Next action                                 | **********\_\_\_**********                                       |

---

## Cross-reference

- `docs/golive/SCOPE_LOCK_v1.6.md` — document being signed
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — full question detail
- `docs/golive/DEFERRAL_ROADMAP.md` — what OUT items become
- `docs/golive/C1_WORKSHOP_AGENDA.md` — Path A facilitation guide
- `docs/golive/C1_ASYNC_SIGNOFF.md` — Path B fallback
- `docs/golive/C1_PRE_MORTEM.md` — what to do per outcome scenario
- [project_golive memory] — update C-1 status immediately after signing
