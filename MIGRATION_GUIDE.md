# Migration Guide — Ops Control v1.2 → v1.5

**Audience:** ops + IT admin tại CCL Vietnam.
**Time required:** ~10 phút mỗi máy.
**Downtime:** không (data layout giữ nguyên; chỉ thay binary; SQLite migration tự áp dụng khi boot).
**Breaking changes:** 0 (mọi schema + endpoint thay đổi đều additive + feature-flagged).

> **Đây là gì?** Operator-facing checklist để upgrade từ v1.2 (LTS), v1.3 (GA), hoặc v1.4.x (MES sprints) lên v1.5.0. Technical detail của từng fix nằm ở `CHANGELOG.md` + `docs/audit/STEP-B-fix-summary.md`.

---

## 1. Pre-flight checks (làm trước khi update)

| ✓   | Hạng mục                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ☐   | Backup SQLite + JSON Library (file `backup/<ver>_pre_upgrade_<ts>.tar.gz` đã tạo tự động khi build pass — copy ra ổ cứng ngoài để chắc) |
| ☐   | Ghi lại **Installation ID** từ máy SERVER (Settings → License → Copy Installation ID)                                                   |
| ☐   | Email Installation ID + tên customer + tier mong muốn (S/M/L) đến CCL HQ ops                                                            |
| ☐   | Nhận `license.json` v2 đã ký Ed25519 từ CCL HQ (nếu chưa có từ v1.3 upgrade trước đó)                                                   |
| ☐   | Confirm `.env` còn nguyên `OPS_TOTP_KEY` (deploy.sh / deploy.ps1 sẽ preserve, nhưng verify trước cho an tâm)                            |

## 2. Cài đặt SERVER edition (Apple Silicon — M1/M2/M3/M4/M5)

1. Đóng toàn bộ Ops Control client + server đang chạy.
2. Copy `OpsControl-SERVER-v1.5.0-mac-arm64.dmg` + `checksums.txt` + `install-from-dmg.sh` từ CCL HQ Drive về máy.
3. **Cài bằng installer script (khuyên dùng — bỏ Gatekeeper warning vĩnh viễn):**

   ```bash
   bash install-from-dmg.sh OpsControl-SERVER-v1.5.0-mac-arm64.dmg
   ```

   Script tự verify SHA-256 → mount DMG → copy `OpsControl SERVER.app` vào `/Applications` → xóa `com.apple.quarantine` xattr. Sau đó app launch bằng double-click bình thường, không có cảnh báo "from unidentified developer".

   **Cài thủ công (fallback):** mount DMG, drag `OpsControl SERVER.app` vào `/Applications`. Lần đầu launch: macOS hiện modal "from unidentified developer" → right-click app → **Open** → **Open** lần nữa. Lần sau double-click bình thường.

   Dữ liệu cũ ở `~/Library/Application Support/ops-control-desktop/` được giữ nguyên qua mọi lần cài lại.

4. Mở app → nếu là máy mới chạy **Setup Wizard**; nếu upgrade từ v1.2/v1.3/v1.4.x → app boot thẳng (cấu hình cũ giữ nguyên).
5. Server boot xong → mở Settings → License để confirm tier hiển thị đúng.

> **Lưu ý:** v1.5 KHÔNG yêu cầu Apple Developer ID (CCL không trả phí $99/năm). Bù lại, mỗi DMG ship kèm `checksums.txt` để operator verify SHA-256 + bundle marker bên trong DMG (verify qua `scripts/verify-bundle-marker.sh`). Trust chain: CCL HQ ký build → publish checksums lên kênh nội bộ → operator verify trước khi cài.

## 3. Cài đặt CLIENT edition (Apple Silicon)

1. Trên mỗi máy operator: copy `OpsControl-CLIENT-v1.5.0-mac-arm64.dmg` + `install-from-dmg.sh` về máy.
2. Cài bằng script (khuyên dùng):
   ```bash
   bash install-from-dmg.sh OpsControl-CLIENT-v1.5.0-mac-arm64.dmg
   ```
   Hoặc cài thủ công: mount DMG, drag vào `/Applications`, right-click → Open lần đầu.
3. Mở app lần đầu → Setup Wizard (chỉ máy mới):
   - **Bước 1 — Server URL:** nhập `http://<ip-server>:3000` → bấm "Test connection".
   - **Bước 2 — Hoàn tất:** click "Mở Ops Control" → màn hình login bình thường.
