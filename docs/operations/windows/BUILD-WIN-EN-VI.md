> **STALE — describes v1.5.12, the repo is v1.6.0** (banner added 2026-09-16).
> The Windows build track has been paused since Sprint S-RELEASE-DAY1A (Q3a:
> Mac-only soft-launch), so these steps were last exercised against the
> 2026-06-09 go-live and have not been re-run since. Kept rather than deleted
> because S-WIN-PORT will need them — treat every version number, commit SHA
> and checklist item as needing re-verification before use, not as current.

# WIN-BUILD-KIT — Build the Windows installers (SERVER + CLIENT)

**Bản phát hành GO-LIVE FINAL · 2026-06-09**
**Final commit (main):** `c35d4a205938d24bba8bf4cbaf8f432c23bc0f65` (short `c35d4a2`)
**Mục tiêu / Goal:** dựng 2 file `.exe` NSIS từ ĐÚNG commit final, role-aware (SERVER + CLIENT).

> ⚠️ Máy Mac KHÔNG build được `.exe` (NSIS cần Wine). Vì vậy phải build trên **máy Windows**.
> Tài liệu này là cho **người vận hành trên máy Windows**. Làm tuần tự từ trên xuống.
>
> ⚠️ This machine (Mac) cannot produce the Windows `.exe` (NSIS needs Wine). Build on a
> **Windows machine** using the steps below, in order.

---

## 0) Yêu cầu máy Windows · Windows prerequisites

| Thành phần       | Phiên bản                                     | Link tải chính thức                                                           |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Windows          | 10 / 11 x64                                   | —                                                                             |
| Git for Windows  | mới nhất                                      | https://git-scm.com/download/win                                              |
| Node.js          | **24.x LTS** (khớp ABI Electron 41 → NMV 145) | https://nodejs.org/en/download (chọn **Windows Installer .msi, 64-bit, v24**) |
| Dung lượng trống | ≥ 6 GB                                        | —                                                                             |

