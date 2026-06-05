# Cài Ops Control SERVER · Install the Ops Control SERVER (EN-VI)

Tài liệu cho **máy chạy SERVER** (1 máy duy nhất trong xưởng — thường là máy
Lead). Các máy CLIENT chỉ cần cài bản CLIENT và trỏ tới SERVER.

> This guide is for the **single SERVER machine**. CLIENT machines just install
> the CLIENT build and point at the SERVER's LAN address.

---

## Chạy SERVER dạng dịch vụ nền (KHUYẾN NGHỊ) · Run the SERVER as a background service (RECOMMENDED)

**Tiếng Việt.** Cách này biến SERVER thành **dịch vụ chạy nền**:

- Tự bật **ngay khi máy khởi động**, **trước khi có ai đăng nhập**.
- **Không cần mở app** Ops Control, không có cửa sổ.
- **Tự khởi động lại** nếu chẳng may server crash.
- Client trong LAN nối tới `http://<IP-máy-SERVER>:3000` bất cứ lúc nào máy bật.

**English.** This turns the SERVER into a **background service**: starts at boot
(before any login), no app window, auto-restarts on crash. Clients reach it at
`http://<SERVER-IP>:3000` whenever the machine is on.

> ⚠️ **Đừng chạy đồng thời** app SERVER (mở cửa sổ) **và** dịch vụ nền — chọn MỘT.
> Nếu cả hai cùng chạy, server thứ hai sẽ báo "cổng 3000 đang bận" và tự thoát
> (không làm hỏng dữ liệu). · **Don't run both** the windowed app SERVER and the
> background service at once — pick ONE; the second one exits with a clear
> "port busy" message.

### Chuẩn bị · Prerequisites

1. Đã cài bản **Ops Control SERVER** (`.dmg` trên Mac / `.exe` trên Windows).
   _Install the SERVER build first._
2. Có **file license đã ký** (`license.json`). Nếu máy đã từng mở app SERVER và
   nạp license, trình cài đặt sẽ **tự copy** license đó sang dịch vụ nền.
   _Have a signed `license.json`; the installer auto-copies the app's license if present._

---

## 🍎 macOS

Thư mục script: `scripts/headless/mac/`

### 1) Cài đặt · Install

1. Mở Finder → vào `scripts/headless/mac/`.
2. **Double-click** `ops-server-install-daemon.command`.
   - Lần đầu macOS có thể chặn: **chuột phải → Open → Open**.
3. Cửa sổ Terminal hiện ra. Nó **xin mật khẩu Mac của bạn** (sudo) — gõ mật khẩu
   (không hiện ký tự là bình thường) rồi Enter.
4. Script in **từng bước** (tạo thư mục, sinh khóa, ghi plist, nạp dịch vụ). Khi
   xong sẽ thấy:
   ```
   ✅ Server ĐANG CHẠY — http://127.0.0.1:3000/health OK
   ```
5. Xong! Server giờ tự chạy mỗi lần bật máy.

> Nếu chưa có license: script báo `[!] Chưa có license` + đường dẫn
> `/Library/OpsControl/data/license.json`. Copy file license đã ký vào đó rồi
> chạy `ops-server-start.command`.

### 2) Kiểm tra "server sống không" · Health check

Cách nào cũng được:

- **Double-click** `ops-server-status.command` → xem dòng `Health check: ✅ SỐNG`.
- Hoặc mở trình duyệt: `http://localhost:3000/health` → thấy `{"ok":true,...}`.
- Từ máy CLIENT: mở `http://<IP-máy-SERVER>:3000/health`.

> Tìm IP máy SERVER: System Settings → Network, hoặc Terminal `ipconfig getifaddr en0`.

### 3) Xem log khi sự cố · View logs

- `ops-server-status.command` in sẵn 8 dòng log lỗi cuối.
- Log đầy đủ:
  - Lỗi: `/var/log/opscontrol/server.err.log`
  - Thường: `/var/log/opscontrol/server.out.log`
- Terminal: `tail -n 50 /var/log/opscontrol/server.err.log`

### 4) Start / Stop / Gỡ · Manage

| Việc | Double-click |
| --- | --- |
| Khởi động / khởi động lại | `ops-server-start.command` |
| Dừng (vẫn tự chạy lại lần boot sau) | `ops-server-stop.command` |
| Gỡ hẳn (giữ dữ liệu) | `ops-server-uninstall.command` |

---

## 🪟 Windows

Thư mục script: `scripts/headless/win/`

> Cơ chế: **Task Scheduler** (có sẵn trong Windows) — chạy lúc boot bằng tài khoản
> SYSTEM, trước login, tự restart, chạy ẩn. Không cần cài thêm phần mềm.

