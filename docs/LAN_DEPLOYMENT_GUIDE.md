# Ops Control — LAN Deployment Guide

**Bản dành cho:** Setup 1 máy chủ + 6 máy user trong cùng mạng LAN nội bộ
**Phiên bản:** 1.2.0 · **Cập nhật:** 2026-04-27
**Đối tượng:** Người không biết kỹ thuật cũng làm được — đọc xong tự setup

---

## Phần A — Tóm tắt nhanh (TL;DR)

```
┌─────────────────────────────────────┐
│  1 MÁY CHỦ (bất kỳ Mac/Win)         │
│  IP nội bộ ví dụ: 192.168.1.50      │
│  Chạy: Express server cổng 3000     │
│  Lưu: ops.db + Library/* JSON       │
└──────────────┬──────────────────────┘
               │ HTTP qua mạng LAN
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐  ┌─────────────┐  (... 6 máy user)
│  Máy user 1 │  │  Máy user 2 │
│  Mac hoặc   │  │  Mac hoặc   │
│  Windows    │  │  Windows    │
│  Cài DMG/   │  │  Cài DMG/   │
│  EXE Ops    │  │  EXE Ops    │
│  Control    │  │  Control    │
└─────────────┘  └─────────────┘
```

**Trong 60 phút anh sẽ có:** 6 máy chạy song song, đăng nhập riêng tài khoản, dữ liệu chung, lưu quote → các máy khác refresh thấy ngay.

---

## Phần B — KIỂM TRA TRƯỚC: Code có đảm bảo 6 máy chạy song song không?

**Câu trả lời ngắn:** ✅ **An toàn về dữ liệu** — 6 máy đọc/ghi cùng lúc KHÔNG bị mất hay corrupt data, có cơ chế chống xung đột.

### B.1 Bằng chứng audit (đã verify trong code)

| #   | Cơ chế                                                                                                                        | Có trong code?                        | Tác dụng                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **SQLite WAL mode** ([server/db/connection.js:47](../server/db/connection.js))                                                | ✅ `journal_mode = WAL`               | Nhiều reader cùng lúc, 1 writer tại 1 thời điểm — không corrupt         |
| 2   | **busy_timeout 5s**                                                                                                           | ✅ `busy_timeout = 5000`              | Writer #2 chờ 5s nếu writer #1 đang ghi, không fail                     |
| 3   | **Async mutex per resource** ([server/utils/asyncLock.js](../server/utils/asyncLock.js))                                      | ✅ `withLock(key, fn)`                | Serialize read-modify-write — không race condition                      |
| 4   | **Atomic file write** ([server/services/atomicWrite.js](../server/services/atomicWrite.js))                                   | ✅ `tmp + fsync + rename`             | File JSON Library/\* không bao giờ partial-write                        |
| 5   | **Optimistic locking trên quotes** ([server/repositories/quotesStore.js:228](../server/repositories/quotesStore.js))          | ✅ `_version` field                   | User A và B cùng sửa quote #5 → B nhận HTTP 409 → reload hoặc overwrite |
| 6   | **DB transactions** ([server/repositories/auditStore.js:111](../server/repositories/auditStore.js), quoteVersions, chatStore) | ✅ `db.transaction()`                 | Bulk insert atomic — all-or-nothing                                     |
| 7   | **Rate limit ghi** ([server/middleware/rateLimit.js:116](../server/middleware/rateLimit.js))                                  | ✅ `writeRateLimit + saveRateLimit`   | Chống user/script spam ghi quá 30/min                                   |
| 8   | **Server bind 0.0.0.0** ([server/index.js:717](../server/index.js))                                                           | ✅ `app.listen(PORT, '0.0.0.0', ...)` | Sẵn sàng accept LAN connection                                          |

### B.2 Real-time sync — TRUNG THỰC

**Hiện tại:** ⚠️ KHÔNG có push real-time cho data thường (chỉ chat dùng SSE).

