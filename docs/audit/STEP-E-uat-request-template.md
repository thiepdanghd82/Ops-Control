# Step E — UAT Request Template / Mẫu yêu cầu UAT

Bilingual EN+VI request a tester / technical lead can copy-paste into the team's communication channel (Slack, Teams, email, internal wiki) when scheduling UAT for `fix/pre-go-live-p0`.

> **Branch state at template generation:** HEAD `124eb73`, 12 commits ahead of `main`, all 7 P0 fixes shipped + Step C/D/Retrospective docs in place.

---

## EN — UAT Request

### UAT Request — Ops Control v1.5 Step B (Production Readiness)

**Branch:** `fix/pre-go-live-p0`
**Commit range:** `e75cac9..124eb73` (12 commits)
**UAT checklist (full):** [`docs/audit/STEP-C-uat-checklist.md`](STEP-C-uat-checklist.md)
**Estimated time:** ~1–2 hours per tester (60 min full pass + 15 min sign-off + 15-30 min buffer)

**What needs verification:**
7 production-readiness fixes catching items flagged by the Phase 0-5 audit (verdict was ⚠ GO WITH CONDITIONS):

- **Security** — Unified login error response per OWASP ASVS V4.0 §6.2.4 (closes username-enumeration leak)
- **Performance** — gzip compression middleware (~80 % reduction on initial bundle)
- **Accessibility** — Login form heading hierarchy + control labels (WCAG 2.1 §1.3.1, §2.4.6, §4.1.2)
- **Operations** — DATA_DIR resolution sync across deploy scripts + new env-source startup logging (closes F4-5 root-cause class)
- **Documentation** — MIGRATION_GUIDE refreshed for v1.5

Plus 1 audit-evidence commit + 1 retrospective doc + 1 UAT checklist (this one).

**Test environment:**

- [ ] Dev only — confirm env access
- [ ] Staging — preferred for pre-prod validation
- [ ] Production-like — best simulation

**UAT artifacts you'll use:**

- **§1 Pre-UAT Checklist** — env prerequisites, test users, sample data, backup
- **§2 Per-Fix Scenarios (×7)** — 5–10 min each; each scenario standalone (skip out of order if needed)
- **§3 End-to-End Smoke** — 5-min happy path exercising all 7 fixes together
- **§4 Rollback Decision Tree** — severity-based action map; "hard rollback" emergency procedure
- **§5 Operator Coordination** — tester selection, scheduling, findings template, sign-off ceremony
- **§6 Final Sign-off Form** — tester sign + tech lead counter-sign

**Findings template:** Section 5.4 of the UAT checklist. File reports under `docs/audit/uat-issues/`.

**Rollback plan if UAT fails:** Section 4 of the UAT checklist (severity-based). Hard rollback per Sprint 1.7 snapshot pattern (CLAUDE.md "Bad deploy" runbook).

**Recovery anchors active** (preserved through Step B):

