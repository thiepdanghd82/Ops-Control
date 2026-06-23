# Hướng dẫn BACKUP & CHUYỂN SERVER — Ops Control (macOS desktop)

> Cho topology thật: **app desktop "Ops Control" chạy role SERVER, embedded, port 3100**, dữ liệu
> trong `~/Library/Application Support/ops-control-desktop/`. Đã kiểm chứng đường dẫn + nội dung
> trực tiếp trên máy. (KHÔNG áp dụng cho kịch bản Linux/systemd.)

Ký hiệu: `UD` = `~/Library/Application Support/ops-control-desktop`

---

## PHẦN A — Những gì PHẢI mang theo khi chuyển máy

| #   | Thứ cần copy           | Đường dẫn (trong `UD`)       | Vì sao bắt buộc                                                                           |
| --- | ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | **Toàn bộ dữ liệu**    | `UD/data/`                   | Chứa `ops.db` (49 MB) + `Library/` + `Backup/`. Đây là TẤT CẢ dữ liệu nghiệp vụ.          |
| 2   | **File secret**        | `UD/.env`                    | Chứa `OPS_TOTP_KEY`, `OPS_KIOSK_KEY`, `OPS_EXPORT_HMAC_KEY`. Mất → hỏng 2FA + xlsx đã ký. |
| 3   | **Config app**         | `UD/ops-control-config.json` | electron-store: mode/role/remoteUrl + bản sao các khoá đã sinh.                           |
| 4   | (Tham khảo) license cũ | `UD/license.json`            | Sẽ **vô hiệu** trên máy mới (bind máy cũ) → **phải cấp lại**, xem Phần D.                 |

> ⚠️ **Bẫy chí mạng:** nếu chỉ copy `data/` mà **quên** `.env` + `ops-control-config.json`, máy mới
> sẽ **tự sinh khoá MỚI** → `OPS_TOTP_KEY` khác → các secret 2FA trong dữ liệu cũ **không giải mã được**
> → **toàn bộ user mất 2FA**, và các file xlsx đã ký HMAC trước đó không xác minh được. **Luôn mang khoá.**

### Khoá nào mất thì sao?

| Khoá                  | Mất/đổi → hậu quả                                                        |
| --------------------- | ------------------------------------------------------------------------ |
| `OPS_TOTP_KEY`        | 🔴 Mọi user phải đăng ký lại 2FA (secret cũ thành rác).                  |
| `OPS_EXPORT_HMAC_KEY` | 🟡 File xlsx xuất trước đó không xác minh được (vẫn mở đọc bình thường). |
| `OPS_KIOSK_KEY`       | 🟡 Kiosk phải ghép nối (pair) lại.                                       |

---

## PHẦN B — Backup định kỳ (đang chạy) + cách tạo bản thủ công

### Backup tự động (đã bật)

App chạy 1 chu kỳ/ngày vào giờ đã đặt (Settings → Backup/Restore). Mỗi chu kỳ tạo:

- `UD/data/Backup/SQLite/ops_YYYYMMDD_HHMMSS.sqlite` — snapshot DB (online, không khoá DB sống).
- `UD/data/Backup/Library/library_YYYYMMDD.tar.gz` — nén toàn bộ `Library/`
  (⚠️ **loại trừ** `Library/Users/totp_secrets*` — nên restore xong user phải đăng ký lại 2FA).
- Tự kiểm tra `PRAGMA integrity_check` + cảnh báo nếu số dòng tụt >10%.
- Tự dọn bản >30 ngày (luôn giữ ≥10 bản mới nhất).

> Lưu ý: `data/Products layout/` **không** nằm trong tarball (chỉ `Library/` được nén). Nếu thư mục
> này có dữ liệu cần giữ, đưa nó vào bản copy thủ công/off-site ở Phần C.

### Tạo backup thủ công ngay trước khi chuyển máy

1. Mở app → **Settings → Backup / Restore → "Run now"** (chạy 1 chu kỳ ngay), HOẶC
2. Bấm **"Create Data Backup"** (gói riêng vào `UD/data/Backup/PackageBackups/Data/`).
3. Đảm bảo có file SQLite + tarball với timestamp vừa tạo.

---

## PHẦN C — Backup OFF-SITE (việc còn THIẾU — nên làm trước go-live)

Hiện mọi backup nằm **cùng ổ đĩa** với dữ liệu sống → hỏng đĩa là mất hết (xem audit H-1).
Tối thiểu nên copy thư mục `Backup/` ra **ổ ngoài** mỗi đêm:

```bash
# Ví dụ: copy backup ra ổ SSD ngoài tên "OPSBACKUP", giữ nguyên cấu trúc
rsync -a --delete \
  "$HOME/Library/Application Support/ops-control-desktop/data/Backup/" \
  "/Volumes/OPSBACKUP/ops-control-backup/"
```

Tự động hoá bằng `launchd` (chạy 02:30 mỗi đêm) — tạo
`~/Library/LaunchAgents/vn.ccldesign.opsbackup.offsite.plist` rồi `launchctl load`. (Có thể nhờ tôi
viết file plist cụ thể.)