| Loại data                                        | Cập nhật như thế nào?                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Chat messages                                    | ✅ **Real-time push** qua SSE (`text/event-stream`) — User B thấy tin User A trong < 1 giây |
| Dashboard KPI                                    | ⏱ **Auto-refresh 60s** ([Dashboard.jsx:87](../client/src/modules/cost/tabs/Dashboard.jsx))  |
| System Logs / online users                       | ⏱ **Auto-refresh 30s** ([Settings.jsx:537](../client/src/modules/cost/tabs/Settings.jsx))   |
| Quotes / RFQ Tracker / Sample Tracking / Library | ❌ **KHÔNG auto-refresh** — User B phải đóng/mở tab hoặc Cmd+R để thấy data User A vừa save |
| Approvals Inbox                                  | ⏱ Badge count refresh khi đổi tab; list không auto-refresh                                  |

**Hệ quả thực tế cho 6 user:**

✅ **Trường hợp KHÔNG có vấn đề:**

- 6 user mỗi người tạo/sửa quote KHÁC NHAU → không xung đột, dữ liệu OK
- User chat với nhau → real-time
- User mở Dashboard → 60s tự refresh

⚠️ **Trường hợp cần để ý:**

- 2 user cùng sửa quote #5 → B save → A save sau → A nhận HTTP 409 (conflict). A có 2 lựa chọn:
  - **Reload** (lấy bản B đã save, sửa tiếp) — KHUYẾN NGHỊ
  - **Overwrite** (đè lên bản B) — chỉ dùng nếu cố ý
- User A vừa thêm quote mới → User B đang ở QuoteHistory tab → KHÔNG tự thấy. B phải refresh tab hoặc reload.
- User A xoá row Library MaterialCost → User B đang xem cùng row → vẫn thấy cho đến khi B refresh.

### B.3 Khuyến nghị thực dụng cho 6-user team

**Workflow chống xung đột:**

1. Mỗi user tạo quote riêng theo prefix (e.g. user A: Q-A-001, user B: Q-B-001) — tránh ID đụng
2. Khi cần edit quote chung, dùng RFQ Tracker workflow (1 owner per RFQ)
3. Library admin (rate, machine_profiles) chỉ 1 user (admin) edit — user khác chỉ đọc
4. Bật **rate limit cao hơn** nếu cần (env `OPS_WRITE_RATE_MAX=60`)
5. Bật **multi-instance lock** nếu chạy multi-Node (`OPS_MULTI_INSTANCE=1`) — không cần cho single-server

**Với 6 user thực tế:** Setup đơn giản 1 server + 6 client → đủ ổn. Multi-instance chỉ cần khi scale > 50 user hoặc dùng PM2 cluster.

---

## Phần C — Setup MÁY CHỦ (chọn 1 trong 2 OS)

### C.1 macOS server setup

**Yêu cầu:**

- Mac (Intel hoặc Apple Silicon) — không cần cấu hình mạnh, 8 GB RAM đủ
- macOS 11 (Big Sur) trở lên
- Quyền admin

**Bước 1: Cài Node.js LTS** (~3 phút)

1. Mở Safari → vào https://nodejs.org/
2. Tải bản **LTS** (Long Term Support — số chẵn, ví dụ 20.x)
3. Mở file `.pkg` vừa tải → Continue → Continue → Install → nhập password admin
4. Verify: mở Terminal (Cmd+Space → "Terminal"), gõ:
   ```
   node --version
   ```
   Phải hiện `v20.x.x` hoặc cao hơn.

**Bước 2: Copy thư mục Ops Control vào server** (~5 phút)

1. Trên máy dev của anh, copy nguyên thư mục `Ops Control v1.2/` vào USB hoặc share LAN
2. Trên máy server, copy vào `~/ops-control/` (vd `/Users/admin/ops-control/`)
3. KHÔNG copy `node_modules/`, `dist-electron/`, `client/dist/` — sẽ rebuild

**Bước 3: Cài dependencies** (~5 phút)
Mở Terminal, chạy:

```bash
cd ~/ops-control
npm install --omit=dev
cd client && npm install && npm run build && cd ..
```

**Bước 4: Cấu hình môi trường** (~2 phút)
Tạo file `.env` trong `~/ops-control/`:

```bash
cat > ~/ops-control/.env << 'EOF'
NODE_ENV=production
PORT=3000
OPS_TOTP_KEY=PASTE_64_HEX_CHARS_HERE
OPS_ALLOW_SAME_ORIGIN=0
OPS_CORS_ORIGINS=http://192.168.1.0/24
EOF
```