4. Login với account v1.2/v1.3/v1.4 cũ — nếu account còn dùng bcrypt sẽ tự động được rehash sang argon2id (silent, một lần). Không có thao tác bổ sung từ user.

## 4. Migration ladder mật khẩu

| Trước login đầu tiên trên v1.5             | Sau login đầu tiên                                 |
| ------------------------------------------ | -------------------------------------------------- |
| `pwd_bcrypt = $2a$12$...` (v1.2 bcrypt)    | `pwd_bcrypt = $argon2id$v=19$...` (v1.3+ argon2id) |
| `pwd = abc123` legacy 32-bit hash (rất cũ) | `pwd_bcrypt = $argon2id$...`, field `pwd` xoá      |
| `pwd_bcrypt = $argon2id$...` (v1.3+)       | giữ nguyên                                         |

Logic ở `server/services/authService.js:upgradeLegacyPasswordIfNeeded()`. Idempotent dưới concurrent login.

## 5. Behavioral changes (operator-facing)

7 thay đổi operator sẽ thấy ngay sau upgrade. Technical detail nằm trong `CHANGELOG.md` + `docs/audit/STEP-B-fix-summary.md`.

### EN

- **Login error unified.** Failed attempts now show "Invalid credentials" for any reason (unknown user / wrong password / per-username lockout) — server still logs the rich detail to the audit log. Closes username-enumeration gap (OWASP ASVS V4.0 §6.2.4).
- **Login screen redesigned.** Carbon redesign with EN/VN flag toggle on Hardware/Mode tabs + bilingual decision Legend (Sprint 1.5).
- **Forced password change on first login.** Provisioned accounts (`must_change_password=true`) require setting a new pwd before continuing. Admins generate via "Generate Provisioning Card" flow (Sprint 1.5).
- **Pending Approvals badge.** Numeric count of quotes awaiting approval shown on landing page (pre-audit UI work).
- **Page load ~80% faster.** HTTP gzip compression enabled on the server; initial bundle drops from ~2.6 MB → ~520 KB over the wire. SSE streaming endpoints excluded so live events stay responsive.
- **MOQ tiers route per-tier.** Setup LM (Materials) and Setup H (Process) for both Standard + Complex now write to the active MOQ tier; editing MOQ 2 no longer clobbers MOQ 1's base (Sprint 1.6).
- **Remember-me works.** 30-day session if checked, browser-session only if unchecked. Server cookie maxAge + client storage routing both honoured (Sprint 1.6).

### EN — What you don't need to do

- ✓ **No database schema migration required** — additive SQLite migrations apply automatically on first server boot via `_migration_state` row guard.
- ✓ **No password reset for existing users** — bcrypt auto-upgrades to argon2id on next successful login.
- ✓ **No license re-issuance** — Ed25519 v2 license already in force since v1.3; v1.5 reads the same format.
- ✓ **No client URL update** — endpoint paths unchanged. Existing client code keeps working.
- ✓ **No downtime required** — ~10 min/máy hot-swap. Data ở `~/Library/Application Support/ops-control-desktop/` giữ nguyên qua reinstall.

### VI

- **Login error gộp chung.** Đăng nhập sai (user không tồn tại / sai mật khẩu / bị khóa do quá nhiều lần fail) đều hiển thị "Thông tin đăng nhập không hợp lệ" — server vẫn lưu detail vào audit log. Đóng lỗ hổng enumeration username (OWASP ASVS V4.0 §6.2.4).
- **Login screen redesign.** Carbon redesign + EN/VN flag toggle ở Hardware/Mode tabs + bilingual decision Legend (Sprint 1.5).
- **Bắt buộc đổi mật khẩu lần đầu login.** Account được provision (`must_change_password=true`) phải đổi mật khẩu mới trước khi tiếp tục. Admin tạo qua flow "Generate Provisioning Card" (Sprint 1.5).
- **Pending Approvals badge.** Hiển thị số quote đang chờ approval trên landing page.
- **Page load nhanh hơn ~80%.** Bật HTTP gzip compression; bundle ban đầu giảm từ ~2.6 MB → ~520 KB khi truyền. SSE streaming endpoints không bị nén nên live events vẫn nhanh.
- **MOQ tiers ghi đúng tier.** Setup LM (Materials) + Setup H (Process) cho cả Standard + Complex giờ ghi vào tier MOQ đang active; sửa MOQ 2 không clobber MOQ 1 nữa (Sprint 1.6).
- **Remember-me hoạt động.** Session 30 ngày nếu tick, chỉ trong phiên browser nếu không tick. Server cookie maxAge + client storage routing đồng bộ (Sprint 1.6).

