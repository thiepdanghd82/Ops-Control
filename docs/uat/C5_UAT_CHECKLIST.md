# C-5 UAT CHECKLIST — Environment + pass/fail + signature block

## Per-session UAT checklist · Checklist mỗi buổi UAT

**Use during each operator UAT session · Dùng trong từng buổi UAT operator**
**Companion to `docs/uat/pricing-snapshot-uat.md` (30 scenarios) · Đi cùng kịch bản 30 scenario**
**Output: signed checklist filed at `docs/uat/runs/UAT-<operator>-<YYYY-MM-DD>.md`**

---

## 1. Session meta · Thông tin buổi

| Field                          | Value                                                            |
| ------------------------------ | ---------------------------------------------------------------- |
| Operator name · Tên            | \***\*\*\*\*\***\_\_\_\***\*\*\*\*\***                           |
| Operator role · Vai trò        | [ ] Sales primary [ ] Sales backup [ ] NPI [ ] Other: **\_**     |
| Date · Ngày                    | \***\*\*\*\*\***\_\_\_\***\*\*\*\*\***                           |
| Start time · Giờ bắt đầu       | **\_** · End time · Giờ kết thúc: **\_**                         |
| Henry attended · Henry tham dự | [ ] Yes (observe + Q&A) [ ] No (operator solo)                   |
| Hương attended · Hương tham dự | [ ] Yes (witness) [ ] No                                         |
| Environment · Môi trường       | [ ] Production-grade DMG [ ] Pre-release rc [ ] Dev build        |
| Build SHA256 · SHA build       | \***\*\*\*\*\***\_\_\_\***\*\*\*\*\*** (verify Settings → About) |

---

## 2. Environment pre-checks · Kiểm tra môi trường trước

> Verify ALL boxes pass BEFORE starting scenarios. If any fail, STOP — fix first.
> Xác nhận TẤT CẢ tick BEFORE scenarios. Nếu sai, DỪNG — sửa trước.

| #   | Pre-check                                                        | Pass | Fail | Note   |
| --- | ---------------------------------------------------------------- | ---- | ---- | ------ |
| 1   | Mac CLIENT app version matches latest v1.6-rc                    | [ ]  | [ ]  | **\_** |
| 2   | Login works + TOTP enrolled                                      | [ ]  | [ ]  | **\_** |
| 3   | Settings → About shows correct site (CCL Design Hai Duong)       | [ ]  | [ ]  | **\_** |
| 4   | Library data current (latest Materials/Workcenters/Rate rows)    | [ ]  | [ ]  | **\_** |
| 5   | At least 3 pre-existing quote fixtures available (for Copy test) | [ ]  | [ ]  | **\_** |
| 6   | Network: server :3000 reachable (test by opening Quote History)  | [ ]  | [ ]  | **\_** |
| 7   | Backup of operator's state taken (rollback if bug corrupts)      | [ ]  | [ ]  | **\_** |

**Environment ready? · Môi trường sẵn sàng?**: [ ] YES — proceed · [ ] NO — STOP, log issue

---

## 3. 30-scenario pass/fail summary · Tóm tắt 30 scenario

> Operator works through `docs/uat/pricing-snapshot-uat.md`; for each scenario, tick P (pass) or F (fail). Note bug ID if F.
> Operator thực hiện theo `docs/uat/pricing-snapshot-uat.md`; mỗi scenario tick P (pass) hoặc F (fail). Ghi bug ID nếu F.

### A. Save + freeze (scenarios 1-5)

| #   | Scenario name (from UAT script)                | P   | F   | Bug ID / Note                        |
| --- | ---------------------------------------------- | --- | --- | ------------------------------------ |
| 1   | Std quote save → snapshot persisted            | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 2   | Cpx quote save → snapshot per-SP persisted     | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 3   | Empty draft save → empty snapshot graceful     | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 4   | Snapshot status badge shows "Frozen"           | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 5   | \_captured_by + \_captured_at fields populated | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### B. Copy quote (scenarios 6-10)

| #   | Scenario name                                 | P   | F   | Bug ID / Note                        |
| --- | --------------------------------------------- | --- | --- | ------------------------------------ |
| 6   | Copy Std quote → new copy = draft state       | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 7   | Copy Cpx quote → all SPs copied               | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 8   | Copy preserves pricing snapshot in source     | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 9   | Copy resets \_captured_at/\_by in destination | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 10  | Copy badge flips to "Live" until first save   | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### C. Legacy heal-on-read (scenarios 11-15)

| #   | Scenario name                                 | P   | F   | Bug ID / Note                        |
| --- | --------------------------------------------- | --- | --- | ------------------------------------ |
| 11  | Pre-snapshot legacy quote loads without error | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 12  | Legacy quote shows "No snapshot" badge        | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 13  | Resave legacy quote populates snapshot        | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 14  | Legacy + tool_life partial heal works         | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 15  | \_warnings array surfaces legacy detection    | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### D. SnapshotPanel UI (scenarios 16-19)

| #   | Scenario name                                       | P   | F   | Bug ID / Note                        |
| --- | --------------------------------------------------- | --- | --- | ------------------------------------ |
| 16  | Cost Breakdown bottom panel renders 5 fields        | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 17  | Click-toggle works (open/close)                     | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 18  | Source pill color matches state (green/yellow/gray) | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 19  | Copy-mode banner appears on copies                  | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### E. Summarize column (scenarios 20-21)

| #   | Scenario name                              | P   | F   | Bug ID / Note                        |
| --- | ------------------------------------------ | --- | --- | ------------------------------------ |
| 20  | Snapshot column togglable in ColumnsToggle | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 21  | Column shows Frozen/Live/No per row        | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### F. xlsx audit sheet (scenarios 22-25)

