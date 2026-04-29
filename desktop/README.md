# Ops Control — Desktop Shell (Electron)

Vỏ Electron đóng gói toàn bộ Ops Control v1.0 thành ứng dụng desktop chạy trên Windows + macOS, **không sửa code v1.0**.

## Quick start (dev)

Đứng ở thư mục `Ops Control v1.1/desktop/`:

```bash
# 1. Install với cache tránh root-owned files (xem bug log #1 trong SOLUTION_v1.1.md)
npm install --cache /tmp/npm-cache-ops --ignore-scripts

# 2. Tải Electron binary (skipped khi --ignore-scripts)
node node_modules/electron/install.js

# 3. Rebuild native modules cho Electron ABI
npx electron-builder install-app-deps

# 4. Build client UI (cần thiết cho mode embedded)
cd ../client && npm install --cache /tmp/npm-cache-ops --ignore-scripts && npm run build && cd ../desktop

# 5. Khởi chạy — LƯU Ý: phải unset ELECTRON_RUN_AS_NODE (VSCode set sẵn)
env -u ELECTRON_RUN_AS_NODE OPS_DESKTOP_MODE=embedded ./node_modules/.bin/electron .

# Hoặc thin mode trỏ về server v1.0:
env -u ELECTRON_RUN_AS_NODE OPS_DESKTOP_MODE=thin OPS_REMOTE_URL=http://10.102.3.61:3000 ./node_modules/.bin/electron .
```

Lưu ý:
- Server prod v1.0 thường chạy ở port 3000. Embedded server PoC tự pick port trong dải **3100-3199** (xem `findFreePort` trong `main.js`).
- `node-hid` dùng N-API prebuild, không cần rebuild cho Electron ABI.
- `--ignore-scripts` tránh gặp bug node-gyp trên Node 24+ (Python 3.12+ không còn `distutils`).

## 3 mode vận hành

| Mode | Khi nào dùng | Cấu hình |
|---|---|---|
| `embedded` | Single-user, demo, làm tại nhà | Server chạy in-process, DB ở `~/Library/Application Support/Ops Control/data/` |
| `thin` | Production nhà máy, mạng LAN ổn | UI gọi thẳng `http://10.102.3.61:3000` |
| `smart` | Phase 2 — offline + cache | Local cache SQLite + sync queue (xem `smart-client.js`) |

Đổi mode: env var `OPS_DESKTOP_MODE=<thin|embedded|smart>` hoặc Settings UI (Sprint 2).

## Build installer

```bash
npm run build:win        # Output: dist-electron/Ops-Control-Setup-1.1.0.exe
npm run build:mac        # Output: dist-electron/Ops-Control-1.1.0.dmg
npm run build:all        # Cả Windows + macOS
```

Build production cần:
- **Windows:** EV Code Signing Cert (Sectigo ~290 USD/năm). Đặt biến `CSC_LINK` + `CSC_KEY_PASSWORD` trước khi build.
- **macOS:** Apple Developer ID (99 USD/năm). Đặt `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` để notarize.

PoC build (chưa có cert) vẫn chạy được — Windows hiện cảnh báo SmartScreen "Unknown publisher", macOS yêu cầu Right-click → Open lần đầu.

## Cấu trúc thư mục

```
desktop/
├── main.js              ─ Main process: window/tray/menu + embedded server spawn
├── preload.js           ─ contextBridge → window.ops.* cho renderer
├── auto-update.js       ─ electron-updater wrapper
├── smart-client.js      ─ Sync engine (Tier 1 ↔ Tier 2)
├── license.js           ─ HW fingerprint + license check
├── native/
│   ├── index.js         ─ Bridge registry (load tất cả module dưới)
│   ├── printer.js       ─ pdf-to-printer (A4/A3 office)
│   ├── zebra.js         ─ ZPL/TSPL TCP:9100 raw socket
│   ├── scale.js         ─ serialport — cân điện tử RS232/USB
│   ├── scanner.js       ─ node-hid — barcode scanner Raw HID
│   ├── cache.js         ─ better-sqlite3 — local cache + outbox
│   └── fs.js            ─ Sandboxed file dialogs
├── build/
│   ├── installer.nsh    ─ NSIS custom (firewall, registry, defender whitelist)
│   ├── entitlements.mac.plist  ─ macOS hardened runtime entitlements
│   └── icon.{ico,icns,png}     ─ App icons (chưa add — TODO Sprint 4)
└── package.json         ─ Electron deps + electron-builder config
```

