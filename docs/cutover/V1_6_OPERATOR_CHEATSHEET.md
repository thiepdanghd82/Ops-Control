# Ops Control v1.6 — Operator Cheatsheet · Phiếu nhắc thao tác

> Print this 1-page double-sided · In 1 trang 2 mặt. Tape to monitor · Dán ở cạnh màn hình.
> A4 portrait, 2-column VI / EN layout. 10 pt font when rendered.

---

## Page 1 · Snapshot basics · Cơ bản về Snapshot

| 🇻🇳 Vietnamese                                                                                                                          | 🇬🇧 English                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **🎯 Quy tắc vàng** Mỗi lần ấn **Save** = giá báo giá ĐÓNG BĂNG. Mở lại sau cũng thấy đúng số đó, không thay đổi khi library cập nhật. | **🎯 Golden rule** Each **Save** = quote prices FREEZE. Reopen later → same numbers, even after library updates. |
| **🟢 Badge XANH "Frozen"** Quote đã đóng băng đơn giá đúng cách. KHÔNG cần làm gì thêm.                                                | **🟢 GREEN "Frozen" badge** Quote prices frozen correctly. Nothing to do.                                        |
| **🟡 Badge VÀNG "Live rates"** Quote ĐANG dùng giá hiện tại (chưa freeze). → Lưu lại 1 lần để đóng băng.                               | **🟡 AMBER "Live rates" badge** Quote using CURRENT prices (not frozen). → Save once to freeze.                  |
| **⚪ Badge XÁM "No snapshot"** Quote mới chưa nạp library. → Mở library → save.                                                        | **⚪ GRAY "No snapshot" badge** New quote, library not loaded. → Open library → save.                            |
| **🔴 Badge ĐỎ "N warning(s)"** Có cảnh báo audit (vd site mismatch). → Mở panel đọc chi tiết → xử lý.                                  | **🔴 RED "N warning(s)" badge** Audit warnings present (e.g. site mismatch). → Expand panel → resolve.           |
| **Xem panel ở đâu?** Pricing (Std/Cpx) → Cost Breakdown → cuộn xuống dưới cùng → "Pricing Snapshot".                                   | **Where's the panel?** Pricing (Std/Cpx) → Cost Breakdown → scroll to bottom → "Pricing Snapshot".               |

---

## Page 2 · Common workflows · Luồng thao tác thường dùng

| 🇻🇳 Vietnamese                                                                                                                                                  | 🇬🇧 English                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **① Báo giá mới** Pricing → fill RFQ + materials + processes → **Save** → reload → verify badge XANH.                                                          | **① New quote** Pricing → fill RFQ + materials + processes → **Save** → reload → verify GREEN badge.                                                                         |
| **② Sao chép báo giá** Quote History → CHUỘT PHẢI quote → **Copy** → banner XANH NƯỚC BIỂN xuất hiện → edit → đổi RFQ mới → **Save**. **Quote gốc KHÔNG đổi.** | **② Copy quote** Quote History → RIGHT-CLICK quote → **Copy** → BLUE banner appears → edit → new RFQ → **Save**. **Original quote UNCHANGED.**                               |
| **③ Báo giá cũ (pre-v1.6)** Mở → badge VÀNG "Live rates" → **Save** 1 lần (không cần đổi gì) → reload → badge → XANH.                                          | **③ Old quote (pre-v1.6)** Open → AMBER "Live rates" badge → **Save** once (no edits needed) → reload → badge → GREEN.                                                       |
| **④ Đổi Site giữa chừng** Đổi `state.site` → SnapshotPanel có cảnh báo ĐỎ "site mismatch". → Save lại để rebuild snapshot với site mới.                        | **④ Change site mid-quote** Edit `state.site` → SnapshotPanel shows RED "site mismatch" warning. → Save again to rebuild snapshot under new site.                            |
| **⑤ Xuất xlsx** Quote History → icon download → file xlsx có thêm tab **"10 Pricing Snapshot"** với metadata. Finance / auditor đọc tab này thay vì mở app.    | **⑤ Export xlsx** Quote History → download icon → xlsx now includes a **"10 Pricing Snapshot"** tab with metadata. Finance / auditor reads this tab without opening the app. |
| **⑥ Quét nhiều quote** Cost Breakdown (Summarize) → Columns toggle → bật cột **Snapshot** → mỗi dòng có pill Frozen / Live / No.                               | **⑥ Scan many quotes** Cost Breakdown (Summarize) → Columns toggle → enable **Snapshot** column → per-row Frozen / Live / No pill.                                           |

---

## 🆘 Hỗ trợ · Support

| 🇻🇳                                                                | 🇬🇧                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Bug / lỗi nghiêm trọng → ping Henry ngay                          | Critical bug → ping Henry immediately                       |
| Câu hỏi vận hành → Zalo group "Ops Control"                       | Operational questions → Zalo group "Ops Control"            |
| Help in-app: SYSTEM → Help → tìm "snapshot"                       | In-app help: SYSTEM → Help → search "snapshot"              |
| Hướng dẫn đầy đủ: docs/cutover/PRICING_SNAPSHOT_OPERATOR_GUIDE.md | Full guide: docs/cutover/PRICING_SNAPSHOT_OPERATOR_GUIDE.md |

---

**v1.6.0 · CCL Vietnam Hai Duong · go-live 2026-07-30**