Tạo `OPS_TOTP_KEY` (KHÓA QUAN TRỌNG, đừng đổi sau khi user đã enroll 2FA):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output 64 ký tự, paste thay `PASTE_64_HEX_CHARS_HERE` ở trên.

**Bước 5: Tìm IP LAN của server**

```bash
ipconfig getifaddr en0     # Wi-Fi
# hoặc
ipconfig getifaddr en1     # Ethernet
```

Ghi lại IP, vd `192.168.1.50`.

**Bước 6: Mở firewall cho port 3000**

1. System Settings → Network → Firewall → bật on (nếu chưa bật)
2. Firewall Options → "+" → chọn `node` từ `/usr/local/bin/node` → Allow incoming
3. Hoặc tạm thời tắt firewall trong LAN trusted

**Bước 7: Khởi động server thủ công (test)**

```bash
cd ~/ops-control
node server/index.js
```

Nếu thấy:

```
✅  production preflight passed: TOTP key set
🚀 Ops Control server running at http://localhost:3000
```

→ OK. Test bằng browser:

- Trên server: http://localhost:3000 → phải thấy login page
- Trên máy khác cùng LAN: http://192.168.1.50:3000 → phải thấy login page

**Bước 8: Cài auto-start (launchd) — chạy nền 24/7**

Tạo file `~/Library/LaunchAgents/com.ccldesign.opscontrol.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ccldesign.opscontrol</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/admin/ops-control/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/admin/ops-control</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>3000</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/admin/ops-control/logs/server.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/admin/ops-control/logs/server.err.log</string>
</dict>
</plist>
```

Thay `admin` bằng tên user thực tế. Tạo folder logs:

```bash
mkdir -p ~/ops-control/logs
```

Load launchd service:

```bash
launchctl load ~/Library/LaunchAgents/com.ccldesign.opscontrol.plist
launchctl start com.ccldesign.opscontrol
```

Verify:

```bash
curl http://localhost:3000/health
# Phải trả về: {"ok":true,"uptime_sec":...}
```

Sau bước này: server tự khởi động khi máy boot, tự restart nếu crash.

### C.2 Windows server setup

**Yêu cầu:**

- Windows 10/11 (Server edition cũng OK)
- 8 GB RAM
- Quyền admin

**Bước 1: Cài Node.js LTS** (~3 phút)

1. Mở Edge/Chrome → vào https://nodejs.org/
2. Tải bản **LTS** Windows Installer (.msi)
3. Chạy installer → Next → tick "Add to PATH" → Install
4. Verify trong Command Prompt:
   ```
   node --version
   ```

**Bước 2: Copy thư mục Ops Control** (~5 phút)
Copy `Ops Control v1.2/` vào `C:\ops-control\` (KHÔNG để dấu cách trong path).

**Bước 3: Cài dependencies** (~5 phút)
Mở **Command Prompt** (Admin), chạy:

```cmd
cd C:\ops-control
npm install --omit=dev
cd client && npm install && npm run build && cd ..
```

**Bước 4: Cấu hình môi trường**
Tạo file `C:\ops-control\.env`:

```
NODE_ENV=production
PORT=3000
OPS_TOTP_KEY=PASTE_64_HEX_CHARS_HERE
OPS_ALLOW_SAME_ORIGIN=0
OPS_CORS_ORIGINS=http://192.168.1.0/24
```

Tạo TOTP key (chạy trong cmd):

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Bước 5: Tìm IP LAN**

```cmd
ipconfig
```

Tìm dòng `IPv4 Address` của adapter Ethernet hoặc Wi-Fi, vd `192.168.1.50`.

**Bước 6: Mở firewall port 3000**
Mở PowerShell as Admin:

```powershell
New-NetFirewallRule -DisplayName "Ops Control 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**Bước 7: Test thủ công**

```cmd
cd C:\ops-control
node server\index.js
```

Verify cả localhost và LAN IP đều mở được http://192.168.1.50:3000 từ máy khác.

**Bước 8: Cài Windows Service qua NSSM (auto-start)**

Tải NSSM (Non-Sucking Service Manager — free):

