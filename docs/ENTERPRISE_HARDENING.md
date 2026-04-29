# Enterprise Hardening Proposal — Ops Control v1.2 → v1.3

**Phiên bản:** 1.0 · **Ngày soạn:** 2026-04-27 · **Tác giả:** Henry Dang — NPI Manager
**Đối tượng:** vendor + IT lead
**Phạm vi:** 20-user LAN deployment với enterprise-grade reliability

---

## Phần 0 — Tóm tắt điều hành

Sau audit toàn diện codebase Ops Control v1.2, tôi xác định được **15 vấn đề** chia 3 nhóm theo 3 mục tiêu của anh:

| Mục tiêu | Đã có | Cần cải tiến | Effort |
|---|---|---|---|
| 1. Auto-start + Reconnect | launchd/NSSM external + graceful shutdown | Client retry, health monitor, offline queue | 8h |
| 2. Data protection + Backup | Optimistic lock, atomic write, mutex, manual backup, quote_versions | Scheduled backup cron, off-site replication, verify daily, restore UX | 6h |
| 3. Security | Bcrypt, TOTP, CSRF, audit log, lockout, rate limit | At-rest encryption, audit retention, anomaly detection, HTTPS | 5h |

**Tổng effort cho hardening: ~19h** (cộng ~13h cho lộ trình B = **~32h**, ship được v1.3 production-ready cho 20-user trong 5-7 ngày dev).

Phần dưới chi tiết từng mục tiêu + priorty + estimated code change.

---

## Phần 1 — MỤC TIÊU 1: Auto-start + Network reconnect

### 1.1 Hiện trạng (sau audit)

| Hạng mục | Status | Chi tiết |
|---|---|---|
| Server auto-start when machine boots | ✅ Có | launchd (Mac) + NSSM (Win) — documented trong [LAN_DEPLOYMENT_GUIDE.md](LAN_DEPLOYMENT_GUIDE.md) |
| Server graceful shutdown | ✅ Có | SIGTERM handler 2s drain ([server/index.js:729](../server/index.js)) |
| Server auto-restart on crash | ✅ Có | launchd `KeepAlive=true`, NSSM Default Restart |
| Server health endpoint | ✅ Có | `/health` returns `{ok, uptime, version, memory}` |
| Server graceful uncaughtException | ✅ Có | Exit code 1 → external supervisor restart |
| **Client** API retry on network fail | ❌ KHÔNG có | Chỉ throw error generic, user thấy "Lỗi mạng" |
| **Client** connection health monitor | ❌ KHÔNG có | App im lặng khi server down |
| **Client** offline queue (write retry) | ⚠️ Smart-client.js có outbox nhưng UI chưa wire | Mode `smart` cần frontend complete |
| **Client** auto-reconnect with backoff | ❌ KHÔNG có | User phải reload tay |
| **Client** stale-data warning sau reconnect | ❌ KHÔNG có | Risk: user nhập tiếp vào state cũ |

### 1.2 Cải tiến đề xuất

#### 1.2.1 Server-side (1h)

**Đã có:** launchd `KeepAlive=true` + NSSM `Restart on failure`. KHÔNG cần thêm gì.

**Bonus quick win:** Thêm `/ready` endpoint phân biệt "server up" vs "server up + DB ready". Đã có `/health` check sơ bộ; nâng thêm DB ping + Library file check:

```js
// server/index.js
app.get('/ready', (req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    fs.accessSync(path.join(DATA_DIR, 'Library'), fs.constants.R_OK);
    res.json({ ok: true, ready: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
```

External supervisor (launchd/NSSM) hoặc nginx healthcheck dùng `/ready` thay `/health` để chỉ route traffic khi DB OK.

#### 1.2.2 Client-side (4h)