### 1) Cài đặt · Install

1. Mở thư mục `scripts/headless/win/`.
2. **Chuột phải** `ops-server-install-service.bat` → **Run as administrator**.
   (Nếu quên, script tự bật cửa sổ UAC xin quyền — bấm **Yes**.)
3. Cửa sổ đen hiện các bước [1/6]…[6/6]. Khi xong:
   ```
   OK Server DANG CHAY - http://127.0.0.1:3000/health
   ```
4. Xong! Server tự chạy mỗi lần bật máy.

> Chưa có license: script báo đường dẫn `C:\ProgramData\OpsControl\data\license.json`.
> Copy file license đã ký vào đó rồi chạy `start.bat` (Run as administrator).

### 2) Kiểm tra "server sống không" · Health check

- **Double-click** `status.bat` → xem dòng `OK SONG - HTTP 200`.
- Hoặc trình duyệt: `http://localhost:3000/health` → `{"ok":true,...}`.
- Từ máy CLIENT: `http://<IP-máy-SERVER>:3000/health`.

> Tìm IP: Command Prompt → `ipconfig` → mục IPv4 Address.

### 3) Xem log khi sự cố · View logs

- `status.bat` in 8 dòng log lỗi cuối.
- Log đầy đủ:
  - Lỗi: `C:\ProgramData\OpsControl\logs\server.err.log`
  - Thường: `C:\ProgramData\OpsControl\logs\server.out.log`

### 4) Start / Stop / Gỡ · Manage (Run as administrator)

| Việc | File |
| --- | --- |
| Khởi động / khởi động lại | `start.bat` |
| Dừng (vẫn tự chạy lại lần boot sau) | `stop.bat` |
| Gỡ hẳn (giữ dữ liệu) | `uninstall.bat` |

### 5) ✅ Checklist test thủ công (Lead chạy trên 1 máy Windows thật)

> Bản Windows **chưa được test trên máy Win thật** (môi trường build là macOS).
> Lead làm theo checklist này một lần để xác nhận trước khi triển khai:

1. [ ] Cài bản **Ops Control SERVER Setup ….exe** vào `C:\Program Files\Ops Control`.
2. [ ] Đặt `license.json` hợp lệ (hoặc mở app SERVER 1 lần để có license ở `%APPDATA%`).
3. [ ] Chuột phải `ops-server-install-service.bat` → **Run as administrator** → UAC **Yes**.
4. [ ] Thấy `[6/6] … OK Server DANG CHAY`. Nếu không → mở `status.bat` + đọc log lỗi.
5. [ ] `http://localhost:3000/health` trả `{"ok":true,…}`.
6. [ ] **Mở Task Scheduler** (taskschd.msc) → thấy task **OpsControlServer**, trạng thái **Running**.
7. [ ] **Khởi động lại máy** (giả lập boot). **KHÔNG đăng nhập**, từ máy khác mở
       `http://<IP>:3000/health` → vẫn `ok:true` (chứng minh chạy trước login).
8. [ ] Test tự-restart: Task Scheduler → End task → đợi ~1 phút → task tự chạy lại
       (hoặc kill tiến trình `Ops Control.exe` trong Task Manager → tự lên lại).
9. [ ] Máy CLIENT trỏ `http://<IP-máy-SERVER>:3000` → đăng nhập + dùng bình thường.
10. [ ] `uninstall.bat` (Run as admin) → task biến mất, `status.bat` báo không phản hồi,
        dữ liệu vẫn còn trong `C:\ProgramData\OpsControl\data`.

---

## Khắc phục sự cố · Troubleshooting

| Triệu chứng | Xử lý |
| --- | --- |
| `/health` không phản hồi | Xem `server.err.log`. Thường do thiếu license hoặc cổng 3000 bận. |
| "cổng 3000 đang bận / port busy" | Đang có server khác chạy (app SERVER đang mở, hoặc dịch vụ đã chạy). Đóng bớt một cái. |
| `LICENSE_INVALID` khi tạo user | Đặt `license.json` đã ký vào DATA_DIR (mac: `/Library/OpsControl/data`, win: `C:\ProgramData\OpsControl\data`) rồi start lại. |
| Client không nối được | Kiểm tra firewall cho phép cổng 3000 inbound + IP đúng + cùng LAN. |
| Đổi cổng | Sửa `OPS_PORT` trong `server.env` (mac: `/Library/OpsControl/server.env`, win: `C:\ProgramData\OpsControl\server.env`) → start lại. |

> **Khóa bí mật** (TOTP/KIOSK/HMAC) nằm trong `server.env` — **đừng xóa** file này;
> mất nó (rồi cài lại với khóa mới) sẽ khiến mọi user phải đăng ký lại 2FA.
