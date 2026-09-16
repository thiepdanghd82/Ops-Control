> **STALE — describes v1.5.12, the repo is v1.6.0** (banner added 2026-09-16).
> The Windows build track has been paused since Sprint S-RELEASE-DAY1A (Q3a:
> Mac-only soft-launch), so these steps were last exercised against the
> 2026-06-09 go-live and have not been re-run since. Kept rather than deleted
> because S-WIN-PORT will need them — treat every version number, commit SHA
> and checklist item as needing re-verification before use, not as current.

# GO-LIVE RELEASE CHECKLIST — Ops Control 1.5.12 (1 trang)

**Ngày go-live:** 2026-06-09 · **Commit:** `c35d4a2` · **Topology:** 1 SERVER + N CLIENT (LAN)
**Nguồn:** `docs/INSTALL-SERVER-EN-VI.md` + `docs/cutover/MAC_INSTALL_GUIDE.md`

> Nguyên tắc vàng: **SERVER lên trước (migrate dữ liệu) → rồi CLIENT → license sau cùng.**
> Mỗi máy chỉ một role. KHÔNG mở app SERVER windowed song song với dịch vụ nền (đụng SQLite).

---

## A. SHA256 phát hành (điền sau khi có cả Mac + Win)

| File                                      | SHA256                                                             | Size        |
| ----------------------------------------- | ------------------------------------------------------------------ | ----------- |
| Ops Control SERVER 1.5.12-arm64.dmg (Mac) | `45651434c5e302b661538679f577120baf55ca2ee7acdb287b6f94b163d420cc` | 154,356,362 |
| Ops Control CLIENT 1.5.12-arm64.dmg (Mac) | `82a34cc30b7872ad80349970e4dca94f47eed7ff48d568667fe801b9d2a10f80` | 154,356,395 |
| Ops Control SERVER Setup 1.5.12.exe (Win) | _điền sau khi build trên máy Win_                                  | _…_         |
| Ops Control CLIENT Setup 1.5.12.exe (Win) | _điền sau khi build trên máy Win_                                  | _…_         |

Broadcast 4 hash này lên Zalo; operator tự `certutil -hashfile` / `shasum -a 256` đối chiếu trước khi cài.

---

## B. Bước 1 — Máy SERVER (làm TRƯỚC, 1 máy duy nhất)

1. [ ] Báo operators **tạm dừng** vài phút.
2. [ ] **Thoát HẲN** app Ops Control cũ trên máy SERVER (Cmd+Q / Quit; chắc chắn không còn tiến trình).
3. [ ] Cài bản **SERVER** mới: Mac kéo `.app` vào `/Applications` (Gatekeeper: chuột phải → Open);
       Win chạy `Ops Control SERVER Setup 1.5.12.exe`.
4. [ ] Chạy **dịch vụ nền + di trú dữ liệu**:
   - Mac: `scripts/headless/mac/ops-server-install-daemon.command` (xin sudo).
   - Win: `scripts\headless\win\ops-server-install-service.bat` (Run as Administrator).
   - Khi hỏi **migrate** → thoát app cũ rồi gõ **y**. Chờ `MIGRATE-OK` + `row-count verify OK`.
   - Nếu verify **FAIL**: daemon KHÔNG start, data cũ giữ nguyên → DỪNG, báo lại.
5. [ ] `curl http://localhost:3000/health` → `{"ok":true,...,"version":"1.5.12"}`.
6. [ ] `curl http://localhost:3000/api/runtime-config` → `planning:false, kiosk:false`.
7. [ ] Mở thử 1–2 quote cũ → số liệu đúng (calcEngine không đổi → giá khớp bản cũ).
8. [ ] Ghi lại **IP LAN** máy SERVER (Mac `ipconfig getifaddr en0`; Win `ipconfig`).
9. [ ] **TỪ NAY chỉ dùng dịch vụ nền** — không mở app SERVER windowed nữa.

## C. Bước 2 — Mỗi máy CLIENT (sau khi SERVER xanh)

1. [ ] Cài bản **CLIENT**: Mac kéo `.app` vào `/Applications`; Win `Ops Control CLIENT Setup 1.5.12.exe`.
2. [ ] Mở app → wizard hỏi địa chỉ SERVER → nhập `http://<IP-SERVER>:3000`.
3. [ ] Màn **login** hiện (không trắng trang). Đăng nhập bằng tài khoản + temp pwd (Provisioning Card).
4. [ ] Enroll **TOTP** (quét QR) nếu được yêu cầu; đổi mật khẩu lần đầu.
5. [ ] Mở 1 tab Pricing → tạo thử 1 quote nháp → lưu OK (xác nhận client ↔ server thông).

## D. Bước 3 — License (sau cùng, nếu máy báo cần)

1. [ ] Nếu app báo **License Invalid / chưa có license**: lấy **Installation ID** trong app
       (About/Diagnostics) → gửi Lead qua Zalo.
2. [ ] Lead mint `.lic`/`license.json` offline (khóa ký pubkey fp `044e1ad7…`, đã xoay vòng PR #105)
       → gửi lại → operator dán vào app HOẶC copy vào DATA_DIR license path.
3. [ ] App/diagnostics: **License status = xanh**, **HW fingerprint** khớp.

---

## E. Rào chắn / nếu sự cố

- [ ] Rollback: theo `docs` "Bad deploy — need to roll back" (Mac/Win) — snapshot `releases\<ts>\`.
- [ ] Data mất sau restore: nightly SQLite backup tại `DATA_DIR/Backup/`.
- [ ] KHÔNG xoay `OPS_TOTP_KEY` / `OPS_EXPORT_HMAC_KEY` / `LICENSE_PUBKEY` / `OPS_KIOSK_KEY` —
      deploy script tự giữ; xoay nhầm = lockout/license-invalid hàng loạt.
- [ ] Escalation: +84965191991 / +84988749869.

**DDL lockdown (#108) trong bản này:** chỉ **admin/sys** sửa được Drop-Down Lists; user/cost
không thấy tab + server chặn 403. Mọi lần Save DDL ghi audit `DDL_SAVE` (diff). 2 admin sửa
trùng lúc → người lưu sau bị **409**, bấm **Tải lại** rồi lưu lại.
