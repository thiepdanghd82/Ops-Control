> **STALE — describes v1.5.12, the repo is v1.6.0** (banner added 2026-09-16).
> The Windows build track has been paused since Sprint S-RELEASE-DAY1A (Q3a:
> Mac-only soft-launch), so these steps were last exercised against the
> 2026-06-09 go-live and have not been re-run since. Kept rather than deleted
> because S-WIN-PORT will need them — treat every version number, commit SHA
> and checklist item as needing re-verification before use, not as current.

# VERIFY-WIN-CHECKLIST — kiểm tra 2 installer Windows sau khi build

> Chạy trên **máy Windows** (PowerShell) sau `node scripts\build-windows-installers.mjs`.
> Đây là bản **GO-LIVE FINAL** — KHÔNG tin nhãn file, verify từng mục. Bất kỳ mục FAIL → DỪNG.
>
> Tham chiếu: bản Mac đã verify y hệt 5 mục này và PASS toàn bộ (xem báo cáo Mac).
> Commit final: `c35d4a2`.

Artifacts cần verify:

```
C:\ops\desktop\dist-electron\Ops Control SERVER Setup 1.5.12.exe
C:\ops\desktop\dist-electron\Ops Control CLIENT Setup 1.5.12.exe
```

`asar` CLI dùng dưới đây: `npx --no-install @electron/asar` (đã có trong desktop deps).
Bản unpack để verify nằm ở `dist-electron\win-unpacked\` (build sau cùng) — nếu build cả 2
role, win-unpacked là role build SAU; để verify CHẮC từng role, build & verify lần lượt:
`node scripts\build-windows-installers.mjs server` → verify → rồi `... client` → verify.

---

## ✅ Mục 1 — SHA256 + size

```powershell
cd C:\ops\desktop\dist-electron
certutil -hashfile "Ops Control SERVER Setup 1.5.12.exe" SHA256
certutil -hashfile "Ops Control CLIENT Setup 1.5.12.exe" SHA256
Get-Item "Ops Control *.exe" | Select Name,Length
```

- [ ] Ghi lại 2 hash + size → đối chiếu khi broadcast Zalo.

## ✅ Mục 2 — Role đúng trong asar (per build)

```powershell
cd C:\ops\desktop
# build server trước:
node ..\scripts\build-windows-installers.mjs server
npx --no-install @electron/asar extract-file "dist-electron\win-unpacked\resources\app.asar" build-role.json
type build-role.json    # => {"role":"server"}; xoá file sau khi xem
del build-role.json
# rồi build client:
node ..\scripts\build-windows-installers.mjs client
npx --no-install @electron/asar extract-file "dist-electron\win-unpacked\resources\app.asar" build-role.json
type build-role.json    # => {"role":"client"}
del build-role.json
```

- [ ] SERVER build → `{"role":"server"}` · CLIENT build → `{"role":"client"}`.

## ✅ Mục 3 — Native ABI 145 + @serialport stack

**3a. Dual-binary hash khớp (Lesson 28):**

```powershell
$res = "dist-electron\win-unpacked\resources"
certutil -hashfile "$res\app\node_modules\better-sqlite3\build\Release\better_sqlite3.node" SHA256
certutil -hashfile "$res\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node" SHA256
```

- [ ] 2 hash **GIỐNG NHAU** (overlay outside-asar == asar.unpacked).

**3b. Load thật dưới Electron (ABI 145):**

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "dist-electron\win-unpacked\Ops Control.exe" -e "const D=require(process.cwd()+'/dist-electron/win-unpacked/resources/app/node_modules/better-sqlite3'); const db=new D(':memory:'); db.exec('create table t(x)'); console.log('OK NMV='+process.versions.modules+' electron='+process.versions.electron)"
Remove-Item Env:\ELECTRON_RUN_AS_NODE
```

- [ ] In `OK NMV=145 electron=41.3.0`.

**3c. @serialport đủ stack (kể cả parser-readline):**

```powershell
dir "$res\app\node_modules\@serialport"
```

- [ ] Có `bindings-cpp` + `parser-readline` (và các parser khác).

## ✅ Mục 4 — IPC bridge (license)

```powershell
npx --no-install @electron/asar extract-file "dist-electron\win-unpacked\resources\app.asar" preload.js
Select-String -Path preload.js -Pattern "ops:license.status","ops:license.fingerprint" | measure | % Count   # > 0
Select-String -Path preload.js -Pattern "invoke\('ops:license.applyFromFleet'\)" | measure | % Count          # = 0
del preload.js
```

- [ ] `ops:license.status` + `ops:license.fingerprint` CÓ.
- [ ] `invoke('ops:license.applyFromFleet')` = **0** (chỉ có 1 dòng COMMENT nhắc tới
      `applyFromFleet` là bình thường — đó KHÔNG phải handler; thuộc PR #105 chưa merge).

## ✅ Mục 5 — Chạy thử (smoke)

**5a. CLIENT:** cài `Ops Control CLIENT Setup 1.5.12.exe` trên 1 máy test → mở app →
hiện màn **login** (không trắng trang, không ERR_CONNECTION_REFUSED).

- [ ] Login screen hiện. (Chưa cần login thật — chỉ cần app khởi động sạch.)

**5b. SERVER:** cài `Ops Control SERVER Setup 1.5.12.exe` → mở app HOẶC chạy dịch vụ nền →

```powershell
curl http://localhost:3000/health
curl http://localhost:3000/api/runtime-config
```

- [ ] `/health` → `{"ok":true,...,"version":"1.5.12"}`.
- [ ] `/api/runtime-config` → `"planning":false,"kiosk":false` (alt_materials:true là đúng).

**5c. DDL gate (tùy chọn, nếu có user cost để test):** đăng nhập user role `cost` →
Settings → Library → **không thấy** tab Drop-Down Lists (đã khoá admin/sys). Hoặc curl
`POST /api/save-all` với `{"ddlSitesDB":...}` bằng session cost → **HTTP 403**
`"Chỉ admin/sys được sửa Drop-Down Lists"`.

- [ ] 403 enforced (đã verify trên bản Mac; server code y hệt).

---

### Kết luận

- [ ] **TẤT CẢ 5 mục PASS** cho cả 2 role → ghi hash vào `RELEASE-CHECKLIST-1PAGE.md` → phát hành.
- [ ] Bất kỳ mục **FAIL** → **DỪNG**, không phát hành, gửi log về để xử lý.
