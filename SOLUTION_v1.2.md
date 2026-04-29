# Ops Control v1.2 — Giải pháp & Lộ trình

**Phiên bản:** 1.2.0-draft
**Ngày soạn:** 27/04/2026
**Tác giả:** Henry Dang — NPI Manager (Solution Architect, cảm hứng IBM/SAP/IFS implementation patterns)
**Trạng thái:** 🚧 v1.2 fresh start — copy clean từ v1.1 production-ready (1.1.0 release notes giữ nguyên ở Section 9 + CHANGELOG). Chờ scope + roadmap mới cho v1.2.

**Base:** Inherits all v1.1 deliverables (Carbon Login UI + Hardware UI + Import UI + Smart-client cache + Native bridges + 30/30 tests + free signing). Xem [CHANGELOG.md](CHANGELOG.md) cho chi tiết v1.1 → v1.2 baseline.

**v1.2 candidate features** (chờ user define):
- [x] **Settings UI: Mode switcher (embedded/thin/smart)** ✅ Done — [ModeSection.jsx](client/src/modules/cost/tabs/ModeSection.jsx)
- [ ] Sprint 5 deployment: nginx update repo trên 10.102.3.61 + auto-update flow end-to-end
- [ ] Pilot rollout 3 máy + thu thập feedback
- [ ] Smart-client mode `smart` thực sự (Sprint 3 backend đã xong, frontend wire chưa — Mode UI cho phép pick nhưng app cần restart trong mode smart để engine khởi động)
- [ ] Bytenode IP compile (Sprint 4 — script đã viết, chưa apply vào release pipeline)
- [ ] Windows EXE build + sign + GPO push test
- [ ] _____ (anh fill thêm)

---

## v1.1 baseline (giữ nguyên)
**Khách hàng:** CCL Design Vietnam
**Domain:** Printing Industrial — Costing, Design, Process Development, Products Control, Warehouse Management

---

## 0. Tóm tắt điều hành

Ops Control v1.0 hiện đang chạy ổn định dạng web app trên server Windows nội bộ (`http://10.102.3.61:3000`) với 1.025 test pass, 79 module backend Node.js, 141 file React frontend, và database SQLite dung lượng ~129 MB. Đây là một codebase trưởng thành.

**Mục tiêu của v1.1:** đóng gói toàn bộ Ops Control thành ứng dụng desktop chạy trên Windows + macOS, **giữ nguyên 100% tính năng** của bản web hiện tại, đồng thời mở thêm khả năng tích hợp phần cứng đặc thù ngành in (máy in nhãn Zebra/TSC, cân điện tử, máy quét barcode, máy in A4/A3) và auto-update.

**Phương án kỹ thuật được chọn:** **Electron 33** + chế độ **3-tier smart client** lấy cảm hứng từ kiến trúc SAP GUI / IFS Aurena. Lý do tóm tắt: 79 file backend Node.js + native module `better-sqlite3` + `puppeteer-core` chỉ tương thích Electron; chuyển sang Tauri đòi hỏi viết lại toàn bộ backend bằng Rust (~6–9 tháng) và phá vỡ 1.025 test, không phải lựa chọn hợp lý.

**Tổng nỗ lực ước tính:** **5 tuần** cho 1 senior developer full-time, hoặc **8–10 tuần** cho 1 developer part-time. Chi phí phần mềm/license bổ sung: **0 USD/năm** (dùng self-signed Windows cert + GPO push + macOS ad-hoc sign — phù hợp deploy nội bộ; chi tiết xem section 6.1 + [docs/INTERNAL_TRUST_SETUP.md](docs/INTERNAL_TRUST_SETUP.md)).

**Khuyến nghị:** phê duyệt phương án Electron, triển khai theo lộ trình 5 sprint trong tài liệu này. Pilot 2–3 máy ở tuần 4, full rollout ở tuần 5.

---

## 1. Bối cảnh & hiện trạng

### 1.1 Codebase Ops Control v1.0

| Lớp | Công nghệ | Quy mô |
|---|---|---|
| Frontend | React 19 + Vite 8 + React Router 6 | 95 JSX, 46 JS, ~18 MB build |
| Backend | Node.js + Express 4 (ESM) | 79 module |
| Database | better-sqlite3 (`ops.db`) + JSON | ~129 MB DB, 4 thư mục dữ liệu |
| Auth | bcryptjs + TOTP/2FA, CSRF, RBAC | Có audit log, soft-delete, rate-limit |
| PDF/Office | puppeteer-core, docx, exceljs | Sinh quote/báo cáo PDF & DOCX |
| Tests | Jest + node:test | 1.025 test (560 server + 465 client) |

### 1.2 Mô hình triển khai hiện tại

Người dùng hiện chạy `START_SERVER.bat` (Windows) hoặc `START_SERVER.command` (macOS). Script này yêu cầu user **tự cài Node.js trước**, sau đó tự `npm install` và build, rồi mở browser tới `localhost:3000`. Có thêm một bản chạy trên server Windows từ xa `10.102.3.61:3000` cho team chung.

Vấn đề của mô hình hiện tại:

- User không kỹ thuật phải cài Node.js, mở terminal — rào cản cao.
- Không có icon double-click trên desktop.
- Không tích hợp được máy in nhãn, cân điện tử, scanner trong ngữ cảnh trình duyệt thường (Web USB/Web Serial bị giới hạn nặng).
- Không có cơ chế auto-update — mỗi lần update phải `git pull` + `npm install` + restart bằng tay.
- Không signed → SmartScreen Windows / Gatekeeper macOS có thể chặn khi user click.
- Code source nằm trần — IT của khách dễ copy mã công thức tính giá in (calcEngine, inkCalcCore, layoutOptimizer, printAreaCore — đây là IP cốt lõi).

### 1.3 Yêu cầu đã chốt với người dùng (ghi nhận từ phỏng vấn 27/04/2026)

| # | Yêu cầu | Giá trị anh đã chọn |
|---|---|---|
| R1 | Mô hình dữ liệu | 3-tier smart client kiểu IBM/SAP/IFS |
| R2 | Số máy trạm | 10–50 máy |
| R3 | Hardware integration | Máy in Zebra/TSC + cân + scanner + máy in A4/A3 |
| R4 | Offline-first | Có |
| R5 | Auto-update | Có |
| R6 | Bảo mật / chống copy code | Có |
| R7 | Hiệu năng + file cài nhẹ | Có (chấp nhận trade-off với offline + native) |

---

## 2. Phương án kỹ thuật

### 2.1 So sánh các phương án

| Tiêu chí | Electron 33 | Tauri 2 | NW.js | PWA |
|---|---|---|---|---|
| Tương thích codebase Node.js | ✅ Hoàn toàn | ❌ Phải viết lại Rust | ✅ Tương đương | ⚠ Browser sandbox |
| `better-sqlite3` native | ✅ | ❌ | ✅ | ❌ |
| `puppeteer-core` | ✅ | ⚠ Phức tạp | ✅ | ❌ |
| Hỗ trợ máy in/cân/scanner | ✅ Mạnh | ⚠ Cần Rust binding | ✅ | ❌ Web USB hạn chế |
| File installer | 70–90 MB | 5–10 MB | 100 MB | 0 (dùng browser) |
| RAM | 200–350 MB | 80–150 MB | 250 MB | Theo browser |
| Auto-update | electron-updater | tauri-plugin-updater | nw-builder thủ công | Service Worker |
| Code-signing | Mature | Mature | Mature | Không cần |
| Cộng đồng | Lớn nhất | Đang phát triển | Nhỏ dần | N/A |
| Học phí khi đã biết JS | Thấp | Trung bình (Rust) | Thấp | Thấp |
| **Phù hợp với Ops Control** | **★★★★★** | ★★ | ★★★ | ★ |