1. https://nssm.cc/download → chọn latest stable → tải zip
2. Giải nén → copy `nssm.exe` (chọn x64) vào `C:\ops-control\`

Cài service (PowerShell Admin):

```powershell
cd C:\ops-control
.\nssm.exe install OpsControl
```

UI hiện lên, điền:

- **Path:** `C:\Program Files\nodejs\node.exe`
- **Startup directory:** `C:\ops-control`
- **Arguments:** `server\index.js`
- Tab **I/O:**
  - Output (stdout): `C:\ops-control\logs\server.log`
  - Error (stderr): `C:\ops-control\logs\server.err.log`
- Tab **Environment:**
  ```
  NODE_ENV=production
  PORT=3000
  ```
- Click **Install service**

Tạo folder logs + start:

```powershell
mkdir C:\ops-control\logs
nssm start OpsControl
```

Verify:

```powershell
curl http://localhost:3000/health
Get-Service OpsControl
```

Sau bước này: service tự khởi động khi Windows boot, tự restart nếu crash.

### C.3 Backup tự động trên server

Quan trọng: dữ liệu Ops Control nằm ở:

- `server/data/ops.db` (SQLite — quotes, audit, rfq, samples, materials, ifs_inventory, bom, routing)
- `server/data/Library/` (JSON files — Users, Permissions, MaterialCost, etc.)

**macOS: cron daily backup**

```bash
# Edit crontab
crontab -e

# Thêm dòng (backup mỗi ngày 2:00 AM):
0 2 * * * cd ~/ops-control && tar czf ~/ops-control-backups/backup-$(date +\%Y\%m\%d).tar.gz server/data/ && find ~/ops-control-backups/ -name "backup-*.tar.gz" -mtime +30 -delete
```

**Windows: Task Scheduler**

1. Task Scheduler → Create Task → Name: "Ops Control Backup"
2. Trigger: Daily at 2:00 AM
3. Action: PowerShell.exe with arguments:
   ```
   -Command "cd C:\ops-control; Compress-Archive -Path server\data\* -DestinationPath C:\ops-control-backups\backup-$(Get-Date -Format yyyyMMdd).zip; Get-ChildItem C:\ops-control-backups\backup-*.zip | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item"
   ```

---

## Phần D — Setup MÁY USER (6 máy)

### D.1 Cài Ops Control Desktop App

**macOS (Apple Silicon hoặc Intel):**

1. Vendor (anh) gửi cho mỗi user file `Ops Control-1.2.0-arm64.dmg` (hoặc `-x64.dmg` cho Mac Intel) qua:
   - File share LAN (`smb://192.168.1.50/share/`)
   - USB
   - AirDrop
2. User double-click DMG → drag `Ops Control v1.2.app` vào Applications
3. Mở từ Launchpad

**Windows:**

1. Vendor gửi `Ops-Control-Setup-1.2.0.exe`
2. User double-click → Next → Install
3. Mở từ Start Menu

### D.2 Cấu hình mode "thin" (gọi server LAN)

Lần đầu chạy app:

1. App mở mode `embedded` mặc định (chạy server local) — KHÔNG đúng ý cho team
2. Login bằng **Administrator / [password ban đầu]**
3. Vào **Settings → User → 🔁 Chế độ kết nối**
4. Chọn card **Thin (recommended)**
5. Nhập **Remote server URL:** `http://192.168.1.50:3000` (IP server thực tế)
6. Click **Áp dụng** → app sẽ hiện banner "Cần khởi động lại"
7. Click **↻ Khởi động lại app ngay**
8. App restart, login lại — giờ đã dùng server chung

### D.3 Tạo tài khoản user trên server

Trên server (chạy thủ công 1 lần):

```bash
cd ~/ops-control   # macOS
# hoặc cd C:\ops-control   trên Windows

# Reset admin password (in ra password mới):
OPS_TOTP_KEY=$(grep OPS_TOTP_KEY .env | cut -d= -f2) node scripts/reset-totp.js
```

Login bằng admin → Settings → System → Account Control → tạo 6 tài khoản user:

- Username: `nguyen.a`, `tran.b`, `le.c`, ...
- Password: tạm `User@2026`, force user đổi lần đầu
- Role: `user` (default — read/write tab cost, không xoá user khác)
- Department: chọn theo phòng ban
- Permission Group: chọn theo template (sales_default / cs_default / production_default / ...)

