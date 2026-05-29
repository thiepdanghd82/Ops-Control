# Ops Control Desktop — IT Deployment Guide

**Phiên bản tài liệu:** 1.0 · **Cho phiên bản app:** 1.1.x · **Cập nhật:** 2026-04-27

Hướng dẫn cài đặt + cấu hình + bảo trì Ops Control Desktop App cho IT của khách hàng. Đối tượng đọc: IT manager / system admin có quyền cài phần mềm trên 50 máy trạm + server.

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│  10 – 50 máy trạm Windows   │ HTTPS   │  Server Windows nội bộ   │
│  + một vài máy macOS        │ ──────▶ │  10.102.3.61             │
│  (Ops Control.exe / .app)   │         │  • App (port 3000)       │
│                             │         │  • Update repo (port 80) │
└─────────────────────────────┘         └──────────────────────────┘
        │                                          ▲
        │ IT triển khai (tuần đầu)                 │ IT push update
        │ qua GPO / file share / thủ công          │ qua release script
        ▼                                          │
┌─────────────────────────────┐                    │
│  Pilot 3 máy trong 3 ngày   │ ────────── thu thập feedback ──┘
└─────────────────────────────┘
```

**Phân rõ trách nhiệm:**

- **IT khách hàng:** triển khai installer ban đầu, cấu hình firewall, đảm bảo server `10.102.3.61` chạy ổn định.
- **CCL Design (vendor):** build + sign + push update qua `release.sh`. IT KHÔNG cần build từ source.

---

## 2. Pre-requisites

### 2.1 Máy trạm

| Hạng mục   | Yêu cầu tối thiểu                                                  | Khuyến nghị                |
| ---------- | ------------------------------------------------------------------ | -------------------------- |
| OS         | Windows 10 1809+ / macOS 11 (Big Sur)+                             | Windows 11 / macOS 14      |
| RAM        | 4 GB                                                               | 8 GB                       |
| Disk       | 500 MB free                                                        | 2 GB free (cho data cache) |
| Network    | Truy cập tới `10.102.3.61:3000` (LAN) + `10.102.3.61:80` (updates) | Gigabit LAN                |
| Quyền user | Standard user OK (per-user install)                                | —                          |

**Không cần:** Node.js, Python, Visual C++ runtime — tất cả đã bundled trong installer.

### 2.2 Server (10.102.3.61)

Server hiện đã chạy v1.0 — tận dụng. Bổ sung:

- nginx phục vụ `/var/www/updates/` qua port 80 (xem section 5)
- Firewall cho phép outbound TCP 9100 (Zebra/TSC) — đã có sẵn nếu in được v1.0

### 2.3 Mạng

Cấu hình firewall outbound trên máy trạm:

| Đích                      | Port                           | Protocol | Mục đích                                      |
| ------------------------- | ------------------------------ | -------- | --------------------------------------------- |
| 10.102.3.61               | 3000                           | TCP      | App API (REST)                                |
| 10.102.3.61               | 80                             | TCP/HTTP | Auto-update (download .exe/.dmg + latest.yml) |
| Máy in nhãn (192.168.x.x) | 9100                           | TCP      | ZPL/TSPL raw printing                         |
| Máy in A4/A3              | tùy theo print spooler Windows | —        | Office printing                               |

Inbound: KHÔNG cần — app là pure client.

---

## 3. Installer — Windows

### 3.1 File installer

CCL Design gửi 1 file `.exe` qua email/USB/file share:

```
Ops-Control-Setup-1.1.0.exe   (≈ 90 MB)
```

File này được sign bằng **self-signed code-signing cert** của CCL Design Vietnam (free alternative — không phải EV cert paid). Để Windows SmartScreen KHÔNG cảnh báo "Unknown publisher", IT cần push cert vào Trusted Publishers + Trusted Root CAs qua GPO **một lần** trước khi rollout.

**Quy trình GPO push** (xem chi tiết: [`docs/INTERNAL_TRUST_SETUP.md`](INTERNAL_TRUST_SETUP.md)):

1. Vendor gửi 1 file `internal-cert.cer` (~2 KB) cho IT
2. IT Group Policy Management Console:
   - Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies
   - Import `internal-cert.cer` vào **Trusted Publishers**
   - Import `internal-cert.cer` vào **Trusted Root Certification Authorities**
3. `gpupdate /force` trên DC, push xuống 50 máy trạm
4. Sau đó cài Ops Control mượt — không SmartScreen warning

**Nếu IT không setup GPO** (hoặc máy không trong domain): user thấy dialog "Windows protected your PC" → click "More info" → "Run anyway". Một lần duy nhất, sau đó Windows nhớ cert.

### 3.2 Cài thủ công (1 máy)

1. Double-click `.exe`
2. Chọn "Cài cho user hiện tại" (mặc định) HOẶC "Cài cho mọi user" (cần admin)
3. Pick install path (mặc định `%LOCALAPPDATA%\Programs\Ops Control\`)
4. Tick "Tạo shortcut Desktop" + "Tạo Start Menu entry"
5. Click "Install" — mất ~30 giây
6. Click "Finish" — app tự khởi động lần đầu

### 3.3 Cài hàng loạt qua GPO / SCCM / Intune (recommended cho 50 máy)

**Silent install:**

```cmd
"Ops-Control-Setup-1.1.0.exe" /S /allusers
```

- `/S` = silent (không hiện UI)
- `/allusers` = cài per-machine, cần admin

**Uninstall silent:**

```cmd
"%PROGRAMFILES%\Ops Control\Uninstall Ops Control.exe" /S
```

**GPO Software Installation:** copy `.exe` lên file share `\\fileserver\software\ops-control\1.1.0\`, tạo Group Policy với:

- Computer Configuration → Software Settings → Software Installation
- Package source: `\\fileserver\software\ops-control\1.1.0\Ops-Control-Setup-1.1.0.exe`
- Deployment method: Assigned (auto cài khi user login)

### 3.4 First-run config

Lần đầu chạy, app sẽ hỏi:

1. **Mode**: Mặc định `thin` (gọi server `10.102.3.61:3000`). Đổi qua menu Tệp → Cấu hình kết nối nếu cần.
2. **Login**: Dùng tài khoản đã có sẵn trên server v1.0. Nếu chưa có, sys-admin tạo qua web UI v1.0 trước.
3. **TOTP**: Nếu user role là sys/admin, sẽ yêu cầu enroll Authenticator app (Google Authenticator / Microsoft Authenticator / Authy).

---

## 4. Installer — macOS

### 4.1 File installer

```
Ops-Control-1.1.0-arm64.dmg   (Apple Silicon ≈ 100 MB)
Ops-Control-1.1.0-x64.dmg     (Intel Mac ≈ 100 MB)
```

DMG được **ad-hoc signed** (free alternative — không phải Apple Developer ID notarization). Để mở mà không bị Gatekeeper block, IT cần distribute qua kênh KHÔNG gắn `com.apple.quarantine` attribute (chi tiết: [`docs/INTERNAL_TRUST_SETUP.md`](INTERNAL_TRUST_SETUP.md)):

**Kênh distribution KHÔNG gắn quarantine** (recommended cho deploy nội bộ):

- ✅ File share LAN (smb://, afp://) — IT mount + copy
- ✅ MDM (Jamf Pro / Mosyle / Kandji) — push install qua agent
- ✅ Internal `.pkg` installer (xem section 2.4 của INTERNAL_TRUST_SETUP)
- ✅ scp / rsync / sftp từ build server
- ✅ USB stick (APFS/HFS+ format, không FAT32)

**Kênh GẮN quarantine** (cần workaround):

- ❌ Browser download (Safari/Chrome/Edge) → user phải right-click → Open lần đầu
- ❌ Email attachment → tương tự

**Workaround nếu user lỡ download qua browser:**

```bash
xattr -cr "/Applications/Ops Control.app"
open "/Applications/Ops Control.app"
```

### 4.2 Cài thủ công

1. Double-click `.dmg` → mount như đĩa ảo
2. Drag `Ops Control.app` vào thư mục `Applications`
3. Eject DMG
4. Mở từ Launchpad / Spotlight

### 4.3 Cài silent qua MDM (Jamf / Mosyle / Kandji)

Nén `.app` thành `.pkg`:

```bash
pkgbuild --root /tmp/payload \
         --identifier vn.ccldesign.opscontrol \
         --version 1.1.0 \
         --install-location /Applications \
         OpsControl.pkg
