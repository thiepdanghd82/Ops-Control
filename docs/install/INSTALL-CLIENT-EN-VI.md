# Cài Ops Control CLIENT · Install the Ops Control CLIENT (EN-VI)

Hướng dẫn cho **máy CLIENT** (máy operator) — nối tới 1 máy SERVER trong LAN.
Viết cho người **chưa biết gì**: mỗi bước = 1 việc cần làm + **"bạn sẽ thấy gì"**.

> Máy SERVER cài riêng — xem [`INSTALL-SERVER-EN-VI.md`](INSTALL-SERVER-EN-VI.md).
> CLIENT **không** lưu dữ liệu; mọi thứ nằm trên SERVER. Tắt máy CLIENT không mất gì.

---

## 0) Yêu cầu máy · Requirements

| | Mac | Windows |
| --- | --- | --- |
| OS | macOS 12+ (Apple Silicon M1/M2/M3) | Windows 10 / 11 (64-bit) |
| RAM | 8 GB+ | 8 GB+ |
| Mạng | Cùng LAN với máy SERVER (Wi-Fi/LAN) | Cùng LAN với máy SERVER |
| Cần biết trước | **IP của máy SERVER** (vd `10.102.3.61`) + tài khoản (Provisioning Card) |

> Hỏi Lead 2 thứ TRƯỚC khi bắt đầu: **(1) địa chỉ server** `http://<IP>:3000`,
> **(2) Provisioning Card** (username + mật khẩu tạm).

## 1) Tải đúng file · Download the right file

Lead gửi qua Zalo (kèm mã SHA256 để kiểm tra). **Đúng tên file:**

- **Mac:** `Ops Control CLIENT 1.5.12-arm64.dmg`
- **Windows:** `Ops Control CLIENT Setup 1.5.12.exe`

> ⚠️ Đừng tải nhầm bản **SERVER** — bản CLIENT mới hỏi địa chỉ server lúc mở lần đầu.

(Tùy chọn) Kiểm tra toàn vẹn:
- Mac: `shasum -a 256 "Ops Control CLIENT 1.5.12-arm64.dmg"` → so với mã Lead gửi.
- Win (PowerShell): `Get-FileHash "Ops Control CLIENT Setup 1.5.12.exe"`.

---

## 2) Cài đặt · Install

### 🍎 Mac

1. Double-click file `.dmg`. **Bạn sẽ thấy:** cửa sổ có icon **Ops Control** và thư mục **Applications**.
2. **Kéo** icon Ops Control **thả vào** Applications.
3. Mở Launchpad / Applications → click **Ops Control**.
4. **Bạn sẽ thấy** (lần đầu): macOS chặn _"không mở được vì từ nhà phát triển chưa xác minh"_.
   - **Chuột phải** vào app → **Open** → **Open** lần nữa. (Chỉ cần làm 1 lần.)

### 🪟 Windows

1. Double-click `Ops Control CLIENT Setup 1.5.12.exe`.
2. **Bạn sẽ thấy:** SmartScreen _"Windows protected your PC"_.
   - Click **More info** → **Run anyway**. (Bình thường — app ký ad-hoc, chưa mua cert.)
3. Trình cài chạy → **Install** → ~20 giây → **Finish** (để ô "Launch" tick sẵn).

---

## 3) Lần chạy đầu — nhập địa chỉ server · First run

CLIENT mở ra **wizard 2 bước** (vì đây là bản role = client):

1. **Bạn sẽ thấy:** màn hình _"Ops Control — Client Setup"_, **"Bước 1 / 2 — Địa chỉ server"**,
   ô nhập **Server URL** với gợi ý `http://10.102.3.61:3000`.
2. Gõ địa chỉ server Lead cho: `http://<IP-máy-SERVER>:3000`
   - ⚠️ Đúng định dạng: `http://` + IP + **dấu hai chấm** + cổng. Ví dụ `http://10.102.3.61:3000`.
3. Click **Test connection**.
   - ✅ **Thấy:** "Đang kiểm tra kết nối…" rồi chuyển sang **"Bước 2 / 2 — Hoàn tất"**.
   - ❌ Nếu **"Kết nối thất bại"** → xem Troubleshooting (mục không nối được server).
4. Click **Mở Ops Control** → ra màn hình **đăng nhập**.

---

## 4) Nạp license — APP TRƯỚC, LICENSE SAU · Apply the license (app first, then license)

> **Thứ tự bắt buộc:** cài app + chạy lần đầu **TRƯỚC**, rồi mới đặt license. License
> gắn với **phần cứng máy này** nên phải lấy mã từ chính máy đã cài.

