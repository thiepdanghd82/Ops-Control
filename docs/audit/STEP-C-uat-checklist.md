# Step C — UAT Checklist (Pre-Go-Live Acceptance Test)

**Branch tested:** `fix/pre-go-live-p0` (HEAD `e72cffe` after Step D)
**Audit verdict:** ✅ GO (post-Step-B, 2026-05-04)
**Purpose / Mục đích:** Independent operator-side verification that all 7 Step B P0 fixes work in the **actual deployment environment** — not just the dev machine where Step D ran. / Xác minh độc lập từ phía operator rằng 7 P0 fix của Step B chạy đúng trên môi trường deploy thật, không phải máy dev.

> **Tester / Người kiểm thử:** an operator with shell + admin UI access who did NOT write the code. / Operator có quyền shell + admin UI, KHÔNG phải người viết code.
>
> **Time budget / Thời gian:** ~60 min full pass — 7 scenarios × 5–10 min each + smoke 5 min + sign-off 15 min. Each scenario standalone — tester can skip out of order if needed. / Mỗi scenario độc lập — tester có thể bỏ qua hoặc đảo thứ tự.
>
> **Out of scope / Ngoài phạm vi:** P1/P2 findings (still in backlog), B1/B2 deferred WIP, sub-system smoke for unmodified subsystems (covered by 1 618 automated tests).

---

## Table of Contents