### 2.2 Quyết định kiến trúc — Electron 33 + Smart Client 3-Tier

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1 — PRESENTATION LAYER                                │
│  (Ops Control.exe / Ops Control.app)                        │
│                                                             │
│  ┌─ Electron Main Process (Node.js) ──────────────────┐     │
│  │  • Single-instance lock                            │     │
│  │  • Window/Tray/Menu management                     │     │
│  │  • Native bridges (Printer/Zebra/Scale/Scanner)    │     │
│  │  • Local cache (SQLite) + offline queue            │     │
│  │  • Auto-updater (electron-updater)                 │     │
│  │  • License/HW fingerprint (anti-piracy)            │     │
│  └────────────────┬───────────────────────────────────┘     │
│                   │ IPC (contextBridge)                     │
│  ┌────────────────▼───────────────────────────────────┐     │
│  │  Renderer Process (BrowserWindow)                  │     │
│  │  • React 19 UI (giữ nguyên 100%)                   │     │
│  │  • Truy cập native qua window.ops.*                │     │
│  │  • Fallback Web API khi chạy trong browser         │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (REST + future WebSocket)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 2 — APPLICATION LAYER                                 │
│  Express server tại 10.102.3.61 (giữ nguyên server/index.js)│
│  • REST API hiện hữu                                        │
│  • TOTP, RBAC, audit, rate-limit                            │
│  • Sync endpoint mới /api/sync/* cho smart client cache     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 3 — DATA LAYER                                        │
│  ops.db (SQLite master) + Library/* JSON                    │
│  Backup tự động hàng ngày (đã có sẵn)                        │
└─────────────────────────────────────────────────────────────┘
```

**Vì sao 3-tier?** Đây là pattern cổ điển của SAP R/3, IFS, Oracle E-Business. Tách presentation khỏi application logic giúp:

- Một thay đổi UI không phải redeploy backend.
- Một thay đổi backend (logic tính giá, bảng giá ink mới) không bắt user reinstall.
- Có thể update Tier 2 (app server) cho cả 50 máy chỉ bằng restart 1 server.
- Khi cần scale, chỉ cần load-balancer trước Tier 2, không phải distribute logic xuống từng client như mô hình "fat client" cũ.

### 2.3 Chế độ vận hành (mode)

App hỗ trợ ba chế độ — chuyển đổi qua Settings hoặc env var:

**Mode `embedded`** — Express server chạy in-process trong Electron, dữ liệu local trong `~/Library/Application Support/Ops Control/data/` (macOS) hoặc `%APPDATA%\Ops Control\data\` (Windows). Phù hợp cho user single-machine, demo, làm việc tại nhà.

**Mode `thin`** — Desktop chỉ là vỏ wrap UI, mọi API call đi về server `10.102.3.61:3000`. Tương đương "SAP GUI thin client" hoặc "IFS Aurena Web Client". Tất cả 50 máy share cùng 1 database — phù hợp môi trường nhà máy có mạng LAN ổn định.

**Mode `smart`** — Hybrid. Mỗi máy có cache SQLite local cho master data (Library, Products, Customers) đọc nhanh không cần round-trip. Write thì queue vào local, sync về master mỗi 30s hoặc khi user trigger. Khi mất mạng vẫn dùng được cache, sync lại khi có mạng. Tương đương "IFS Cloud Aurena offline-capable" hoặc SAP UI5 với local store.

Khuyến nghị mặc định: **mode `thin` cho production**, **mode `smart` cho phase 2** (sau 3 tháng). Mode `embedded` để debug / test nội bộ.

### 2.4 Bảo mật

**Lớp 1 — Code obfuscation:** dùng `bytenode` compile các file IP cốt lõi (`server/services/calcEngine.js`, `inkCalcCore.js`, `layoutOptimizer.js`, `printAreaCore.js`) thành V8 bytecode `.jsc`. Bytecode rất khó decompile và gắn với version Node cụ thể.

**Lớp 2 — Asar integrity:** đóng gói tất cả file JS vào `app.asar` với `--integrity` flag. Electron sẽ verify hash mỗi lần load — nếu user vá file, app refuse to start.

**Lớp 3 — Code signing:**
- Windows: mua EV Code Signing Cert (Sectigo ~290 USD/năm hoặc DigiCert ~470 USD/năm). Sign installer + autoupdate file. Loại bỏ cảnh báo SmartScreen.
- macOS: Apple Developer ID (99 USD/năm) + notarization. Tránh Gatekeeper chặn.

**Lớp 4 — Runtime hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox` cho renderer, CSP header chặn inline script, block navigation tới origin lạ.

**Lớp 5 — License manager:** bind mỗi cài đặt vào hardware fingerprint (CPU ID + first MAC + motherboard serial qua `node-machine-id`). License file ký HMAC-SHA256 lưu trong electron-store, expired check mỗi lần khởi động. Chống copy file installer cho công ty khác.

**Lớp 6 — Network security:** mọi traffic Tier 1 ↔ Tier 2 đi qua HTTPS với cert nội bộ (Let's Encrypt nếu có domain, hoặc self-signed cert pinned trong app). Token JWT/session HttpOnly + SameSite=Strict (đã có ở v1.0).

### 2.5 Auto-update

`electron-updater` polling endpoint `http://10.102.3.61/updates/latest.yml` mỗi lần app khởi động và mỗi 6h sau đó. Khi có version mới:

1. Download trong nền (không làm phiền user đang làm việc).
2. Khi xong, hiện toast notification "Phiên bản 1.1.3 đã sẵn sàng — Khởi động lại để cài đặt".
3. Nếu user chọn "Để sau", bản update sẽ tự cài khi user đóng app lần kế.
4. Rollback channel: nếu phát hiện bug nghiêm trọng, push file `latest.yml` chỉ về version cũ → app khởi động sẽ "downgrade" về version đó.

Về phía server, IT chạy script `desktop:build:win` + `desktop:build:mac` rồi `rsync` 3 file (`Ops-Control-Setup-1.1.x.exe`, `Ops-Control-1.1.x.dmg`, `latest.yml`) lên `/var/www/updates/` của nginx tại `10.102.3.61`.

### 2.6 Tích hợp phần cứng

| Thiết bị | Protocol | Thư viện | Ghi chú |
|---|---|---|---|
| Máy in nhãn Zebra | ZPL qua TCP:9100 | `net.Socket` (built-in) | Không cần driver |
| Máy in nhãn TSC | TSPL qua TCP:9100 | `net.Socket` (built-in) | Không cần driver |
| Máy in A4/A3 | Native | `pdf-to-printer` | SumatraPDF bundled cho Windows |
| Cân điện tử Mettler/Ohaus | RS232 / USB-Serial | `serialport` | 9600 baud mặc định |
| Scanner USB-HID | HID | `node-hid` | Auto-detect VID/PID |
| Scanner USB keyboard mode | Browser keydown | Không cần native | Như hiện tại |

**Lưu ý quan trọng:** `serialport` và `node-hid` cần native compilation cho từng OS/arch. `electron-builder` tự động rebuild khi đóng gói (`postinstall: electron-builder install-app-deps`). Trên macOS Apple Silicon cần build riêng arm64 + x64.

---

## 3. Lộ trình triển khai

### Sprint 1 — Wrapping & smoke test (Tuần 1, ~32h)

**Mục tiêu:** chạy được Ops Control v1.0 trong vỏ Electron trên máy dev, không sửa code v1.0.

| Task | Owner | Effort | Output |
|---|---|---|---|
| Setup folder `desktop/` + `package.json` | Dev | 2h | desktop/package.json |
| Viết `main.js` (window mgmt + Express embedded) | Dev | 6h | desktop/main.js |
| Viết `preload.js` + IPC contract | Dev | 4h | desktop/preload.js |
| `electron-builder.yml` cho dev build | Dev | 3h | build config |
| Test smoke trên Windows 11 + macOS Sonoma | QA | 4h | Demo video |
| Verify 12/12 self-test smoke checks pass trong Electron | QA | 4h | Test report |
| Fix issue phát sinh | Dev | 8h | — |
| Buffer / docs | — | 1h | — |

**Định nghĩa hoàn thành (DoD):**
- Double-click `Ops Control` icon → app mở trong < 5s
- Login bằng tài khoản thật + TOTP → vào được Cost module + Planning module
- Tạo + lưu được 1 quote test
- Đóng app → reopen → quote vẫn còn
- Không có DevTools warning về CSP / contextIsolation

### Sprint 2 — Native bridges (Tuần 2, ~36h)

**Mục tiêu:** Renderer gọi được printer / scanner / scale / Zebra qua `window.ops.*`.

| Task | Owner | Effort | Output |
|---|---|---|---|
| Native module: Zebra/TSC TCP raw | Dev | 4h | desktop/native/zebra.js |
| Native module: pdf-to-printer | Dev | 3h | desktop/native/printer.js |
| Native module: serialport scale | Dev | 5h | desktop/native/scale.js |
| Native module: node-hid scanner | Dev | 4h | desktop/native/scanner.js |
| Client service `desktopBridge.js` (fallback web/electron) | Dev | 3h | client/src/services/desktopBridge.js |
| UI: Settings tab "Thiết bị phần cứng" (chọn printer mặc định, COM port cân) | Dev | 6h | client UI |
| Test với máy in Zebra ZD420 thật + cân Mettler PB | QA + Operator | 6h | Test report + video |
| Fix bug | Dev | 4h | — |
| Docs | Dev | 1h | desktop/HARDWARE.md |

**DoD:**
- Print 1 nhãn ZPL ra Zebra qua app < 3s
- Cân Mettler hiển thị weight realtime trong UI ( < 500ms latency)
- Quét barcode bằng scanner USB-HID → tự fill vào field active

### Sprint 3 — Smart client cache + sync (Tuần 3, ~32h)

**Mục tiêu:** Mode `smart` hoạt động với offline read + write queue + sync.

| Task | Owner | Effort | Output |
|---|---|---|---|
| Schema cache SQLite local (subset master tables) | Dev | 4h | desktop/cache/schema.sql |
| Sync engine: pull master data theo `_saved_at` | Dev | 6h | desktop/smart-client.js |
| Write queue: mỗi action offline → enqueue → POST khi có mạng | Dev | 8h | — |
| Conflict resolution rule (last-write-wins + flag) | Dev | 4h | — |
| Backend: `/api/sync/pull?since=<ts>` + `/api/sync/push` | Dev | 6h | server/routes/sync.js |
| UI banner "Đang offline" / "Đang sync (3 changes)" | Dev | 3h | — |
| Test ngắt mạng giả lập | QA | 1h | — |

**DoD:**
- Tắt WiFi → app vẫn cho xem Library, tạo quote draft
- Bật lại WiFi → quote draft tự sync trong < 30s
- Kéo file ops.db từ master → cache local match 100%

### Sprint 4 — Bảo mật + đóng gói + ký số (Tuần 4, ~36h)

**Mục tiêu:** Có installer signed, chạy được trên máy clean Windows + macOS không cảnh báo.

| Task | Owner | Effort | Output |
|---|---|---|---|
| Bytenode compile 4 file IP (calcEngine, inkCalc, layout, printArea) | Dev | 5h | scripts/build-bytecode.js |
| asar integrity flag | Dev | 1h | builder config |
| Mua EV cert Sectigo + đặt trên build machine | Admin | 4h (queue) | .pfx file |
| Apple Developer ID + provisioning profile | Admin | 4h (queue) | .p12 + profile |
| `electron-builder` Windows NSIS + sign | Dev | 4h | dist/Ops-Control-Setup-1.1.0.exe |
| `electron-builder` macOS DMG + notarize | Dev | 6h | dist/Ops-Control-1.1.0.dmg |
| Hardware fingerprint + license check | Dev | 8h | desktop/license.js |
| Test installer trên Windows 10/11 sạch | QA | 2h | — |
| Test DMG trên macOS Intel + Apple Silicon | QA | 2h | — |

**DoD:**
- Cài `.exe` trên Windows 11 sạch → SmartScreen không cảnh báo "Unknown publisher"
- Cài `.dmg` trên macOS → Gatekeeper cho phép mở mà không cần "Right-click → Open"
- Sửa 1 byte trong asar → app refuse to start với log "integrity check failed"
- Decompile thử app.asar → 4 file IP là `.jsc` (V8 bytecode), không đọc được

### Sprint 5 — Auto-update + rollout (Tuần 5, ~24h)

**Mục tiêu:** Pilot 3 máy → full rollout 50 máy với auto-update server hoạt động.

| Task | Owner | Effort | Output |
|---|---|---|---|
| Setup nginx tại 10.102.3.61 phục vụ /updates/ | Admin | 2h | — |
| CI script: build + upload `latest.yml` + installer | Dev | 4h | scripts/release.sh |
| Telemetry (opt-in): gửi version + crash log về server | Dev | 4h | — |
| Pilot 3 máy: quan sát trong 3 ngày | QA + Pilot users | 6h spread | Daily report |
| Fix bug từ pilot | Dev | 6h | — |
| Full rollout: gửi installer cho IT công ty triển khai | Admin | 2h | Email + GPO/manual |

**DoD:**
- Pilot 3 máy chạy 72h không crash, không support ticket
- Push v1.1.1 lên `/updates/` → 3 máy pilot tự update trong < 24h
- 50 máy nhận installer + 90% cài thành công trong tuần đầu

### Tổng cộng

**160 giờ** cho 1 dev senior, **24 giờ** cho QA, **12 giờ** cho admin (mua cert + setup nginx). Tương đương **5 tuần calendar** với 1 dev full-time, hoặc **8–10 tuần** part-time.

---

## 4. Cấu trúc thư mục v1.1

```
Ops Control v1.1/
├── package.json                # Bumped: 1.0.0 → 1.1.0, thêm desktop:* scripts
├── client/                     # GIỮ NGUYÊN từ v1.0 (95 JSX + 46 JS)
│   └── src/services/
│       └── desktopBridge.js    # MỚI — fallback web/electron
├── server/                     # GIỮ NGUYÊN từ v1.0 (79 module)
│   └── routes/
│       └── sync.js             # MỚI — endpoint cho smart client (Sprint 3)
├── desktop/                    # MỚI — Electron shell
│   ├── package.json            # Electron deps + electron-builder config
│   ├── main.js                 # Main process (đã viết)
│   ├── preload.js              # IPC bridge (đã viết)
│   ├── auto-update.js          # electron-updater (đã viết)
│   ├── smart-client.js         # Sync engine (Sprint 3)
│   ├── license.js              # HW fingerprint + license check (Sprint 4)
│   ├── native/
│   │   ├── index.js            # Bridge registry (đã viết)
│   │   ├── printer.js          # pdf-to-printer (đã viết)
│   │   ├── zebra.js            # ZPL/TSPL TCP (đã viết)
│   │   ├── scale.js            # serialport (đã viết)
│   │   ├── scanner.js          # node-hid (Sprint 2)
│   │   ├── cache.js            # Local SQLite cache (Sprint 3)
│   │   └── fs.js               # Sandboxed file dialogs (Sprint 1)
│   ├── build/
│   │   ├── icon.ico            # 256x256 Windows icon
│   │   ├── icon.icns           # macOS icon
│   │   ├── icon.png            # Linux fallback
│   │   ├── tray.png
│   │   ├── installer.nsh       # NSIS custom install steps
│   │   └── entitlements.mac.plist
│   └── README.md               # Dev/IT guide
├── scripts/
│   ├── build-bytecode.js       # MỚI — bytenode compile IP files (Sprint 4)
│   └── release.sh              # MỚI — CI build + upload (Sprint 5)
│                               # (deploy/ đã xóa — superseded by docs/GO_LIVE_GUIDE.md + electron-builder DMG)
├── docs/                       # GIỮ NGUYÊN + bổ sung DESKTOP_DEPLOYMENT.md
├── CHANGELOG.md                # MỚI cho v1.1
├── SOLUTION_v1.1.md            # File này
└── README.md                   # Cập nhật
```

---

## 5. Ma trận rủi ro

| # | Rủi ro | Xác suất | Tác động | Cách giảm thiểu |
|---|---|---|---|---|
| R1 | better-sqlite3 native build fail trên máy CI | Trung bình | Cao | Dùng GitHub Actions matrix Windows + macOS, prebuilt binaries |
| R2 | Apple notarization từ chối | Thấp | Cao | Test sớm ở sprint 1 với 1 build dummy |
| R3 | EV cert ship chậm ( Sectigo có thể 1–2 tuần ) | Trung bình | Trung bình | Đặt cert ngay khi phê duyệt, không đợi đến sprint 4 |
| R4 | Native module conflict version giữa Electron và `better-sqlite3` | Trung bình | Cao | Pin versions trong package.json, dùng `@electron/rebuild` |
| R5 | User network nội bộ chặn `electron-updater` | Cao | Trung bình | Cho phép tự host trên 10.102.3.61, không cần internet |
| R6 | Cân điện tử mỗi hãng có protocol khác | Cao | Trung bình | Settings cho operator pick regex parser, ship sẵn 3-4 preset |
| R7 | User dùng Windows 7 (EOL) | Thấp | Trung bình | Electron 33 yêu cầu Win10+, communicate sớm với IT |
| R8 | Smart client conflict resolution sai → mất data | Thấp | Cao | Sprint 3: dùng last-write-wins + soft-delete (đã có sẵn) + audit log |

---

## 6. Chi phí

### 6.1 Chi phí phần mềm bên thứ ba (ngân sách năm)

**Phương án FREE (đã chọn — phù hợp deploy nội bộ 50 máy):**

| Khoản | Giải pháp | Chi phí | Ghi chú |
|---|---|---|---|
| Windows code signing | Self-signed cert + GPO Trusted Publishers push | **0 USD** | IT generate cert 1 lần (10 năm), push qua GPO 1 lần. Xem [docs/INTERNAL_TRUST_SETUP.md](docs/INTERNAL_TRUST_SETUP.md) |
| macOS code signing | Ad-hoc sign + IT-distributed (no quarantine) | **0 USD** | Distribute qua MDM/file share/USB → không có `com.apple.quarantine` → Gatekeeper không block |
| HTTPS internal | Self-signed CA hoặc IP literal `http://10.102.3.61` | **0 USD** | LAN nội bộ chấp nhận được |
| **Tổng FREE** | | **0 USD/năm** | |

**Phương án PAID (tham khảo — chỉ cần khi mở rộng phân phối public):**

| Khoản | Nhà cung cấp | Chi phí | Khi nào cần |
|---|---|---|---|
| EV Code Signing Cert | Sectigo | ~290 USD/năm | Bán Ops Control cho khách hàng B2B khác (ngoài CCL) |
| Apple Developer Program | Apple | 99 USD/năm | Distribute macOS app qua App Store hoặc gửi DMG qua email |
| Domain | — | ~12 USD/năm | Public-facing HTTPS endpoint |

Migration FREE → PAID không phá deploy hiện tại — xem section 5 của INTERNAL_TRUST_SETUP.md.

**Trade-off của phương án FREE:**
- ✗ User ngoài 50 máy GPO sẽ thấy SmartScreen warning (acceptable cho deploy nội bộ)
- ✗ User download macOS qua browser cần `xattr -cr` 1 lần (workflow IT bypass được hoàn toàn)
- ✓ Tiết kiệm 401 USD/năm
- ✓ Không phụ thuộc CA bên ngoài (Sectigo backlog có thể chậm 1-2 tuần)
- ✓ Cert key vendor tự kiểm soát — không lo CA leak

### 6.2 Chi phí nhân lực (tham khảo, không kèm fixed price)

| Vai trò | Effort | Ghi chú |
|---|---|---|
| Senior dev (full-time) | 5 tuần × 40h = 200h | Hoặc 10 tuần × 20h |
| QA | 24h spread 5 tuần | |
| IT/Admin (cert, deploy) | 12h | |

### 6.3 Chi phí phần cứng (đã có sẵn, không phát sinh)

Server `10.102.3.61` đã chạy v1.0 — tận dụng để serve auto-update qua nginx.

---

## 7. Tiêu chí nghiệm thu (UAT)

Sau Sprint 5, anh nghiệm thu khi đầy đủ các điểm sau:

1. Cài Ops Control trên 1 máy Windows 11 sạch và 1 máy macOS sạch, **không có cảnh báo SmartScreen / Gatekeeper**.
2. Login + TOTP + truy cập Cost + Planning module — **mọi tính năng v1.0 hoạt động giống nguyên bản**.
3. Print 1 nhãn ZPL ra máy Zebra trong < 3 giây.
4. Cân điện tử Mettler hiển thị weight realtime trong UI < 500ms latency.
5. Quét 1 barcode bằng scanner USB-HID → tự fill field.
6. Tắt mạng → app vẫn cho thao tác (mode smart). Bật lại mạng → sync trong < 30s.
7. Push version mới lên `/updates/` → 1 máy pilot tự update trong < 24h.
8. Decompile `app.asar` → 4 file IP cốt lõi (`calcEngine`, `inkCalcCore`, `layoutOptimizer`, `printAreaCore`) là `.jsc` bytecode.
9. Sửa 1 byte trong asar → app refuse to start.
10. Tài liệu `DESKTOP_DEPLOYMENT.md` ≥ 5 trang, IT công ty đọc và tự deploy được.

---

## 8. Quyết định cần anh phê duyệt

PoC đã viết xong **14/14 file Sprint 1–4** (~1.500 dòng code) trong `desktop/` + `client/src/services/desktopBridge.js`. Trước khi triển khai Sprint 3 backend (`server/routes/sync.js`) và Sprint 5 deployment, anh xác nhận giúp:

**Q1.** Đồng ý phương án **Electron 33** thay vì Tauri/PWA? (Khuyến nghị: ✅)

**Q2.** Đồng ý kiến trúc **3-tier smart client** với 3 mode (embedded / thin / smart)? (Khuyến nghị: ✅, default = `thin`)

**Q3.** Ngân sách ~400 USD/năm cho code-signing + Apple Developer có ổn không? Nếu không, ta có thể tạm bỏ qua signing trong PoC, chỉ ship signed cho production.

**Q4.** Lộ trình 5 sprint × 1 tuần (full-time dev) có khớp với deadline mong muốn của anh không? Nếu cần gấp hơn, ta có thể parallelize Sprint 2 + Sprint 3 (2 dev) để rút còn 3 tuần.

**Q5.** Có muốn pilot trước trên bộ phận nào cụ thể (Cost/Planning/Warehouse) thay vì pilot trên 3 máy ngẫu nhiên?

**Q6.** Có constraint gì về OS phía máy trạm? (Tất cả Win10+? Có máy macOS không? Có máy Windows 7 cũ cần support?)

**Q7.** License cho Ops Control: anh muốn HW-bind từng máy (chỉ chạy trên máy đã đăng ký) hay chỉ cần password protect?

---

## 9. Phụ lục — Tham chiếu

### 9.1 Files đã viết PoC (14/14 hoàn tất 27/04/2026)

**Sprint 1 — wrapping:**
- `desktop/package.json` ✅ — Electron 33 + electron-builder + native deps
- `desktop/main.js` ✅ — Main process, Express embedded, window/tray/menu
- `desktop/preload.js` ✅ — contextBridge `window.ops.*` API
- `desktop/native/index.js` ✅ — bridge registry (auto safe-load)
- `desktop/native/fs.js` ✅ — sandboxed file dialogs
- `desktop/auto-update.js` ✅ — electron-updater wrapper
- `desktop/build/installer.nsh` ✅ — NSIS firewall + registry + Defender
- `desktop/build/entitlements.mac.plist` ✅ — macOS hardened runtime
- `desktop/README.md` ✅ — dev/IT guide

**Sprint 2 — native bridges:**
- `desktop/native/zebra.js` ✅ — Zebra/TSC TCP:9100 raw socket
- `desktop/native/printer.js` ✅ — pdf-to-printer (A4/A3)
- `desktop/native/scale.js` ✅ — serialport cho cân điện tử
- `desktop/native/scanner.js` ✅ — node-hid USB barcode scanner
- `client/src/services/desktopBridge.js` ✅ — abstraction web/electron + keyboard wedge fallback

**Sprint 3 — smart client:**
- `desktop/native/cache.js` ✅ — better-sqlite3 local cache + outbox queue
- `desktop/smart-client.js` ✅ — sync engine (pull delta + push outbox + ping online)

**Sprint 4 — bảo mật:**
- `desktop/license.js` ✅ — HW fingerprint + signed license + trial 14 ngày

**Sprint 1.1 — data migration UI (added 2026-04-27):**
- `desktop/native/import.js` ✅ — IPC handler `ops:import.{pickFolder,scanFolder,execute}` (245 dòng — validate source, skip Users+totp+audit_log, backup ops.db, recursive copy, **schema validation v2 với better-sqlite3 peek 5 REQUIRED_TABLES**)
- `client/src/modules/cost/tabs/ImportLegacySection.jsx` ✅ — UI 3-step (pick folder → scan preview với table → execute + restart prompt). 230 dòng React + 180 dòng CSS, **block button + warning tag ⚠ SCHEMA INVALID nếu thiếu tables**
- Mounted vào Settings → Maintenance → "📥 Import data v1.0" (admin-only)
- Backup `ops.db.before-import-<timestamp>` trước mỗi import

**Sprint 1.2 — Login UI Carbon redesign (added 2026-04-27):**
- `client/src/components/Auth/LoginPage.jsx` (refactored — giữ NGUYÊN logic + state, đổi structure)
- `client/src/components/Auth/LoginPage.css` (+260 dòng `.cb-*` classes)
- Split-screen layout (IBM Carbon + IFS Cloud + SAP Fiori inspired): hero đen bên trái + form Carbon-style bên phải
- 3 screens cùng style: Login / TOTP verify / TOTP enrollment
- Compact mode (session-expired modal) hide hero + full-width card
- Responsive < 880px: collapse single-column
- Dark mode auto-switch
- 100% logic giữ nguyên: TOTP auto-submit, change-pwd inline, pwdAge debounced fetch, i18n VN/EN, Remember me, last-username localStorage prefill, Enter key submit, ARIA roles

### 9.2 Files chưa cần PoC (Sprint 3-5 backend + ops)

Các file dưới đây nằm phía Tier 2 / CI / docs, không nằm trong PoC desktop. Sẽ viết khi triển khai sprint tương ứng:

- `server/routes/sync.js` — endpoints `/api/sync/pull` + `/api/sync/push` (Sprint 3 backend)
- `scripts/build-bytecode.js` — bytenode compile 4 file IP (Sprint 4)
- `scripts/release.sh` — CI build + rsync upload `/updates/` (Sprint 5)
- `docs/DESKTOP_DEPLOYMENT.md` — IT deployment guide (Sprint 5)

### 9.3 Wiring đã hoàn tất (2026-04-27 16:40)

`desktop/main.js` đã wire xong:
- Top: `require('./license.js')` + `require('./smart-client.js')`
- `app.whenReady`: gọi `license.register(ipcMain)`, boot probe khi `app.isPackaged`, start smart-client khi `mode === 'smart'`
- `before-quit`: gọi `smartClient.stop()` để dừng poll timers

### 9.4 Bug log smoke test (2026-04-27)

Trong quá trình chạy PoC end-to-end đã gặp + fix 8 bug:

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | npm install `EACCES /Users/thiepdt/.npm/_cacache` | Cache cũ chứa root-owned files | Dùng `--cache /tmp/npm-cache-ops` |
| 2 | node-gyp `ModuleNotFoundError: distutils` | Python 3.13 đã remove `distutils` khỏi stdlib, node-gyp 9.4.1 chưa update | `pip install setuptools` (vẫn không tự inject — phải dùng workaround #3) |
| 3 | better-sqlite3 build fail rồi node-hid build fail vì path có space | clang++ không escape path khi gọi từ make | `npm install --ignore-scripts` rồi `electron-builder install-app-deps` cho better-sqlite3 + serialport (NAPI prebuild của node-hid dùng được luôn không cần rebuild) |
| 4 | `Electron failed to install correctly` | `--ignore-scripts` skip cả `node install.js` của electron module | Chạy `node install.js` thủ công trong `node_modules/electron/` để fetch binary 150MB |
| 5 | `electron-store@10` `ERR_REQUIRE_ESM` | electron-store v10 chuyển pure ESM, main.js dùng CommonJS | Downgrade về `electron-store@^8.2.0` + bỏ `.default` ở require |
| 6 | `electron-updater Cannot read getVersion of undefined` | electron-updater v6 init eager khi require, app chưa ready | Defer require qua `getAutoUpdater()` lazy getter trong `auto-update.js` |
| 7 | `app.requestSingleInstanceLock is undefined` | Shell có sẵn `ELECTRON_RUN_AS_NODE=1` (VSCode inject) → mọi Electron binary chạy như Node thuần | `env -u ELECTRON_RUN_AS_NODE` khi launch (hoặc unset trong launch script) |
| 8 | `EADDRINUSE port 3000` | Server v1.0 đã listen `*:3000`, findFreePort kiểm tra `127.0.0.1` thay vì `0.0.0.0` nên báo "free" sai | Đổi findFreePort sang test bind `0.0.0.0`, range mặc định 3100–3199 |
| 9 | `node-gyp space-path crash khi electron-builder rebuild x64` | clang++ không escape path có space khi gọi từ make | Build trong `/tmp/ops-build/` (no spaces); chỉ build arm64 nếu host arm64 |
| 10 | electron-builder copy `node_modules/.bin` symlinks bị materialize → bin invalid | `cp -r` không follow symlinks chuẩn | Fresh `npm install` trong `/tmp/ops-build/desktop/` |
| 11 | Built app version vẫn `1.0.0` | desktop/package.json chưa bump | Bump → `1.1.0` |
| 12 | Built `.app` bị Gatekeeper kill silent | DMG unsigned (PoC) → ad-hoc sign vẫn cần entitlements | `codesign --force --deep --sign - <app>` + `xattr -cr <app>` để clear quarantine |
| 13 | Server spawn fail `import statement outside a module` | Bundle thiếu parent package.json với `"type": "module"` | Thêm `from: ../package.json, to: app/package.json` vào extraResources |
| 14 | Server's `better-sqlite3` không có `.node` binary | Native chưa rebuild cho Electron Node ABI | `electron-rebuild --module-dir /tmp/ops-build --only better-sqlite3 --arch arm64` |
| 15 | EPIPE crash khi launch built app từ Finder | electron-log console transport ghi vào stdout, mà stdout pipe đóng khi launched từ LaunchServices | Disable console transport khi `app.isPackaged` + add stdout/stderr error handler + uncaughtException guard |
| 16 | `cache.test.js` báo "incompatible architecture x86_64 / need arm64" | better-sqlite3 binary còn lại từ build x64 attempt trước | `electron-rebuild --only better-sqlite3 --arch arm64` trong desktop/ |
| 17 | `sign-macos.sh` crash: `app…: unbound variable` | `set -u` + Unicode `…` (U+2026) ngay sau `$app` → bash misparse tên biến | Đổi `…` thành ASCII `...` trong tất cả script bash dùng `set -u` |
| 18 | TOTP enroll trả 500 "Unknown cipher" | Server dùng `chacha20-poly1305` cipher, mà Electron 33's bundled Node 20 dùng BoringSSL không có cipher này | Đổi 6 vị trí trong `server/services/authService.js` từ `chacha20-poly1305` → `aes-256-gcm` (universal, security tương đương). Hot-patch áp được cho cả app đã cài (sed in-place trong app.asar resources) |
| 19 | Dashboard "database_shape_mismatch" → "no such table: quotes" | User pick folder Import có ops.db chỉ chứa 4 chat tables (backup chat-only) thay vì full 14 tables (quotes/materials/ifs_inventory...) | (a) Restore từ `Ops Control/server/data/ops.db` trực tiếp; (b) Improve `desktop/native/import.js` scan: peek sqlite_master, check 5 REQUIRED_TABLES (quotes/materials/ifs_inventory/bom/routing_operations), trả `schemaValid: false` + `missingCoreTables` nếu thiếu; (c) UI block button "Bắt đầu import" + warning tag "⚠ SCHEMA INVALID" + ghi chi tiết tables thiếu |

### 9.5 Smoke test results

```
[main] APP_ROOT: .../Ops Control v1.1/
[main] mode: embedded
[native] Bridges registered                 ← 25/25 IPC handlers ✓
[main] Starting embedded server on port 3100
[server] ✅  production preflight passed
[server] 🔐  TOTP boot probe OK
[server] 🚀 Ops Control server running at http://localhost:3100
[main] Embedded server ready in 231 ms
[main] Loading URL: http://127.0.0.1:3100
[server] GET /health  200
[server] GET /        200
[server] GET /theme-init.js   200
[server] GET /login-bg.jpg    200          ← UI render OK ✓

# Module probes (riêng biệt):
Cache:    KV roundtrip ✓ | master_cache 2 rows ✓ | outbox 2→1 after markDone ✓ | sync_state ✓
License:  HW fingerprint sha256 64 hex ✓ | trial 14d issued ✓ | bad-signature rejected ✓ | valid signed accepted ✓
Bridges:  25/25 IPC handlers register OK ✓
Sync API: /api/sync/manifest mounted (401 auth required) ✓
```

Tổng boot time: **270 ms** (start → window load). Đáp ứng DoD Sprint 1 (< 5s).

### 9.3 Tham chiếu external

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- electron-builder documentation: https://www.electron.build/
- electron-updater publish providers: https://www.electron.build/auto-update
- pdf-to-printer: https://github.com/artiebits/pdf-to-printer
- node-serialport: https://serialport.io/
- node-hid: https://github.com/node-hid/node-hid
- bytenode: https://github.com/bytenode/bytenode

---

**— Hết tài liệu —**

> Sau khi anh phê duyệt (hoặc yêu cầu chỉnh sửa) tài liệu này, tôi sẽ tiếp tục Sprint 1 → Sprint 5 theo lộ trình. Nếu có câu hỏi nào trong Section 8, cứ trả lời từng câu một, tôi sẽ điều chỉnh kế hoạch ngay.
