# C-1 ASYNC SIGN-OFF — Path B (fallback when workshop unschedulable)

## Async stakeholder scope-lock · Khóa scope không cần họp

**Deadline · Hạn phản hồi**: 2026-06-26 23:59 ICT (D-65)
**Use case · Khi nào dùng**: Henry không đặt được lịch 3h với stakeholder trước 2026-06-26 (Path A unschedulable)
**Mechanism · Cơ chế**: Email + form + 48-72h response window + silence-implies-consent clause (⚠️ Henry confirm trước khi gửi)

---

## ⚠️ Henry-confirm-first decision · Cần xác nhận trước khi gửi

> **EN:** Path B contains a clause: "If no response received by 2026-06-26 23:59 ICT, this document is considered SIGNED-OFF and v1.6 scope is locked as proposed (Mac-only pilot, Hai Duong site, 15 users)."
>
> **VI:** Path B có điều khoản: "Nếu không nhận phản hồi trước 2026-06-26 23:59 ICT, văn bản này được coi là ĐÃ KÝ-OFF và scope v1.6 khóa như đề xuất (pilot Mac-only, site Hai Duong, 15 users)."
>
> **⚠️ Henry MUST confirm acceptability before invoking Path B.** Some organizations / regulatory regimes (SOX, ISO 27001) require explicit written sign-off; silence-implies-consent invalidates the audit trail. If unacceptable, replace the clause with "Failure to respond by deadline triggers escalation to S-SCOPE-LOCK-PENDING blocking ticket + project pause."

---

## 📧 Email template · Mẫu email

**To**: [stakeholder name + email]
**Cc**: Hương (witness), Henry (self-cc for trail)
**Subject**: 🚨 ACTION REQUIRED by 2026-06-26 — Ops Control v1.6 scope-lock sign-off

---

**🇬🇧 ENGLISH**

Dear [stakeholder name],

Ops Control v1.6 go-live is scheduled for **2026-08-30**, with stakeholder scope-lock required by **2026-06-26** (6 days from today, 2026-06-20). Due to scheduling constraints, we are requesting **async sign-off** instead of a live workshop.

**Three documents are attached** (please read in this order):

1. **SCOPE_LOCK_v1.6.md** (8.5 KB, bilingual EN+VN) — the proposed scope lock. Lists what is IN and OUT of v1.6 D-0 with full rationale.
2. **DEFERRAL_ROADMAP.md** (7 KB) — quarter-by-quarter timeline showing OUT items aren't cancelled, just dated (Windows in Q4-2026, multi-site in 2027, etc.).
3. **STAKEHOLDER_QUESTIONS.md** (10 KB) — 7 blocking questions with options and recommended answers.

**What we need from you by 2026-06-26 23:59 ICT (Friday)**:

- Read all 3 docs (~30 min total)
- Reply to this email with answers to the 7 questions in STAKEHOLDER_QUESTIONS.md (form below)
- Sign SCOPE_LOCK_v1.6.md (scan + return, OR digital signature if your org supports it)

**If you have concerns or need to discuss**: Reply with the questions/concerns BEFORE 2026-06-26. Henry can schedule a 30-min call within 48h to walk through any blocker.

**Silence-implies-consent clause** [⚠️ Henry confirm before sending]: If no response received by 2026-06-26 23:59 ICT, this document is considered SIGNED-OFF and v1.6 scope locks as proposed (Mac-only pilot for Hai Duong site, 15 users, Materials/Inks/Processes Combined tab, 20-year retention via pricing snapshot). Project proceeds on this basis.

Best regards,
Henry Đặng Thế Thiệp
Lead Engineer, Ops Control v1.6

---

**🇻🇳 TIẾNG VIỆT**

Kính gửi [tên stakeholder],

Ops Control v1.6 go-live dự kiến **2026-08-30**, scope-lock cần ký với stakeholder trước **2026-06-26** (còn 6 ngày tính từ 2026-06-20). Do hạn chế lịch họp, chúng tôi đề nghị **ký-off async** thay vì workshop trực tiếp.

