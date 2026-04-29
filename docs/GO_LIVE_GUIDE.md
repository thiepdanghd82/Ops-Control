# Ops Control v1.2 — Hướng dẫn Go-Live toàn diện

**Henry Dang — NPI Manager · CCL Design Vietnam**
**Phiên bản tài liệu:** 1.0 (Tháng 4/2026)
**Áp dụng cho:** Ops Control v1.2.0 (Electron 33 · Node 20 · React 19)

> **Mục đích:** Tài liệu này hướng dẫn từ A→Z để triển khai Ops Control v1.2 cho 6-20 user trong mạng LAN. Bao gồm cả 2 kịch bản phổ biến: máy chủ Windows + client macOS, và ngược lại. Sau khi hoàn thành 8 chương dưới đây, hệ thống sẵn sàng go-live.

---

## Mục lục

1. [Trước khi cài đặt](#1-trước-khi-cài-đặt)
2. [Cài đặt máy chủ — Windows](#2-cài-đặt-máy-chủ--windows)
3. [Cài đặt máy chủ — macOS](#3-cài-đặt-máy-chủ--macos)
4. [Cấu hình mạng & Firewall](#4-cấu-hình-mạng--firewall)
5. [Cài đặt máy client (5-20 máy)](#5-cài-đặt-máy-client)
6. [Tạo user, phân quyền, kích hoạt 2FA](#6-tạo-user-phân-quyền-kích-hoạt-2fa)
7. [Backup & Disaster Recovery](#7-backup--disaster-recovery)
8. [Bảo mật, HTTPS, anomaly monitoring](#8-bảo-mật-https-anomaly-monitoring)
9. [Vận hành hằng ngày & Troubleshooting](#9-vận-hành-hằng-ngày--troubleshooting)
10. [Phụ lục: Lệnh & Đường dẫn quan trọng](#10-phụ-lục-lệnh--đường-dẫn-quan-trọng)

---

## 1. Trước khi cài đặt

### 1.1 Yêu cầu phần cứng

**Máy chủ (server) — host cho 6-20 user:**

| Thành phần | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 4 core / 2.5 GHz | 8 core / 3.0 GHz (Intel i7 / Apple M2 / Ryzen 7) |
| RAM | 8 GB | 16 GB |
| Disk | 50 GB SSD trống | 200 GB NVMe SSD (SQLite + 30 ngày backup + Library files) |
| Mạng | Ethernet 1 Gbps (KHÔNG dùng WiFi cho server) | Ethernet 1 Gbps + IP tĩnh trong LAN |
| OS | Windows 10/11 Pro · macOS 13+ (Ventura) · Ubuntu 22.04+ | Windows 11 Pro · macOS 14 (Sonoma) Apple Silicon |
| Uptime | Bật 24/7 (hoặc giờ làm việc + cron) | 24/7 + UPS chống mất điện |

**Máy client (5-20 máy):**

| Thành phần | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 2 core | 4 core |
| RAM | 4 GB | 8 GB |
| Disk | 1 GB trống cho app | 5 GB |
| OS | Windows 10/11 · macOS 12+ (Monterey) | Windows 11 · macOS 14 |
| Mạng | Cùng LAN với server (subnet 192.168.x.x hoặc 10.x.x.x) | Ethernet ưu tiên hơn WiFi |

### 1.2 Quyết định kiến trúc

**Hỏi 4 câu trước khi triển khai:**

1. **Máy chủ chạy OS gì?** Windows hay macOS đều được — không có khác biệt về tính năng.
   - **Windows**: phù hợp với IT team Việt quen Windows Server. NSSM service quản lý dễ. Không bị macOS App Nap.
   - **macOS**: phù hợp với máy Mac Mini / Mac Studio đặt làm server nhỏ. launchd quản lý.

2. **Server có cần truy cập từ Internet không?** 99% case là KHÔNG — chỉ trong LAN nhà máy.
   - **Trong LAN**: HTTP đủ (port 3100). Optional: HTTPS qua Caddy self-signed.
   - **Có WAN access**: BẮT BUỘC HTTPS (Let's Encrypt qua Caddy public mode) + VPN khuyến nghị.

3. **6 user hay 20 user?** Xác định trước để chọn hardware đúng.
   - 6 user: laptop i5 + 8 GB RAM đủ.
   - 20 user: workstation i7/M2 + 16 GB RAM khuyến nghị.

4. **Backup off-site đặt ở đâu?** Bắt buộc theo quy tắc IBM 3-2-1.
   - Phương án 1: NAS Synology / QNAP cùng LAN → rsync over SSH.
   - Phương án 2: USB SSD 1TB cắm sẵn → mount + sync nightly.
   - Phương án 3: OneDrive / Google Drive sync folder local → app backup tự đi cùng.

### 1.3 Chuẩn bị trước khi cài

**Vị trí file installer trong package** (`<project-root>/desktop/dist-electron/`):

| Platform | Vai trò | File | Size |
|---|---|---|---|
| Windows x64 | **MÁY CHỦ** (1 máy duy nhất) | `Ops Control SERVER Setup 1.2.0.exe` | ~160 MB |
| Windows x64 | **MÁY NHÂN VIÊN** (5–20 máy) | `Ops Control CLIENT Setup 1.2.0.exe` | ~160 MB |
| Windows x64 | (legacy / generic, không khuyên) | `Ops Control Setup 1.2.0.exe` | ~167 MB |
| Windows x64 | Portable (không cần admin) | `Ops Control-1.2.0-win.zip` | ~209 MB |
| Mac Apple Silicon | (chưa tách Server/Client) | `Ops Control-1.2.0-arm64.dmg` | ~188 MB |

> **Cách chọn:** Trong nhà máy có **1 máy chủ** + **5–20 máy nhân viên**.
> Cài SERVER lên đúng 1 máy → cài CLIENT lên các máy nhân viên còn lại.
> Đừng cài SERVER lên 2 máy — sẽ tạo 2 nguồn data tách rời, không sync.

Đường dẫn đầy đủ trên máy build:
```
<project-root>/desktop/dist-electron/
├── Ops Control SERVER Setup 1.2.0.exe   ← Cài máy chủ (mở firewall 3100, server defaults)
├── Ops Control CLIENT Setup 1.2.0.exe   ← Cài máy nhân viên (hỏi URL server lần đầu)
├── Ops Control-1.2.0-arm64.dmg          ← Mac installer
└── Ops Control-1.2.0-win.zip            ← Windows portable backup
```

**Khác biệt SERVER vs CLIENT EXE:**

| | SERVER Setup | CLIENT Setup |
|---|---|---|
| Default mode khi cài xong | `embedded` (chạy server local port 3100) | `thin` (kết nối server LAN) |
| First-run dialog | Hiện IP máy này — dán cho người cài Client | Hỏi URL server + nút "Test kết nối" |
| Firewall TCP 3100 inbound | Tự mở (cho LAN clients connect) | KHÔNG mở (không cần) |
| Firewall TCP 9100 outbound (Zebra) | Tự mở | Tự mở |
| Windows Defender whitelist | Tự thêm | Tự thêm |
| Registry `HKLM\Software\CCL Design Vietnam\Ops Control\Role` | `"server"` | `"client"` |

**Build từ source** (chỉ khi cần tạo lại, ví dụ sau update):
```bash
cd <project-root>
node scripts/build-windows-installers.mjs           # build cả 2
node scripts/build-windows-installers.mjs server    # chỉ SERVER
node scripts/build-windows-installers.mjs client    # chỉ CLIENT
```

**Cần có sẵn:**

- ✅ Tải file cài tương ứng platform (xem bảng trên) từ shared folder hoặc IT
- ✅ Dữ liệu cũ (nếu migrate từ v1.0/v1.1): folder `server/data/` hoặc backup `.json` snapshot
- ✅ Danh sách user cần tạo: username, full name (VN), email, phone, role, department
- ✅ IP tĩnh cho máy chủ (xem mục 4.1)
- ✅ Account admin local trên máy chủ (cần để firewall + Defender whitelist tự động)

---

## 2. Cài đặt máy chủ — Windows

### 2.1 Cài Ops Control trên Windows (MÁY CHỦ)

Dùng file **`Ops Control SERVER Setup 1.2.0.exe`** — installer này đã cấu hình
sẵn embedded mode, mở firewall TCP 3100 inbound cho LAN clients connect, và
hiện IP máy chủ ngay sau khi cài.

```powershell
# Bước 1: Copy "Ops Control SERVER Setup 1.2.0.exe" về máy chủ
#   Nguồn: <package>/desktop/dist-electron/Ops Control SERVER Setup 1.2.0.exe
# Bước 2: Double-click → Smart Screen "More info" → "Run anyway" (1 lần)
# Bước 3: Wizard chạy:
#   - Stop process cũ nếu có
#   - Mở firewall TCP 3100 inbound (cho máy nhân viên LAN connect)
#   - Mở firewall TCP 9100 outbound (Zebra/TSC printing)
#   - Whitelist Windows Defender (giảm warning)
#   - Ghi registry HKLM\Software\CCL Design Vietnam\Ops Control\Role = "server"
#   - Tạo shortcut Desktop + Start Menu
# Bước 4: App mở lần đầu → hiện dialog "Đây là URL server của anh"
#   Ghi lại các URL hiện trong dialog (vd http://192.168.1.16:3100)
#   → Dán URL đó vào dialog của máy nhân viên ở mục 5.1
# Bước 5: Login — xem mục 6.1
#   Default: Administrator / admin1234  (BẮT BUỘC đổi password ngay)
```

**Vị trí cài mặc định:** `%LOCALAPPDATA%\Programs\Ops Control\`
(per-user install, không cần admin rights — tương thích máy corporate bị lock)

**Audit registry IT inventory tool đọc được:**
```
HKLM\Software\CCL Design Vietnam\Ops Control
├── Version       = "1.2.0"
├── InstallPath   = "C:\Users\<user>\AppData\Local\Programs\Ops Control"
└── InstallDate   = "YYYY-MM-DD HH:MM:SS"  (lúc user chạy installer)
```

**Phương án B — Portable ZIP (nếu corporate IT không cho chạy installer)**

```powershell
# Right-click "Ops Control-1.2.0-win.zip" → Extract All
# Đích: C:\OpsControl\  (hoặc bất kỳ chỗ user có write permission)
# Vào folder vừa giải nén, double-click "Ops Control.exe"
# Smart Screen warning lần đầu: "More info" → "Run anyway"
```

ZIP **KHÔNG** tự thêm firewall rule / Windows Defender whitelist / registry — phải làm thủ công nếu cần.

> **Lưu ý chung:** Nếu IT đã push publisher cert qua GPO Trusted Publishers, Smart Screen sẽ không xuất hiện.
>
> **Update app:** chạy installer phiên bản mới đè lên (NSIS tự stop process cũ + giữ user data ở `%APPDATA%\Ops Control\`). Với ZIP: thay folder cũ bằng folder ZIP mới — KHÔNG xóa `%APPDATA%\Ops Control\`.

### 2.2 Cấu hình app làm Embedded (server local)

Mở Ops Control → mode mặc định đã là `embedded`. Server local sẽ chạy port 3100 bind 0.0.0.0 → các máy LAN khác kết nối được qua `http://<windows-ip>:3100`.

**Verify server đang chạy:**

```powershell
# Trong PowerShell:
netstat -ano | findstr :3100
# Should show TCP 0.0.0.0:3100 LISTENING <PID>
```

### 2.3 Auto-start server cùng Windows (NSSM service)

App Electron tự chạy khi user login, NHƯNG nếu user logout, server sẽ dừng. Để server chạy 24/7 không cần user login, dùng NSSM (Non-Sucking Service Manager):

```powershell
# Bước 1: Tải NSSM
# https://nssm.cc/download → giải nén nssm-2.24-101.zip
# Copy nssm.exe vào C:\Windows\System32

# Bước 2: Xác định install path của Ops Control
# - Nếu cài qua NSIS Setup: %LOCALAPPDATA%\Programs\Ops Control\
# - Nếu giải nén ZIP portable:  C:\OpsControl\  (hoặc folder anh chọn)
#
# Lệnh sau dùng path NSIS (default). Đổi $OPSPATH nếu khác.

$OPSPATH = "$env:LOCALAPPDATA\Programs\Ops Control"
cd "$OPSPATH\resources\app"

# Bước 3: Tạo service trỏ vào server/index.js
nssm install OpsControlServer "$OPSPATH\Ops Control.exe" --hidden
nssm set OpsControlServer AppEnvironmentExtra ELECTRON_RUN_AS_NODE=1 OPS_PORT=3100 NODE_ENV=production
nssm set OpsControlServer AppDirectory "$OPSPATH\resources\app"
nssm set OpsControlServer AppParameters "server\index.js"
nssm set OpsControlServer DisplayName "Ops Control Server"
nssm set OpsControlServer Description "CCL Design Vietnam - Ops Control LAN server"
nssm set OpsControlServer Start SERVICE_AUTO_START
nssm set OpsControlServer AppStdout "C:\OpsControl\logs\server-stdout.log"
nssm set OpsControlServer AppStderr "C:\OpsControl\logs\server-stderr.log"
nssm set OpsControlServer AppRotateFiles 1
nssm set OpsControlServer AppRotateBytes 10485760

# Bước 4: Tạo log dir
mkdir C:\OpsControl\logs

# Bước 5: Start service
nssm start OpsControlServer

# Verify:
nssm status OpsControlServer
# → SERVICE_RUNNING
```

> **Để stop / restart:** `nssm stop OpsControlServer` / `nssm restart OpsControlServer`. Để gỡ: `nssm remove OpsControlServer confirm`.

### 2.4 Chỉ định IP tĩnh cho máy chủ — BẮT BUỘC

> ⚠ **Đây là bước KHÔNG được skip.** Máy chủ DHCP-tự-động sẽ đổi IP bất
> kỳ lúc nào (router restart, đổi mạng, lease expire) → toàn bộ máy
> nhân viên cấu hình IP cũ sẽ mất kết nối, phải config lại tay từng máy.

**2 cách (ưu tiên cách A — chỉnh từ router):**

**Cách A — DHCP Reservation trên router (ưu tiên):**
```
1. Login router admin (vd 192.168.1.1)
2. Vào DHCP → Reserved IPs (hoặc "Address Reservation" / "Static DHCP")
3. Pick MAC address của máy chủ → bind cố định IP 192.168.1.16
4. Save → restart router (1 lần) → từ giờ máy chủ luôn nhận IP này
```
→ Ưu điểm: máy chủ không cần config gì, chỉ chạy DHCP bình thường.
   Đổi router ⇒ chỉ phải set lại reservation ở router mới.

**Cách B — Static IP trên Windows:**
```
1. Settings → Network & Internet → Ethernet (hoặc WiFi)
2. Click connection → IP assignment → Edit → Manual → IPv4: ON
3. IP address: 192.168.1.16 (chọn IP trong LAN range không trùng router/máy khác)
4. Subnet prefix length: 24
5. Gateway: 192.168.1.1 (router của LAN)
6. Preferred DNS: 8.8.8.8
7. Save → restart network adapter
```
Verify: `ipconfig` → đảm bảo IPv4 Address là 192.168.1.16.

⚠ **Đổi mạng = đổi IP**: Nếu bê máy chủ sang LAN khác (vd Wi-Fi nhà/văn
phòng), Static IP từ Cách B sẽ không khớp subnet mới → phải set lại.
Cách A (DHCP reservation) cũng chỉ áp dụng đúng router cũ.

**Sau khi set IP tĩnh:** mở app → Settings → ⇄ Chế độ kết nối → block
"🔗 URL server cho máy nhân viên" sẽ list IP mới. Bấm Copy → gửi cho
người dùng để update Client. Bấm `↻ Refresh` nếu IP chưa cập nhật.

---

## 3. Cài đặt máy chủ — macOS

### 3.1 Cài Ops Control trên Mac

**File DMG**: `<package>/desktop/dist-electron/Ops Control-1.2.0-arm64.dmg` (~188 MB, Apple Silicon).

```bash
# Bước 1: Mount DMG (giả sử file đã copy về Downloads)
open ~/Downloads/Ops\ Control-1.2.0-arm64.dmg

# Bước 2: Drag "Ops Control" → Applications
#   Vị trí cài: /Applications/Ops Control.app

# Bước 3: First launch — Gatekeeper warning (vì DMG chưa code-sign Apple Developer ID)
# Right-click app → Open → Open (1 lần)
# Hoặc clear quarantine attribute:
xattr -cr "/Applications/Ops Control.app"

# Bước 4: Login lần đầu — xem mục 6.1
#   Default: Administrator / admin1234  (BẮT BUỘC đổi password ngay)
```

**User data location:** `~/Library/Application Support/Ops Control/` (KHÔNG xóa khi update app).

### 3.2 Mode embedded + verify

Mở Ops Control → mode mặc định `embedded` → server local trên port 3100.

**Verify:**

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
# Should show node process listening
```

### 3.3 Auto-start cùng macOS (launchd)

App Electron tự chạy khi user login, nhưng để server chạy 24/7 (kể cả khi user log out), dùng launchd:

```bash
# Bước 1: Tạo plist
cat > ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ccldesign.opscontrol</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/Ops Control.app/Contents/MacOS/Ops Control</string>
        <string>--hidden</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OPS_PORT</key>
        <string>3100</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/opscontrol-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/opscontrol-stderr.log</string>
</dict>
</plist>
EOF

# Bước 2: Load
launchctl load -w ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist

# Bước 3: Verify
launchctl list | grep opscontrol
```

> **Để stop:** `launchctl unload ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist`. Để restart: unload rồi load lại.

### 3.4 Chống App Nap (quan trọng)

macOS có App Nap suspend background apps. Tắt cho Ops Control:

```bash
defaults write com.ccldesign.opscontrol NSAppSleepDisabled -bool YES
```

### 3.5 IP tĩnh trên macOS — BẮT BUỘC

> ⚠ Cùng lý do mục 2.4: IP DHCP đổi → toàn bộ máy nhân viên mất kết nối.

**Cách A (ưu tiên) — DHCP Reservation trên router:** xem mục 2.4.

**Cách B — Static IP từ macOS:**
```
1. System Settings → Network → Ethernet (hoặc WiFi) → Details
2. TCP/IP → Configure IPv4: Manually
3. IP Address: 192.168.1.16
4. Subnet Mask: 255.255.255.0
5. Router: 192.168.1.1
6. DNS: 8.8.8.8
7. Apply
```

**Sau khi set:** mở app → Settings → ⇄ Chế độ kết nối → block "🔗 URL
server cho máy nhân viên" → bấm Copy URL → gửi cho người dùng. Bấm
`↻ Refresh` nếu IP chưa cập nhật ngay.

⚠ **Mac laptop di động**: Nếu máy chủ là MacBook hay đổi mạng (Wi-Fi
nhà ↔ Wi-Fi văn phòng), Static IP sẽ không khớp subnet mới mỗi lần đổi
mạng. Khuyến nghị **dùng máy bàn (Mac mini / iMac) làm server**, ghim
ở 1 nơi cố định, kết nối qua Ethernet đến router.

---

## 4. Cấu hình mạng & Firewall

### 4.1 Mở port 3100 trong firewall

**Windows Firewall:**

```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="Ops Control LAN Server" dir=in action=allow protocol=TCP localport=3100 profile=private
```

Hoặc qua GUI:
1. Windows Defender Firewall → Advanced Settings
2. Inbound Rules → New Rule → Port → TCP → 3100 → Allow → Private profile only
3. Name: "Ops Control LAN Server"

**macOS Firewall:**

```bash
# Cho phép Ops Control accept incoming connections
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "/Applications/Ops Control.app"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock "/Applications/Ops Control.app"
```

### 4.2 Verify từ máy client

Trên 1 máy client trong LAN:

```bash
# macOS / Linux:
curl -sS http://192.168.1.16:3100/api/health
# → {"ok":true,"version":"1.2.0",...}

# Windows (PowerShell):
Invoke-WebRequest -Uri http://192.168.1.16:3100/api/health
```

Nếu không kết nối được:
- Ping `192.168.1.16` xem có thông không
- Kiểm tra firewall server (mục 4.1)
- Kiểm tra cùng subnet (`ipconfig` / `ifconfig` so sánh)

### 4.3 Reserved DHCP (khuyến nghị)

Vào router admin → DHCP → Reserved IPs → bind MAC address của máy chủ với IP `192.168.1.16`. Đảm bảo IP không bao giờ đổi sau khi router restart.

---

## 5. Cài đặt máy client

### 5.1 Cho mỗi máy nhân viên (5-20 máy)

Copy 2 file installer từ `<package>/desktop/dist-electron/` lên shared folder
(vd `\\<server>\Public\OpsControl\`):
- `Ops Control SERVER Setup 1.2.0.exe`  (chỉ cài 1 lần lên máy chủ)
- `Ops Control CLIENT Setup 1.2.0.exe`  (cài lên 5-20 máy nhân viên)

**Windows x64** (máy nhân viên):
```
1. Tải "Ops Control CLIENT Setup 1.2.0.exe" từ \\<server>\Public\OpsControl\
2. Double-click → Smart Screen "More info" → "Run anyway" (1 lần)
3. Wizard install xong → app mở
4. Dialog "Kết nối tới server Ops Control" hiện ra:
   • Nhập URL server lấy từ mục 2.1 bước 4 (vd http://192.168.1.16:3100)
   • Bấm "Test kết nối" → chờ kết quả OK
   • Bấm "Lưu & tiếp tục →"
5. App restart → vào màn hình login
6. Login bằng account riêng (admin tạo cho mỗi nhân viên — xem mục 6.2)
```

**macOS** (Apple Silicon — chưa tách Server/Client):
```
1. Tải "Ops Control-1.2.0-arm64.dmg" từ \\<server>\Public\OpsControl\
2. Mount DMG + drag "Ops Control" → /Applications
3. Right-click app → Open → Open (Gatekeeper bypass 1 lần)
4. App mở → vào Settings → ⇄ Chế độ kết nối → pick "Thin"
   → URL: http://<server-ip>:3100 → Save & Restart
5. Login
```

> Nếu IT corporate lock không cho chạy installer: dùng `Ops Control-1.2.0-win.zip` —
> giải nén vào `C:\OpsControl\`, double-click `Ops Control.exe`. Sau đó vào
> Settings → ⇄ Chế độ kết nối tự config thin URL.

### 5.2 Đổi URL server sau khi đã cài (nếu IP server thay đổi)

Client EXE đã tự config thin mode + URL ở first-run dialog (mục 5.1).
Nếu server đổi IP (vd dời máy chủ sang VLAN khác) — đổi URL trong app:

```
1. Click Settings (gear icon, sidebar)
2. SYSTEM section → ⇄ Chế độ kết nối
3. URL: http://<new-server-ip>:3100
4. Click "Đã áp dụng" → app restart
```

Hoặc reset hoàn toàn first-run wizard:
```powershell
# Quit app trước
Remove-Item "$env:APPDATA\Ops Control\ops-control-config.json"
# Mở lại app → first-run dialog hiện lại
```

### 5.3 Verify từ máy client

- TopBar góc trái: nếu thấy banner đỏ "Mất kết nối server" → server tắt hoặc firewall chặn
- TopBar góc phải: pill "● N online" → click thấy danh sách user đang online
- Settings → ⓘ About → click "Server /health" → status `OK · v1.2.0`

---

## 6. Tạo user, phân quyền, kích hoạt 2FA

### 6.1 Login với account admin lần đầu

**Default credential (lần đầu chạy server, chưa có `users.json`):**

| Field | Value |
|---|---|
| Username | `Administrator` |
| Password | `admin1234` |
| Role | `sys` (god mode) |

> ⚠️ **BẮT BUỘC đổi password ngay sau lần login đầu tiên.** Default này
> deterministic để onboarding nhanh — KHÔNG bao giờ để nguyên trên prod LAN.

App tạo file sidecar tự động nhắc:
```
%APPDATA%\Ops Control\data\Library\Users\README_FIRST_LOGIN.txt   (Windows)
~/Library/Application Support/Ops Control/data/Library/Users/README_FIRST_LOGIN.txt   (Mac)
```

**Quy trình lần đầu:**
```
1. Login: Administrator / admin1234
2. Settings → ⚿ My Password → đổi password mạnh (≥10 ký tự, có số + ký tự đặc biệt)
3. Settings → My Profile → cập nhật full name + email + phone (cho audit log)
4. Settings → ◍ Account Control → Setup TOTP 2FA cho Administrator
   (scan QR bằng Google Authenticator / Microsoft Authenticator / 1Password)
5. Xóa file README_FIRST_LOGIN.txt (đã dùng xong, tránh lộ default cho người khác)
```

#### Quên password admin / Default password không nhận

**Hai cách recovery (chọn 1):**

**Cách A — Reset users.json thủ công (giữ data hiện tại)**

1. Quit Ops Control hoàn toàn (right-click tray → Quit, hoặc Task Manager kill `Ops Control.exe`)
2. Mở folder users:
   - Windows: `%APPDATA%\Ops Control\data\Library\Users\`
   - Mac: `~/Library/Application Support/Ops Control/data/Library/Users/`
3. (Backup) đổi tên `users.json` → `users.json.bak` (giữ data user khác)
4. Tạo `users.json` mới với nội dung:
   ```json
   [
     {
       "id": 1,
       "username": "Administrator",
       "role": "sys",
       "pwd": "1w56gx1",
       "lastPwdChange": "2026-04-27T13:00:00.000Z",
       "permissions": { "canDeleteQuote": true },
       "full_name": "Administrator",
       "english_name": "Administrator",
       "id_no": "", "email": "", "phone": ""
     }
   ]
   ```
   `pwd: "1w56gx1"` chính là `jsHash("admin1234")` — login với `admin1234` sẽ pass và auto-upgrade sang bcrypt.
5. (Optional) Merge user khác từ `users.json.bak` vào array — nhớ giữ unique `id`.
6. Mở lại app → login `Administrator` / `admin1234` → đổi password ngay.

**Cách B — Reinstall sạch (mất toàn bộ data nếu không backup)**

1. Quit app
2. **Backup** toàn bộ folder data trước khi xóa:
   - Windows: copy `%APPDATA%\Ops Control\data\` → `D:\Backup\OpsControl-data-YYYYMMDD\`
   - Mac: copy `~/Library/Application Support/Ops Control/data/` → backup folder
3. Uninstall Ops Control (Windows: Settings → Apps; Mac: drag /Applications/Ops Control.app → Trash)
4. Xóa folder data:
   - Windows: `rd /s /q "%APPDATA%\Ops Control"`
   - Mac: `rm -rf ~/Library/Application\ Support/Ops\ Control`
5. Run installer mới → app tạo lại default `Administrator` / `admin1234`
6. Restore data từ backup nếu cần (copy vào `Library/` subfolders, KHÔNG đè `users.json`).

### 6.2 Tạo user cho 5-20 nhân viên

Settings → Account Control → Users → "+ Add User":

| Field | Note |
|---|---|
| Username | viết thường, không dấu, không khoảng trắng (vd: `quynh.tran`) |
| Full Name (VN) | Tên có dấu (vd: "Trần Thị Quỳnh") |
| English Name | Tên không dấu cho audit log |
| Email | Để gửi notification |
| Role | viewonly < user < cost < admin < sys |
| Department | sales / cs / npi / purchasing / production / quality / finance / leader |
| Permission Group | Pick group có sẵn (sales_default, npi_default, …) |
| Password | Tạm — user đổi khi login đầu |

### 6.3 Kích hoạt 2FA bắt buộc cho admin / sys

User role admin/sys BẮT BUỘC enroll 2FA — server enforce. Lần login đầu sẽ pop QR code:

```
1. User cài Google Authenticator / Microsoft Authenticator trên điện thoại
2. Scan QR (hiển thị trên màn hình login)
3. Nhập mã 6 chữ số → verify
4. Lần login sau: nhập password → app yêu cầu mã 6 chữ số
```

### 6.4 Permission Groups (SAP-style 3 lớp)

Settings → Account Control → Permission Groups → Choose group → matrix 23 tab × 3 mode (Hidden / Read / Edit).

Seed groups có sẵn:
- `all_access` (sys-only fallback)
- `leader_default`, `sales_default`, `cs_default`, `npi_default`, `purchasing_default`, `production_default`, `quality_default`

Có thể duplicate + customize bất kỳ group nào.

### 6.5 Active Sessions admin (sys-only)

Settings → Account Control → Sessions tab — xem mọi user đang đăng nhập. Click "Revoke" bất kỳ dòng → user đó bị logout khỏi MỌI máy ngay lập tức (force re-login bằng password).

---

## 7. Backup & Disaster Recovery

### 7.1 Quy tắc IBM 3-2-1

> **3** copies dữ liệu, **2** loại media khác nhau, **1** off-site.

Ops Control v1.2 satisfies:
- **Copy 1:** Live data ở `~/Library/Application Support/ops-control-desktop/data` (macOS) hoặc `%APPDATA%\ops-control-desktop\data` (Windows)
- **Copy 2:** Auto daily backup trong `data/Backup & restore/Data/auto_*.json` (giữ 30 ngày, prune tự động) + SQLite backup `data/Backup/SQLite/ops_*.sqlite`
- **Copy 3:** Off-site qua `scripts/backup-offsite.sh` (rsync sang NAS / USB / SSH)

### 7.2 Verify scheduled backup hoạt động

Đợt 5 (v1.3) đã set `OPS_BACKUP_SCHEDULE=1` mặc định cho desktop. Verify:

```bash
# macOS
ls -lh ~/Library/Application\ Support/ops-control-desktop/data/Backup/SQLite/
# Should show ops_YYYYMMDD_HHMMSS.sqlite created daily at 02:00

# Windows
dir "%APPDATA%\ops-control-desktop\data\Backup\SQLite"
```

Nếu chưa có file, mở Settings → Backup/Restore → click "Create Data Backup" để test manual lần đầu.

### 7.3 Setup off-site backup (NAS qua SSH)

**Trên server (macOS hoặc Linux):**

```bash
# Bước 1: Generate SSH key (nếu chưa có)
ssh-keygen -t ed25519 -f ~/.ssh/ops_backup_id -N ""

# Bước 2: Copy public key lên NAS
ssh-copy-id -i ~/.ssh/ops_backup_id.pub backup@nas.local

# Bước 3: Test SSH không cần password
ssh -i ~/.ssh/ops_backup_id backup@nas.local "ls /volume1/ops-backup"

# Bước 4: Cấu hình env
cat >> ~/.ops-backup.env <<EOF
export OPS_DATA_DIR="$HOME/Library/Application Support/ops-control-desktop/data"
export OPS_OFFSITE_TARGET="backup@nas.local:/volume1/ops-backup"
export OPS_OFFSITE_SSH_KEY="$HOME/.ssh/ops_backup_id"
export OPS_OFFSITE_RETAIN=14
export OPS_BACKUP_WEBHOOK="https://hooks.slack.com/services/XXX"  # optional
EOF

# Bước 5: Test manual
source ~/.ops-backup.env
/Applications/Ops\ Control.app/Contents/Resources/app/scripts/backup-offsite.sh

# Bước 6: Cron nightly 02:30
crontab -e
# Add line:
30 2 * * * source ~/.ops-backup.env && /Applications/Ops\ Control.app/Contents/Resources/app/scripts/backup-offsite.sh >> /tmp/ops-offsite.log 2>&1
```

**Trên Windows server:** dùng Task Scheduler thay cron, hoặc chạy `backup-offsite.sh` qua Git Bash / WSL.

### 7.4 Test restore (PHẢI LÀM TRƯỚC GO-LIVE)

Tháng 1 lần, làm restore drill:

```
1. Tạo 1 backup mới (Settings → Backup/Restore → Create Data Backup)
2. Note tên file (vd manual_2026-04-27_153012.json)
3. Tạo 1 quote mới + lưu (để có "thay đổi" có thể restore xoá)
4. Settings → Backup/Restore → row backup ban đầu → Restore → confirm
5. Verify: quote vừa tạo đã biến mất (đã rollback), pre-restore snapshot tự tạo (pre_restore_*.json)
6. Restore lại snapshot mới hơn để restore quote
```

### 7.5 Recovery scenarios

| Sự cố | Cách phục hồi |
|---|---|
| Server crash, không boot lại | Cài lại app trên máy mới + copy folder `data/` từ backup mới nhất |
| Database corrupt | Settings → Backup/Restore → restore từ SQLite backup gần nhất `data/Backup/SQLite/ops_*.sqlite` |
| User xoá nhầm quote | Quote History → tab Trash → click Restore (soft-delete giữ 30 ngày) |
| Mất TOTP key (lock all 2FA) | SSH server → `OPS_TOTP_KEY=$(new_key) node scripts/reset-totp.js` (xem CLAUDE.md TOTP runbook) |
| Library file (rate.json, ddl.json) bị wipe | Restore từ `data/Backup/Library/library_*.tar.gz` daily snapshot |

---

## 8. Bảo mật, HTTPS, anomaly monitoring

### 8.1 HTTPS via Caddy (LAN self-signed)

Browsers 2026 yêu cầu HTTPS cho geolocation, clipboard, service workers. Caddy tự generate self-signed cert:

```bash
# macOS (Homebrew)
brew install caddy

# Linux (Debian)
sudo apt install caddy

# Windows (Chocolatey)
choco install caddy

# Setup
cd /Applications/Ops\ Control.app/Contents/Resources/app
./scripts/setup-https-caddy.sh

# Run foreground (test)
caddy run --config ~/.config/ops-control-caddy/Caddyfile

# Background macOS
brew services start caddy
sudo cp ~/.config/ops-control-caddy/Caddyfile /opt/homebrew/etc/Caddyfile

# Background Linux
sudo cp ~/.config/ops-control-caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Trust self-signed CA trên mỗi máy client:**

```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ~/Library/Application\ Support/Caddy/pki/authorities/local/root.crt

# Windows (PowerShell elevated)
Import-Certificate -FilePath caddy_root.crt -CertStoreLocation Cert:\LocalMachine\Root
```

Sau đó: trên client app → Settings → Mode → Thin → URL = `https://192.168.1.16` (port 443 mặc định, không cần ghi).

### 8.2 Login anomaly monitoring

Server tự stamp `LOGIN_ANOMALY` event khi:
- Cùng user login từ 2+ IP trong 5min
- Login từ IP mới (chưa thấy trong 30 ngày)
- Login giờ bất thường (22h-6h) khi user không có history ca đêm

**Admin xem real-time:**
- Login tài khoản admin/sys → khi anomaly trigger → toast vàng top-right "🛡 Security: <username> — <reasons>"
- Settings → Account Control → Sessions → click Revoke nếu phát hiện hijack

**Admin grep audit log:**

```bash
# macOS
grep LOGIN_ANOMALY ~/Library/Application\ Support/ops-control-desktop/data/Library/Users/audit_log.json

# Windows
findstr /c:"LOGIN_ANOMALY" "%APPDATA%\ops-control-desktop\data\Library\Users\audit_log.json"
```

### 8.3 Per-user rate limit + lockout

Đã active mặc định:
- 60 saves / 10 phút / user
- 30 writes / 10 phút / user
- 5 fail logins → lock 5 phút
- 10 fail logins → lock 30 phút

Không cần config thêm.

### 8.4 Hardening checklist (sys-admin)

- [ ] TOTP enrolled cho TẤT CẢ admin/sys role
- [ ] Default password "admin1234" đã đổi cho Administrator account
- [ ] Permission Groups assign rõ ràng — không user nào còn ở "all_access" trừ 1-2 sys
- [ ] Firewall chỉ mở port 3100 (hoặc 443 nếu Caddy) cho LAN, không Internet
- [ ] Off-site backup cron đã chạy được ít nhất 3 lần (verify file size đều)
- [ ] HTTPS Caddy CA trusted trên mọi client (nếu enable)
- [ ] Server đã set IP tĩnh (mục 2.4 / 3.5)
- [ ] Auto-start service đã enable (NSSM Windows / launchd macOS)

---

## 9. Vận hành hằng ngày & Troubleshooting

### 9.1 Daily ops checklist (cho IT/admin)

| Tần suất | Task | Lệnh |
|---|---|---|
| Hằng ngày | Verify server uptime | `curl http://192.168.1.16:3100/api/health` |
| Hằng ngày | Verify auto backup chạy | Check size `data/Backup/SQLite/` mới hơn 24h |
| Hằng tuần | Smoke test toàn bộ infra | `./scripts/smoke-runtime.sh http://192.168.1.16:3100` |
| Hằng tuần | Review LOGIN_ANOMALY | `grep LOGIN_ANOMALY data/Library/Users/audit_log.json | tail -50` |
| Hằng tháng | Test restore (drill) | Mục 7.4 |
| Hằng quý | Đổi sys account password + 2FA secret | Settings → My Password + 2FA toggle |

### 9.2 Common errors & fixes

| Lỗi user thấy | Nguyên nhân | Cách fix |
|---|---|---|
| "Mất kết nối server" banner đỏ liên tục | Server không reachable | Ping IP server; check NSSM/launchd service status |
| `ERR_CONNECTION_REFUSED` ở client | Port 3100 chưa mở firewall | Mục 4.1 mở port |
| `ERR_CERT_AUTHORITY_INVALID` | HTTPS Caddy CA chưa trust trên client | Mục 8.1 trust CA |
| "Too many failed attempts" | Login fail 5+ lần | Đợi 5 phút HOẶC admin reset password |
| TOTP "Invalid code" liên tục | Đồng hồ máy lệch giờ > 30s | Settings OS → Date & Time → Set automatically |
| "Conflict — quote đã bị sửa bởi người khác" modal | 2 user cùng update 1 quote | Click "↻ Reload" để lấy bản mới (an toàn) |
| Tab trắng / chunk loading error | Cache cũ sau update | Cmd+Shift+R / Ctrl+Shift+R hard reload |
| Login từ IP mới toast vàng | User login từ máy khác | Bình thường nếu là user; suspicious nếu không phải họ → admin Revoke session |

### 9.3 Smoke test sau update

Sau mỗi lần update DMG/EXE, chạy smoke test:

```bash
./scripts/smoke-runtime.sh http://192.168.1.16:3100
# Pass: 8/8 green
```

Test endpoints: /health, /assets/*404, /api/events/stream auth, /api/users/status auth, /api/backup/list auth, /api/shared/admin/quotes-backend auth.

### 9.4 Deploy update

```
1. Tải DMG/EXE mới từ vendor
2. Notify users qua Slack/Teams: "Server sẽ restart trong 5 phút"
3. macOS: launchctl unload ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist
   Windows: nssm stop OpsControlServer
4. Cài đè app: drag DMG vào Applications / chạy installer Windows
5. Verify config persist: ~/Library/Application Support/ops-control-desktop/ops-control-config.json (macOS) hoặc %APPDATA%\ops-control-desktop\ops-control-config.json (Windows)
6. Restart service
7. Smoke test (mục 9.3)
8. Notify users: "Update xong, F5 / Cmd+R nếu thấy lỗi"
```

---

## 10. Phụ lục: Lệnh & Đường dẫn quan trọng

### 10.1 Đường dẫn chính

| Loại | macOS | Windows |
|---|---|---|
| App | `/Applications/Ops Control.app` | `%LOCALAPPDATA%\Programs\OpsControl` |
| Server source | `/Applications/Ops Control.app/Contents/Resources/app/server/` | `%LOCALAPPDATA%\Programs\OpsControl\resources\app\server\` |
| Data dir | `~/Library/Application Support/ops-control-desktop/data` | `%APPDATA%\ops-control-desktop\data` |
| Config | `~/Library/Application Support/ops-control-desktop/ops-control-config.json` | `%APPDATA%\ops-control-desktop\ops-control-config.json` |
| Logs | `~/Library/Logs/ops-control-desktop/main.log` | `%APPDATA%\ops-control-desktop\logs\main.log` |
| Audit log | `<data>/Library/Users/audit_log.json` | `<data>\Library\Users\audit_log.json` |
| Backups | `<data>/Backup & restore/Data/` + `<data>/Backup/SQLite/` | `<data>\Backup & restore\Data\` + `<data>\Backup\SQLite\` |

### 10.2 Lệnh cứu hộ nhanh

```bash
# Tail log realtime (macOS)
tail -f ~/Library/Logs/ops-control-desktop/main.log

# Stop server
launchctl unload ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist  # macOS
nssm stop OpsControlServer                                                # Windows

# Start server
launchctl load -w ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist  # macOS
nssm start OpsControlServer                                                # Windows

# Reset config về mặc định
rm ~/Library/Application\ Support/ops-control-desktop/ops-control-config.json   # macOS
del "%APPDATA%\ops-control-desktop\ops-control-config.json"                       # Windows

# Force-revoke all sessions (cần restart server)
# Stop service → start lại = clear in-memory sessions

# Reset 2FA cho TẤT CẢ user (last resort)
cd /Applications/Ops\ Control.app/Contents/Resources/app
ELECTRON_RUN_AS_NODE=1 /Applications/Ops\ Control.app/Contents/MacOS/Ops\ Control scripts/reset-totp.js
```

### 10.3 Environment variables (advanced)

| Env | Default | Purpose |
|---|---|---|
| `OPS_PORT` | 3100 | Server bind port |
| `OPS_DATA_BACKEND` | `sqlite` (đợt 5) | `sqlite` hoặc `file` |
| `OPS_BACKUP_SCHEDULE` | `1` (đợt 5) | Bật scheduled backup |
| `OPS_AUDIT_RETENTION` | `1` (đợt 5) | Bật audit rotation |
| `OPS_BACKUP_RETENTION_DAYS` | 30 | Số ngày giữ auto backup |
| `OPS_TOTP_KEY` | tự sinh | 64-hex AES key cho TOTP secrets (BACKUP NẾU MUỐN ROTATE) |
| `OPS_BACKUP_WEBHOOK` | (none) | Slack/Teams URL cho backup alert |
| `OPS_OFFSITE_TARGET` | (none) | rsync target cho off-site script |
| `OPS_OFFSITE_RETAIN` | 14 | Số ngày giữ off-site backup |

### 10.4 Tài liệu liên quan

- [LAN_DEPLOYMENT_GUIDE.md](LAN_DEPLOYMENT_GUIDE.md) — chi tiết kỹ thuật triển khai LAN
- [LAN_CLIENT_QUICKSTART.md](LAN_CLIENT_QUICKSTART.md) — 1 trang setup cho end-user
- [ENTERPRISE_HARDENING.md](ENTERPRISE_HARDENING.md) — IBM-style 3-2-1 backup roadmap
- [GO_LIVE_READINESS.md](GO_LIVE_READINESS.md) — P0/P1/P2 audit + risk register

### 10.5 Liên hệ hỗ trợ

| Tình huống | Liên hệ |
|---|---|
| Bug critical (server crash, data loss) | Henry Dang — NPI Manager |
| User onboarding | Internal IT/admin |
| Permission group config | Admin/sys role user |
| Backup/restore issue | Sys role user |

---

## ✅ Go-Live Checklist (in & sign)

Trước khi tuyên bố production:

**Infrastructure**
- [ ] Server hardware đáp ứng spec (mục 1.1)
- [ ] OS update + patch đầy đủ
- [ ] IP tĩnh đã set (mục 2.4 / 3.5)
- [ ] Firewall mở port 3100 (mục 4.1)
- [ ] Auto-start service enable (NSSM/launchd)
- [ ] App Nap disable (macOS chỉ)

**App config**
- [ ] Mode = `embedded` trên server
- [ ] Default Administrator password đã đổi
- [ ] OPS_TOTP_KEY đã backup file riêng (KHÔNG mất)
- [ ] OPS_DATA_BACKEND = sqlite (verify trong AboutSection)

**Users & Permissions**
- [ ] Tất cả user trong danh sách đã được tạo
- [ ] Tất cả admin/sys đã enroll 2FA
- [ ] Permission groups assign rõ ràng (không ai còn all_access trừ sys)
- [ ] User được hướng dẫn install + first-login (LAN_CLIENT_QUICKSTART.md)

**Backup**
- [ ] Auto daily backup chạy được 3+ ngày liên tiếp
- [ ] Off-site backup cron set + verify file đến đích
- [ ] Test restore drill thành công (mục 7.4)
- [ ] Backup webhook (Slack/Teams) optional config

**Security**
- [ ] HTTPS Caddy enable (nếu cần)
- [ ] Tất cả client trust CA cert (nếu HTTPS)
- [ ] Login anomaly verified (test login từ 2 IP cùng user → toast bật)
- [ ] Sessions admin tab tested (revoke session test user → verified họ bị logout)

**Documentation**
- [ ] Tài liệu này đã in + lưu trên server
- [ ] LAN_CLIENT_QUICKSTART.md đã share cho 5-20 user
- [ ] Số liên hệ ops/IT có trên app (Settings → About)

---

**Kết thúc tài liệu — Ops Control v1.2 sẵn sàng go-live cho 6-20 user trong LAN.**

*Henry Dang — NPI Manager · CCL Design Vietnam · 2026-04-27*