## Phần cứng được hỗ trợ

| Thiết bị | Giao thức | Module | Cần cài driver? |
|---|---|---|---|
| Zebra ZD/ZT/GX | ZPL qua TCP:9100 | built-in `net` | Không |
| TSC TTP/TE | TSPL qua TCP:9100 | built-in `net` | Không |
| Máy in A4/A3 | OS print spooler | `pdf-to-printer` | Driver Windows mặc định OK |
| Cân Mettler PB | RS232 9600 baud | `serialport` | USB-Serial driver (Prolific/FTDI) |
| Cân Ohaus | RS232 4800 baud | `serialport` | Như trên |
| Scanner USB-HID | Raw HID | `node-hid` | Không (HID generic) |
| Scanner USB-Keyboard | keydown wedge | `desktopBridge.js` fallback | Không |

## Test plan PoC

Trên máy dev (sau `npm install` + `npm start`):

1. **Boot smoke** — app mở < 5 s, login + TOTP vào được Cost module.
2. **Tray** — close window → app vẫn chạy (icon ở tray) → double-click tray → window mở lại.
3. **Native bridge** — mở DevTools console:
   ```js
   await window.ops.printer.list()         // [{ name, deviceId, ... }]
   await window.ops.labelPrinter.ping('192.168.1.50', 9100)
   await window.ops.scale.listPorts()      // [{ path, manufacturer, ... }]
   await window.ops.scanner.listDevices()  // HID devices
   ```
4. **Cache** — gọi `await window.ops.cache.set('foo', { bar: 1 })` rồi `get('foo')` → ra cùng object.
5. **Auto-update (chỉ trong build packaged)** — Help menu → "Kiểm tra cập nhật" → dialog hiển thị.
6. **License** — kiểm tra `<userData>/license.json` được tạo (trial 14 ngày) sau lần boot đầu.

## Wiring vào Ops Control v1.0

Trong code React của v1.0, import:

```js
import desktop from '@/services/desktopBridge';

if (desktop.isAvailable) {
  // chạy trong Electron — dùng native
  await desktop.labelPrinter.sendZpl('192.168.1.50', 9100, zplString);
} else {
  // chạy trong browser — fallback Web API
  await fetch('/api/print-zebra', { method: 'POST', body: zplString });
}
```

`desktop.scanner.listenKeyboardWedge(cb)` cho phép code 1 lần dùng được cả 2 mode (HID raw trong desktop, keyboard wedge trong web).

## Troubleshooting

| Symptom | Nguyên nhân | Cách fix |
|---|---|---|
| `better-sqlite3 not available — run electron-builder install-app-deps` | Native module chưa rebuild cho Electron ABI | `cd desktop && npm run postinstall` |
| Cân không trả weight | Wrong baud rate hoặc protocol | DevTools: `await window.ops.scale.read()` để xem raw data; chỉnh regex parser trong `native/scale.js` |
| Zebra timeout sau 5 s | Sai IP/port hoặc firewall block | `await window.ops.labelPrinter.ping(host, port)` để verify; kiểm tra firewall trên cả PC + máy in |
| App refuse to start sau update | asar integrity check fail | Restore từ backup, verify nguồn installer |
| macOS "App is damaged" | Notarization chưa pass hoặc Gatekeeper cache cũ | `xattr -cr "/Applications/Ops Control.app"` |

## Liên kết

- Chi tiết kiến trúc + lộ trình: [`SOLUTION_v1.1.md`](../SOLUTION_v1.1.md)
- Codebase v1.0: [`CLAUDE.md`](../CLAUDE.md)
- IT deployment guide: `docs/DESKTOP_DEPLOYMENT.md` (Sprint 5)