```

Push qua MDM Software policy.

---

## 5. Server-side: auto-update endpoint

Cài 1 lần trên server `10.102.3.61`:

### 5.1 nginx

```nginx
# /etc/nginx/sites-available/ops-updates
server {
    listen 80;
    server_name 10.102.3.61;

    location /updates/ {
        alias /var/www/updates/;
        autoindex off;

        # Cho phép app cache 5 phút (latest.yml). Nếu push update khẩn,
        # IT phải kill cache hoặc đổi tên version.
        location ~ \.yml$ {
            add_header Cache-Control "public, max-age=300";
        }

        # Installer file (.exe/.dmg) cache forever — file hash trong tên
        location ~ \.(exe|dmg|zip)$ {
            add_header Cache-Control "public, max-age=31536000, immutable";
        }
    }
}
```

```bash
sudo mkdir -p /var/www/updates
sudo chown ops:ops /var/www/updates
sudo ln -s /etc/nginx/sites-available/ops-updates /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

### 5.2 Push update từ vendor

CCL Design chạy `scripts/release.sh 1.1.x` (xem file đó) — sẽ rsync 4-5 file:

```
/var/www/updates/Ops-Control-Setup-1.1.x.exe
/var/www/updates/Ops-Control-1.1.x.dmg
/var/www/updates/Ops-Control-1.1.x-arm64.dmg
/var/www/updates/latest.yml         (Windows manifest)
/var/www/updates/latest-mac.yml     (macOS manifest)
```