Lý tưởng: thêm 1 đích thứ 2 ngoài toà nhà (NAS phòng IT hoặc cloud có mã hoá) → đủ quy tắc 3-2-1.

---

## PHẦN D — Quy trình CHUYỂN SERVER sang máy Mac mới (từng bước)

### D-0. Chuẩn bị (trên máy CŨ)

- [ ] Chạy backup thủ công mới nhất (Phần B).
- [ ] Ghi lại 3 khoá: mở `UD/.env`, lưu lại 3 dòng `OPS_*` vào nơi an toàn tạm thời.
- [ ] Đảm bảo có quyền admin trên cả 2 máy.

### D-1. Sao chép dữ liệu + khoá sang máy MỚI

Cách nhanh nhất — copy nguyên thư mục `UD` (gọn nhất, mang theo mọi thứ):

```bash
# Trên máy CŨ — nén (bỏ cache cho nhẹ)
cd "$HOME/Library/Application Support"
tar czf ~/Desktop/opscontrol-migrate.tgz \
  --exclude='ops-control-desktop/Cache' \
  --exclude='ops-control-desktop/GPUCache' \
  --exclude='ops-control-desktop/Code Cache' \
  --exclude='ops-control-desktop/DawnCache' \
  ops-control-desktop

# → Chép opscontrol-migrate.tgz sang máy MỚI (AirDrop/USB/SMB)
```

### D-2. Trên máy MỚI

1. **Cài app trước** (cài SERVER DMG, chạy 1 lần để nó tạo `UD` rồi **thoát** app).
2. Tắt auto-restart (nếu đã cấu hình LaunchAgent): `launchctl unload ~/Library/LaunchAgents/vn.ccldesign.opscontrol.server.plist`
3. Giải nén đè dữ liệu:
   ```bash
   cd "$HOME/Library/Application Support"
   # (tuỳ chọn) sao lưu UD trống mới tạo
   mv ops-control-desktop ops-control-desktop.fresh 2>/dev/null
   tar xzf ~/Desktop/opscontrol-migrate.tgz   # bung lại UD từ máy cũ
   ```
4. Kiểm tra đã có: `UD/data/ops.db`, `UD/.env` (3 khoá), `UD/ops-control-config.json`.
   `chmod 600 "UD/.env"`.

### D-3. License cho máy mới (BẮT BUỘC)

License cũ bind máy cũ → máy mới báo `installation-mismatch`. Phải cấp lại:

1. Mở app máy mới → **Settings → About** → copy **Installation ID mới**.
2. Theo [HUONG_DAN_TAO_LICENSE.md](HUONG_DAN_TAO_LICENSE.md) §4: ký license mới cho ID đó
   (giữ nguyên customer/tier/expires) → áp vào máy mới.

### D-4. Khởi động + kiểm tra

1. Mở app (hoặc `launchctl load …server.plist` nếu dùng auto-start).
2. Kiểm tra server sống: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/health` → `200`.
3. Đăng nhập 1 tài khoản admin:
   - [ ] Login OK (2FA vẫn hoạt động → chứng tỏ `OPS_TOTP_KEY` mang đúng).
   - [ ] **Quote History** load đủ số báo giá như máy cũ.
   - [ ] Materials / Rate Table có dữ liệu.
   - [ ] Settings → About: version + License = valid.
   - [ ] Màn Sign in hiện 🟢 Server connected.
4. Trên máy client khác: trỏ tới IP mới của máy server, đăng nhập thử.

### D-5. Dọn dẹp

- [ ] Xoá `opscontrol-migrate.tgz` ở Desktop 2 máy (chứa dữ liệu + khoá — nhạy cảm).
- [ ] Xoá nơi lưu tạm 3 khoá ở D-0.
- [ ] Cập nhật IP server mới cho 6 máy operator (nếu IP đổi).
- [ ] Tắt/thu hồi máy cũ để tránh 2 server chạy song song gây lệch dữ liệu.

---

## PHẦN E — Khôi phục từ backup (khi DB hỏng, không phải chuyển máy)

- **Cách 1 (UI):** Settings → Backup/Restore → chọn bản → Restore. ⚠️ Restore là **GHI ĐÈ** (không merge);
  app tự tạo 1 bản `pre_restore_*` trước khi đè để có điểm lùi.
- **Cách 2 (file SQLite):** dừng app → thay `UD/data/ops.db` bằng file
  `UD/data/Backup/SQLite/ops_*.sqlite` mong muốn (đổi tên thành `ops.db`) → mở lại app.
- **Kiểm tra trước khi tin:** `npm run verify-backup <đường-dẫn-file-.sqlite>` (nhận cả dạng thư mục lẫn snapshot).

---

## Tóm tắt 1 dòng

**Chuyển server = copy `UD/data/` + `UD/.env` + `UD/ops-control-config.json` sang máy mới, rồi
CẤP LẠI LICENSE cho installation_id mới.** Quên `.env` = mất 2FA. Quên license = app không mở.