**A. Connection health monitor** ([client/src/services/connectionHealth.js](#) — 60 dòng)
```js
// Singleton hook, ping /health mỗi 15s, broadcast online/offline state
// Pause khi tab hidden (visibilitychange)
// Backoff khi offline (15s → 30s → 60s → max 5min)
```

**B. Top-level banner** ([client/src/components/Layout/ConnectionBanner.jsx](#) — 50 dòng)
- Đỏ banner sticky top khi offline > 10s: "⚠ Mất kết nối server. Đang thử lại..."
- Xanh toast khi reconnected: "✓ Kết nối lại — refresh dữ liệu?"
- Click "Refresh" → invalidate cache + re-fetch active tab

**C. API retry with exponential backoff** ([client/src/services/api.js](#) — patch 30 dòng)
- 5xx + network error → retry 3 lần (200ms / 500ms / 1500ms)
- Save endpoints: NO retry (vì optimistic lock — retry có thể tạo duplicate). Show error.
- Read endpoints: silent retry với backoff
- Authorization-failed (401/403): KHÔNG retry — kick to login

**D. Stale-data refresh prompt** ([client/src/services/connectionHealth.js](#) — thêm callback)
- Khi reconnect sau > 30s offline: hiện modal "Đã offline 2 phút. Refresh data để tránh xung đột?"
- 3 lựa chọn: "Refresh" / "Tiếp tục với data cũ (rủi ro 409)" / "Logout"

#### 1.2.3 Smart-client offline queue (4h, optional v1.3+)

Mode `smart` đã có outbox queue trong [desktop/native/cache.js](#). Cần wire frontend:
- Khi offline + user save: queue vào outbox + show "💾 Đã lưu local, sẽ sync khi online"
- Khi online lại: drain outbox, show toast per success
- Conflict resolution: nếu remote đã có version mới hơn → ask user reload vs overwrite

Đây là feature phức tạp; defer cho v1.3 sau khi 20-user pilot ổn.

---

## Phần 2 — MỤC TIÊU 2: Data protection + Backup

### 2.1 Hiện trạng

| Hạng mục | Status | Chi tiết |
|---|---|---|
| Data integrity locks | ✅ Có | SQLite WAL + busy_timeout 5s + asyncLock + atomicWriteFileSync |
| Quote version history | ✅ Có | quote_versions table — keep last 20 per quote ([quoteVersions.js:19](../server/repositories/quoteVersions.js)) |
| Optimistic lock conflict | ✅ Có | HTTP 409 với version detail |
| Manual backup endpoints | ✅ Có | 5 datasets: inventory/finishedGoods/rawMaterials/bom/routing + Library/Rate + Library/DDL |
| `db.backup()` SQLite online-safe | ✅ Có | [server/db/backup.js](../server/db/backup.js) |
| verify-backup.js script | ✅ Có | Schema validate critical files |
| Backup retention 30d | ✅ Có | `OPS_BACKUP_RETENTION_DAYS` (default 30) |
| Code backup endpoint | ✅ Có | `/api/backup/code-server` zips entire repo |
| **Auto-trigger backup cron** | ❌ KHÔNG có | Backup chỉ chạy khi admin click hoặc trong save flow |
| **Off-site backup** | ❌ KHÔNG có | Tất cả backup local → mất disk = mất data |
| **Backup verify daily** | ❌ KHÔNG có | Có script nhưng không tự chạy |
| **Restore UX** | ⚠️ CLI only | Admin phải SSH + chạy script — không UI |
| **Encryption at rest** | ❌ ops.db plain text | Anyone với file access đọc được toàn bộ data |

### 2.2 Cải tiến đề xuất

#### 2.2.1 IBM-style backup strategy: 3-2-1 rule

Tiêu chuẩn IBM cho enterprise:
- **3 copies** of data (1 primary + 2 backups)
- **2 different media** (disk + tape/cloud/NAS)
- **1 off-site** (geo-separated)

Áp dụng cho Ops Control:
- Primary: `server/data/ops.db` + `server/data/Library/`
- Local backup: `server/data/Backup/SQLite/ops_YYYYMMDD.sqlite` (đã có, manual)
- Off-site: rsync sang NAS hoặc cloud (S3/Drive/Dropbox)

#### 2.2.2 Implementation: Server-side backup scheduler (3h)

**A. In-process scheduler** ([server/services/backupScheduler.js](#) — 120 dòng, MỚI)

```js
// Cron-like internal scheduler. Runs daily at 02:00 (off-hours).
// 3 stages:
//   1. SQLite db.backup() → server/data/Backup/SQLite/ops_YYYYMMDD_HHMMSS.sqlite
//   2. Library/* tarball → server/data/Backup/Library/library_YYYYMMDD.tar.gz
//   3. Rsync to OFFSITE_BACKUP_PATH (env-configured): NAS/S3/cloud
// 4. Self-verify: open the SQLite backup, check integrity, count rows
// 5. Audit log: success/fail with row counts + size
// 6. Email/Slack alert on failure (env-configured webhook)
```

Activated by `OPS_BACKUP_SCHEDULE=1` env. Default OFF cho dev.

**B. Backup verify auto-cron** (đã có script, chỉ wire vào scheduler)
- Chạy verify-backup.js sau mỗi backup
- Fail → mark backup `untrusted` trong audit log
- Alert qua webhook nếu 2 backup liên tiếp fail

**C. Off-site rsync helper** ([scripts/backup-offsite.sh](#) — 50 dòng, MỚI)

```bash
#!/usr/bin/env bash
# Rsync backup folder to remote NAS or cloud.
# Pre-req: SSH key configured for nas-user@nas-host:/path
# Or: rclone configured for cloud (S3/Drive/Dropbox)
# Run nightly from cron AFTER backup-scheduler
```

#### 2.2.3 Restore UX — UI thay vì CLI (3h)

Settings → Maintenance → 🗄 **Backup / Restore** đã có manual backup; thêm:

**A. Backup list UI** — show all backups (date + size + verify status)
- Filter: SQLite / Library / Code
- Status badge: ✅ verified / ⚠ unverified / ❌ corrupt

**B. Restore wizard 3-step**
1. Pick backup (with preview: row counts, file sizes)
2. Show preview "Sẽ overwrite: ops.db (current 123MB → restore 118MB), Library/QuoteHistory (1024 rows → 998 rows)"
3. Confirm → backup current state to `.before-restore-<ts>` → execute restore → audit log → restart server

**C. Schedule preview** — admin thấy "Backup tiếp theo: 02:00 ngày mai. Backup gần nhất: 02:00 hôm nay (45 MB, ✅ verified)"

#### 2.2.4 Encryption at rest (1h, OPTIONAL P2)

`ops.db` hiện plain SQLite. Để encrypt:
- Option A: SQLCipher (open-source) thay better-sqlite3 → SQLite + AES-256
- Option B: Encrypt at filesystem level (FileVault Mac, BitLocker Win) — đơn giản hơn, transparent
- Option C: Selective field encryption (chỉ encrypt PII columns)

→ **Khuyến nghị: Option B** (FileVault/BitLocker) — zero code change, OS-level. Document trong DEPLOYMENT_GUIDE.

---

## Phần 3 — MỤC TIÊU 3: Security

### 3.1 Hiện trạng

| Hạng mục | Status | Chi tiết |
|---|---|---|
| Password hash | ✅ Bcrypt 10 rounds + auto-upgrade legacy | OWASP recommended ≥ 8 |
| TOTP 2FA | ✅ Bắt buộc cho sys/admin role | RFC 6238 chuẩn |
| TOTP secret encryption | ✅ AES-256-GCM + PBKDF2 200k iter (Bug 18 fix) | Strong |
| CSRF protection | ✅ Double-submit cookie | Phase 9H.4 |
| Session cookies | ✅ HttpOnly + SameSite=Strict | OWASP best |
| Rate limit per-IP | ✅ writeRateLimit 30/min, saveRateLimit 120/min | Adjustable |
| Login lockout | ✅ Có (authService.loginLockout.test.js) | After N failures |
| Audit log | ✅ Login, save, approve, password-change, group-change | server/data/Library/Users/audit_log.json |
| Permission groups | ✅ 3-layer SAP-style (role + dept + group) | Per-tab matrix |
| Server-side enforcement | ✅ requireTabAccess middleware | Defense-in-depth |
| **HTTPS in transit** | ❌ HTTP plain | LAN trusted, vẫn nên có |
| **Audit log retention** | ❌ Grow forever, không rotate | Could fill disk |
| **Anomaly detection** | ❌ Không có | E.g. login từ IP lạ, ngoài giờ |
| **Per-user rate limit** | ❌ Per-IP only | Shared NAT issue |
| **Brute-force IP block** | ⚠️ Lockout theo username, không IP-level | DDoS protection limited |

### 3.2 Cải tiến đề xuất

#### 3.2.1 HTTPS via Caddy (P1, 30 phút)

Documented trong LAN_DEPLOYMENT_GUIDE Phần H.1. Recap:
- Cài Caddy → reverse proxy localhost:3000 với cert tự sinh
- Mỗi user thêm `192.168.1.50 ops.local` vào hosts
- App config: `https://ops.local` thay `http://192.168.1.50:3000`

#### 3.2.2 Audit log retention + archive (1h, P0)

[server/services/auditRetention.js](#) — MỚI, 80 dòng:
- Daily cron: rotate audit_log.json > 30 days → `audit_log_archive/audit_YYYYMM.json.gz`
- Active log keep last 30 days
- Archive retain 12 months → delete
- Audit endpoint `/api/audit?from=&to=` queries cả active + archive

#### 3.2.3 Per-user rate limit (1h, P0 cho 20 user)

[server/middleware/rateLimit.js](#) — patch 30 dòng:
- Add new limiter `userRateLimit(60/min)` keyed by `req.user.id` thay req.ip
- Apply trên save endpoints
- Effect: Shared NAT (20 user 1 IP) vẫn được 60/min/user × 20 user = 1200/min capacity

#### 3.2.4 Anomaly detection (2h, P1)

[server/services/loginAnomaly.js](#) — MỚI, 100 dòng:
- Track login pattern per user: usual IPs (last 30 days), usual hours
- Trigger alert if:
  - Login từ IP chưa từng dùng → email user "Login mới từ IP X — không phải anh? Đổi password ngay"
  - Login ngoài giờ làm việc (08:00-19:00) → log warning
  - 5+ login khác IP trong 1 giờ → tạm khóa account 30 phút
- Audit log: ANOMALY_DETECTED event

#### 3.2.5 IP-level brute-force block (30 phút, P1)

[server/middleware/ipBlock.js](#) — MỚI, 50 dòng:
- Track failed login per IP (in-memory map, persist mỗi 5 phút)
- 10 fails / 1 hour → block IP 1 hour
- Whitelist via `OPS_TRUSTED_IPS` env (LAN range)
- Reset block via admin UI

---

## Phần 4 — Roadmap implementation

Phân chia thành 3 đợt ship để tránh big-bang risk:

### Đợt 1 — v1.2.1 (4 ngày dev): User-facing P0 — go-live ready cho 6 user

| Item | Hours | Files |
|---|---|---|
| Auto-refresh hook + apply 4 tabs | 1.5 | client/src/utils/useAutoRefresh.js + 4 tab patches |
| Connection health monitor + banner | 1.5 | client/src/services/connectionHealth.js + components/Layout/ConnectionBanner.jsx |
| API retry with backoff | 1 | client/src/services/api.js (patch) |
| 409 conflict modal | 1 | client/src/components/Shared/ConflictModal.jsx |
| Server `/ready` endpoint | 0.5 | server/index.js (patch) |
| Auto-trigger backup cron | 1.5 | server/services/backupScheduler.js (NEW) |
| Audit log rotation | 1 | server/services/auditRetention.js (NEW) |
| **Tổng đợt 1** | **8h** | **= ~1 day senior dev** |

→ Sau đợt 1, **ship cho 6-user pilot** (lộ trình A).

### Đợt 2 — v1.2.2 (3 ngày dev): Scaling cho 20 user

| Item | Hours | Files |
|---|---|---|
| JSON quotes → SQLite primary migration | 4 | server/repositories/quotesStore.js (refactor) + tests |
| SSE event stream `/api/events` | 4 | server/routes/events.js (NEW) + client subscriber |
| Per-user rate limit | 1 | server/middleware/rateLimit.js (patch) |
| Bcrypt rounds 10→8 (config) | 0.5 | server/services/authService.js (patch) |
| Restore UX (Settings UI) | 3 | client/src/modules/cost/tabs/RestoreSection.jsx (NEW) |
| **Tổng đợt 2** | **12.5h** | **= ~1.5 day senior dev** |

### Đợt 3 — v1.3 (1 tuần dev): Enterprise polish

| Item | Hours | Files |
|---|---|---|
| Off-site backup rsync helper | 1 | scripts/backup-offsite.sh (NEW) |
| Login anomaly detection | 2 | server/services/loginAnomaly.js (NEW) |
| IP brute-force block | 0.5 | server/middleware/ipBlock.js (NEW) |
| HTTPS Caddy setup automation | 1 | scripts/setup-caddy.sh (NEW) + docs |
| Smart-client offline queue UI | 4 | client wire + outbox UI |
| Active user list (header) | 2 | client/src/components/Layout/OnlineUsers.jsx |
| **Tổng đợt 3** | **10.5h** | **= ~1.5 day** |

**Tổng cộng 3 đợt = ~31h dev = 4-5 ngày senior dev full-time**.

---

## Phần 5 — Quyết định vendor cần

1. **Đợt 1 (4 ngày)** — confirm autonomous execute? → tôi làm ngay
2. **Đợt 2 (3 ngày)** — JSON→SQLite migration cần test cẩn thận trên prod data, anh muốn tôi chạy migration script trên DMG copy hay đợi user data thật?
3. **Đợt 3 (1 tuần)** — schedule sau pilot kết quả?
4. **Off-site backup destination**: NAS LAN, OneDrive, hay S3? Cần cấu hình credentials trên server.
5. **Anomaly detection alert channel**: Email (cần SMTP), Slack/Teams webhook, hay chỉ log trong app?
6. **HTTPS cert**: Self-signed (free, browser warning) hay Let's Encrypt internal CA (free, smooth)? Domain có sẵn không (`ops.local`?)?

---

## Phần 6 — Risk register sau hardening

| Risk | Trước | Sau hardening |
|---|---|---|
| User mất kết nối save → data lost | High | Low (offline queue + retry) |
| 2 user conflict quote → confused | Medium | Low (friendly modal + reload) |
| Server crash → 6 user blocked | Low | Low (auto-restart + monitor) |
| Disk full → backup fail silent | Medium | Low (verify daily + alert) |
| Lost local backup (disk fail) | High | Low (off-site replication) |
| Brute-force password | Medium | Low (lockout + IP block) |
| Audit log fills disk | Medium | None (rotation) |
| 20 user concurrent → tail latency | High | Low (SQLite primary 40× faster) |
| 30s polling stale data | Medium | Low (SSE push) |
| HTTPS MITM in LAN | Low | None (Caddy + cert) |

---

**Verdict cuối:** Sau 3 đợt hardening, Ops Control v1.3 đạt **enterprise reliability tier** tương đương SAP/IFS internal deployment cho công ty 20-50 user. Không cần migrate PostgreSQL cho đến > 50 concurrent user.

Tôi sẽ bắt đầu Đợt 1 ngay (autonomous mode).