App tự check `latest.yml` mỗi 6h + lúc khởi động.

### 5.3 Rollback

Nếu phát hiện bug nghiêm trọng sau khi push v1.1.5:

```bash
# Restore manifest về v1.1.4 (file installer của v1.1.4 vẫn còn)
ssh ops@10.102.3.61
cd /var/www/updates/
cp latest.yml.bak.20260427_143000 latest.yml
cp latest-mac.yml.bak.20260427_143000 latest-mac.yml
```

App sẽ tự "downgrade" về 1.1.4 ở lần check tiếp theo. (release.sh tự backup `latest.yml.bak.YYYYMMDD_HHMMSS` trước mỗi push.)

---

## 6. Cấu hình per-machine

App lưu config tại:

- **Windows:** `%APPDATA%\ops-control-desktop\ops-control-config.json`
- **macOS:** `~/Library/Application Support/ops-control-desktop/ops-control-config.json`

Schema (chỉnh được bằng tay nếu IT cần preconfig hàng loạt):

```json
{
  "mode": "thin",
  "remoteUrl": "http://10.102.3.61:3000",
  "embeddedPort": 0,
  "windowBounds": { "width": 1440, "height": 900 },
  "zoomFactor": 1.0,
  "totpKey": "<64 hex chars — chỉ tồn tại ở mode embedded>"
}
```

**Pre-deploy preset** (GPO logon script hoặc Jamf preference):

```cmd
:: Windows
mkdir "%APPDATA%\ops-control-desktop"
echo {"mode":"thin","remoteUrl":"http://10.102.3.61:3000"} > "%APPDATA%\ops-control-desktop\ops-control-config.json"
```

```bash
# macOS
mkdir -p "$HOME/Library/Application Support/ops-control-desktop"
echo '{"mode":"thin","remoteUrl":"http://10.102.3.61:3000"}' > "$HOME/Library/Application Support/ops-control-desktop/ops-control-config.json"
```

---

## 7. Hardware setup

### 7.1 Máy in nhãn Zebra/TSC

App KHÔNG cần driver Windows — gửi ZPL/TSPL trực tiếp qua TCP:9100.

**Cấu hình lần đầu:**

1. Máy in cắm LAN, đặt IP tĩnh (192.168.x.x), bật port 9100 (mặc định bật).
2. Trong app: Settings → Thiết bị phần cứng → Label Printer → nhập IP + Port (9100) → Test (in 1 nhãn mẫu).
3. App lưu config per-user.

### 7.2 Cân điện tử (Mettler / Ohaus / A&D)

1. Cân cắm USB-Serial (hoặc RS232 + USB-Serial adapter Prolific/FTDI).
2. Driver Prolific PL2303 thường tự cài Windows.
3. Trong app: Settings → Thiết bị phần cứng → Cân → chọn COM port (Win) hoặc /dev/cu.\* (Mac), baud 9600.
4. Test: bấm "Đọc cân hiện tại" — phải hiện weight realtime.

Nếu protocol khác chuẩn, IT chỉnh regex parser trong settings (mặc định: `/([+-]?\d+(?:\.\d+)?)\s*(kg|g|lb)?/i`).

### 7.3 Scanner USB

**Mode mặc định: Keyboard wedge** — scanner gõ thẳng vào field active. KHÔNG cần config.

**Mode HID raw** (chống ghost-typing): Settings → Thiết bị phần cứng → Scanner → Pick từ danh sách USB-HID detected → Save.

---

## 8. Bảo trì

### 8.1 Logs