**3 tài liệu đính kèm** (đọc theo thứ tự):

1. **SCOPE_LOCK_v1.6.md** (8.5 KB, song ngữ) — scope-lock đề xuất. Liệt kê TRONG và NGOÀI scope v1.6 D-0 + lý do.
2. **DEFERRAL_ROADMAP.md** (7 KB) — timeline quý-by-quý các item NGOÀI scope (Windows Q4-2026, multi-site 2027, …).
3. **STAKEHOLDER_QUESTIONS.md** (10 KB) — 7 câu hỏi blocking + options + khuyến nghị.

**Yêu cầu phản hồi trước 2026-06-26 23:59 ICT (thứ Sáu)**:

- Đọc 3 tài liệu (~30 phút)
- Trả lời 7 câu hỏi trong STAKEHOLDER_QUESTIONS.md (form bên dưới)
- Ký SCOPE_LOCK_v1.6.md (scan + gửi lại, HOẶC chữ ký số nếu tổ chức hỗ trợ)

**Nếu cần thảo luận**: Phản hồi câu hỏi/quan ngại TRƯỚC 2026-06-26. Henry có thể đặt call 30 phút trong 48h.

**Điều khoản im-lặng-là-đồng-ý** [⚠️ Henry xác nhận trước khi gửi]: Nếu không nhận phản hồi trước 2026-06-26 23:59 ICT, văn bản coi như ĐÃ KÝ-OFF và scope v1.6 khóa như đề xuất (pilot Mac-only site Hai Duong, 15 users, tab Materials & Process gộp, lưu trữ 20 năm qua pricing snapshot). Dự án tiếp tục trên cơ sở này.

Trân trọng,
Henry Đặng Thế Thiệp
Lead Engineer, Ops Control v1.6

---

## 📋 7-Question response form · Form trả lời 7 câu hỏi

> **EN:** Copy this form into your email reply. For each question, circle/highlight your choice and add notes if needed.
>
> **VI:** Sao chép form này vào email phản hồi. Mỗi câu, chọn đáp án và ghi chú nếu cần.