| #   | Scenario name                          | P   | F   | Bug ID / Note                        |
| --- | -------------------------------------- | --- | --- | ------------------------------------ |
| 22  | Export shows "10 Pricing Snapshot" tab | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 23  | 11 audit rows populate correctly       | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 24  | Status label matches snapshot state    | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 25  | Warnings cell shows all \_warnings     | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### G. Site mismatch + library drift (scenarios 26-28)

| #   | Scenario name                                           | P   | F   | Bug ID / Note                        |
| --- | ------------------------------------------------------- | --- | --- | ------------------------------------ |
| 26  | Site mismatch warning surfaces in \_warnings            | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 27  | Library update post-save: snapshot still uses old rates | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 28  | Library audit shielding works across reload             | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |

### H. /metrics counters (scenarios 29-30)

| #   | Scenario name                                        | P   | F   | Bug ID / Note                        |
| --- | ---------------------------------------------------- | --- | --- | ------------------------------------ |
| 29  | pricing_snapshot_save_total counter increments       | [ ] | [ ] | \***\*\*\*\*\***\_\_\***\*\*\*\*\*** |
| 30  | pricing_snapshot_synth_save_total tracks synth saves | [ ] | [ ] | **\*\*\*\***\_\_**\*\*\*\***         |

---

## 4. Scenario summary statistics · Thống kê

| Metric · Chỉ số                               | Count       |
| --------------------------------------------- | ----------- |
| Scenarios PASSED                              | \_\_\_\_/30 |
| Scenarios FAILED                              | \_\_\_\_/30 |
| P0 bugs found (operator can't use feature)    | \_\_\_\_    |
| P1 bugs found (workaround exists but painful) | \_\_\_\_    |
| P2 bugs found (cosmetic / edge case)          | \_\_\_\_    |
| Workflow gaps (no bug but confusing)          | \_\_\_\_    |

**Pass threshold for C-5 sign-off · Ngưỡng pass cho ký C-5**: ≥28/30 PASS + 0 P0 + ≤1 P1 + ≤3 P2

---

## 5. Operator subjective rating · Đánh giá chủ quan operator

After completing all 30 scenarios, the operator answers:

> **EN:** "Based on this UAT session, do you feel ready to use Ops Control v1.6 for your daily work starting 2026-08-30?"
>
> **VI:** "Sau buổi UAT này, bạn có cảm thấy sẵn sàng dùng Ops Control v1.6 hàng ngày từ 2026-08-30 không?"

- [ ] **YES** — confident, ship as-is
- [ ] **YES WITH CAVEATS** — usable but please fix [list]: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
- [ ] **NO** — too many issues; need [list]: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***

**Optional comments · Ghi chú tùy chọn**:

---

---

---

---

## 6. Bug list filed · Bug đã file

| Bug ID (MES-3-FIX-NN) | Severity (P0/P1/P2) | Brief description · Mô tả ngắn                             |
| --------------------- | ------------------- | ---------------------------------------------------------- |
| **\*\***\_\_**\*\***  | **\_**              | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| **\*\***\_\_**\*\***  | **\_**              | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| **\*\***\_\_**\*\***  | **\_**              | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| **\*\***\_\_**\*\***  | **\_**              | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| **\*\***\_\_**\*\***  | **\_**              | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |

---

## 7. Signatures · Chữ ký

By signing below, the operator confirms they completed the UAT scenarios above, the pass/fail results are accurate, and the subjective rating reflects their honest assessment.

> Bằng chữ ký dưới đây, operator xác nhận đã hoàn thành scenario UAT trên, kết quả pass/fail chính xác, và đánh giá chủ quan phản ánh đúng cảm nhận thực.

| Role · Vai trò                   | Name · Tên                     | Signature · Chữ ký             | Date · Ngày    |
| -------------------------------- | ------------------------------ | ------------------------------ | -------------- |
| Operator                         | **\*\*\*\***\_\_\_**\*\*\*\*** | **\*\*\*\***\_\_\_**\*\*\*\*** | \***\*\_\*\*** |
| Engineering Lead (Henry)         | Henry Đặng Thế Thiệp           | **\*\*\*\***\_\_\_**\*\*\*\*** | \***\*\_\*\*** |
| Backup Engineer (Hương, witness) | Hương                          | **\*\*\*\***\_\_\_**\*\*\*\*** | \***\*\_\*\*** |

---

## 8. Henry post-session action checklist · Việc Henry làm sau

Within 4 hours after session ends:

- [ ] File this completed checklist at `docs/uat/runs/UAT-<operator>-<YYYY-MM-DD>.md`
- [ ] Open MES-3-FIX-NN tickets for each P0/P1/P2 bug logged
- [ ] Update `project_golive` memory: C-5 progress (X of ≥2 operators done)
- [ ] If P0 found: assess fix-time, decide if D-21 deadline at risk; escalate if yes
- [ ] If all ≥2 operators done + criteria met: mark C-5 ✅ CLOSED in memory + notify stakeholder + Hương
- [ ] If criteria not met after 2nd operator: schedule 3rd operator OR re-test post-fix; document in memory

---

## Cross-reference

- `docs/uat/pricing-snapshot-uat.md` — 30-scenario UAT script (the actual test cases)
- `docs/uat/C5_OPERATOR_INVITATION.md` — operator booking + invitation flow
- `docs/uat/runs/` — completed signed checklists archive
- [project_golive memory] — C-5 tracking