User login → bị yêu cầu đổi password lần đầu + enroll 2FA (scan QR bằng Google Authenticator).

### D.4 Verify multi-user OK

Test từ 2 máy:

1. Máy A: tạo 1 quote mới `Q-TEST-A`
2. Máy B: vào QuoteHistory → Click reload (refresh button) → thấy `Q-TEST-A`
3. Máy A: chat message tới máy B → máy B thấy real-time (< 1s)
4. Máy A: vào Dashboard → đợi 60s → tự refresh KPI

---

## Phần E — Multi-user behavior — Operator phải biết

### E.1 Khi 2 user cùng sửa 1 quote

Cảnh báo: **app sẽ báo lỗi 409 conflict** ở user save sau, KHÔNG silent overwrite.

User B sẽ thấy dialog đại ý:

> Quote này đã bị sửa bởi user khác (server v3, anh đang gửi v2).
> [Reload + sửa tiếp] [Overwrite (mất sửa của user khác)]

Khuyến nghị quy trình team:

- Mỗi quote có 1 owner (đừng share editing)
- Nếu thực sự cần handoff, chat trong app báo cho người kia "Tôi xong rồi, anh edit tiếp"

### E.2 Refresh data từ user khác

App KHÔNG auto-push data update (trừ chat). User muốn xem mới nhất:

| Tab             | Cách refresh                                          |
| --------------- | ----------------------------------------------------- |
| Quote History   | Click nút "Refresh" trên tab header, hoặc đóng/mở tab |
| RFQ Tracker     | Cmd+R (Mac) / Ctrl+R (Win) reload toàn app            |
| Sample Tracking | Reload                                                |
| Library tabs    | Reload                                                |
| Dashboard       | Tự auto-refresh 60s                                   |
| System Logs     | Tự auto-refresh 30s                                   |
| Online Users    | Tự auto-refresh 30s                                   |
| Chat            | Real-time (SSE)                                       |
| Approvals Inbox | Badge live; list reload khi đổi tab                   |

**Mẹo:** Vào Settings → Appearance → bật "Auto-refresh tabs every 30s" (nếu có — feature roadmap v1.3).

### E.3 Permission groups — phân quyền tab

Sys/admin tạo permission group cho mỗi role:

- `sales_default`: read RFQ + edit quote + chat. Hidden mode mới Library admin.
- `production_default`: read planning + edit RFQ. Hidden Pricing.
- `cs_default`: read everything, edit RFQ + Sample Tracking only.

Vào Settings → System → Account Control → Permission Groups → Duplicate seed → customize per-tab access.

---

## Phần F — Troubleshooting

### F.1 User không kết nối được tới server

```
Symptom: app báo "Cannot connect to http://192.168.1.50:3000"
```

Check theo thứ tự:

1. **Ping server từ máy user:**
   ```bash
   ping 192.168.1.50
   ```
   Nếu fail → vấn đề mạng LAN (router, switch, VLAN).
2. **Curl health endpoint:**
   ```bash
   curl http://192.168.1.50:3000/health
   ```
   Nếu timeout → firewall server chặn port 3000.
3. **Trên server, verify service đang chạy:**
   - macOS: `launchctl list | grep ops`
   - Windows: `Get-Service OpsControl`
4. **Restart service:**
   - macOS: `launchctl kickstart -k gui/$(id -u)/com.ccldesign.opscontrol`
   - Windows: `nssm restart OpsControl`

### F.2 Server crash + auto-restart

NSSM (Win) và launchd (Mac) tự restart sau crash. Check log:

- macOS: `~/ops-control/logs/server.err.log`
- Windows: `C:\ops-control\logs\server.err.log`

Nếu crash loop:

- Check disk full: `df -h` (Mac) / `Get-PSDrive C` (Win)
- Check `OPS_TOTP_KEY` trong `.env` đúng 64 hex chars
- Restore backup gần nhất

### F.3 SQLite "database is locked" error

Hiếm khi xảy ra (busy_timeout = 5s đã handle 99% case). Nếu thấy:

- Stop service
- Backup `ops.db`
- Run: `sqlite3 ops.db "PRAGMA integrity_check;"` — phải trả "ok"
- Nếu corrupt: restore từ backup gần nhất
- Start service

