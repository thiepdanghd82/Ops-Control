# Pricing Snapshot — Operator Guide · Hướng dẫn người dùng

> Audience: Cost / Sales / NPI operators who save and re-open quotes daily.
> Đối tượng: Người dùng Cost / Sales / NPI lưu và mở lại báo giá hàng ngày.

## TL;DR · Tóm tắt

Every time you press **Save**, the system freezes the pricing parameters used by your quote (material prices, workcenter rates, coverage table). When you reopen the quote later — even after the master library has been updated — you see the SAME numbers you saw at save time. No more "I saved 0.50 last week, today it shows 0.53."

Mỗi lần bạn ấn **Lưu**, hệ thống đóng băng các tham số định giá (giá vật tư, đơn giá workcenter, bảng coverage). Khi mở lại — kể cả khi library tổng đã cập nhật — bạn thấy ĐÚNG số liệu lúc lưu. Không còn "tôi lưu 0.50 tuần trước, hôm nay hiện 0.53".

You don't need to do anything — freeze is automatic. This guide explains how to verify it's working.

Bạn không cần làm gì thêm — freeze tự động. Tài liệu này hướng dẫn cách kiểm tra freeze đã hoạt động.

---

## 1. Where to see snapshot status · Xem trạng thái snapshot ở đâu

After saving a quote, reopen it from Quote History:

Sau khi lưu, mở lại từ Quote History:

1. Cost → Pricing (Std) hoặc (Cpx).
2. Quote History tab → click on your quote.
3. Cost Breakdown sub-tab (the "Summarize" cost view, NOT Cost Breakdown summary list).
4. Scroll to the BOTTOM of the breakdown.
5. **Pricing Snapshot** panel is the last block.

The panel is collapsible. Click the row to expand / collapse. Caret rotates ▸ → ▾.

Panel có thể đóng/mở. Click vào dòng tiêu đề để mở rộng / thu gọn.

---

## 2. Reading the snapshot badge · Đọc badge snapshot

The badge next to "Pricing Snapshot" tells you whether the quote is frozen.

Badge bên cạnh "Pricing Snapshot" cho biết báo giá đã được đóng băng chưa.

| Badge color · Màu badge | Meaning · Ý nghĩa | Action needed · Cần làm gì |
| ----------------------- | ----------------- | -------------------------- |
| 🟢 **Frozen** (green)   | Quote pinned to rates at save time. Reopen → same numbers, every time. · Báo giá pin vào đơn giá lúc lưu. Mở lại → đúng số. | None — this is normal. · Không cần làm gì. |
| 🟡 **Live rates** (amber) | Quote uses CURRENT library rates. Numbers may change if library changes. · Báo giá dùng đơn giá library HIỆN TẠI. Số có thể đổi nếu library đổi. | **Save the quote** to freeze. · **Lưu báo giá** để freeze. |
| ⚪ **No snapshot** (gray)  | Quote has no rates resolved (no library loaded). · Báo giá chưa có đơn giá (chưa nạp library). | Open library, then save. · Mở library rồi lưu. |

🔴 **Red warning badge** ("N warning(s)") — appears when there are audit warnings (e.g. site mismatch). Expand panel to read.

🔴 **Badge cảnh báo đỏ** ("N warning(s)") — xuất hiện khi có cảnh báo audit (ví dụ site mismatch). Mở panel để đọc.

---

## 3. Verifying freeze worked · Kiểm tra freeze đã hoạt động

Quick checklist after saving / Checklist sau khi lưu:

1. Reload page (Cmd+R). · Tải lại trang.
2. Open quote from Quote History. · Mở quote từ Quote History.
3. Cost Breakdown → SnapshotPanel.
4. Check 4 fields / Kiểm tra 4 trường:
   - **Captured at · Đóng băng lúc**: today + a recent time.
   - **Captured by · Đóng băng bởi**: your username.
   - **Site**: VN (hoặc India / China nếu khác).
   - **Materials frozen + Workcenters frozen**: counts > 0.

If all green and badge = 🟢 Frozen → done. · Nếu xanh hết và badge = 🟢 Frozen → xong.

---

## 4. Common workflows · Các luồng thường dùng

### 4.1 New quote · Báo giá mới

1. Pricing (Std) or (Cpx) → fill RFQ + materials + processes + selling price.
2. Save.
3. Reload + verify Frozen badge.

That's it. Snapshot is frozen automatically. · Hết. Snapshot đã tự động freeze.

### 4.2 Edit existing quote · Sửa báo giá có sẵn

1. Open the quote.
2. Make your changes.
3. Save.

Each Save UPDATES the snapshot. The **Captured at** timestamp moves forward. Captured by stays as the LATEST editor.

Mỗi lần Lưu, snapshot CẬP NHẬT. Captured at đẩy lên thời điểm mới. Captured by = người sửa CUỐI CÙNG.

### 4.3 Copy quote · Sao chép báo giá

When you right-click a quote in Quote History and choose **Copy**:

Khi click chuột phải vào quote trong Quote History và chọn **Copy**:

1. New draft opens in Pricing editor with the ORIGINAL state copied in.
2. **Blue info banner** at the top: "This is a COPY of …"
3. SnapshotPanel badge → 🟡 **Live rates** (because the copy hasn't been saved yet).
4. captured_at = `—`, captured_by = `—`.

This is INTENTIONAL. The system wants you to confirm the copy reflects YOUR judgement before freezing. · Đây là CỐ Ý. Hệ thống muốn bạn xác nhận copy phản ánh đánh giá của BẠN trước khi freeze.

5. Make any edits to the copy (different selling price, swap a material, etc.).
6. Save → name the copy with a new RFQ.
7. Reload → badge flips to 🟢 **Frozen** with a NEW captured_at (today, not the original's save time).

Original quote stays unchanged. · Quote gốc không đổi.

### 4.4 Old quote (pre-Phase 1, before 2026-06-10) · Báo giá cũ

If you open a quote saved before the snapshot feature shipped:

Nếu mở quote lưu trước khi tính năng snapshot ra (2026-06-10):

- Badge = 🟡 **Live rates** (synthesized from current library).
- captured_at + captured_by = `—`.
- Cost numbers DO display (system synthesizes from current rates).

To freeze the old quote, just open and Save it once. · Để freeze quote cũ, chỉ cần mở và Lưu một lần.

---

## 5. What's in the snapshot · Trong snapshot có gì

The system freezes only the rows your quote actually uses — keeps the snapshot compact:

Hệ thống chỉ freeze các dòng quote thực sự dùng — giữ snapshot gọn:

- **Materials frozen · Số vật tư**: rows in lib.mat referenced by your material codes.
- **Workcenters frozen · Số workcenter**: rows in lib.rate referenced by your process workcenters.
- **Coverage rows · Số coverage**: the entire lib.ddl.coverage table (small, copied whole).

If you delete a sub-product or change a material code, the NEXT save will rebuild the snapshot with ONLY the new used set. Old (now-unused) rows drop out.

Nếu xóa sub-product hoặc đổi mã vật tư, Save lần SAU sẽ rebuild snapshot CHỈ với set mới dùng. Dòng cũ (không còn dùng) bị loại.

---

## 6. xlsx export shows the same info · File xlsx hiển thị thông tin tương tự

When you export a quote to xlsx (Quote History → download icon), the workbook now has a tab called **`10 Pricing Snapshot`** with the same data as SnapshotPanel:

Khi xuất quote ra xlsx (Quote History → icon download), workbook có thêm tab **`10 Pricing Snapshot`** với cùng thông tin như SnapshotPanel:

- Quote ID
- Quote saved at
- Pricing captured at
- Pricing captured by
- Site
- Library version
- Snapshot status (Frozen / Live rates / No snapshot)
- Materials frozen / Workcenters frozen / Coverage rows
- Warnings (if any)

Customer copy + internal copy both include this tab. Finance / auditor reviewers can verify freeze status without opening the app.

Bản customer + bản internal đều có tab này. Người duyệt finance / auditor có thể kiểm tra freeze status mà không cần mở app.

---

## 7. Summarize tab — "Snapshot" column · Tab Summarize — cột Snapshot

Cost → Cost Breakdown (Summarize). Click the Columns toggle (3-dot icon, right side) → enable **Snapshot**.

Cost → Cost Breakdown (Summarize). Click toggle Columns (icon 3-chấm bên phải) → bật **Snapshot**.

Each row now shows the per-quote snapshot badge. Use this to scan many quotes at once:

Mỗi dòng hiển thị badge snapshot tương ứng. Dùng để quét nhiều quote cùng lúc:

- Frozen → safe to re-export.
- Live rates → operator should save once to freeze before sending to customer / finance.
- No snapshot → typically just-created drafts; fill + save first.

---

## 8. FAQ · Câu hỏi thường gặp

### Q: Why are numbers different from last week's saved quote? · Tại sao số khác so với quote lưu tuần trước?

Open the quote → Cost Breakdown → SnapshotPanel. If badge = 🟢 Frozen → numbers should NOT change. If they do, raise a bug (MES-3-FIX).

If badge = 🟡 Live rates → quote was never frozen, so it reflects today's library. Save once to freeze.

### Q: Tôi không thấy SnapshotPanel ở đâu? · Don't see the panel?

It's at the BOTTOM of the Cost Breakdown sub-tab (not the Summarize list). Scroll all the way down past the per-tier KPI cards.

### Q: Có thể tắt freeze được không? · Can I disable freeze?

Không. Freeze là mặc định + bắt buộc — không có toggle ẩn. Cần để compliance + audit-trail.

No. Freeze is default + mandatory — there's no hidden toggle. Required for compliance + audit-trail.

### Q: Lib version field is empty — bug? · Trường Lib version trống — lỗi à?

Chỉ khi library chưa có `_version` field. Admin có thể thêm sau (không gating). Without `_version`, freeze still works correctly.

### Q: Captured_at sai múi giờ? · Captured_at wrong timezone?

The panel formats timestamps in your browser's local timezone. The underlying value is UTC ISO 8601 (stored exactly as `_captured_at`). xlsx export also formats in local timezone of the exporter's machine.

Panel format theo múi giờ local của browser. Giá trị gốc là UTC ISO 8601. xlsx export format theo múi giờ máy người export.

---

## 9. Help · Trợ giúp

- In-app help: SYSTEM → Help → search "snapshot" or "pricing snapshot".
- Trong app: SYSTEM → Help → tìm "snapshot" hoặc "pricing snapshot".
- Bug + feedback: report via your usual Zalo group or `Settings → Send Feedback`.

---

**Last updated · Cập nhật cuối**: 2026-06-10 (Phase 5 / S-SNAPSHOT)