1. Ở màn hình đăng nhập, **bạn sẽ thấy** banner đỏ ở trên:
   **"License không hợp lệ: …"** (vì máy mới chưa có license — đang chạy **TRIAL 14 ngày**).
2. **Click banner** → hộp thoại hiện **Installation ID** (chuỗi 64 ký tự) + nút **Copy Installation ID**.
3. Click **Copy** → dán vào Zalo gửi Lead, kèm tên máy/operator.
4. Lead ký và gửi lại file **`license.json`**.
5. Đặt file vào đúng chỗ (đổi tên thành đúng `license.json`):
   - **Mac:** `~/Library/Application Support/ops-control-desktop/license.json`
     - Mở Finder → menu **Go** → **Go to Folder…** → dán đường dẫn `~/Library/Application Support/ops-control-desktop/`.
   - **Windows:** `%APPDATA%\ops-control-desktop\license.json`
     - Mở Explorer → gõ `%APPDATA%\ops-control-desktop` vào thanh địa chỉ → Enter.
6. **Thoát hẳn** Ops Control rồi **mở lại**. **Bạn sẽ thấy:** banner đỏ biến mất.

> Không có license thật, app vẫn chạy TRIAL 14 ngày rồi **khóa**. Nạp license trước khi hết hạn.

---

## 5) Đăng nhập lần đầu · First login

1. Nhập **Username** + **mật khẩu tạm** trên Provisioning Card → **Đăng nhập**.
2. Nếu tài khoản bắt **2FA**: hiện QR code → mở Microsoft/Google Authenticator → quét → gõ mã 6 số → **Verify**.
3. Nếu bắt **đổi mật khẩu**: gõ mật khẩu mới (≥12 ký tự) → xác nhận.
4. **Bạn sẽ thấy:** trang **Home** (lời chào + KPI). Xong!

---

## 6) ✅ Checklist "cài thành công" (3 mục)

- [ ] **Nối server**: góc app **không** có banner đỏ "mất kết nối"; mở **Cost → Quote History** thấy danh sách quote (dữ liệu từ SERVER).
- [ ] **License OK**: **không** còn banner "License không hợp lệ". (Kiểm: Settings → About / Diagnostics → License status xanh.)
- [ ] **Đăng nhập + dùng được**: vào **Cost → Standard**, mọi sub-tab mở không lỗi đỏ "crashed".

Đủ 3 mục = máy CLIENT sẵn sàng.

---

## 7) Khắc phục sự cố · Troubleshooting

| Triệu chứng | Cách xử lý |
| --- | --- |
| **"License không hợp lệ: installation-mismatch"** | Mã Installation ID gửi đi khác với máy hiện tại (đổi máy/cài lại). Mở lại hộp thoại → **Copy Installation ID** MỚI → gửi Lead xin license mới. |
| **"License không hợp lệ: expired"** | License hết hạn. Báo Lead cấp license mới (cùng Installation ID, hạn mới) → thay file → mở lại. |
| **Trial hết hạn → app khóa** | Bản mới chạy TRIAL 14 ngày; hết là khóa. Nạp `license.json` thật (mục 4) là vào lại được. |
| **"Kết nối thất bại" / "Failed to fetch"** | (1) Máy SERVER đang chạy? (2) Đúng IP + cổng `:3000`? (3) Cùng LAN? Thử mở trình duyệt máy CLIENT: `http://<IP>:3000/health` → phải thấy `{"ok":true}`. (4) Firewall máy SERVER cho phép cổng 3000 inbound. |
| **Mac chặn "chưa xác minh"** | Chuột phải app → **Open** → **Open**. Hoặc Terminal: `xattr -dr com.apple.quarantine "/Applications/Ops Control.app"`. |
| **Windows SmartScreen chặn** | **More info** → **Run anyway**. Bình thường (ad-hoc sign). |
| **"Tài khoản của bạn vừa đăng nhập ở máy khác"** | **Đăng nhập đơn**: tài khoản chỉ mở 1 máy 1 lúc. Có người (hoặc bạn) vừa đăng nhập máy khác → máy này bị đăng xuất. Bản nháp đang nhập **đã được lưu tạm**. Đăng nhập lại nếu đúng là bạn; nếu không phải bạn → **đổi mật khẩu ngay**. |
| **Khi đăng nhập hiện hộp thoại "đang đăng nhập tại máy khác"** | Tài khoản đang mở ở máy kia. **Tiếp tục** = đăng xuất máy kia + vào máy này; **Hủy** = không đụng máy kia. |
| **"Session expired" giữa chừng** | Phiên hết hạn (8 giờ, hoặc 30 ngày nếu tick "Ghi nhớ"). Đăng nhập lại. |

> Liên hệ Lead nếu kẹt: gửi ảnh chụp màn hình lỗi + tên máy.
