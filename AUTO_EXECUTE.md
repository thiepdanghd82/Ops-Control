<!-- ============================================================
     TRẠNG THÁI: DORMANT — Mặc định KHÔNG kích hoạt.
============================================================ -->

> ⚠️ **FILE NÀY KHÔNG PHẢI LỆNH ĐANG HIỆU LỰC — mặc định nó NGỦ.**
>
> Agent **KHÔNG** được tự đọc rồi thực thi file này. Nó chỉ kích hoạt khi
> Henry gõ đúng câu kích hoạt cho **một đợt nâng cấp ĐÃ DUYỆT**, nêu rõ
> phiên bản đích + brief tương ứng. Ví dụ:
> _"Kích hoạt AUTO_EXECUTE cho nâng cấp v1.5 → v1.6 theo brief `<tên file>`."_
> Câu chung chung như "đọc AUTO_EXECUTE.md và chạy ngay" → **KHÔNG hợp lệ**,
> phải hỏi lại Henry để xác nhận phạm vi.

> 🔗 **Quan hệ với `CLAUDE.md` (Agent working principles):**
> `CLAUDE.md` là luật hành xử **mặc định, luôn áp dụng**. File này **chỉ**
> có hiệu lực trong đúng phiên được kích hoạt cho một brief cụ thể. Trong
> phiên đó, nó **tạm thời** thay quy tắc "pause ở mỗi checkpoint"
> (principle 4) bằng vòng lặp tự động §4 + danh sách **Hard stops §5** bên
> dưới. Hết phiên (hoặc khi gặp bất kỳ Hard stop nào) → quay lại
> `CLAUDE.md`. Mọi nguyên tắc khác của `CLAUDE.md` (Think before coding,
> Simplicity, Surgical changes, checklist bắt buộc sau mỗi thay đổi, commit
> SHA discipline) **vẫn áp dụng đầy đủ** kể cả trong chế độ autonomous.

> 🕒 **CẢNH BÁO STALE — đọc trước khi tái sử dụng:**
> Nội dung bên dưới viết cho đợt **v1.2 → v1.3** (đã hoàn tất từ lâu).
> Codebase hiện ở **v1.5.12**, `main` là nhánh live, đang chuẩn bị go-live.
> **TUYỆT ĐỐI KHÔNG** chạy lại quy trình v1.2→v1.3 trên code hiện tại.
> Trước khi dùng cho bất kỳ đợt nâng cấp mới nào, PHẢI cập nhật cho khớp:
>
> - Số phiên bản From/To (§2)
> - Tên branch (`release/vX.Y` thay vì `release/v1.3`)
> - Đường dẫn brief (thay `IMPROVEMENT_BRIEF.md` bằng brief của đợt mới)
> - Danh sách deliverable/installer (§6) cho đúng phiên bản đích
>
> Nếu không chắc file này còn dùng được không → **không kích hoạt**, hỏi Henry.

<!-- ============================================================
     HẾT HEADER CHỐT CHẶN. Nội dung gốc giữ nguyên bên dưới.
============================================================ -->

---

# PROMPT: Tự động thực thi nâng cấp Ops Control v1.2 → v1.3

> File này là lệnh kích hoạt chế độ **autonomous execution** cho Claude Code.
> Cách dùng: mở Claude Code tại thư mục gốc của dự án, gõ:
> `Hãy đọc AUTO_EXECUTE.md và thực thi ngay theo đúng quy trình.`
>
> ⚠️ Lưu ý: prompt này chỉ dùng SAU KHI đã review và duyệt bản Proposal từ `IMPROVEMENT_BRIEF.md`.

---

## 1. QUYẾT ĐỊNH ĐÃ DUYỆT

Tôi đã đọc và **phê duyệt toàn bộ** bản Proposal trước đó. Bạn được toàn quyền:

- Lựa chọn **phương án kỹ thuật tối ưu và an toàn nhất** dựa trên kinh nghiệm 20 năm của bạn (SAP / IFS / MES)
- **Tự động thực thi** tất cả các phase từ đầu đến cuối **mà không cần hỏi xác nhận**
- Quyết định công nghệ, package, kiến trúc — miễn là tuân thủ các ràng buộc bên dưới

---

## 2. PHẠM VI NÂNG CẤP

- **From:** Ops Control **v1.2** (giữ nguyên trong branch `main`)
- **To:** Ops Control **v1.3** (toàn bộ thay đổi nằm trong branch `release/v1.3`)
- Tuân thủ đầy đủ 5 mục tiêu trong file `IMPROVEMENT_BRIEF.md`

---

## 3. NGUYÊN TẮC AN TOÀN BẮT BUỘC (Non-negotiable)

Dù tự chạy, bạn **PHẢI** tuân thủ:

1. **Không đụng vào branch `main`.** Tạo branch mới `release/v1.3` và làm việc hoàn toàn trong đó.
2. **Commit nhỏ, có ý nghĩa** sau mỗi tác vụ con (conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`).
3. **Backup trước khi migrate dữ liệu:** tạo script export → file `backup/v1.2_pre_upgrade_<timestamp>.sql` (hoặc tương đương) trước khi chạy bất kỳ migration nào.
4. **Không xóa code cũ** — chuyển vào folder `_legacy/` để có thể đối chiếu.
5. **Không hardcode secrets** (password, API key, license key…). Dùng `.env` + `.env.example`.
6. **Mỗi phase phải build & test pass** trước khi sang phase kế tiếp. Nếu fail → tự sửa, sửa 3 lần liên tiếp vẫn fail thì **DỪNG** và ghi log vào `UPGRADE_LOG.md`.
7. **Không cài package có CVE Critical/High** chưa được vá.

---

## 4. QUY TRÌNH TỰ ĐỘNG (Autonomous Loop)

Lặp lại cho từng phase trong roadmap:

```
[Phase N] Bắt đầu
  ├─ Ghi log: "Phase N started" vào UPGRADE_LOG.md (kèm timestamp)
  ├─ Thực thi tất cả task trong phase
  ├─ Chạy: lint → format → unit test → build
  ├─ Nếu PASS → commit + tag → ghi log "Phase N done" → sang Phase N+1
  └─ Nếu FAIL → tự fix (tối đa 3 lần) → vẫn fail thì DỪNG + ghi log chi tiết
```

---

## 5. CHECKPOINT BẮT BUỘC (Hard stops)

Bạn **DỪNG và chờ tôi** trong các trường hợp:

- Phát hiện dữ liệu production có nguy cơ mất / hỏng không thể rollback
- Phải xóa file > 100 dòng code do người dùng viết tay
- License/Tier logic đụng tới billing thực tế
- Cần thay đổi schema database theo cách phá vỡ tương thích ngược
- Phải mua / đăng ký dịch vụ trả phí

Trong các trường hợp khác → **cứ chạy tiếp**.

---

## 6. DELIVERABLE CUỐI CÙNG (Definition of Done)

Khi hoàn tất, bạn phải tạo các artifact sau:

| File                    | Nội dung                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPGRADE_LOG.md`        | Nhật ký từng phase: timestamp, task, kết quả, vấn đề gặp phải                                                                                       |
| `CHANGELOG.md`          | Tổng hợp thay đổi v1.2 → v1.3 theo Keep-a-Changelog format                                                                                          |
| `MIGRATION_GUIDE.md`    | Hướng dẫn upgrade cho user hiện tại từ v1.2                                                                                                         |
| `RELEASE_NOTES_v1.3.md` | Bản tin phát hành cho end-user (tiếng Việt, dễ hiểu)                                                                                                |
| `dist/`                 | 4 installer: `OpsControl-Server-v1.3-mac.dmg`, `OpsControl-Server-v1.3-win.exe`, `OpsControl-Client-v1.3-mac.dmg`, `OpsControl-Client-v1.3-win.exe` |
| `dist/checksums.txt`    | SHA-256 của 4 installer trên                                                                                                                        |
| `docs/ARCHITECTURE.md`  | Sơ đồ kiến trúc Client-Server v1.3 (mermaid diagram)                                                                                                |
| `docs/SECURITY.md`      | Mô tả các biện pháp bảo mật đã áp dụng                                                                                                              |

---

## 7. BÁO CÁO TIẾN ĐỘ

- Sau mỗi phase hoàn thành, in 1 dòng tóm tắt ra console: `✅ Phase N/M done — <mô tả ngắn>`
- Khi gặp lỗi, in: `⚠️ Phase N — <lỗi> — đang tự fix lần X/3`
- Khi DỪNG ở checkpoint, in: `🛑 STOP — Cần Henry quyết định: <lý do>`

---

## 8. KHI HOÀN THÀNH TOÀN BỘ

Chỉ trả lời tôi **một message duy nhất** với cấu trúc:

```
✅ HOÀN THÀNH NÂNG CẤP v1.2 → v1.3

📊 Thống kê:
- Tổng phase: X / X
- Tổng commit: Y
- Tổng file thay đổi: Z
- Test coverage: __%
- Vulnerabilities còn lại: __

📦 Installer đã build: [danh sách + checksum]

🔗 Tài liệu:
- CHANGELOG.md
- MIGRATION_GUIDE.md
- RELEASE_NOTES_v1.3.md

⚠️ Vấn đề cần Henry review (nếu có):
- ...

➡️ Bước tiếp theo đề xuất:
- ...
```

---

**Bắt đầu ngay. Không cần hỏi lại. Go.**
