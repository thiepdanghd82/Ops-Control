# C-5 OPERATOR UAT INVITATION — 30-scenario user acceptance test

## Pre-go-live UAT operator coordination · Phối hợp UAT trước go-live

**UAT deadline · Hạn UAT**: 2026-08-09 (D-21)
**Go-live target · Mục tiêu go-live**: 2026-08-30 (D-0)
**Operator count · Số lượng operator**: minimum 2 sales operators (NOT Henry solo — gap from Phase 5 closeout — Trụ 12 "0 user signature" issue)
**UAT script · Kịch bản**: `docs/uat/pricing-snapshot-uat.md` (30 scenarios, ~3-4h per operator)
**Output · Đầu ra**: Signed UAT acceptance report (this doc's checklist + per-operator signature in `C5_UAT_CHECKLIST.md`)

**Critical · Quan trọng**: Booking operator lead-time is the schedule risk. CCL Design Hai Duong sales operators have customer deadlines + production cycles — schedule UAT WEEKS in advance, not days.

---

## 📧 Operator invitation template · Mẫu thư mời operator

**To**: [2-3 sales operator emails]
**Cc**: Hương (witness), Henry (organizer), sales manager (visibility)
**Subject**: 📋 UAT Ops Control v1.6 — booking session 3-4h trước 2026-08-09

---

**🇬🇧 ENGLISH**

Hello [operator names],

You are invited to participate in **User Acceptance Testing (UAT)** for Ops Control v1.6 — the costing + quotation system you will use daily starting **2026-08-30**.

**What you will do**:

- Run 30 real-world quote scenarios end-to-end (save, copy, export, approve, snapshot review)
- Verify the system produces the expected results
- Report any bugs, confusing UI, or workflow gaps
- Sign off when you're confident the system is ready for daily use

**Time commitment**: 3-4 hours per session, **before 2026-08-09**. Can be split into 2 × 2h sessions if more convenient.

**Where**: CCL Design Hai Duong, your normal workstation (Mac CLIENT app)

**Why this matters**: Without your sign-off, we cannot confirm the system meets sales-floor needs. Henry's pre-test does not count — you're the actual user. If we ship without your validation and you find issues on day 1, the cutover risks recall.

**Preparation**:

- Read `docs/cutover/MAC_INSTALL_GUIDE.md` (15 min) if you haven't installed the latest CLIENT DMG
- Read `docs/cutover/PRICING_SNAPSHOT_OPERATOR_GUIDE.md` (10 min) — covers the new snapshot badge + copy workflow
- No coding needed; you'll use the app exactly as you would daily

**Scheduling**: Reply with 2-3 time windows that work for you between **2026-07-15 and 2026-08-05** (gives 4 days buffer before D-21 deadline). Henry will confirm + send calendar invite.

If you cannot participate, **please reply ASAP** so we can find a substitute (sales team is the priority pool; NPI as backup).

Thanks,
Henry Đặng Thế Thiệp
Lead Engineer, Ops Control v1.6

---

**🇻🇳 TIẾNG VIỆT**

Chào [tên operator],

Bạn được mời tham gia **User Acceptance Testing (UAT)** cho Ops Control v1.6 — hệ thống tính giá + báo giá bạn sẽ dùng hàng ngày từ **2026-08-30**.

**Việc bạn làm**:

- Chạy 30 kịch bản báo giá thực tế end-to-end (save, copy, export, approve, review snapshot)
- Xác nhận hệ thống cho kết quả đúng
- Báo cáo bug, UI khó hiểu, hoặc thiếu workflow
- Ký nhận khi tự tin hệ thống sẵn sàng dùng hàng ngày

**Thời gian cần**: 3-4 giờ mỗi buổi, **trước 2026-08-09**. Có thể chia 2 buổi × 2h nếu tiện hơn.

**Địa điểm**: CCL Design Hai Duong, workstation của bạn (Mac CLIENT app)

**Tại sao quan trọng**: Không có chữ ký của bạn, không thể xác nhận hệ thống đáp ứng nhu cầu sales floor. Henry test trước KHÔNG ĐỦ — bạn là người dùng thật. Nếu ship mà không có validation của bạn và phát hiện vấn đề day 1, cutover có rủi ro phải rollback.

**Chuẩn bị**:

- Đọc `docs/cutover/MAC_INSTALL_GUIDE.md` (15 phút) nếu chưa cài CLIENT DMG mới
- Đọc `docs/cutover/PRICING_SNAPSHOT_OPERATOR_GUIDE.md` (10 phút) — covers badge snapshot + workflow copy
- Không cần code; bạn dùng app như hàng ngày

**Đặt lịch**: Phản hồi 2-3 khung giờ phù hợp giữa **2026-07-15 và 2026-08-05** (cho 4 ngày buffer trước hạn D-21). Henry sẽ xác nhận + gửi calendar invite.

Nếu không tham gia được, **phản hồi sớm nhất có thể** để tìm người thay (ưu tiên sales team; NPI là backup).

Cảm ơn,
Henry Đặng Thế Thiệp
Lead Engineer, Ops Control v1.6

---

## 📅 Proposed scheduling window · Khung lịch đề xuất

| Window · Khoảng                  | Operator slot count · Số slot | Slack remaining · Buffer còn lại |
| -------------------------------- | ----------------------------- | -------------------------------- |
| 2026-07-15 → 2026-07-22 (Week 1) | 4 slots × ~3-4h               | 18 days to D-21 deadline         |
| 2026-07-23 → 2026-07-30 (Week 2) | 4 slots                       | 11 days                          |
| 2026-07-31 → 2026-08-05 (Week 3) | 4 slots ← **HARD STOP HERE**  | 4 days (buffer for re-tests)     |

**Henry's allocation strategy**:

- Aim Week 1-2 for primary operators (most likely to find blocker issues)
- Reserve Week 3 for: (a) re-tests after bug fixes, (b) backup operators if primary cancels, (c) final sign-off circuit
- Do NOT schedule into 2026-08-06+ — that's bug-fix time before D-21

---

## 👥 Operator pool · Danh sách operator

> Henry fills in actual names + emails when sending invitations · Henry điền tên + email thực khi gửi mời

| #   | Name · Tên             | Role · Vai trò            | Email  | Status                             | Session date booked    |
| --- | ---------------------- | ------------------------- | ------ | ---------------------------------- | ---------------------- |
| 1   | **\*\***\_\_\_**\*\*** | Sales (primary)           | **\_** | [ ] Invited [ ] Confirmed [ ] Done | \***\*\_\*\***         |
| 2   | **\*\***\_\_\_**\*\*** | Sales (primary)           | **\_** | [ ] Invited [ ] Confirmed [ ] Done | \***\*\_\*\***         |
| 3   | **\*\***\_\_\_**\*\*** | Sales (backup)            | **\_** | [ ] Invited [ ] Confirmed [ ] Done | \***\*\_\*\***         |
| 4   | **\*\***\_\_\_**\*\*** | NPI (backup)              | **\_** | [ ] Invited [ ] Confirmed [ ] Done | \***\*\_\*\***         |
| 5   | Hương                  | Backup engineer (witness) | **\_** | [ ] Confirmed                      | (attends all sessions) |

**Target · Mục tiêu**: ≥2 confirmed completions before 2026-08-09. 3 ideal (one finds something the other two miss).

---

## 🛠️ Session preparation checklist · Checklist chuẩn bị buổi

> Henry runs through this **24h before each scheduled UAT session** · Henry kiểm tra **24h trước mỗi buổi**

- [ ] Operator's Mac CLIENT app version verified ≥ v1.6.0-rc latest (Settings → About)
- [ ] Operator's login works + TOTP enrolled (test by logging in night before)
- [ ] Library data current (Materials / Workcenters / Coverage / Rate rows synced from production master)
- [ ] At least 3 pre-existing quote fixtures available for "copy quote" scenarios
- [ ] `docs/uat/C5_UAT_CHECKLIST.md` printed (~4 pages) + pen
- [ ] Backup of operator's session-relevant data taken (in case bug corrupts state mid-test)
- [ ] Henry available for ~30 min Q&A immediately after session (don't make operator wait for bug discussion)
- [ ] Coffee + water + room booked if at-office; quiet environment if WFH

---

## 📝 Per-session output · Đầu ra mỗi buổi

After each UAT session, operator + Henry produce:

1. **Filled `C5_UAT_CHECKLIST.md`** — pass/fail per scenario (30 rows), operator signature
2. **Bug list** (if any) — Henry files each into MES-3-FIX-NN ticket with operator's reproduce steps
3. **Workflow gap notes** — items "not a bug but confusing UI" → backlog for post-go-live polish
4. **Operator subjective rating** — "ready to use daily? YES / NO / YES-WITH-CAVEATS" + reason

---

## 🚦 Decision criteria · Tiêu chí ra quyết định

After ≥2 operators complete UAT (before 2026-08-09):

| Outcome                              | Action                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Both YES + 0 P0/P1 bugs              | ✅ C-5 CLOSED, go-live confirmed for 2026-08-30                                     |
| Both YES + ≤3 P2 bugs                | ✅ C-5 CLOSED-WITH-CAVEATS, P2 fixes ship in v1.6.0-rcN before D-7                  |
| At least 1 NO + any P0/P1 bug        | 🟡 C-5 PENDING — fix bugs in 7-10 days, retest before D-7 (2026-08-23)              |
| At least 1 NO + complex workflow gap | 🟡 C-5 PENDING — design fix + Henry decision: ship v1.6 with workaround OR slip D-0 |
| Both NO + multiple P0 bugs           | 🔴 ESCALATE — slip D-0 to 2026-09-15 minimum, file `S-V1.6-DELAY-D21-UAT-FAIL`      |

---

## Cross-reference

- `docs/uat/pricing-snapshot-uat.md` — 30-scenario UAT script (source of truth for what's tested)
- `docs/uat/C5_UAT_CHECKLIST.md` — pass/fail checklist + signature block (use during each session)
- `docs/cutover/MAC_INSTALL_GUIDE.md` — operator install pre-req
- `docs/cutover/PRICING_SNAPSHOT_OPERATOR_GUIDE.md` — snapshot-specific UX brief
- [project_golive memory] — update C-5 status after each session closes
