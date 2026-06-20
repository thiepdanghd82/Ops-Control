# Headless SERVER — chạy nền, tự khởi động cùng máy (macOS + Windows)

Đóng gói chế độ chạy Ops Control **SERVER không cần mở app**: chạy như dịch vụ
nền, tự bật khi máy khởi động (trước khi ai login), tự restart khi crash, không
cửa sổ.

> Operator-facing step-by-step (EN-VI): [`docs/INSTALL-SERVER-EN-VI.md`](../../docs/INSTALL-SERVER-EN-VI.md).
> File này mô tả **kiến trúc** cho người bảo trì.

## Kiến trúc chung (cả 2 OS)

| Khía cạnh    | Lựa chọn                                                                                                                      | Vì sao                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**  | Electron của app đã cài, chạy `ELECTRON_RUN_AS_NODE=1` trên `<app>/…/resources/app/server/index.js`                           | Không cần cài Node riêng; native module (better-sqlite3…) đã đúng ABI của Electron. Cùng `server/index.js` mà app embedded + deploy Linux dùng.                               |
| **Cổng**     | Cố định `3000` (`OPS_PORT`)                                                                                                   | Client LAN trỏ tới cổng ổn định. (App embedded dùng cổng động → không trỏ cố định được.)                                                                                      |
| **DATA_DIR** | **Hệ thống**, không theo user: `/Library/OpsControl/data` (mac) · `C:\ProgramData\OpsControl\data` (win)                      | Dịch vụ chạy **trước login** bằng root/SYSTEM. Thư mục `~/Library` của user **không đọc được pre-login khi bật FileVault**. Phải dùng thư mục hệ thống.                       |
| **Secrets**  | `server.env` (chmod 600 root / ACL admin) — `OPS_TOTP_KEY` `OPS_KIOSK_KEY` `OPS_EXPORT_HMAC_KEY` sinh 1 lần                   | Preflight production của server bắt buộc 3 khóa 64-hex. Sinh 1 lần, **không xoay** ở lần cài lại (tránh khóa user khỏi 2FA). KHÔNG nằm trong plist/task (chỉ trong file 600). |
| **License**  | `<DATA_DIR>/license.json` qua `OPS_LICENSE_FILE`                                                                              | `server/services/licenseService.js` chỉ verify **chữ ký** (không HW-recheck), nên copy thẳng license.json của app sang là chạy. Installer tự copy từ profile user nếu có.     |
| **Env khác** | `NODE_ENV=production`, `OPS_ALLOW_SAME_ORIGIN=1`, `OPS_DATA_BACKEND=sqlite`, `OPS_BACKUP_SCHEDULE=1`, `OPS_AUDIT_RETENTION=1` | Khớp y hệt env mà `desktop/main.js startEmbeddedServer()` set cho server.                                                                                                     |

## macOS — LaunchDaemon (`mac/`)

- `ops-server-install-daemon.command` — sinh `/Library/LaunchDaemons/com.opscontrol.server.plist`
  (`RunAtLoad` + `KeepAlive`), wrapper `/Library/OpsControl/run-server.sh`, `server.env`,
  log `/var/log/opscontrol/server.{out,err}.log`. Tự `exec sudo` + **in từng lệnh privileged**.
- `ops-server-{status,start,stop,uninstall}.command` — quản lý qua `launchctl bootstrap/bootout/kickstart`.
- `_common.sh` — path + helper dùng chung.

`KeepAlive=true` → launchd tự restart khi crash. `RunAtLoad=true` + LaunchDaemon → chạy lúc boot, trước login.

## Windows — Task Scheduler (`win/`)

**Vì sao Task Scheduler chứ không phải Windows Service "thật":** một tiến trình
Electron/node thuần **không nói giao thức SCM** (không báo `SERVICE_RUNNING`), nên
`sc create` trỏ thẳng vào nó sẽ bị SCM kill sau ~30s. Muốn là service thật phải
bọc bằng shim bên thứ ba (**nssm** / WinSW / **node-windows**) = **cài thêm**, trái
ràng buộc "không cần cài thêm thủ công". Task Scheduler **có sẵn trong Windows**,
chạy lúc **boot** bằng tài khoản **SYSTEM** (trước login), **tự restart khi lỗi**
(`RestartOnFailure` 999 lần / 1 phút), **chạy ẩn** (không cửa sổ) — đủ mọi yêu cầu,
zero cài thêm.