```
================================================================
SCOPE-LOCK SIGN-OFF FORM — Ops Control v1.6 (CCL Design Hai Duong)
Deadline: 2026-06-26 23:59 ICT  ·  Hạn: 2026-06-26 23:59 ICT
================================================================

Stakeholder name · Họ tên:    _______________________
Title · Chức vụ:               _______________________
Date · Ngày phản hồi:          _______________________

----------------------------------------------------------------
Q1. "CCL Design" scope · Phạm vi "CCL Design"
----------------------------------------------------------------
  [ ] (a) Hai Duong-only pilot  ✅ RECOMMENDED
  [ ] (b) CCL Design global multi-site
  Notes: _______________________________________________

----------------------------------------------------------------
Q2. "Hybrid" definition · Định nghĩa "Hybrid"
----------------------------------------------------------------
  [ ] A. Off-site backup (rsync) — already in scope  ✅ RECOMMENDED
  [ ] B. Cloud BI dashboard
  [ ] C. Cloud web access
  [ ] D. SaaS multi-tenant rewrite
  Notes: _______________________________________________

----------------------------------------------------------------
Q3. 20-year retention basis · Cơ sở lưu trữ 20 năm
----------------------------------------------------------------
  [ ] (a) Legal/compliance (SOX/GDPR/ISO 27001/NĐ 13/2023)
  [ ] (b) Business requirement only
  [ ] (c) Both
  Notes: _______________________________________________

----------------------------------------------------------------
Q4. "15 users" interpretation · Diễn giải "15 user"
----------------------------------------------------------------
  [ ] (a) 15 concurrent at peak
  [ ] (b) 15 total provisioned (peak 5-7)  ✅ RECOMMENDED
  [ ] (c) 15 named × 3 shifts = ~45 accounts
  Notes: _______________________________________________

----------------------------------------------------------------
Q5. Tech stack changes pre-v1.6 · Thay đổi tech stack trước v1.6
----------------------------------------------------------------
  [ ] No change (React/Electron/SQLite as documented)  ✅ RECOMMENDED
  [ ] Yes — specify: _____________________________

----------------------------------------------------------------
Q6. Integration scope · Phạm vi tích hợp
----------------------------------------------------------------
  SAP / ERP:        [ ] IN  [ ] OUT  ✅ OUT RECOMMENDED
  Printer (xlsx):   [ ] IN  [ ] OUT  ✅ OUT RECOMMENDED
  Scale/barcode:    [ ] IN  [ ] OUT  ✅ OUT RECOMMENDED
  Customer email:   [ ] IN  [ ] OUT  ✅ OUT RECOMMENDED

----------------------------------------------------------------
Q7. 🚨 GATE — Mac-only acceptance · Chấp nhận Mac-only
----------------------------------------------------------------
  [ ] (a) Yes — Mac only for v1.6, Win Q4-2026  ✅ RECOMMENDED
  [ ] (b) No — must include Win (counter: dời D-0 tới 2026-09-15)
  [ ] (c) Mac + read-only web for managers
  Notes: _______________________________________________

----------------------------------------------------------------
Final sign-off · Ký-off cuối
----------------------------------------------------------------

I have read SCOPE_LOCK_v1.6.md + DEFERRAL_ROADMAP.md and agree to
the proposed scope for Ops Control v1.6 go-live 2026-08-30, subject
to the answers above.

Tôi đã đọc SCOPE_LOCK_v1.6.md + DEFERRAL_ROADMAP.md và đồng ý với
scope đề xuất cho Ops Control v1.6 go-live 2026-08-30, theo các
câu trả lời trên.

Signature · Chữ ký:    _______________________
Date · Ngày:            _______________________

================================================================
```

---

## 🚦 Decision pathways after response · Hành động sau phản hồi

| Stakeholder response                                                     | Action                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ All 7 answers match RECOMMENDED + signature                           | C-1 CLOSED. Capture in `C1_DECISION_LOG.md`, update `project_golive` memory, lift engineering freeze.                                                                                  |
| 🟡 Answers diverge but within scope tolerance (e.g. Q4 = (c) shifts)     | Capture divergence, evaluate impact (likely minor), update C-1 status to CLOSED-WITH-NOTES.                                                                                            |
| 🔴 Answers shift scope significantly (Q1=b, Q2=B/C/D, Q6 SAP=IN, Q7=b/c) | Pause v1.6. Re-draft SCOPE_LOCK + DEFERRAL_ROADMAP per `C1_PRE_MORTEM.md` scenarios. Re-send Path B OR schedule emergency Path A within 5 days.                                        |
| ⏰ No response by 2026-06-26 23:59 ICT                                   | **IF silence-clause acceptable**: C-1 CLOSED-BY-SILENCE, capture in DECISION_LOG with timestamp. **IF NOT**: file `S-SCOPE-LOCK-PENDING`, project paused, escalate to Henry's manager. |
| 📞 Stakeholder requests live call                                        | Schedule within 48h (still hits D-65). Convert to Path A short-form (~1h, focus on Q1+Q2+Q7 gates).                                                                                    |

---

## Cross-reference

- `docs/golive/SCOPE_LOCK_v1.6.md` — document being signed
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — full question detail (the form here is the short version)
- `docs/golive/DEFERRAL_ROADMAP.md` — OUT-items roadmap
- `docs/golive/C1_DECISION_LOG.md` — where to capture the response
- `docs/golive/C1_PRE_MORTEM.md` — what to do if answers diverge
- `docs/golive/C1_WORKSHOP_AGENDA.md` — Path A live-workshop alternative