### VI — Những việc KHÔNG cần làm

- ✓ **Không cần migrate database schema** — additive SQLite migrations tự áp dụng lần đầu boot server qua `_migration_state` row guard.
- ✓ **Không cần reset mật khẩu user hiện tại** — bcrypt tự upgrade sang argon2id ở lần login thành công kế tiếp.
- ✓ **Không cần cấp lại license** — Ed25519 v2 license đã có từ v1.3; v1.5 đọc đúng format đó.
- ✓ **Không cần update URL client** — endpoint paths giữ nguyên. Client code cũ chạy bình thường.
- ✓ **Không downtime** — ~10 phút/máy hot-swap. Data ở `~/Library/Application Support/ops-control-desktop/` giữ nguyên qua reinstall.

## 6. Endpoint changes

Mọi endpoint v1.2 giữ nguyên path. Các endpoint v2 ship sau v1.3 đều **feature-flagged default off** — không gây ảnh hưởng cho deployment đang dùng surface cũ.

| Group             | Count | Path prefix                                                                                         | Visibility                                            |
| ----------------- | ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Audit (v1.3 N6)   | —     | `/api/audit`                                                                                        | Đã extract sang `domains/security/`. Path không đổi.  |
| MES-1 work-orders | 8     | `/api/planning/v2/...`                                                                              | Behind `mes.workOrder.enabled` flag (default `false`) |
| MES-2 kiosk       | 11    | `/api/planning/v2/kiosks/...` + `/api/planning/v2/operations/...` + `/api/planning/v2/reason-codes` | Behind `mes.kiosk.enabled` flag (default `false`)     |

Full danh sách trong `CHANGELOG.md` §[1.4.0-mes-extension] + §[1.4.1-mes-2-kiosk].

> **Client URL cutover audit (v1.3 N6) đã hoàn tất.** Cluster `/rate/*` + `/ddl/*` đã cut sang `/library/rate/*` + `/library/ddl/*`. Không còn legacy URL đang active trong v1.5 client.

## 7. License tier enforcement

- **Tier S** = 15 active users
- **Tier M** = 20 active users
- **Tier L** = 50 active users

`POST /api/users` (tạo user mới) sẽ trả `HTTP 402 LICENSE_LIMIT_EXCEEDED` nếu vượt cap. Client UI hiển thị popup "Liên hệ CCL HQ để nâng cấp tier".

Soft-deleted users (`deleted_at IS NOT NULL`) **KHÔNG** đếm vào cap. Sys recovery account cũng không tính.

## 8. Verify post-install

```bash
# Server health
curl http://<server>:3000/health
# → { ok: true, version: '1.5.0', ... }

# License status (qua admin UI)
Settings → License → expects: { customer, tier, max_users, expires_at }

# Audit log accessible
Sidebar → Audit log (sys role) — bảng phải hiển thị các sự kiện gần đây

# Compression bật đúng (Step B Fix 2)
curl -sI -H "Accept-Encoding: gzip" http://<server>:3000/ | grep -i content-encoding
# → content-encoding: gzip

# Stale-chunk 404 guard (regression test, CLAUDE.md)
curl -sS -o /dev/null -w "%{http_code}\n" http://<server>:3000/assets/THIS-DOES-NOT-EXIST.js
# → 404 (NOT 200)
```

**Nếu enable MES surfaces:**

```bash
# MES-1 work orders (chỉ khi mes.workOrder.enabled=true)
curl -H "Cookie: <session>" http://<server>:3000/api/planning/v2/work-orders

# MES-2 kiosk dispatch (chỉ khi mes.kiosk.enabled=true; cần kiosk JWT)
curl -H "Authorization: Bearer <kiosk-jwt>" http://<server>:3000/api/planning/v2/operations/dispatch
```

## 9. Feature flags introduced post-v1.3

⚠️ **Default fail-closed.** Cả 2 flag default `false` trong production. Operator phải chủ động bật + restart để expose surface — đừng bật nhầm trên production khi chưa test.