- `wip-snapshot-20260504-082812` git tag
- `pre-sidebar-revert-20260504-090729` git tag
- `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB)

**Contact for questions:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Target completion:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**On UAT pass** → tech lead counter-signs Section 6 of the UAT checklist → branch is approved for merge to `main` + version bump (`v1.5.1` patch or `v1.6.0` minor; decision deferred to post-UAT).

**On UAT fail** → file UAT Issue Report (template at §5.4 of checklist) → return to dev → re-test only failing scenarios after the follow-up fix.

**Background docs:**

- Per-fix evidence: [`STEP-B-fix-summary.md`](STEP-B-fix-summary.md)
- Final audit verdict: [`FINAL-REPORT.md`](FINAL-REPORT.md)
- Retrospective + hidden findings registry: [`STEP-B-RETROSPECTIVE.md`](STEP-B-RETROSPECTIVE.md)
- Fix 6 WIP triage decisions: [`FIX-6-CLASSIFICATION.md`](FIX-6-CLASSIFICATION.md)

---

## VI — Yêu cầu UAT

### Yêu cầu UAT — Ops Control v1.5 Step B (Sẵn sàng go-live)

**Branch:** `fix/pre-go-live-p0`
**Khoảng commit:** `e75cac9..124eb73` (12 commits)
**Checklist UAT đầy đủ:** [`docs/audit/STEP-C-uat-checklist.md`](STEP-C-uat-checklist.md)
**Thời gian dự kiến:** ~1–2 giờ / tester (60 phút chạy đủ + 15 phút ký nhận + 15–30 phút dự phòng)

**Cần xác minh:**
7 fix đóng các finding đã flag từ audit Phase 0-5 (verdict ban đầu là ⚠ GO WITH CONDITIONS):

- **Bảo mật** — Gộp thông báo lỗi login theo OWASP ASVS V4.0 §6.2.4 (đóng lỗ hổng leak username)
- **Hiệu năng** — Bật middleware nén gzip (~80 % giảm bundle ban đầu)
- **Khả năng tiếp cận (a11y)** — Cấu trúc heading + label các input form login (WCAG 2.1 §1.3.1, §2.4.6, §4.1.2)
- **Vận hành** — Đồng bộ phân giải `DATA_DIR` qua deploy scripts + log nguồn env khi khởi động (đóng cả root cause của F4-5)
- **Tài liệu** — Cập nhật `MIGRATION_GUIDE.md` cho v1.5

Cộng thêm 1 commit bằng chứng audit + 1 doc retrospective + 1 checklist UAT (chính file này).

**Môi trường test:**

- [ ] Dev — confirm có quyền truy cập
- [ ] Staging — ưu tiên để verify pre-prod
- [ ] Tương đương production — mô phỏng tốt nhất

**Tài liệu tester sẽ dùng:**

- **§1 Pre-UAT Checklist** — yêu cầu môi trường, tài khoản test, dữ liệu mẫu, backup
- **§2 Scenarios per fix (×7)** — 5–10 phút/scenario; mỗi scenario độc lập (có thể đảo thứ tự)
- **§3 End-to-End Smoke** — happy path 5 phút chạy qua cả 7 fix
- **§4 Cây quyết định rollback** — bảng tra cứu theo severity; quy trình rollback khẩn
- **§5 Phối hợp operator** — chọn tester, lên lịch, mẫu finding, lễ ký nhận
- **§6 Phiếu ký nhận cuối** — tester ký + tech lead đồng ký

**Mẫu báo cáo finding:** §5.4 trong UAT checklist. Lưu báo cáo dưới `docs/audit/uat-issues/`.

**Kế hoạch rollback nếu UAT fail:** §4 của UAT checklist (theo severity). Hard rollback theo pattern snapshot Sprint 1.7 (runbook "Bad deploy" trong CLAUDE.md).

**Mốc khôi phục đang có sẵn** (đã giữ qua Step B):

- `wip-snapshot-20260504-082812` git tag
- `pre-sidebar-revert-20260504-090729` git tag
- `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB)

**Người liên hệ khi có câu hỏi:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Hạn hoàn thành dự kiến:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Khi UAT pass** → tech lead đồng ký §6 của UAT checklist → branch được duyệt merge vào `main` + bump version (`v1.5.1` patch hoặc `v1.6.0` minor; quyết định sau UAT).

**Khi UAT fail** → mở UAT Issue Report (template §5.4) → quay về dev → chỉ test lại các scenario fail sau khi fix.

**Tài liệu nền:**

- Bằng chứng từng fix: [`STEP-B-fix-summary.md`](STEP-B-fix-summary.md)
- Verdict audit cuối: [`FINAL-REPORT.md`](FINAL-REPORT.md)
- Retrospective + registry hidden findings: [`STEP-B-RETROSPECTIVE.md`](STEP-B-RETROSPECTIVE.md)
- Phân loại WIP Fix 6: [`FIX-6-CLASSIFICATION.md`](FIX-6-CLASSIFICATION.md)

---

## Suggested communication channels

Pick whichever the team uses. Same content fits all formats:

- **Slack** — paste the EN or VI block (or both) into the relevant channel; pin the message
- **Teams** — same as Slack; use a Wiki/Tab if the team has one
- **Email** — Subject: `UAT Request — Ops Control v1.5 Step B`; body = the EN block; attach the checklist .md or link to repo
- **Internal wiki / Confluence** — create a page; copy-paste; link from the sprint-tracking page

## Operational reminders for the requester

- Confirm the tester does NOT meet the "wrote the Step B code" criterion — independent verification is the whole point of UAT.
- Request a 1-hour rollback window AFTER UAT completion for safety.
- Test data prep (per §5.3 of the checklist) should be done by a SEPARATE operator from the tester, BEFORE UAT starts.
- Sign-off ceremony (§5.5) is in-person or screen-shared — do NOT accept "I ran the checklist on my own and signed at the bottom" without observation.
