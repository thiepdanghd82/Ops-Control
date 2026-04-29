# Migration Guide — Ops Control v1.2 → v1.3

**Audience:** ops + IT admin tại CCL Vietnam.
**Time required:** ~10 phút mỗi máy.
**Downtime:** không (data layout giữ nguyên; chỉ thay binary).

---

## 1. Pre-flight checks (làm trước khi update)

| ✓ | Hạng mục |
|---|---|
| ☐ | Backup SQLite + JSON Library (file `backup/v1.2_pre_upgrade_<ts>.tar.gz` đã được tạo tự động khi build pass v1.3 — copy ra ổ cứng ngoài để chắc) |
| ☐ | Ghi lại **Installation ID** từ máy SERVER (Settings → License → Copy Installation ID) |
| ☐ | Email Installation ID + tên customer + tier mong muốn (S/M/L) đến CCL HQ ops |
| ☐ | Nhận `license.json` v2 đã ký Ed25519 từ CCL HQ |

## 2. Cài đặt SERVER edition

1. Đóng toàn bộ Ops Control client + server đang chạy.
2. Copy DMG mới: `OpsControl-SERVER-v1.3-mac-arm64.dmg` (Apple Silicon) hoặc `-mac-x64.dmg` (Intel) — verify SHA-256 với `dist/checksums.txt`.
3. Drag vào `/Applications`, replace bản v1.2 (data ở `~/Library/Application Support/Ops Control/` được giữ nguyên).
4. Mở app → chạy **Setup Wizard** lần đầu:
   - **Bước 1 — License:** dán nội dung `license.json` đã nhận → bấm "Áp dụng license & tiếp tục". Nếu chưa có → "Dùng trial 14 ngày" (tier S, 15 user max).
   - **Bước 2 — Khởi tạo dữ liệu:** thường giữ default (`<userData>/data`).
   - **Bước 3 — Kết nối mạng:** port 3000 + bind `0.0.0.0` (cho LAN).
   - **Bước 4 — Tạo admin:** username + mật khẩu ≥ 12 ký tự (chữ + số). Tài khoản được cấp role `sys`.
5. Server boot xong → mở Settings → License để confirm tier hiển thị đúng.

## 3. Cài đặt CLIENT edition

1. Trên mỗi máy operator: copy DMG `OpsControl-CLIENT-v1.3-mac-{arm64|x64}.dmg`.
2. Drag vào `/Applications`.
3. Mở app lần đầu → Setup Wizard:
   - **Bước 1 — Server URL:** nhập `http://<ip-server>:3000` → bấm "Test connection".
   - **Bước 2 — Hoàn tất:** click "Mở Ops Control" → màn hình login bình thường.
4. Login với account v1.2 cũ — mật khẩu sẽ tự động được rehash sang argon2id (silent, một lần). Không có thao tác bổ sung từ user.

## 4. Migration ladder mật khẩu

| Trước login đầu tiên trên v1.3 | Sau login đầu tiên |
|---|---|
| `pwd_bcrypt = $2a$12$...` (v1.2 bcrypt) | `pwd_bcrypt = $argon2id$v=19$...` (v1.3 argon2id) |
| `pwd = abc123` legacy 32-bit hash (rất cũ) | `pwd_bcrypt = $argon2id$...`, field `pwd` xoá |

Logic ở `server/services/authService.js:upgradeLegacyPasswordIfNeeded()`. Idempotent dưới concurrent login.

## 5. Endpoint changes

| Endpoint | v1.2 | v1.3 |
|---|---|---|
| `GET /api/audit` | inline trong `server/index.js` | extracted → `server/domains/security/routes/audit.js` |
| (Path KHÔNG đổi) | `/api/audit` | `/api/audit` |

Tất cả endpoint khác giữ nguyên. URL không đổi → existing client code không cần touch.

## 6. License tier enforcement

- **Tier S** = 15 active users
- **Tier M** = 20 active users
- **Tier L** = 50 active users

`POST /api/users` (tạo user mới) sẽ trả `HTTP 402 LICENSE_LIMIT_EXCEEDED` nếu vượt cap. Client UI hiển thị popup "Liên hệ CCL HQ để nâng cấp tier".