| Flag                    | Sprint | Mặc định | Khi bật                                                                                         |
| ----------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `mes.workOrder.enabled` | MES-1  | `false`  | Mở Work Orders v2 surface (8 endpoints, schema additive)                                        |
| `mes.kiosk.enabled`     | MES-2  | `false`  | Mở Kiosk PWA + dispatch + offline queue (11 endpoints, schema additive, OPS_KIOSK_KEY required) |

**Bật flag (chỉ làm trên production sau khi test pass trên staging):**

1. Edit `server/data/Library/SystemConfig/feature-flags.json`:
   ```json
   { "mes.workOrder.enabled": true, "mes.kiosk.enabled": true }
   ```
2. Restart server (`systemctl restart ops-control` Linux; `nssm restart ops-control` Windows; quit + relaunch app trên macOS).
3. Verify surface up qua §8 curl probes.

**Env var bổ sung (chỉ cần nếu bật `mes.kiosk.enabled`):**

- `OPS_KIOSK_KEY` — pairing token signing key. `deploy.sh` + `deploy.ps1` sẽ preserve key này tự động giống `OPS_TOTP_KEY` (Sprint 1.7 + MES-2.3 pattern). Generate qua `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 10. Rollback

### 10.1 Snapshot rollback (recommended, < 5 min)

`deploy.sh` v1.7+ snapshot live `/opt/ops-control` sang `releases/<ts>/` BEFORE rsyncing release mới. 5 snapshot gần nhất giữ lại.

```bash
ssh user@server
sudo systemctl stop ops-control
ls /opt/ops-control/releases             # pick snapshot trước bad deploy
PREV=20260427-101530
cd /opt/ops-control
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./
sudo systemctl start ops-control
journalctl -u ops-control -n 30          # confirm clean boot
```

`server/data/` KHÔNG bị version (data tích lũy qua release). Nếu data corrupt → restore từ nightly SQLite backup `server/data/Backup/`.

### 10.2 DMG rollback (macOS desktop, fallback)

Trong 24h đầu sau update:

```bash
sudo systemctl stop ops-control
mv ~/Library/Application\ Support/Ops\ Control{,.v1.5}
mv ~/Library/Application\ Support/Ops\ Control.backup_<ts> ~/Library/Application\ Support/Ops\ Control
# Cài lại DMG cũ (giữ trong backup folder)
sudo systemctl start ops-control
```

⚠️ Sau bước này, license v2 đã apply trên v1.5 vẫn tương thích với v1.3+ (cùng Ed25519 format). Chỉ rollback xuống v1.2 mới cần liên hệ CCL HQ để cấp license v1 (HMAC) tạm.

### 10.3 Disaster recovery

Đầy đủ runbooks trong `CLAUDE.md` §"Recovery playbook":

- "All users are locked out of 2FA" → `npm run reset-totp`
- "All admin / sys users lost access" → `node scripts/recover-sys-user.js` (console-only)
- "Bad deploy — need to roll back" → snapshot rollback (10.1)
- "Bare-metal restore — disk dies / fresh box" → off-site restore + preflight

## 11. Deferred items

Backlog đầy đủ trong `CLAUDE.md` §"MES-3 Backlog" (10 tickets, breakdown P1/P2/P3 + effort estimate). Không cần action từ operator — sẽ ship trong sprint sau.

Highlight 2 P1 sẽ lead MES-3 sprint:

- **KIOSK-003** — WO-level lifecycle cascade khi mọi op đạt ACCEPTED (data-integrity)
- **KIOSK-006b** — `groups.json` idempotent migration script (deploy automation gap)

## 12. Hỗ trợ

| Loại sự cố               | Kênh                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| License không apply được | thiepdt@outlook.com (kèm screenshot Installation ID)                               |
| Login fail sau update    | Check server log `journalctl -u ops-control -n 50` + audit log Sidebar → Audit log |
| Setup wizard không hiện  | Xoá `<userData>/setup-done.json` rồi mở lại app                                    |
| Vuln scan fail trong CI  | Run `npm audit --audit-level=high --omit=dev` để loại devDeps noise                |
| Compression không bật    | Verify `curl -sI -H "Accept-Encoding: gzip" /` trả `content-encoding: gzip` (§8)   |
| MES surface không hiện   | Check `feature-flags.json` đã set `true` + restart server (§9)                     |
| Kiosk pairing fail       | Verify `OPS_KIOSK_KEY` set trong `.env` server (§9)                                |