Khi cài Node.js: **TICK** ô _"Automatically install the necessary tools…"_ (Chocolatey →
VS Build Tools + Python). Nếu không tick, native module (`better-sqlite3`) sẽ không
compile được. (Hoặc cài tay: **Visual Studio Build Tools 2022** với workload _"Desktop
development with C++"_ + **Python 3.x**.)

Kiểm tra sau khi cài (mở **PowerShell mới**):

```powershell
node -v      # phải in v24.x.x
npm -v
git --version
```

---

## 1) Lấy đúng source (final commit) · Get the exact source

> Dùng PowerShell. Tránh đường dẫn có **dấu cách** (Lesson 25 — node-gyp gãy makefile
> khi path có space). Build ở `C:\ops` cho gọn.

**Trường hợp A — chưa có repo trên máy:**

```powershell
cd C:\
git clone https://github.com/thiepdanghd82/Ops-Control.git ops
cd C:\ops
git fetch --all
git checkout main
git pull --ff-only
```

**Trường hợp B — đã có repo sẵn (pull cho mới):**

```powershell
cd C:\ops
git fetch --all --prune
git checkout main
git reset --hard origin/main
```

**BẮT BUỘC — chốt đúng commit final rồi xác minh:**

```powershell
git checkout c35d4a205938d24bba8bf4cbaf8f432c23bc0f65
git rev-parse HEAD
# => phải in: c35d4a205938d24bba8bf4cbaf8f432c23bc0f65
git log --oneline -1
# => c35d4a2 fix(security): DDL editor locked to admin/sys with audit + anti-clobber (#108)
```

Nếu SHA KHÁC → **DỪNG**, không build. Báo lại.

---

## 2) Cài dependencies · Install dependencies

> 3 lần install: root → client → desktop. `postinstall` của desktop sẽ tự chạy
> `electron-builder install-app-deps` → rebuild native module theo **ABI Electron 41
> (NMV 145)**. Đây là bước quan trọng nhất; xem Troubleshooting nếu lỗi.

```powershell
cd C:\ops

# (a) ROOT — runtime deps cho server nhúng + native argon2 (N-API prebuild)
npm install --omit=dev

# (b) CLIENT — cần devDeps (vite) để build bundle
cd C:\ops\client
npm install
npm run build          # sinh client\dist  (PDF worker patch chạy trong prebuild)

# (c) DESKTOP — electron + electron-builder + rebuild 4 native (better-sqlite3,
#     node-hid, serialport, @serialport) theo ABI 145
cd C:\ops\desktop
npm install
```

> 📌 **Ghi chú `--omit=dev` ở root:** ở Mac, `--omit=dev` làm rớt `docx` (một devDep)
> khiến bước sinh Word doc trong `client` prebuild **abort cả build**. Trên Windows,
> KIT này đã chỉnh `npm run build` ở (b) chỉ chạy sau khi root đã cài; nếu `npm run build`
> báo lỗi `Cannot find module 'docx'` → chạy `npm install docx --no-save` trong `C:\ops`
> rồi build lại, HOẶC bỏ qua doc-gen (xem Troubleshooting #4). File `.docx` đã build sẵn
> trong `client\public\help\` vẫn được đóng gói.

---

## 3) Build 2 installer (role-aware) · Build both role installers

> Script `scripts\build-windows-installers.mjs` tự: ghi `desktop\build-role.json`,
> swap NSIS include (`installer-server.nsh` ↔ `installer-client.nsh`), chạy
> electron-builder `--win nsis --x64 --config.npmRebuild=false`, rồi khôi phục trạng thái.
> Mặc định build CẢ HAI role.

```powershell
cd C:\ops
node scripts\build-windows-installers.mjs
```

Hoặc build riêng từng role:

```powershell
node scripts\build-windows-installers.mjs server
node scripts\build-windows-installers.mjs client
```

Kết quả nằm ở `C:\ops\desktop\dist-electron\`:

```
Ops Control SERVER Setup 1.5.12.exe
Ops Control CLIENT Setup 1.5.12.exe
```

> Nếu thấy `Preflight: native module overlay check...` rồi **FAIL** → một native chưa có
> overlay. ĐỪNG dùng `OPS_SKIP_NATIVE_OVERLAY_CHECK=1` cho bản final — báo lại để kiểm tra.

---

## 4) Verify từng EXE (5 mục) · Verify each installer

Xem file kèm theo: **`VERIFY-WIN-CHECKLIST.md`** (chi tiết từng lệnh). Tóm tắt 5 mục:

1. [ ] **SHA256 + size** mỗi file (`certutil -hashfile "<file>" SHA256`), ghi lại để đối chiếu Zalo.
2. [ ] **Role đúng trong asar**: giải nén `app.asar` (xem checklist) → `build-role.json`
       của bản SERVER phải `{"role":"server"}`, bản CLIENT `{"role":"client"}`.
3. [ ] **Native ABI 145 load OK**: `better-sqlite3` nạp được dưới Electron (lệnh trong checklist).
       `@serialport` đủ stack (kể cả `parser-readline`).
4. [ ] **IPC bridge** trong asar: có `ops:license.status` + `ops:license.fingerprint`;
       **KHÔNG** có `ops:license.applyFromFleet` (cái đó thuộc PR #105 chưa merge).
5. [ ] **Chạy thử**: cài bản CLIENT trên 1 máy test → mở app → màn login hiện;
       cài bản SERVER → daemon/app khởi động → `http://localhost:3000/health` trả `{"ok":true}`;
       `runtime-config` mặc định `planning:false, kiosk:false`.

Bất kỳ mục nào FAIL → **DỪNG**, không phát hành. Báo lại kèm log.

---

## 5) Bàn giao · Hand-off

- Copy 2 `.exe` + bảng SHA256 vào kênh phát hành (Zalo broadcast cho operators).
- Ghi rõ: **commit `c35d4a2`**, ngày build, người build, SHA256 từng file.
- Thứ tự phát hành từng máy: xem `RELEASE-CHECKLIST-1PAGE.md` (kèm theo).

---

## Troubleshooting — 5 lỗi build Windows hay gặp

**1. `gyp ERR! ... node-gyp` / `MSB...` khi `npm install` desktop.**
→ Thiếu VS Build Tools C++ hoặc Python. Cài **Visual Studio Build Tools 2022** +
workload _Desktop development with C++_ + Python 3. Mở **PowerShell mới** rồi
`cd C:\ops\desktop && npm install` lại. Đảm bảo path KHÔNG có dấu cách.

**2. `NODE_MODULE_VERSION mismatch` / app báo `ERR_DLOPEN_FAILED` khi chạy.**
→ Native build sai ABI. Chạy lại rebuild đúng Electron:

```powershell
cd C:\ops\desktop
npx electron-builder install-app-deps
```

Đối chiếu 2 bản binary phải GIỐNG hash (Lesson 28):

```powershell
certutil -hashfile "dist-electron\win-unpacked\resources\app\node_modules\better-sqlite3\build\Release\better_sqlite3.node" SHA256
certutil -hashfile "dist-electron\win-unpacked\resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node" SHA256
```

**3. PowerShell chặn script: `running scripts is disabled on this system`.**
→ Mở PowerShell **as Administrator** một lần:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

(npm/node không cần, nhưng một số postinstall `.ps1` thì cần.)

**4. `Cannot find module 'docx'` / `User Guide generator exited with code 1` khi build client.**
→ `docx` là devDep, bị `--omit=dev` ở root bỏ qua. Hoặc: `cd C:\ops && npm install docx --no-save`
rồi build lại; HOẶC sửa tạm `client\package.json` `prebuild` chỉ còn
`node ../scripts/patch-pdfjs-worker.mjs` (bỏ phần `build-all-docs.mjs`) — file `.docx`
trong `client\public\help\` vẫn đóng gói được. **KHÔNG commit** chỉnh tạm này.

**5. `electron-builder` lỗi tải Electron / `ECONNRESET` / chậm.**
→ Mạng/proxy. Đặt mirror rồi build lại:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node scripts\build-windows-installers.mjs
```

Hoặc xoá cache hỏng: `Remove-Item -Recurse -Force $env:LOCALAPPDATA\electron\Cache`.

**Bonus — đừng dùng nhầm script build cũ.** CHỈ dùng `scripts\build-windows-installers.mjs`
(role-aware). `build-desktop.sh` đã bị deprecate (PR #104) thành stub forward; trên Windows
nó không chạy (bash). KHÔNG có script `.bat`/`.ps1` build nào khác trong repo — nếu thấy,
đừng dùng.