1. [Pre-UAT Checklist / Danh sách kiểm tra trước UAT](#section-1)
2. [Per-Fix UAT Scenarios (7) / Kịch bản UAT từng fix](#section-2)
3. [End-to-End Smoke Test / Smoke test toàn luồng](#section-3)
4. [Rollback Decision Tree / Cây quyết định rollback](#section-4)
5. [Operator Coordination / Phối hợp với operator](#section-5)
6. [Final Sign-off Form / Phiếu ký nhận cuối](#section-6)

---

<a id="section-1"></a>

## Section 1 — Pre-UAT Checklist / Danh sách kiểm tra trước UAT

### EN — Before running any scenario, confirm all of these. Do not start if any item below fails.

### VI — Trước khi chạy bất kỳ scenario nào, confirm tất cả các mục dưới. KHÔNG bắt đầu nếu có mục nào fail.

### 1.1 Environment prerequisites / Yêu cầu môi trường

| ✓   | Item / Mục                                                                                               | How to verify / Cách kiểm tra                     |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| ☐   | Node.js ≥ 20.x                                                                                           | `node --version`                                  |
| ☐   | `package.json` version is `1.5.0`+ / phiên bản 1.5.0 trở lên                                             | `grep '"version"' package.json`                   |
| ☐   | `client/dist/` exists / tồn tại with current build                                                       | `ls client/dist/index.html`                       |
| ☐   | `.env` exists with valid `OPS_TOTP_KEY` (64 hex chars in production) / có `.env` với OPS_TOTP_KEY hợp lệ | `wc -c .env` ≥ 100                                |
| ☐   | SQLite DB exists at DATA_DIR / DB tồn tại theo DATA_DIR                                                  | `ls $(grep ^DATA_DIR .env \| cut -d= -f2)/ops.db` |
| ☐   | Backup taken in last 24h / có backup trong 24h gần nhất                                                  | `ls -lt server/data/Backup/ \| head -3`           |

### 1.2 Test user accounts / Tài khoản test

Must exist before UAT. / Phải có sẵn trước UAT.

| Role / Vai trò                | Username (suggest)  | Used in / Dùng ở scenarios    |
| ----------------------------- | ------------------- | ----------------------------- |
| sys                           | `sys-uat`           | Scenario 1, 6                 |
| admin                         | `admin-uat`         | Scenario 4, 5                 |
| user                          | `user-uat`          | Scenario 3, 4, smoke          |
| viewonly                      | `viewonly-uat`      | Scenario 3 (lockout)          |
| (nonexistent / không tồn tại) | `never_existed_xyz` | Scenario 3 (enumeration test) |

If accounts missing / Nếu thiếu account: provision via Settings → Account Control → Users (sys role required / cần role sys).

### 1.3 Sample data / Dữ liệu mẫu

| ✓   | Data / Dữ liệu                       | Where to confirm / Kiểm tra ở       |
| --- | ------------------------------------ | ----------------------------------- |
| ☐   | At least 1 quote / ≥ 1 quote         | Sidebar → Quote History             |
| ☐   | At least 1 customer / ≥ 1 khách hàng | `ls server/data/Library/Customers/` |
| ☐   | At least 1 BOM row / ≥ 1 BOM         | Library → Mfg Structure             |

### 1.4 Backup + rollback ready / Backup + rollback sẵn sàng

| ✓   | Item / Mục                                                                    | How to verify / Cách kiểm tra             |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| ☐   | `npm run verify-backup` passes / pass                                         | exit 0                                    |
| ☐   | Latest deploy snapshot at `releases/<ts>/` (production only / chỉ production) | `ls /opt/ops-control/releases \| tail -3` |
| ☐   | DR runbook accessible / runbook DR có sẵn                                     | CLAUDE.md "Recovery playbook"             |

### 1.5 Step-B-specific recovery anchors / Mốc khôi phục riêng cho Step B

| ✓   | Anchor / Mốc                                      | Path / Đường dẫn                        |
| --- | ------------------------------------------------- | --------------------------------------- |
| ☐   | `wip-snapshot-20260504-082812` git tag            | `git tag --list 'wip-snapshot-*'`       |
| ☐   | `pre-sidebar-revert-20260504-090729` git tag      | `git tag --list 'pre-sidebar-revert-*'` |
| ☐   | `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB) | `ls -la /tmp/wip-backup-*.tar.gz`       |

---

<a id="section-2"></a>

## Section 2 — Per-Fix UAT Scenarios / Kịch bản UAT từng fix

Each scenario has positive + negative paths. Tick PASS only when ALL rows in BOTH tables are ✓. / Mỗi scenario có path positive + negative. Chỉ tick PASS khi TẤT CẢ rows trong CẢ HAI bảng đều ✓.

---

### Scenario 1 — Fix 1 (F4-5): DATA_DIR resolution / Phân giải DATA_DIR

**Tester / Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date / Ngày:** \_\_\_\_\_\_\_\_\_\_\_ **Result / Kết quả:** [ ] PASS [ ] FAIL

#### Pre-condition / Điều kiện trước

- `.env` has `DATA_DIR=./server/data` (or operator-chosen) / có DATA_DIR đặt rõ
- Server NOT currently running / Server chưa chạy

#### Positive steps / Bước thuận

| #   | Action / Hành động                                                           | Expected / Kỳ vọng                                                              | Actual / Thực tế | ✓/✗ |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------- | --- |
| 1   | `node server/index.js`; watch boot log / theo dõi boot log                   | Boot completes; no DATA_DIR / COST_V1.0 errors / Boot xong, không lỗi liên quan |                  |     |
| 2   | `grep -i COST_V1.0 /tmp/boot.log`                                            | Zero hits / Không có hit nào                                                    |                  |     |
| 3   | Check `📁 Data directory:` line / Kiểm tra dòng `📁 Data directory:`         | Path matches `.env` / Path khớp `.env`                                          |                  |     |
| 4   | Inspect deploy.sh, deploy.ps1, deploy.bat headers / Xem header 3 file deploy | All say "v1.2" (NOT "v1.0") / Đều ghi "v1.2", KHÔNG ghi "v1.0"                  |                  |     |

#### Negative steps / Bước nghịch (must NOT happen / KHÔNG được xảy ra)

| #   | Bad input / Đầu vào xấu                                               | Expected / Kỳ vọng                                                                                                                    | Actual / Thực tế | ✓/✗ |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --- |
| 1   | `grep -n COST_V1.0 deploy.sh deploy.ps1 deploy.bat`                   | Only explanatory comment in deploy.sh, no `Environment=` lines / Chỉ comment giải thích trong deploy.sh, không có dòng `Environment=` |                  |     |
| 2   | systemd unit text inside deploy.sh / nội dung systemd trong deploy.sh | No `Environment=DATA_DIR=…COST_V1.0…` / Không có dòng đó                                                                              |                  |     |

#### Notes / Issues / Ghi chú

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 2 — Fix 2 (F3-1): HTTP compression / Nén HTTP

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- Server running on `http://<host>:3000` / Server đang chạy
- Browser DevTools available / Có DevTools

#### Positive steps

| #   | Action / Hành động                                                                                                                                                                     | Expected / Kỳ vọng                                                 | Actual | ✓/✗ |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | --- |
| 1   | `curl -sI -H "Accept-Encoding: gzip" http://<host>:3000/assets/<X>.js`                                                                                                                 | Response includes gzip evidence / Có dấu hiệu gzip                 |        |     |
| 2   | Body-size delta:<br>`RAW=$(curl -s -o /dev/null -w "%{size_download}" /assets/<X>.js)`<br>`GZ=$(curl -s -o /dev/null -w "%{size_download}" -H "Accept-Encoding: gzip" /assets/<X>.js)` | GZ < RAW × 0.5 (>50% reduction) / Giảm trên 50%                    |        |     |
| 3   | Browser DevTools → Network → reload login → click any `*.js`                                                                                                                           | Transferred size < uncompressed size / Transfer nhỏ hơn nguyên gốc |        |     |
| 4   | Boot log shows `📦 [compression] enabled (threshold=1024, level=6, sse-excluded)` / Boot log có dòng đó                                                                                | Yes / Có                                                           |        |     |

#### Negative steps

| #   | Bad input                                                                     | Expected                                                   | Actual | ✓/✗ |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | --- |
| 1   | `curl -sI http://<host>:3000/health` (small JSON / JSON nhỏ)                  | NO `Content-Encoding: gzip` (under 1024 B) / KHÔNG có gzip |        |     |
| 2   | `curl -sI -H "Accept-Encoding: gzip" -H "x-no-compression: 1" /assets/<X>.js` | NO compression (debug bypass works) / KHÔNG nén            |        |     |
| 3   | Hit SSE endpoint with `Accept: text/event-stream` / Truy cập SSE              | NO compression on stream / KHÔNG nén stream                |        |     |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 3 — Fix 3 (F2-1): Login error unification / Gộp thông báo lỗi đăng nhập

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- Server running / Server đang chạy
- `user-uat`, `viewonly-uat` exist with known passwords / có account với mật khẩu biết trước
- A nonexistent username on hand (e.g. `never_existed_xyz`) / có 1 username chưa từng tồn tại

#### Positive steps — All 3 branches must return same response / 3 nhánh phải trả về cùng response

| #   | Action / Hành động                                                                                                                | Expected / Kỳ vọng                                                                                   | Actual | ✓/✗ |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | --- |
| 1   | Wrong password / Sai mật khẩu:<br>`curl -X POST /api/auth/login -d '{"username":"user-uat","password":"definitely-wrong"}'`       | `401` + `{"ok":false,"error":"Invalid credentials"}`                                                 |        |     |
| 2   | Unknown user / User không tồn tại:<br>`curl -X POST /api/auth/login -d '{"username":"never_existed_xyz","password":"anything"}'`  | `401` + body **byte-identical to step 1** / body giống hệt step 1                                    |        |     |
| 3   | Lockout / Khóa tài khoản: send 5 wrong-pw attempts for `viewonly-uat`, then a 6th / gửi 5 attempt sai liên tiếp rồi attempt thứ 6 | 6th call: `401` + same uniform body + `Retry-After:` HTTP header / cùng body + có header Retry-After |        |     |
| 4   | UI: try wrong password in login form / Thử sai mật khẩu trên UI                                                                   | Visible error: "Invalid credentials" (EN) / "Thông tin đăng nhập không hợp lệ" (VI)                  |        |     |

#### Negative steps — Must NOT leak / KHÔNG được leak

| #   | Bad input                                                                           | Expected                                                                                                                                                  | Actual | ✓/✗ |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| 1   | Diff bodies of step 1 vs step 2 / So sánh body step 1 và 2                          | Zero-byte diff / Khác 0 byte                                                                                                                              |        |     |
| 2   | Wallclock of step 1 vs step 2 (10 samples each) / Đo wallclock step 1 vs 2 (10 lần) | Δ p50 < 100 ms (Note: legacy bcrypt users still leak ~330 ms — see F-FOLLOW-UP-3 / User bcrypt cũ vẫn leak ~330 ms cho đến lần login thành công đầu tiên) |        |     |
| 3   | Server `audit_log.json` after 3 attempts / audit log sau 3 attempt                  | Each branch has own detailed audit row / Mỗi nhánh có row audit chi tiết riêng (server giữ chi tiết, client thấy uniform)                                 |        |     |
| 4   | SQL-injection probe: username `admin' OR '1'='1`                                    | `401` + uniform body, NO SQL error fragments / không leak fragment SQL                                                                                    |        |     |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 4 — Fix 4 (F3-3 + F3-4 + F-FOLLOW-UP-1): Login a11y / A11y trang login

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- Browser with DevTools accessibility tree / DevTools có accessibility tree (Chrome/Firefox)
- Optional / Không bắt buộc: NVDA (Windows) or VoiceOver (macOS) for full a11y test

#### Positive steps

| #   | Action / Hành động                                                             | Expected / Kỳ vọng                                                                        | Actual | ✓/✗ |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ | --- |
| 1   | DevTools → Elements → Accessibility tab → click each form input                | Each input has associated label / Mỗi input có label gắn programmatic                     |        |     |
| 2   | DevTools → Elements → check page heading hierarchy / kiểm tra cấu trúc heading | First heading is `<h1>` (NOT `<h2>`); no h2 before any h1 / Heading đầu là h1             |        |     |
| 3   | Click EN/VI flag toggle / Bấm cờ EN/VI                                         | h1 switches between "Sign in" and "Đăng nhập" / h1 đổi giữa 2 ngôn ngữ                    |        |     |
| 4   | Tab through form using only keyboard / Tab qua form bằng bàn phím              | Username → Password → Remember-me → Sign-in button; visible focus ring / Có focus ring rõ |        |     |
| 5   | (Optional) Screen reader test / Test screen reader                             | Announces "Username, edit text" — NOT "edit text" alone / Đọc đúng tên field              |        |     |

#### Negative steps

| #   | Bad input                                                                  | Expected                                             | Actual | ✓/✗ |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------- | ------ | --- |
| 1   | Search HTML for `for="login-` / Tìm trong HTML                             | At least 5 `<label for=...>` matches / Ít nhất 5 hit |        |     |
| 2   | Search HTML for `<h2 class="cb-hero-title"`                                | Zero hits (changed to `<p>`) / Không có hit          |        |     |
| 3   | DevTools console:<br>`document.querySelectorAll('input:not([id])').length` | `0` on login form / 0 trên form login                |        |     |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 5 — Fix 5 (F4-21): MIGRATION_GUIDE.md refresh / Cập nhật hướng dẫn migration

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- An operator who has NOT migrated yet, or a fresh staging box / Operator chưa migrate hoặc máy staging mới

#### Positive steps

| #   | Action / Hành động                              | Expected                                                                                                       | Actual | ✓/✗ |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ | --- |
| 1   | Read `MIGRATION_GUIDE.md` from top / Đọc từ đầu | Title says "v1.2 → v1.5" / Tiêu đề ghi v1.2 → v1.5                                                             |        |     |
| 2   | Walk §1 Pre-flight checklist / Đi qua §1        | All 5 items checkable on test env / 5 mục đều check được                                                       |        |     |
| 3   | Read §5 Behavioral changes EN section           | 7 changes + "What you don't need to do" (5 items) / 7 thay đổi + 5 việc không cần làm                          |        |     |
| 4   | Read §5 Behavioral changes VI section           | Mirror of EN with same 7+5 items / Bản dịch VI đồng bộ                                                         |        |     |
| 5   | Try §2 Cài đặt SERVER edition                   | DMG filename matches `OpsControl-SERVER-v1.5.0-mac-arm64.dmg` (or actual built)                                |        |     |
| 6   | Read §9 Feature flags                           | `mes.workOrder.enabled` + `mes.kiosk.enabled` default-false documented; `OPS_KIOSK_KEY` requirement called out |        |     |
| 7   | Read §10 Rollback                               | 10.1 snapshot rollback (Sprint 1.7 pattern) actionable on actual prod box                                      |        |     |

#### Negative steps

| #   | Bad input                          | Expected                                              | Actual | ✓/✗ |
| --- | ---------------------------------- | ----------------------------------------------------- | ------ | --- |
| 1   | Search guide for "v1.3.1 deferred" | No hit (replaced with MES-3 backlog pointer)          |        |     |
| 2   | Search guide for "v1.3.0"          | Only historical refs, no current install instructions |        |     |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 6 — Fix 6 (Hygiene): Working tree state / Trạng thái working tree

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- Shell access to the deploy box (or dev machine where Step B ran) / Có shell trên máy deploy

#### Positive steps

| #   | Action / Hành động                             | Expected                                                                                         | Actual | ✓/✗ |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ | --- |
| 1   | `git log --oneline -8` on `fix/pre-go-live-p0` | Lists Fix 1..7 + Step D (e75cac9, 6a63421, 6568eef, 6b8542f, bed7824, d48afa8, 5fc6268, e72cffe) |        |     |
| 2   | `git log --oneline main \| head -3`            | Top entry: `970163a docs: erpag survey + ops control v1.2 migration assessment`                  |        |     |
| 3   | `ls docs/audit/screenshots/p0-*.png`           | 6 PNGs (Fix 3 + Fix 4 verify) / 6 file                                                           |        |     |
| 4   | `cat docs/audit/FIX-6-CLASSIFICATION.md`       | Full triage of 42 WIP entries documented / Có đủ phân loại 42 WIP                                |        |     |

#### Negative steps

| #   | Bad input                                                | Expected                             | Actual       | ✓/✗           |
| --- | -------------------------------------------------------- | ------------------------------------ | ------------ | ------------- | --- | --- |
| 1   | `git status \| grep -E "\.env\\                          | secret\\                             | credential"` | Empty / Trống |     |     |
| 2   | `git tag --list 'wip-snapshot-*' 'pre-sidebar-revert-*'` | Both tags present / Cả 2 tag tồn tại |              |               |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

### Scenario 7 — Fix 7 (bonus): Env-source startup logging / Log nguồn env khi khởi động

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

#### Pre-condition

- Ability to stop + restart server / Có thể stop + restart server
- Ability to read boot logs / Đọc được boot log (stdout/journalctl/nssm)

#### Positive steps

| #   | Action / Hành động                                                          | Expected                                                                                                                            | Actual | ✓/✗ |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| 1   | Restart server, check first 10 lines of boot log / Restart, xem 10 dòng đầu | First diagnostic: `🌱 [env] resolved sources:` + 8 indented var lines                                                               |        |     |
| 2   | Verify each tracked var reported / Xác nhận mỗi var được report             | Lines for: `NODE_ENV`, `OPS_PORT`, `PORT`, `DATA_DIR`, `OPS_CORS_ORIGINS`, `OPS_TOTP_KEY`, `OPS_KIOSK_KEY`, `OPS_ALLOW_SAME_ORIGIN` |        |     |
| 3   | Inspect OPS_TOTP_KEY line / Xem dòng OPS_TOTP_KEY                           | `<N chars> (from <source>)` — does NOT print key value / KHÔNG in giá trị key                                                       |        |     |
| 4   | Set `DATA_DIR=` (empty) in .env, restart / Đặt DATA_DIR rỗng, restart       | DATA_DIR shows `<empty> (likely misconfig)` / Hiện cờ misconfig                                                                     |        |     |
| 5   | Restore .env, restart / Khôi phục .env, restart                             | DATA_DIR shows path with `(from .env file)` / Hiện đường dẫn + nguồn                                                                |        |     |

#### Negative steps

| #   | Bad input                                                     | Expected                                                      | Actual | ✓/✗ |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------ | --- |
| 1   | `grep "🌱" boot.log` after running suite with `NODE_ENV=test` | Empty (test-gated) / Trống                                    |        |     |
| 2   | Visual scan of OPS_TOTP_KEY line / Quan sát dòng OPS_TOTP_KEY | Cannot see actual key value anywhere / Không thấy giá trị key |        |     |
| 3   | `node --test server/utils/envSources.test.js`                 | 6/6 pass                                                      |        |     |

#### Notes / Issues

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

<a id="section-3"></a>

## Section 3 — End-to-End Smoke Test / Smoke test toàn luồng

A single happy-path walkthrough exercising all 7 fixes together. Run AFTER each scenario above passes individually. / Một flow happy-path duy nhất chạy qua cả 7 fix. Chạy SAU KHI mỗi scenario riêng lẻ đã pass.

**Tester:** \_\_\_\_\_\_\_\_\_\_\_ **Date:** \_\_\_\_\_\_\_\_\_\_\_ **Result:** [ ] PASS [ ] FAIL

| #   | Action / Hành động                                                        | Touches Fix | Expected                                                                                                                | ✓/✗ |
| --- | ------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | `kill <prev-pid>; node server/index.js`                                   | 7           | Boot log starts `🌱 [env] resolved sources:` (8 lines, secrets masked) / Bắt đầu bằng dòng env (8 dòng, secret bị mask) |     |
| 2   | Continue watching boot log / Tiếp tục xem log                             | 1, 2        | Later: `📁 Data directory: <path>` + `📦 [compression] enabled`                                                         |     |
| 3   | Open `http://<host>:3000` in fresh browser / Mở trang trong browser mới   | 2           | Page loads visibly fast; DevTools shows JS bundles gzipped / Trang load nhanh, JS có gzip                               |     |
| 4   | Try login with `user-uat` + wrong password / Thử login sai mật khẩu       | 3           | "Invalid credentials" / "Thông tin đăng nhập không hợp lệ"                                                              |     |
| 5   | Click EN/VI flag toggle / Bấm cờ EN/VI                                    | 4           | h1 changes; focus ring visible / h1 đổi, focus ring rõ                                                                  |     |
| 6   | Login with correct credentials → reach Dashboard / Login đúng → Dashboard | (compose)   | Dashboard renders; no console errors / Dashboard hiện, không có error console                                           |     |
| 7   | (Optional) Open MIGRATION_GUIDE.md / Mở MIGRATION_GUIDE.md                | 5           | Title "v1.2 → v1.5"; cross-link works / Tiêu đề + cross-link OK                                                         |     |
| 8   | `git status --porcelain \| wc -l`                                         | 6           | ≤ 35 (B1+B2 deferred WIP only) / ≤ 35 (chỉ B1+B2 đang giữ chờ review)                                                   |     |

**End-to-end PASS condition / Điều kiện PASS:** all 8 rows ✓ AND total elapsed ≤ 5 min. / Toàn bộ 8 row ✓ VÀ tổng thời gian ≤ 5 phút.

---

<a id="section-4"></a>

## Section 4 — Rollback Decision Tree / Cây quyết định rollback

**Use this if any UAT scenario fails. Don't deploy until resolved. / Dùng khi có scenario fail. KHÔNG deploy đến khi giải quyết xong.**

```
                    ┌──────────────────────────────┐
                    │  Did a scenario fail?        │
                    │  Có scenario nào fail?       │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              │                    │                     │
              ▼                    ▼                     ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
    │ Single scenario │  │  ≥ 2 scenarios  │  │  Smoke failed    │
    │  failed         │  │   failed        │  │  only            │
    │ 1 scenario fail │  │  ≥ 2 fail        │  │  Chỉ smoke fail  │
    └────────┬────────┘  └────────┬────────┘  └─────────┬────────┘
             │                    │                     │
             ▼                    ▼                     ▼
    Investigate THAT     ROLLBACK to pre-     Re-run scenarios in
    fix's commit;        Step-B baseline      isolation; if all 7
    revert if blocking;  (commit f8c6b9f).    pass individually but
    else file as P0      Investigate w/o      smoke fails, file as
    follow-up.           time pressure.       integration bug; do
                                              NOT deploy.
    Điều tra commit      ROLLBACK về          Chạy lại từng
    của fix đó; revert   baseline trước       scenario; nếu cả 7
    nếu blocker; nếu     Step B (f8c6b9f).    pass riêng lẻ mà
    không thì hoãn       Điều tra không bị    smoke fail → bug
    sang follow-up.      áp lực thời gian.    integration. KHÔNG
                                              deploy.
```

### Specific failure → fix mapping / Bảng tra cứu fail

| If this scenario fails… / Nếu fail ở scenario… | Try this first / Thử trước                                                                                                    | If that doesn't work… / Nếu vẫn không được…                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Scenario 1 (DATA_DIR)                          | Check `.env` not reverted / verify systemd unit not v1.0-era / Kiểm tra .env không bị revert                                  | Roll back to last `releases/<ts>/` snapshot                                                                |
| Scenario 2 (compression)                       | `npm install compression@^1.8.1` — verify `package.json` has dep / Cài lại lib                                                | Re-run `npm run build` to re-bundle / Build lại                                                            |
| Scenario 3 (login unification)                 | Clear browser cache / PWA stale-cache window (≤ 5 min) / Xóa cache                                                            | Server-side rollback nếu vẫn lỗi                                                                           |
| Scenario 4 (a11y)                              | Check `client/dist/` rebuilt after `6b8542f` / Kiểm tra build sau commit                                                      | Re-run `cd client && npm run build`                                                                        |
| Scenario 5 (migration guide)                   | Wrong file? Confirm path is repo root `MIGRATION_GUIDE.md`, NOT `README FIRST/MIGRATION.md` (different scope) / Đọc đúng file | n/a — doc-only, no code rollback needed                                                                    |
| Scenario 6 (hygiene)                           | Branch out of date — `git fetch && git log` / Check branch                                                                    | Recovery from `wip-snapshot-20260504-082812` git tag                                                       |
| Scenario 7 (env-source log)                    | Check `NODE_ENV=test` not accidentally set (test-gated) / Kiểm tra NODE_ENV                                                   | If `server/utils/envSources.js` missing, deploy missed Fix 7 commit (`5fc6268`) / Nếu thiếu file, redeploy |
| Smoke (composite)                              | Re-run scenario 6 first (hygiene) / Chạy lại scenario 6 trước                                                                 | n/a — diagnose per row 1-7                                                                                 |

### "Hard rollback" emergency procedure / Quy trình rollback khẩn

If multiple critical fixes break in production AND you must restore service immediately: / Nếu nhiều fix gãy ở production VÀ phải khôi phục dịch vụ ngay:

```bash
# 1. Stop service / Dừng service
sudo systemctl stop ops-control      # Linux
nssm stop ops-control                # Windows

# 2. Identify pre-Step-B snapshot / Chọn snapshot trước Step B
ls /opt/ops-control/releases | head -5
PREV=<timestamp-before-step-b>

# 3. Restore in-place / Khôi phục tại chỗ (Sprint 1.7 pattern, CLAUDE.md "Bad deploy")
cd /opt/ops-control
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./

# 4. Restart / Khởi động lại
sudo systemctl start ops-control
journalctl -u ops-control -n 30        # confirm clean boot

# 5. File postmortem / Mở ticket post-mortem — Step B fixes need re-do
```

`server/data/` is not versioned by `releases/<ts>/`; if data corrupted, restore from `server/data/Backup/`. / Nếu data bị hỏng, khôi phục từ `server/data/Backup/`.

---

<a id="section-5"></a>

## Section 5 — Operator Coordination / Phối hợp với operator

### 5.1 Tester identification / Xác định tester

Pick a tester who matches **all** of these / Chọn tester thỏa **tất cả**:

| Criterion / Tiêu chí                                                             | Why / Lý do                                                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Operator with shell access on the deploy box / Operator có shell trên máy deploy | Several scenarios require `curl`, `grep`, `git status` from the host / Nhiều scenario cần shell trực tiếp |
| Admin UI access (sys or admin role) / Quyền admin UI                             | Scenarios 1, 4, 5, 6 touch admin paths / Cần truy cập admin                                               |
| Did NOT write the Step B code / KHÔNG phải người viết code Step B                | Independent verification — author bias would invalidate UAT / Tránh bias từ chính author                  |
| Comfortable in EN or VI / Thông thạo EN hoặc VI                                  | All scenarios bilingual; either works / Hai ngôn ngữ đều OK                                               |
| Available for ~60 minutes / Rảnh khoảng 60 phút                                  | Full pass timing budget / Thời gian chạy đủ 1 lần                                                         |

### 5.2 Time-slot scheduling / Lên lịch thời gian

| Item / Mục                                                | Recommendation / Khuyến nghị                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Best window / Khung giờ tốt nhất                          | Off-peak (early morning / lunch break / late evening) — production traffic doesn't interfere with timing tests / Giờ thấp điểm — không bị traffic ảnh hưởng |
| Notification to other operators / Thông báo operator khác | "UAT in progress, expect brief login slowness during scenario 3 timing tests" / Thông báo trước scenario 3 (test timing)                                    |
| Backup window / Backup trước UAT                          | Within 24 hours BEFORE UAT starts (tested per §1.4) / Trong 24h trước UAT                                                                                   |
| Rollback window / Cửa sổ rollback                         | 1 hour reserved AFTER UAT completion in case of issues / Giữ 1h sau UAT đề phòng                                                                            |

### 5.3 Test data preparation / Chuẩn bị dữ liệu test

A separate operator (NOT the tester) should prep the data per §1.2 + §1.3 BEFORE UAT starts. / Một operator khác (KHÔNG phải tester) chuẩn bị data theo §1.2 + §1.3 TRƯỚC UAT.

```bash
# 1. Provision the 4 test accounts via the running admin UI
#    Settings → Account Control → Users → New
#    Roles: sys, admin, user, viewonly
#    Set known passwords; share with tester via secure channel.

# 2. Verify sample data exists
test -e server/data/Library/Customers/customers.json
test -e server/data/Library/Manufacturing/structure.json
sqlite3 server/data/ops.db "SELECT COUNT(*) FROM quote;"   # ≥ 1

# 3. Take a confirming backup (Step B-aware)
npm run verify-backup
```

### 5.4 Findings template / Mẫu báo cáo finding

When a scenario fails, file a finding using the standard template below. Use whichever issue tracker the team uses (GitHub Issues, Linear, internal tracker). / Khi có scenario fail, dùng mẫu chuẩn dưới đây trong tracker mà team dùng (GitHub/Linear/tracker nội bộ).

```markdown
─────────────────────────────────────────────────────────────────
UAT Issue Report / Báo cáo lỗi UAT
─────────────────────────────────────────────────────────────────

ID: UAT-2026-MM-DD-NN (NN = sequential per UAT day / số thứ tự trong ngày)

Scenario / Step: Scenario [1..7] / [3] (smoke), Step #\_\_
Fix ID: [F4-5 / F3-1 / F2-1 / F3-3 / F3-4 / F4-21 / F0-6 / bonus]
Severity: [BLOCKER / MAJOR / MINOR / INFO]

Environment / Môi trường:
Host / OS: ****************\_\_\_\_****************
Branch: fix/pre-go-live-p0
HEAD commit: ****\_\_\_\_**** (run / chạy: git rev-parse HEAD)
Browser (if UI): ****************\_\_\_\_****************
Tester / Người test: ****************\_****************

Expected / Kỳ vọng:

---

Actual / Thực tế:

---

Steps to reproduce / Các bước tái hiện (exact commands / lệnh chính xác):

1. ***
2. ***
3. ***

Logs / screenshots attached / Đính kèm:
[ ] Boot log (`/var/log/ops-control.log` / `journalctl -u ops-control`)
[ ] Browser console screenshot
[ ] Server response body (`curl -v` output)
[ ] DevTools Network tab screenshot
[ ] Audit log row for affected action / Row audit log liên quan

Suggested action / Hành động đề xuất:
[ ] Fix on `fix/pre-go-live-p0` and re-run UAT / Sửa rồi chạy lại UAT
[ ] File as known limitation; ship anyway (note added to scenario) / Filed làm known limitation
[ ] Roll back the offending commit; re-do the fix / Rollback commit; làm lại fix
[ ] Investigate further — do NOT deploy until resolved / Điều tra thêm — KHÔNG deploy

Reporter signature / Người báo: ********\_******** Date / Ngày: ****\_\_****
─────────────────────────────────────────────────────────────────
```

Save filed reports under `docs/audit/uat-issues/` (create if missing) named `UAT-<date>-<NN>.md`. / Lưu file dưới `docs/audit/uat-issues/`.

### 5.5 Sign-off ceremony / Lễ ký nhận

A simple, repeatable ritual so the sign-off is meaningful, not a rubber stamp. / Quy trình đơn giản để ký nhận có thật chứ không phải đóng dấu cho có.

1. **Tester walks through all 7 scenarios + smoke / Tester chạy hết 7 scenario + smoke** with the technical lead present (in person, or screen share). / có technical lead chứng kiến (offline hoặc share màn hình).
2. **Both observe each step pass live / Cả hai cùng thấy mỗi step pass trực tiếp** — no blind ticking of boxes. / KHÔNG được tick suông.
3. **Any FAIL stops the ceremony / Bất kỳ FAIL nào cũng dừng lễ ký** — file finding (§5.4), break, return when fixed. / Mở finding rồi nghỉ, sửa xong quay lại.
4. **At end / Cuối buổi** both sign Section 6 form. / hai bên cùng ký vào form §6.
5. **Sign-off file is committed to repo / File ký nhận commit vào repo** as evidence under `docs/audit/uat-issues/SIGN-OFF-<date>.md` (or scanned PDF if printed). / dưới dạng .md hoặc PDF scan.

---

<a id="section-6"></a>

## Section 6 — Final Sign-off Form / Phiếu ký nhận cuối

**Final sign-off proves UAT is complete and the build is cleared for production deploy. / Ký nhận cuối là bằng chứng UAT đã xong và build sẵn sàng cho production.**

### Sign-off prerequisites / Điều kiện ký nhận

All of these must be true before signing / Phải đủ tất cả trước khi ký:

| ✓   | Item / Mục                                                                                |
| --- | ----------------------------------------------------------------------------------------- |
| ☐   | Scenarios 1-7 all marked PASS / Cả 7 scenario PASS                                        |
| ☐   | End-to-end smoke (§3) marked PASS / Smoke (§3) PASS                                       |
| ☐   | No outstanding "FAIL" in any row of any scenario / Không còn row nào FAIL                 |
| ☐   | "Notes / Issues" boxes triaged (fixed or filed as known limitation) / Notes đã xử lý xong |
| ☐   | Tester satisfied no rollback needed / Tester chắc chắn không cần rollback                 |

### Tester sign-off / Tester ký

**Branch:** `fix/pre-go-live-p0`
**HEAD commit at UAT start / Commit lúc bắt đầu UAT:** `e72cffe` (or current HEAD / hoặc HEAD hiện tại)
**Total scenarios run / Tổng scenario đã chạy:** \_\_\_\_ / 7
**Total scenarios passed / Tổng scenario PASS:** \_\_\_\_ / 7
**Smoke test / Smoke:** [ ] PASS [ ] FAIL
**Date UAT started / Ngày bắt đầu UAT:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
**Date UAT completed / Ngày hoàn thành UAT:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Tester name (printed) / Tên tester (in hoa):** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Tester role / Vai trò tester:**
[ ] Operator [ ] IT admin [ ] DevOps [ ] QA [ ] Other / Khác: \_\_\_\_\_\_\_\_\_\_

**Tester signature / Chữ ký tester:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Verdict / Kết luận:**

[ ] ✅ **APPROVED FOR PRODUCTION DEPLOY / DUYỆT DEPLOY PRODUCTION** — all scenarios + smoke PASS; no outstanding FAILs / cả 7 scenario + smoke PASS, không còn FAIL.

[ ] 🟡 **APPROVED WITH NOTES / DUYỆT KÈM GHI CHÚ** — all PASS but specific scenarios have notes — list / có note ở scenario nào:

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

[ ] ❌ **NOT APPROVED / KHÔNG DUYỆT** — failures listed in scenarios above must be addressed before re-test / fail phải sửa xong trước khi test lại.

### Counter-sign by technical lead / Đồng ký bởi technical lead

**Tech lead name / Tên tech lead:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Tech lead signature / Chữ ký tech lead:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Date / Ngày:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Production deploy authorized / Cho phép deploy production:**
[ ] YES / CÓ — proceed to deploy / tiến hành deploy
[ ] NO / KHÔNG — return to dev / quay về dev

---

## Acceptance gate / Cổng chấp nhận

UAT is complete when **either / hoặc**:

- All 7 scenarios + smoke PASS → tester signs `✅ APPROVED` → tech lead counter-signs → proceed to deploy. / Cả 7 + smoke PASS → tester ký APPROVED → tech lead đồng ký → deploy.
- Any scenario fails → file UAT Issue Report (§5.4) → return to development → re-test only failing scenarios after fix. / Có scenario fail → mở Issue Report → quay về dev → test lại chỉ scenario fail.

**Do not deploy without sign-off. / KHÔNG deploy nếu thiếu ký nhận.** Step B verified the dev box; UAT verifies the actual deploy target. They are two distinct checks. / Step B verify máy dev; UAT verify máy deploy thật. Hai bước khác nhau.

---

## Cross-references / Tham chiếu chéo

- Step B per-fix evidence / Bằng chứng từng fix: [`STEP-B-fix-summary.md`](STEP-B-fix-summary.md)
- Audit final report / Báo cáo audit cuối: [`FINAL-REPORT.md`](FINAL-REPORT.md)
- Fix 6 WIP triage / Phân loại WIP Fix 6: [`FIX-6-CLASSIFICATION.md`](FIX-6-CLASSIFICATION.md)
- Step A pre-fix verification / Step A tiền-fix: [`STEP-A-verify-f4-5.md`](STEP-A-verify-f4-5.md)
- Recovery runbooks / Runbook khôi phục: `CLAUDE.md` § "Recovery playbook"
- Verify-evidence screenshots / Ảnh bằng chứng verify: `docs/audit/screenshots/p0-*.png`
- Operator pattern reference / Tham chiếu pattern operator: `docs/Use guide/login-retry.md` (bilingual EN+VI structure mirror)
