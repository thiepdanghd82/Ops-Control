# C-1 ASYNC SIGN-OFF — Path B (fallback when workshop unschedulable)

## Async stakeholder scope-lock · Khóa scope không cần họp

**Deadline · Hạn phản hồi**: 2026-06-26 23:59 ICT (D-65)
**Use case · Khi nào dùng**: Henry không đặt được lịch 3h với stakeholder trước 2026-06-26 (Path A unschedulable)
**Mechanism · Cơ chế**: Email + form + 48-72h response window + **explicit positive acknowledgment required** (no silence-implies-consent — see rationale below)

---

## ⚠️ Why explicit-ack (NOT silence-clause) · Tại sao ack tường minh, không phải im-lặng-là-đồng-ý

> **EN:** An earlier draft of this document proposed a "silence-implies-consent" clause (if no response by deadline → scope auto-signed). **That clause has been removed.** For a 20-year-retention enterprise system, silence-as-consent is:
>
> - **Legally weak** — if stakeholder later disputes scope, "you didn't object to the email" does not hold up in compliance audit (SOX, ISO 27001, NĐ 13/2023). Explicit written agreement is the audit-trail standard.
> - **Relationally weak** — implies "I'll take advantage of your inbox overflow." Damages trust for a project meant to run 20 years.
>
> **Replacement rule**: Path B requires a positive acknowledgment reply (just `"Agreed / Đồng ý"` + name + date is enough). If no acknowledgment by deadline, escalate to blocking ticket — DO NOT auto-pass.

> **VI:** Bản nháp trước của tài liệu này đã đề xuất "im-lặng = đồng ý" (không phản hồi đến hạn → tự động ký scope). **Điều khoản đó đã được loại bỏ.** Đối với hệ thống enterprise lưu trữ 20 năm, im-lặng-là-đồng-ý:
>
> - **Yếu về pháp lý** — nếu stakeholder sau này tranh chấp scope, "anh không phản đối email" KHÔNG đứng vững trong audit tuân thủ (SOX, ISO 27001, NĐ 13/2023). Sự đồng ý tường minh bằng văn bản là chuẩn audit-trail.
> - **Yếu về quan hệ** — ngụ ý "tôi sẽ lợi dụng việc anh quá tải email". Phá hỏng lòng tin cho dự án dự kiến chạy 20 năm.
>
> **Quy tắc thay thế**: Path B yêu cầu reply acknowledgment dương tính (chỉ cần `"Agreed / Đồng ý"` + tên + ngày là đủ). Nếu không có ack đến hạn, leo thang sang blocking ticket — KHÔNG auto-pass.

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

**Acknowledgment required**: A short positive reply is sufficient. Even just `"Agreed — [your name] — [today's date]"` (plus the 7-question form below) is enough to count as written sign-off. **No response by 2026-06-26 23:59 ICT triggers project escalation** (NOT auto-approval — the project pauses until written sign-off is received).

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

**Yêu cầu acknowledgment**: Một reply dương tính ngắn là đủ. Chỉ cần `"Đồng ý — [tên anh/chị] — [ngày hôm nay]"` (kèm form 7 câu hỏi bên dưới) là đủ tính làm sign-off bằng văn bản. **Không phản hồi đến 2026-06-26 23:59 ICT sẽ kích hoạt leo thang dự án** (KHÔNG tự duyệt — dự án tạm dừng cho tới khi nhận được sign-off bằng văn bản).

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

| Stakeholder response                                                     | Action                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ All 7 answers match RECOMMENDED + signature                           | C-1 CLOSED. Capture in `C1_DECISION_LOG.md`, update `project_golive` memory, lift engineering freeze.                                                                                                                                                                                         |
| 🟡 Answers diverge but within scope tolerance (e.g. Q4 = (c) shifts)     | Capture divergence, evaluate impact (likely minor), update C-1 status to CLOSED-WITH-NOTES.                                                                                                                                                                                                   |
| 🔴 Answers shift scope significantly (Q1=b, Q2=B/C/D, Q6 SAP=IN, Q7=b/c) | Pause v1.6. Re-draft SCOPE_LOCK + DEFERRAL_ROADMAP per `C1_PRE_MORTEM.md` scenarios. Re-send Path B OR schedule emergency Path A within 5 days.                                                                                                                                               |
| ⏰ No acknowledgment by 2026-06-26 23:59 ICT                             | **Auto-escalate** (silence is NEVER consent — see §⚠️ above). File `S-SCOPE-LOCK-PENDING` blocking ticket; project paused; escalate to Henry's manager + stakeholder leadership. Engineering freeze remains. Resend Path B with 48h ack deadline OR force Path A live workshop within 5 days. |
| 📞 Stakeholder requests live call                                        | Schedule within 48h (still hits D-65). Convert to Path A short-form (~1h, focus on Q1+Q2+Q7 gates).                                                                                                                                                                                           |

---

## Cross-reference

- `docs/golive/SCOPE_LOCK_v1.6.md` — document being signed
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — full question detail (the form here is the short version)
- `docs/golive/DEFERRAL_ROADMAP.md` — OUT-items roadmap
- `docs/golive/C1_DECISION_LOG.md` — where to capture the response
- `docs/golive/C1_PRE_MORTEM.md` — what to do if answers diverge
- `docs/golive/C1_WORKSHOP_AGENDA.md` — Path A live-workshop alternative