| Vị trí                     | Win                                             | Mac                                             |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| App main log               | `%APPDATA%\ops-control-desktop\logs\main.log`   | `~/Library/Logs/ops-control-desktop/main.log`   |
| Server log (mode embedded) | `%APPDATA%\ops-control-desktop\logs\server.log` | `~/Library/Logs/ops-control-desktop/server.log` |
| Crash dump                 | `%LOCALAPPDATA%\CrashDumps\`                    | `~/Library/Logs/DiagnosticReports/`             |

Rotate: tự động khi size > 5 MB, giữ 5 file cũ.

### 8.2 Data backup

Mode `thin` (default): KHÔNG có data trên client — backup chỉ trên server `10.102.3.61` (đã có cron daily, xem v1.0 docs).

Mode `embedded`/`smart`:

- Win: `%APPDATA%\ops-control-desktop\data\`
- Mac: `~/Library/Application Support/ops-control-desktop/data/`

Backup hàng ngày qua Volume Shadow Copy (Win) hoặc Time Machine (Mac).

### 8.3 Update process

**Auto-update (mặc định):**

- App tự check `http://10.102.3.61/updates/latest.yml` lúc start + mỗi 6h
- Có version mới → download nền → toast "Khởi động lại để cài"
- User chọn "Để sau" → tự cài khi đóng app lần kế

**Force update toàn bộ máy:**

```bash
# Trên server
ssh ops@10.102.3.61
# Push manifest mới đã làm bằng release.sh; không cần thao tác thêm
```

User sẽ thấy toast trong vòng 6h. Để force ngay, IT có thể:

- Email user yêu cầu Help → Kiểm tra cập nhật
- Hoặc remote restart app via SCCM script

### 8.4 Recovery: app không mở được

1. Check log `main.log` — xem error
2. Reset config: xoá `%APPDATA%\ops-control-desktop\ops-control-config.json` → app chạy lại với defaults
3. Reset hoàn toàn: uninstall + xoá `%APPDATA%\ops-control-desktop\` (cẩn thận: mất license + cache + data nếu mode embedded)
4. Reinstall từ installer mới nhất

### 8.5 Recovery: license invalid sau khi đổi máy / clone OS

App bind license với HW fingerprint (CPU + MAC + motherboard SN). Nếu:

- User đổi RAM → fingerprint không đổi (bound on CPU + motherboard)
- User format + clone OS lên SSD mới → fingerprint không đổi
- User đổi máy hoàn toàn → fingerprint đổi → license invalid

Quy trình:

1. Trong app, copy "Installation ID" từ dialog license (64 hex chars)
2. Email cho CCL Design (vendor) — vendor sinh license file mới gắn HW mới
3. User đặt file `license.json` vào `%APPDATA%\ops-control-desktop\` → restart app

---

## 9. Troubleshooting matrix

| Symptom                               | Cause                                                        | Fix                                                                                   |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| App mở rồi đóng ngay                  | Single-instance lock từ instance trước, hoặc license expired | Kill mọi `Ops Control.exe` qua Task Manager; check `main.log` cho `License invalid`   |
| "Cannot connect to server"            | Network down hoặc server `10.102.3.61` chết                  | `ping 10.102.3.61`; `curl http://10.102.3.61:3000/health`                             |
| Zebra ping timeout                    | Sai IP/port hoặc firewall block 9100                         | DevTools → `await window.ops.labelPrinter.ping(host, 9100)`; kiểm tra firewall máy in |
| Cân không trả weight                  | Wrong COM/baud, hoặc protocol khác                           | Check Windows Device Manager → COM ports; thay baud rate; chỉnh regex trong settings  |
| Auto-update không chạy                | Network block port 80, hoặc `latest.yml` cache               | `curl http://10.102.3.61/updates/latest.yml`; nginx log `/var/log/nginx/error.log`    |
| SmartScreen warns "Unknown publisher" | Installer chưa sign hoặc cert expired                        | Liên hệ vendor — installer phải dùng EV Code Signing Cert                             |
| macOS "App is damaged"                | Notarization timeout / Gatekeeper cache                      | `xattr -cr "/Applications/Ops Control.app"`; thử lại; nếu vẫn lỗi, vendor reissue     |
| TOTP locked out                       | User mất phone hoặc Authenticator clear                      | Sys admin reset qua web UI v1.0 (Users tab → Reset TOTP)                              |

---

## 10. Liên hệ vendor (CCL Design Vietnam IT)

- Email: [vendor email]
- Hotline: [vendor phone]
- SLA: 4h response trong giờ hành chính, 8h ngoài giờ

Khi báo bug, đính kèm:

1. Phiên bản app (Help → Phiên bản)
2. OS + version
3. Đoạn log liên quan (`main.log` 100 dòng cuối)
4. Screenshot/video reproduce step