- `ops-server-install-service.bat` — tự xin UAC; chạy `setup-service-files.cjs`
  (qua Electron-as-node) để sinh `server.env` + `run-server.bat` + `OpsControlServer.xml`
  (boot trigger, SYSTEM, hidden, restart-on-failure); rồi `schtasks /Create /XML` + `/Run`.
  Log `C:\ProgramData\OpsControl\logs\server.{out,err}.log`.
- `status.bat` / `start.bat` / `stop.bat` / `uninstall.bat` — quản lý qua `schtasks`.
- `setup-service-files.cjs` — sinh file cấu hình bằng Node (tránh bẫy escaping `>>`/ngoặc của `.bat`).

> **Tùy chọn "service thật" bằng nssm:** nếu muốn quản lý kiểu `sc`/Services.msc,
> tải `nssm.exe` rồi: `nssm install OpsControlServer "C:\Program Files\Ops Control\Ops Control.exe" "…\server\index.js"`,
> `nssm set OpsControlServer AppEnvironmentExtra ELECTRON_RUN_AS_NODE=1 …` (kèm các khóa).
> Không kèm sẵn vì nssm là binary bên thứ ba.

## Di trú dữ liệu app embedded → dịch vụ nền

`migrate-datadir.cjs` (chạy qua Electron-as-node, cross-OS) được trình cài gọi khi
phát hiện DATA_DIR app cũ (`<userData>/data`):

1. **Copy nguyên trạng** cả thư mục (ops.db + `-wal`/`-shm` + `Library/` + `Backup/`)
   sang DATA_DIR hệ thống — yêu cầu app SERVER cũ đã **tắt hẳn**.
2. **Verify** từng file bằng **sha256** (copy faithful ⇒ row count chắc chắn khớp) +
   **bonus** đối chiếu row count các bảng (cũ == mới) nếu nạp được better-sqlite3.
3. Từ chối ghi đè nếu đích đã có `ops.db` (exit 3); fail nếu checksum/row-count lệch
   (exit 4/5). **Chỉ start daemon khi MIGRATE-OK.**

Sau migrate, trình cài **đổi tên DATA_DIR cũ** → `data.migrated-backup-<ts>` + đặt
`READ-ME-SERVER-MOVED.txt`. **Vì sao:** port-guard KHÔNG chặn app embedded (app dùng
cổng động, không đụng 3000) → nếu daemon tắt mà ai mở app SERVER, app sẽ ghi vào DB
cũ → phân kỳ. Đổi tên data cũ ⇒ app mở lại chỉ tạo DB rỗng (lỗi thấy ngay), không âm
thầm ghi DB cũ. Data cũ **giữ nguyên** dưới tên backup (không xóa).

## Guard chống chạy đôi

`server/index.js` bắt `EADDRINUSE` ở `listen()` → in thông báo rõ
"cổng N đang bận — Server đang chạy ở process khác" rồi `exit 1` (không dump stack,
không để hai writer cùng một DATA_DIR). Đây là thay đổi server-logic **duy nhất**.

## Kiểm thử đã chạy (trên máy build Mac, không cần sudo)

- ✅ Runtime dry-run: Electron-as-node chạy `server/index.js` với đúng env contract +
  license thật → `/health ok:true`, preflight production PASS, `DATA_DIR` đúng path,
  `ops.db` + `Library/` + `license.json` được tạo/đọc.
- ✅ Guard chạy đôi: instance thứ 2 trên cùng cổng → exit 1 + thông báo rõ.
- ✅ Migrate: copy DATA_DIR thật → verify checksum (0 sai khác) + row-count 17 bảng khớp
  → `MIGRATE-OK`; guard chống ghi đè đích đã có ops.db (exit 3); đổi tên data cũ thành công.
- ✅ `plutil -lint` plist OK; `xmllint` Task XML OK (UTF-16LE + BOM); `bash -n` mọi script; `node --check` helper.

Phần **cài đặt có quyền** (launchctl/schtasks) cần sudo/admin → Lead chạy theo
checklist trong `docs/INSTALL-SERVER-EN-VI.md` (môi trường build không có sudo
phi tương tác). Windows chưa test máy thật — xem checklist thủ công trong doc.