Soft-deleted users (`deleted_at IS NOT NULL`) **KHÔNG** đếm vào cap. Sys recovery account cũng không tính.

## 7. Verify post-install

```bash
# Server health
curl http://<server>:3000/health
# → { ok: true, version: '1.3.0', ... }

# License status (qua admin UI)
Settings → License → expects: { customer, tier, max_users, expires_at }

# Audit log accessible
Sidebar → Audit log (sys role) — bảng phải hiển thị các sự kiện gần đây
```

## 8. Rollback

Nếu phát sinh sự cố trong 24 h đầu sau update:

```bash
# Trên máy server:
sudo systemctl stop ops-control
mv ~/Library/Application\ Support/Ops\ Control{,.v1.3}
mv ~/Library/Application\ Support/Ops\ Control.backup_<ts> ~/Library/Application\ Support/Ops\ Control
# Cài lại DMG v1.2 (giữ trong backup folder)
sudo systemctl start ops-control
```

⚠️ Sau bước này, license v2 đã apply trên v1.3 sẽ không tương thích với v1.2 (v1.2 chỉ verify HMAC). Nếu rollback xảy ra, liên hệ CCL HQ để được cấp license v1 (HMAC) tạm.

## 8.1 Client-side URL cutover audit (v1.3 N6)

After 8 routers extracted to `server/domains/`, the client's
`services/api.js` has **9 remaining call sites** still hitting legacy
URLs that have a NEW canonical equivalent. Cutover status as of rc.4:

| Legacy URL in api.js | Canonical NEW URL | Cutover status |
|---|---|---|
| `/rate/backups`, `/rate/backup`, `/rate/restore`, `/rate/export-csv` | `/library/rate/*` | ✅ Cut over (N6) |
| `/ddl/backups`, `/ddl/backup`, `/ddl/restore`, `/ddl/export-csv` | `/library/ddl/*` | ⏳ Pending (mirror of rate; same shape) |
| `/admin/backup-schedule` (GET / PUT) | `/basis/backup/schedule` | ⏳ Pending |
| `/admin/backup-schedule/run-now` | `/basis/backup/run-now` | ⏳ Pending |
| `/quotes` (POST) | `/sales/quotes` | ⏳ Pending |
| `/save-quotation` (POST) | `/sales/quotations` | ⏳ Pending |

**Per ADR-0009 retirement criteria**, the legacy URL retires only
when all 4 conditions hold:
1. Client UI no longer hits the legacy URL.
2. No external scripts / docs reference it.
3. Two consecutive sprints pass without defects on the new URL.
4. Legacy behaviour fully covered by new router contract tests.

The `/rate/*` cluster meets condition 1 after this commit; the rest
is a 2-sprint waiting period before legacy can be removed from
costApi.js.

## 9. Deferred items (v1.3.1 follow-up)

- **Windows `.exe` installers** — chưa build, cần Windows VM hoặc Wine.
- **Full split của `costApi.js` (2891 LOC)** — chỉ extract audit router. Phần còn lại migrate dần khi touch (mỗi sprint kéo 1 nhóm endpoint).
- **TLS Client–Server** — vẫn HTTP. Cần ADR + cert lifecycle plan trước khi enable mTLS.
- **Cleanup file dư trong v1.3 folder** (~2 GB build cache + npm cache):
  ```bash
  cd "3. PROJECTS/Ops Control v1.3"
  rm -rf apps/desktop/dist-electron/{mac-arm64,win-unpacked} .npm-cache .npm-cache-local v1.3
  find . -name ".DS_Store" -not -path "*/node_modules/*" -delete
  ```

## 10. Hỗ trợ

| Loại sự cố | Kênh |
|---|---|
| License không apply được | thiepdt@outlook.com (kèm screenshot Installation ID) |
| Login fail sau update | Check server log `journalctl -u ops-control -n 50` |
| Setup wizard không hiện | Xoá `<userData>/setup-done.json` rồi mở lại app |
| Vuln scan fail trong CI | Run `npm audit --audit-level=high` để xem chi tiết |
