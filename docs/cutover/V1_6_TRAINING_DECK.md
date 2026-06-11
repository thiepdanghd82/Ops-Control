# Ops Control v1.6 — Training Deck · Tài liệu training

> 10-slide bilingual deck for Monday 2026-07-21 09:00 ICT operator training session.
> Duration · Thời lượng: 60-90 min (presentation 40 min + live demo 30 min + Q&A 20 min).
> Audience · Đối tượng: CCL Vietnam Hai Duong Cost / Sales / NPI / Plant operators.
> Format: Markdown — render via any deck tool (Marp, Slidev, or just paginate by `---`).

---

## Slide 1 — Title · Tiêu đề

```
                  ┌──────────────────────────┐
                  │                          │
                  │     OPS CONTROL v1.6     │
                  │                          │
                  │   Pricing Snapshot       │
                  │   Đóng băng giá báo giá  │
                  │                          │
                  │   Live from 2026-07-21   │
                  │                          │
                  └──────────────────────────┘

Presented by · Trình bày: Henry Dang (Đặng Thế Thiệp)
Training date · Ngày training: Monday 2026-07-21 · 09:00 ICT
Location · Địa điểm: CCL Vietnam Hai Duong · [Conference room name]
```

---

## Slide 2 — Why v1.6 · Tại sao có v1.6

| 🇻🇳 Vietnamese                                                                                                                                         | 🇬🇧 English                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vấn đề trước v1.6** Quote cũ mở lại thấy giá KHÁC vì library tự cập nhật. Operator + auditor không biết "giá thật" của quote lúc save là bao nhiêu. | **Problem before v1.6** Reopening an old quote showed DIFFERENT prices because the library auto-updated. Operators + auditors had no way to know the "real" prices at save time. |
| **Hệ quả** Compliance gap. Khách hàng có thể nhận quote với giá đã đổi sau khi save. Auditor không trace được.                                        | **Consequence** Compliance gap. Customers could receive quotes with prices that changed after save. Auditors couldn't trace back.                                                |
| **Giải pháp v1.6** Mỗi lần ấn **Save** = đóng băng đơn giá ngay lập tức. Mở lại sau → đúng số lúc save.                                               | **v1.6 solution** Each **Save** = freeze prices immediately. Reopen later → same numbers as save time.                                                                           |
| **Tự động** Không có toggle, không có setting. Operator không cần thao tác thêm.                                                                      | **Automatic** No toggle, no setting. Operators do nothing extra.                                                                                                                 |

**Demo (1 min):** show side-by-side: old behavior (drift) vs new (frozen) on the same quote.

---

## Slide 3 — Reading the badge · Đọc badge

| Badge               | Meaning · Ý nghĩa                                                                        | What to do · Cần làm                         |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| 🟢 **Frozen**       | Quote pinned to rates at save time · Quote đã đóng băng đơn giá đúng                     | None · Không cần làm gì                      |
| 🟡 **Live rates**   | Quote uses current library rates (not frozen) · Quote đang dùng đơn giá library hiện tại | **Save** to freeze · **Lưu** để đóng băng    |
| ⚪ **No snapshot**  | New quote, no library loaded · Quote mới, chưa có library                                | Open library → save · Mở library → lưu       |
| 🔴 **N warning(s)** | Audit warnings (e.g. site mismatch) · Cảnh báo audit                                     | Expand panel to read · Mở panel đọc chi tiết |

### Where to find the panel · Xem panel ở đâu

```
Pricing (Std hoặc Cpx)
    ↓
Cost Breakdown sub-tab
    ↓
Scroll xuống dưới cùng
    ↓
Pricing Snapshot ← bấm vào row mở/đóng
```

Klick row tiêu đề mở/đóng. Caret ▸ ↔ ▾ rotate.

---

## Slide 4 — Demo 1: New quote → freeze · Báo giá mới → đóng băng

**LIVE WALKTHROUGH (3 min)**

🇻🇳 Bước:

1. Pricing (Std) → tạo quote mới
2. Fill RFQ + materials + processes + selling price
3. Ấn Save
4. Reload page (Cmd+R)
5. Quote History → mở quote vừa save
6. Cost Breakdown → cuộn xuống → SnapshotPanel
7. Badge phải XANH 🟢 Frozen
8. Captured at = thời điểm vừa save
9. Captured by = username của bạn

🇬🇧 Steps:

1. Pricing (Std) → create new quote
2. Fill RFQ + materials + processes + selling price
3. Press Save
4. Reload page (Cmd+R)
5. Quote History → open just-saved quote
6. Cost Breakdown → scroll to bottom → SnapshotPanel
7. Badge must be GREEN 🟢 Frozen
8. Captured at = save timestamp
9. Captured by = your username

**Expected · Kết quả mong đợi:** ✓ tất cả 9 checkpoints green.

---

## Slide 5 — Demo 2: Copy quote · Sao chép báo giá

**LIVE WALKTHROUGH (4 min) — IMPORTANT: workflow MỚI v1.6**

| 🇻🇳                                                           | 🇬🇧                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Pre-v1.6: copy quote → save → ghi đè quote gốc (silent bug!) | Pre-v1.6: copy quote → save → silently overwrote the original (bug!) |
| v1.6: copy quote → save → tạo RFQ MỚI · Quote gốc KHÔNG đổi  | v1.6: copy quote → save → creates NEW RFQ · Original UNCHANGED       |

🇻🇳 Bước:

1. Quote History → CHUỘT PHẢI quote bất kỳ → **Copy**
2. Pricing editor mở với state quote gốc
3. **Banner XANH NƯỚC BIỂN xuất hiện ở đầu**: "This is a COPY of …"
4. SnapshotPanel badge → 🟡 Live rates (vì copy chưa save)
5. Edit gì đó (vd đổi selling price 0.50 → 0.55)
6. Save với RFQ mới (vd RFQ-COPY-001)
7. Reload → badge XANH 🟢 Frozen, captured_at = NOW
8. Mở quote GỐC ở tab khác → captured_at vẫn nguyên (không bị đổi)

🇬🇧 Steps:

1. Quote History → RIGHT-CLICK any quote → **Copy**
2. Pricing editor opens with original quote state
3. **BLUE info banner at top**: "This is a COPY of …"
4. SnapshotPanel badge → 🟡 Live rates (copy not saved yet)
5. Edit something (e.g. change selling price 0.50 → 0.55)
6. Save with new RFQ (e.g. RFQ-COPY-001)
7. Reload → GREEN 🟢 Frozen badge, captured_at = NOW
8. Open ORIGINAL quote in other tab → captured_at unchanged

**Key takeaway · Điểm chính:** Copy quote là an toàn trong v1.6. Operator có thể experiment với quote cũ thoải mái mà không sợ ghi đè.

---

## Slide 6 — Demo 3: Legacy quote heal · Báo giá cũ tự heal

**LIVE WALKTHROUGH (2 min)** — chỉ áp dụng cho quote save TRƯỚC 2026-06-10.

🇻🇳 Bước:

1. Quote History → mở quote cũ (RFQ trước Sprint S-SNAPSHOT)
2. Cost Breakdown → SnapshotPanel
3. Badge → 🟡 **Live rates** (synthesized)
4. captured_at + captured_by = `—`
5. Cost numbers VẪN hiển thị (system synth từ current library)
6. Ấn **Save** (không cần đổi gì)
7. Reload → badge chuyển 🟢 **Frozen**
8. captured_at + captured_by giờ có đầy đủ

🇬🇧 Steps:

1. Quote History → open old quote (RFQ before Sprint S-SNAPSHOT)
2. Cost Breakdown → SnapshotPanel
3. Badge → 🟡 **Live rates** (synthesized)
4. captured_at + captured_by = `—`
5. Cost numbers DO display (system synthesizes from current library)
6. Press **Save** (no edits needed)
7. Reload → badge changes to 🟢 **Frozen**
8. captured_at + captured_by now populated

**One-shot migration**: each operator re-saves their old quotes once → all frozen. No batch tool needed.

**Migration một lần**: mỗi operator save lại quote cũ một lần → tất cả freeze. Không cần batch tool.

---

## Slide 7 — Demo 4: Site mismatch warning · Cảnh báo site không khớp

**LIVE WALKTHROUGH (2 min)**

🇻🇳 Bước:

1. Mở quote đã frozen dưới Site = VN
2. Header → đổi Site VN → India (KHÔNG save)
3. Cost Breakdown → SnapshotPanel
4. Hiện badge ĐỎ 🔴 **1 warning**
5. Mở panel → Warnings section: "Site mismatch: snapshot frozen under 'VN', current state.site = 'India'"
6. Cost numbers vẫn hiển thị (resolve qua snapshot)
7. Quyết định: revert site về VN HOẶC save lại để rebuild snapshot under India

🇬🇧 Steps:

1. Open a quote frozen under Site = VN
2. Header → change Site VN → India (DO NOT save)
3. Cost Breakdown → SnapshotPanel
4. RED 🔴 **1 warning** badge appears
5. Expand panel → Warnings section: "Site mismatch: snapshot frozen under 'VN', current state.site = 'India'"
6. Cost numbers still display (resolved via snapshot)
7. Decision: revert site back to VN OR save again to rebuild snapshot under India

**Why this matters · Tại sao quan trọng**: catches operator typo / wrong-site mid-edit BEFORE customer sees the quote. xlsx export cũng surface cảnh báo này.

---

## Slide 8 — Demo 5: xlsx export audit sheet · Xuất xlsx có tab audit

**LIVE WALKTHROUGH (3 min)**

🇻🇳 Bước:

1. Quote History → icon download (⬇) trên row
2. Modal Export → variant: Internal copy, lang: EN, single tier
3. Click Export → save xlsx file
4. Mở file trong Excel
5. Có 11 sheets visible (tăng từ 10 ở v1.5):
   - Cover / RFQ-MOQ / Layout / Materials / Inks / Processes / Balancing / Pack&Ship / Cost Breakdown / Summary
   - **`10 Pricing Snapshot`** ← MỚI ở v1.6
6. Click tab "10 Pricing Snapshot" → 11 rows metadata:
   - Quote ID / Quote saved at / Pricing captured at / Pricing captured by / Site / Library version / Snapshot status / Materials frozen / Workcenters frozen / Coverage rows / Warnings
7. Snapshot status = "Frozen at save time" cho quote đã freeze

🇬🇧 Steps:

1. Quote History → download icon (⬇) on row
2. Export modal → variant: Internal copy, lang: EN, single tier
3. Click Export → save xlsx file
4. Open in Excel
5. 11 visible sheets (up from 10 in v1.5):
   - Cover / RFQ-MOQ / Layout / Materials / Inks / Processes / Balancing / Pack&Ship / Cost Breakdown / Summary
   - **`10 Pricing Snapshot`** ← NEW in v1.6
6. Click "10 Pricing Snapshot" tab → 11 rows of metadata:
   - Quote ID / Quote saved at / Pricing captured at / Pricing captured by / Site / Library version / Snapshot status / Materials frozen / Workcenters frozen / Coverage rows / Warnings
7. Snapshot status = "Frozen at save time" for frozen quotes

**Use case · Trường hợp dùng**: Finance / auditor / customer reviewer đọc tab này thay vì login app. xlsx self-contained.

---

## Slide 9 — Bulk audit + Summarize column · Quét hàng loạt qua cột Snapshot

**LIVE WALKTHROUGH (2 min)**

🇻🇳 Bước:

1. Cost → Cost Breakdown (Summarize tab)
2. Click toggle Columns (icon 3-chấm bên phải)
3. Tìm "Snapshot" trong list → bật ✓
4. Cột mới xuất hiện hiển thị badge per-row: Frozen / Live / No snapshot
5. Quét nhanh bảng → tìm dòng 🟡 Live rates → đó là quote chưa freeze
6. Decision: save lại để freeze trước khi gửi customer / chốt giá

🇬🇧 Steps:

1. Cost → Cost Breakdown (Summarize tab)
2. Click Columns toggle (3-dot icon, right side)
3. Find "Snapshot" in list → enable ✓
4. New column shows per-row badge: Frozen / Live / No snapshot
5. Scan table → find 🟡 Live rates rows → those are unfrozen quotes
6. Decision: save again to freeze before sending to customer / finalising price

**Default**: cột Snapshot tắt mặc định. Operator opt-in khi cần forensic scan.

**Default**: Snapshot column hidden by default. Operator opts in for forensic scan.

---

## Slide 10 — Support + Q&A · Hỗ trợ + Q&A

### Day 1 support · Hỗ trợ ngày đầu