### F.4 User báo "Session expired" liên tục

Session TTL mặc định 8 giờ. Nếu user thấy expired sau 30 phút:

- Check `OPS_TOTP_KEY` trong `.env` — nếu đổi sau khi user enroll 2FA → tất cả 2FA broken → reset bằng `npm run reset-totp`
- Check disk full → server không persist được session
- Check system clock đồng bộ giữa server và client máy (NTP) — TOTP nhạy cảm thời gian

---

## Phần G — Performance ước lượng

Với 6 user concurrent:

| Operation               | Latency typical | Bottleneck                       |
| ----------------------- | --------------- | -------------------------------- |
| Login                   | 200-500 ms      | bcrypt hash 10 round + TOTP      |
| Save quote (small)      | 30-80 ms        | Lock acquire + atomic write JSON |
| Save quote (big, 50 KB) | 100-200 ms      | JSON serialize + fsync           |
| Read quote list         | 20-50 ms        | SQLite WAL read, no lock         |
| Library read            | 10-30 ms        | JSON file load + cache           |
| Concurrent 6 saves      | 200-1000 ms     | Mutex serialize → 6 in line      |

**Bottleneck thực:**

- SQLite: tốt cho ≤ 50 user concurrent. Trên đó cần PostgreSQL.
- JSON Library files: tốt cho < 1 MB/file. File quote_history.json > 5 MB sẽ chậm save (~500ms).
- 6 user → không có vấn đề performance.

---

## Phần H — Bảo mật

### H.1 Đã có sẵn (built-in)

- HTTPS internal: tạm thời chưa setup (chạy HTTP). Cần thì thêm reverse proxy (nginx/Caddy) front Express.
- Session cookies: HttpOnly + SameSite=Strict
- CSRF: double-submit token (Phase 9H.4)
- Bcrypt password hash + auto-upgrade legacy
- TOTP 2FA: bắt buộc cho role sys/admin
- Rate limit ghi: 30/min/IP
- Audit log: mọi save quote / approve / login attempt

### H.2 Cần làm thêm (production hardening)

1. **HTTPS via Caddy** (15 phút setup):

   ```bash
   # Mac (homebrew):
   brew install caddy
   sudo caddy run --config /etc/caddy/Caddyfile
   ```

   Caddyfile:

   ```
   ops.local {
     reverse_proxy localhost:3000
     tls internal
   }
   ```

   Mỗi user thêm `192.168.1.50  ops.local` vào /etc/hosts → truy cập `https://ops.local`.

2. **Firewall whitelist IP:** Chỉ cho 6 máy user IP cụ thể truy cập port 3000.

3. **Backup off-site:** Daily backup tự động sync sang NAS hoặc cloud (rclone).

4. **Disable user creation từ UI cho non-admin:** Đã có sẵn (role check).

---

## Phần I — Tổng kết checklist

Sau khi setup xong, tick từng item:

- [ ] Server chạy 24/7 (launchd / NSSM service active)
- [ ] `curl http://SERVER_IP:3000/health` từ máy user trả `{ok:true}`
- [ ] 6 user account đã tạo, mỗi user enroll 2FA + đổi password lần đầu
- [ ] Permission group đã gán theo role thực tế
- [ ] Daily backup cron / Task Scheduler chạy được
- [ ] Test 2 user cùng sửa 1 quote → 409 conflict báo đúng
- [ ] Test 6 user cùng login → tất cả vào được
- [ ] Test chat real-time giữa 2 user → < 1s
- [ ] Backup test: copy `server/data/` ra ngoài, verify mở lại được bằng app khác

Khi xong tất cả → production ready cho 6-user team.

---

**Liên hệ vendor (Henry Dang — NPI Manager, CCL Design):** [email] / [phone]
**Tài liệu liên quan:**

- [DESKTOP_DEPLOYMENT.md](DESKTOP_DEPLOYMENT.md) — IT GPO + Jamf push installer
- [INTERNAL_TRUST_SETUP.md](INTERNAL_TRUST_SETUP.md) — Free signing setup
- [SOLUTION_v1.2.md](../SOLUTION_v1.2.md) — Full v1.1+v1.2 changelog