| Channel · Kênh                  | Use case · Trường hợp dùng               |
| ------------------------------- | ---------------------------------------- |
| Slack #ops-control-v1-6-support | Quick questions, screenshot bugs         |
| Zalo "Ops Control" group        | Real-time alerts, broadcast updates      |
| Email henry@...                 | Compliance / data questions cần ghi nhận |
| Phone +84 [Henry's number]      | P0 / production blocker only             |

### Top 5 FAQ · 5 câu hỏi thường gặp

**Q1 · 🇻🇳** Tại sao số quote khác tuần trước? · **🇬🇧** Why are numbers different from last week?
**A** Open quote → SnapshotPanel. If 🟢 Frozen → numbers should NOT change (raise bug). If 🟡 Live rates → save once to freeze.

**Q2 · 🇻🇳** Tôi không thấy SnapshotPanel? · **🇬🇧** Don't see the panel?
**A** Cuộn xuống dưới cùng Cost Breakdown sub-tab. Panel collapsible — click row tiêu đề.

**Q3 · 🇻🇳** Có thể tắt freeze được không? · **🇬🇧** Can I disable freeze?
**A** Không / No. Freeze là default + bắt buộc, không có toggle ẩn. Required for compliance.

**Q4 · 🇻🇳** xlsx export có tab gì mới? · **🇬🇧** What's new in xlsx?
**A** Sheet `10 Pricing Snapshot` (visible) — 11 rows audit metadata. Hidden `_Audit` + `_Schema` vẫn còn (MVP-2 contract).

**Q5 · 🇻🇳** Library version field trống? · **🇬🇧** Lib version field empty?
**A** OK — chỉ khi library chưa có `_version` field. Admin có thể thêm sau. Freeze vẫn hoạt động đúng.

### Cheatsheet · Phiếu nhắc

📋 1-trang bilingual đã in sẵn — dán ở workstation. Reference: [V1_6_OPERATOR_CHEATSHEET.md](./V1_6_OPERATOR_CHEATSHEET.md)

### Full guides · Tài liệu đầy đủ

- Operator: [PRICING_SNAPSHOT_OPERATOR_GUIDE.md](./PRICING_SNAPSHOT_OPERATOR_GUIDE.md)
- Admin: [PRICING_SNAPSHOT_ADMIN_GUIDE.md](./PRICING_SNAPSHOT_ADMIN_GUIDE.md)
- UAT script (nếu muốn self-test): [pricing-snapshot-uat.md](../uat/pricing-snapshot-uat.md)

---

## Speaker notes · Ghi chú thuyết trình

### Pacing · Nhịp độ

| Slide                  | Time               | Format                               |
| ---------------------- | ------------------ | ------------------------------------ |
| 1 — Title              | 1 min              | Intro, name, role                    |
| 2 — Why v1.6           | 3 min              | Talk + 1-min demo of drift bug       |
| 3 — Badge              | 2 min              | Show panel, explain colors           |
| 4 — Demo new quote     | 3 min              | LIVE walkthrough                     |
| 5 — Demo copy          | 4 min              | LIVE walkthrough — emphasise SAFE    |
| 6 — Demo legacy heal   | 2 min              | LIVE walkthrough                     |
| 7 — Demo site mismatch | 2 min              | LIVE walkthrough                     |
| 8 — Demo xlsx          | 3 min              | LIVE walkthrough + open Excel        |
| 9 — Summarize column   | 2 min              | LIVE walkthrough                     |
| 10 — Support + Q&A     | 5 min + Q&A 20 min | Slack invite, distribute cheatsheets |

**Total: 27 min presentation + 30 min Q&A = ~60 min session.** Add 20 min buffer for slow Q&A → 80 min total.

### Pre-session setup · Chuẩn bị trước session

- [ ] SERVER Mac v1.6.0 running stable, network reachable from training room.
- [ ] CLIENT Mac connected via thin mode.
- [ ] Have 3 test quotes pre-created in test DB:
  - 1 pre-Phase 1 legacy quote (no snapshot) — for Demo 6
  - 1 fresh post-v1.6 frozen quote — for Demo 4
  - 1 quote with multi-tier MOQ — for xlsx demo
- [ ] Projector resolution test — check SnapshotPanel + xlsx readable from back row.
- [ ] Hand out printed cheatsheet at door.
- [ ] Slack `#ops-control-v1-6-support` channel created + operators invited.

### Common operator pushback · Câu hỏi khó từ operator

**"Sao có 1 lần nữa save lại quote cũ? Phiền quá."**
→ One-shot. Mỗi quote chỉ cần save 1 lần để heal. Sau đó tự động Frozen. Tradeoff cho compliance.

**"Lỡ tôi đóng app khi đang save thì sao?"**
→ Atomic write. Hoặc snapshot không tạo (state cũ giữ nguyên), hoặc snapshot tạo đầy đủ. Không có nửa-trạng-thái.

**"Tôi cần override snapshot bằng tay được không?"**
→ Không có UI cho operator. Admin có thể edit via DB tool (recovery playbook). Operator workflow: save lại để rebuild.

---

**Compiled · Biên soạn**: 2026-06-11 (Phase 6 / Day 6-7 deliverable)
**Last updated · Cập nhật cuối**: 2026-06-11
