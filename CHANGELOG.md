# Changelog

All notable changes to Ops Control. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.3.0] — 2026-04-29 (autonomous upgrade pass)

In-place security + maintainability hardening of v1.2. Same UX, same data
shape — every change is additive or transparent. See `UPGRADE_LOG.md`
for per-phase decisions and `MIGRATION_GUIDE.md` for operator notes.

### Added

- **argon2id password hashing** — replaces `bcryptjs` for new hashes;
  silent rehash ladder upgrades existing bcrypt hashes on next login.
- **Ed25519 license signing** — replaces v1.2 HMAC-SHA256. Server holds
  the private key; client embeds only the public key. License v2 file
  format with `tier`, `max_users`, signed canonical payload.
- **License tier enforcement (S=15, M=20, L=50)** — server-side
  middleware `requireSeatAvailable()` blocks `POST /api/users` with
  HTTP 402 when over the seat cap. Tested at all 3 tiers.
- **Setup wizards** (`desktop/setupWizard.js`):
  - SERVER edition (4 steps) — License → Data path → Network/port → admin user
  - CLIENT edition (2 steps) — Server URL → connection test
- **Content Security Policy** on every BrowserWindow response
  (`default-src 'self'`, no frame, no object). `webview` disabled,
  `allowRunningInsecureContent: false`. External links route through
  `shell.openExternal()` instead of replacing the SPA.
- **Dev license keypair + signer**:
  `scripts/license/{dev-private,dev-public}.pem` and
  `scripts/license/generate-license.mjs` — CLI used by CCL HQ to mint
  signed customer licenses.
- **Server-side license verification** — `server/services/licenseService.js`
  + 7 tests (sign/tamper/expired/unlicensed-fallback + middleware).
- **Per-domain i18n registration** — `client/src/i18n/strings.js`
  exposes `registerStrings(slice)`; first domain module
  (`i18n/domains/security.js`) registers audit log keys at boot.
- **Domain-folder scaffolding** for v1.3 architecture (server-side):
  `server/domains/{costing,library,sales,planning,quality,security,
  basis,mes}/`. First extracted router: `security/routes/audit.js`.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — 5 jobs:
  audit / lint / test-server / test-client / build. `npm audit
  --audit-level=high` gates merges. Tagged releases also trigger
  installer build on `macos-14`.
- **Husky + lint-staged** pre-commit hook (activates when project is
  put under git).
- **Coverage gate** — Jest `coverageThreshold` 70% lines/functions/
  statements, 60% branches.

### Changed

- **Electron 33 → latest** — vás 3 high CVE (ASAR Integrity Bypass,
  AppleScript injection, executeJavaScript IPC spoof).
- **electron-builder 25 → 26**, **postcss latest** — 0 high vulns
  remaining in `desktop/` and `client/`.
- **ESLint 9 unified** at root (was 8/9 split between root/client).
- **Prettier 3** added with `.prettierrc.json` + `.prettierignore`.
- `desktop/license.js` — full rewrite for v2 format. v1.2 HMAC
  licenses are NO LONGER ACCEPTED; old `desktop/license.js` and tests
  archived to `_legacy/`.

### Security

- Password hashing: bcryptjs (~100 ms cost-12) → argon2id (~80 ms,
  4× harder against GPU/ASIC attack). Silent ladder migration so
  no operator action required.
- License: HMAC-SHA256 (single secret embedded in app) → Ed25519
  asymmetric (private key offline at CCL HQ). One leaked client
  install can no longer be used to sign fake licenses.
- CSP injected on every WebContents response — defends against XSS
  from user-uploaded artwork.
- BrowserWindow `webSecurity: true` + `webviewTag: false`.
- Navigation lockdown: `will-navigate` and
  `setWindowOpenHandler` route external URLs through
  `shell.openExternal()` so the SPA can't be replaced by a malicious
  link.

### Fixed

- npm audit: root 10 high (desktop chain) → 0; client 1 moderate → 0;
  root 2 moderate (dev-only `exceljs` → `uuid`) — accepted, fix
  requires major downgrade.
- ESLint config drift: removed `no-useless-escape` in `safeFn` regex,
  cleaned dead `bcryptLib` placeholder.

### Build

- 4 macOS DMG installers built (CLIENT + SERVER × arm64 + x64),
  staged in `dist/` with SHA-256 checksums in `dist/checksums.txt`.
- Windows `.exe` builds deferred — no Windows host or Wine on the
  current build env. CI workflow includes a path for it on
  `macos-14`/`windows-latest`.

### Deferred / known follow-ups

- `server/routes/costApi.js` god-file (2891 LOC) split — only the
  audit router was extracted as POC. Full migration mapped per
  domain in `MIGRATION_GUIDE.md`.
- v1.3 build artefact cleanup — sandbox blocked the cross-project
  `rm -rf` of `Ops Control v1.3/apps/desktop/dist-electron/{mac-arm64,
  win-unpacked}` (~2 GB). Manual command provided in `UPGRADE_LOG.md`.
- TLS for Client–Server (`mTLS` self-signed handshake) deferred to
  a future v1.3.1 — needs operator UX work for cert generation.

---

## [1.2.0] — Unreleased

Fresh start branch from v1.1. Same baseline (Carbon Login + Hardware UI + Import UI + 30/30 tests + free signing) + Sprint 1.3 Mode Switcher UI + Sprint 2.1 enterprise hardening (P0 user-facing).

### Added — Sprint 1.3 (UI)
- **Settings → 🔁 Chế độ kết nối** ([ModeSection.jsx](client/src/modules/cost/tabs/ModeSection.jsx) + [ModeSection.css](client/src/modules/cost/tabs/ModeSection.css)) — visual picker giữa 3 mode (`embedded` / `thin` / `smart`) với card UI hiển thị icon + title + subtitle + description + ưu/trade-off + ACTIVE/PREVIEW badge. URL editor cho thin/smart. Save qua `desktop.app.setConfig()` IPC + restart prompt khi mode đổi. Web mode hiện banner "không khả dụng".
- **Settings → ℹ️ About / Diagnostics** ([AboutSection.jsx](client/src/modules/cost/tabs/AboutSection.jsx) + [AboutSection.css](client/src/modules/cost/tabs/AboutSection.css)) — hiển thị Version (1.2.0 + build timestamp + mode + URL), Runtime (Electron/Node/Chrome/Platform), License (status + customer + expires + features + installation_id 24-char prefix), 5 Diagnostic test buttons (printer list, cache R/W roundtrip, license status, HW fingerprint, server /health) với latency hiển thị, Bug-report copy-to-clipboard JSON snapshot (KHÔNG chứa secrets). Dùng cho IT troubleshooting + bug report.

### Added — Sprint 2.1 v1.3 hardening (P0 user-facing, IBM-style enterprise)
- **Server-side scheduled backup cron** ([server/services/backupScheduler.js](server/services/backupScheduler.js) — 220 dòng) — daily SQLite `db.backup()` (online-safe) + Library `tar czf` + self-verify (PRAGMA integrity_check + row counts vs live) + retention 30d + webhook alert on fail. Activated via `OPS_BACKUP_SCHEDULE=1`. Default OFF cho dev. Wired vào [server/index.js](server/index.js) startup.
- **Audit log rotation + monthly archive** ([server/services/auditRetention.js](server/services/auditRetention.js) — 200 dòng) — daily move events > 30 days to `audit_log_archive/audit_YYYYMM.json.gz` (gzipped), keep active log fast. Prune archives > 12 months. Activated via `OPS_AUDIT_RETENTION=1`.
- **Connection health monitor** ([client/src/services/connectionHealth.js](client/src/services/connectionHealth.js) — 180 dòng) — singleton ping `/api/health` mỗi 15s, exponential backoff khi offline (15s → 30s → 60s → 5min), pause khi tab hidden (visibilitychange API), auto-resume khi visible. Pub-sub pattern với `subscribeConnection(fn)`.
- **Connection status banner** ([client/src/components/Layout/ConnectionBanner.jsx](client/src/components/Layout/ConnectionBanner.jsx) + CSS) — top-of-app sticky banner: hidden khi online; warning vàng "Đang kiểm tra kết nối..." khi offline 5-30s; đỏ "⚠ Mất kết nối server (Xs)" khi offline > 30s; xanh toast "✓ Kết nối lại — Refresh" 8s khi reconnect. Aria-live cho screen readers.
- **`fetchWithRetry` helper** (in connectionHealth.js) — exponential backoff 200/500/1500ms cho READ requests; KHÔNG retry 4xx (client error) hay save endpoints (tránh duplicate qua optimistic-lock 409 path).
- **`useAutoRefresh` hook** ([client/src/utils/useAutoRefresh.js](client/src/utils/useAutoRefresh.js) — 100 dòng) — generic polling hook với pause-when-hidden, in-flight guard, last-refreshed timestamp. Applied to **QuoteHistory tab** (poll 30s). Documented for RFQ Tracker / Sample Tracking / Approvals (Đợt 2).
- **`ConflictModal` component** ([client/src/components/Shared/ConflictModal.jsx](client/src/components/Shared/ConflictModal.jsx) + CSS) — friendly 409 conflict UI thay `window.confirm()`: 3 button "↻ Reload" / "⚠ Overwrite" / "Hủy", default focus Reload (safer), ESC-to-cancel, hiển thị server v + our v + savedBy. Sẵn sàng wire vào StandardCalc/ComplexCalc save flow (Đợt 2).

### Changed
- `LoginPage.jsx` — version + IP/host hiển thị **dynamic** thay hardcoded `v1.1.0` + `127.0.0.1`. Đọc qua `desktop.app.getConfig()` → show actual mode + URL. Classify env: EMBEDDED / DEV / LAN / SMART / PROD theo IP range (RFC1918).
- `App.jsx` — wire `<ConnectionBanner />` near top + `startConnectionMonitor({ endpoint: '/api/health' })` at module load.
- `QuoteHistory.jsx` — auto-refresh 30s + manual refresh button + "Sync 25s ago" indicator trong header.
- All docs author header → **Henry Dang — NPI Manager**.

### Documentation
- [docs/LAN_DEPLOYMENT_GUIDE.md](docs/LAN_DEPLOYMENT_GUIDE.md) — 6/20-user setup chi tiết: macOS launchd + Windows NSSM + backup cron + multi-user behavior + troubleshooting matrix
- [docs/GO_LIVE_READINESS.md](docs/GO_LIVE_READINESS.md) — P0/P1/P2 audit + risk register + verdict
- [docs/ENTERPRISE_HARDENING.md](docs/ENTERPRISE_HARDENING.md) — IBM-style 3-2-1 backup proposal, 3 mục tiêu (auto-start + reconnect, data protection, security), roadmap 3 đợt

### Audit findings (concurrency-safe verified)
- ✅ SQLite WAL + busy_timeout 5s + transactions
- ✅ Async mutex `withLock(key, fn)` + cross-process lock via proper-lockfile
- ✅ Atomic file write (tmp+fsync+rename POSIX guarantee)
- ✅ Optimistic locking on quotes (`_version` field → HTTP 409)
- ✅ Rate limit per-IP (writeRateLimit 30/min, saveRateLimit 120/min)
- ✅ Server bind 0.0.0.0 (LAN-ready)
- ⚠️ JSON quote_history.json mutex bottleneck @ 20 users → migrate to SQLite primary (Đợt 3 todo)
- ✅ Real-time sync via SSE event bus (Đợt 2)

### Added — Sprint 2.2 v1.3 hardening (Đợt 2 — scaling + real-time)
- **Per-user rate limit factory** ([server/middleware/rateLimit.js](server/middleware/rateLimit.js)) — `userSaveRateLimit` (60/10min/user) + `userWriteRateLimit` (30/10min/user) keyed by `req.user.id` với IP fallback. Một user xấu không kéo cả LAN xuống.
- **In-process event bus** ([server/services/eventBus.js](server/services/eventBus.js)) — pub-sub `emitDataChange(type, payload, opts)` + `subscribeEvents(send, opts)` với audience filter + sequence numbers + dead-subscriber cleanup.
- **SSE endpoint `/api/events/stream`** ([server/routes/events.js](server/routes/events.js)) — auth via cookie/Bearer/?t= query, heartbeat 25s, X-Accel-Buffering hint cho nginx, ready event on connect.
- **Server emit hooks** — wired vào write paths:
  - `quote.saved` + `quote.deleted` từ POST/DELETE/restore/PATCH `/api/quotes` ([server/routes/costApi.js](server/routes/costApi.js))
  - `library.imported` batched từ POST `/api/save-all` (per dataset, deduped)
  - `rfq.updated` + `sample.updated` từ audit/attachment add/remove ([server/routes/shared.js](server/routes/shared.js))
  - `approval.transition` từ atomic transition route + auto `quote.saved` follow-up
- **Client SSE subscriber** ([client/src/services/dataEventBus.js](client/src/services/dataEventBus.js)) — singleton EventSource, channel-filtered pub-sub (`subscribeDataEvents(channels, fn)`), seq-gap detection, auto-reconnect via browser EventSource native behavior.
- **4 tabs subscribed to SSE** — instant refetch (< 50ms) thay vì chờ poll:
  - [QuoteHistory.jsx](client/src/modules/cost/tabs/QuoteHistory.jsx) — `quote.saved` + `quote.deleted` + `approval.transition`
  - [RFQTracker.jsx](client/src/modules/cost/tabs/RFQTracker.jsx) — `rfq.updated`
  - [SampleTracking.jsx](client/src/modules/cost/tabs/SampleTracking.jsx) — `sample.updated`
  - [PendingApprovalsInbox.jsx](client/src/modules/cost/tabs/PendingApprovalsInbox.jsx) — `approval.transition` + `quote.saved`
- **`useAutoRefresh` applied broader** — RFQ Tracker (60s), Sample Tracking (60s), Approvals Inbox (30s). Polling là fallback khi SSE rớt.
- **ConflictModal wired into save flow** — [StandardCalc.jsx](client/src/modules/cost/tabs/StandardCalc/StandardCalc.jsx) + [ComplexCalc.jsx](client/src/modules/cost/tabs/ComplexCalc/ComplexCalc.jsx) thay `window.confirm()` bằng modal 3-button (Reload / Overwrite / Cancel) preserve user edits.

### Changed (Đợt 2)
- `App.jsx` — `startDataEventStream()` boot at module load (pair với `startConnectionMonitor`).

### Added — Sprint 2.3 v1.3 hardening (Đợt 3)
- **Off-site backup helper** ([scripts/backup-offsite.sh](scripts/backup-offsite.sh)) — IBM 3-2-1 rule's "1 off-site" copy. Picks newest local SQLite + Library tarball, rsync's to USB/NAS/SSH target, sha256-verifies destination, optional retention prune (local-mount only), webhook alert on failure. Cron-friendly (e.g. `30 2 * * *` after the in-process scheduler at 02:00).
- **ActiveUsersIndicator** ([client/src/components/Layout/ActiveUsersIndicator.jsx](client/src/components/Layout/ActiveUsersIndicator.jsx) + CSS) — TopBar widget showing "● N online" pill. Click → popover liệt kê tên + role + recent-offline với last-seen. Polls `/api/users/status` mỗi 30s + refresh trên SSE write events (free presence signal). Pause khi tab hidden.
- **Backup upload UI** — Settings → Backup/Restore mới có nút "📤 Upload từ máy khác…" (sys-only). POST `/api/backup/upload` validates JSON shape (must have ≥1 known dataset key) trước khi persist vào `Backup & restore/Data/`. Xong rồi user click Restore từ list. Cho phép restore từ off-site copy / USB stick mà không cần rsync vào folder.
- **HTTPS Caddy helper** ([scripts/setup-https-caddy.sh](scripts/setup-https-caddy.sh)) — one-shot TLS reverse proxy generator. Self-signed mode (Caddy internal CA) cho LAN deploy, public ACME mode (Let's Encrypt) cho hosts có DNS public. Generates `Caddyfile` reverse-proxy 443 → 3100 với gzip + X-Forwarded-* headers + access log rotation. Trust-CA instructions cho macOS/Windows clients.

### Bug fixes (Đợt 3)
- **Smart mode → ERR_ADDRESS_INVALID (-108)** — [desktop/main.js](desktop/main.js): `startEmbeddedServer()` chỉ chạy khi mode='embedded', smart mode rớt vào `getAppUrl()` → `http://127.0.0.1:0` (embeddedPort chưa set) → renderer crash với ERR_ADDRESS_INVALID. Fix: smart mode cũng start embedded server (smart cần local cache + remote sync). Plus `getAppUrl()` throw rõ ràng nếu port=0 thay vì silent fail.
- **Default remoteUrl** — đã thay `http://10.102.3.61:3000` (LAN cũ) bằng môi trường-aware default. User vẫn override được qua Settings → Mode UI.

### Added — Sprint 2.4 v1.3 hardening (Đợt 4)
- **Login anomaly detection** ([server/services/loginAnomaly.js](server/services/loginAnomaly.js)) — server-side, in-memory, runs after successful auth. Heuristics:
  - `concurrent_multi_ip` — same user logged in from 2+ IPs within 5min window
  - `new_ip` — IP not seen in last 30d for this user (skipped on first-ever login)
  - `unusual_hour` — login at 22:00–06:00 when user has no prior unusual-hour history (3+ login baseline)
- Server: stamps `LOGIN_ANOMALY` audit event + emits SSE `security.alert` (audience: admins).
- Client: `LoginPage` shows yellow toast cảnh báo user themselves; `App.jsx` admins also see toast for ANY user's anomaly so security ops can react.

### Added — Sprint 2.5 v1.3 hardening (Đợt 5 — backend cutover)
- **SQLite primary backend default for desktop** — [desktop/main.js](desktop/main.js) now sets `OPS_DATA_BACKEND=sqlite` + `OPS_BACKUP_SCHEDULE=1` + `OPS_AUDIT_RETENTION=1` by default. Removes JSON-mutex serialization bottleneck @ 20 concurrent saves; reads now indexed-fast in SQLite. JSON write still mirrors as backup safety net (will remove after 14d observation per Sprint 7.4 plan).
- **AboutSection diagnostic tests +3** — [client/src/modules/cost/tabs/AboutSection.jsx](client/src/modules/cost/tabs/AboutSection.jsx):
  - `Quote backend` — shows current backend (sqlite/file) + row counts (parity at-a-glance)
  - `SSE event stream` — number of subscribers (sanity check that SSE infra is live)
  - `Active users` — N online of total registered
- **SSE security.alert subscription** — `dataEventBus.js` registers the event type; admins-only consumer in `App.jsx` shows real-time anomaly toast.

### Added — Sprint 2.6 v1.3 hardening (Đợt 6 — operator tools)
- **Active Sessions admin tab** — [Settings.jsx AccountSection](client/src/modules/cost/tabs/Settings.jsx) → Sessions sub-tab (sys-only). Shows username, role, 2FA status, token prefix, expires-in for every active session. "Revoke" button per-row → POST `/api/auth/sessions/revoke` kicks user from all machines. Pairs with login anomaly detection: when admin sees `LOGIN_ANOMALY` toast, they can immediately revoke the suspicious user's sessions from this tab.
- **Runtime smoke test** — [scripts/smoke-runtime.sh](scripts/smoke-runtime.sh) curl-based 8-check post-install validator. READ-ONLY (no kill / signal / mutation). Verifies `/health`, `/assets/* → 404`, `/api/events/stream` auth gate, `/api/users/status` auth gate, etc. With `OPS_TOKEN=<token>` env, runs deep checks (parity, SSE subs, online count).
- **LAN Client Quickstart** — [docs/LAN_CLIENT_QUICKSTART.md](docs/LAN_CLIENT_QUICKSTART.md) one-page setup guide for end users on machines #2-#20: install DMG/EXE, point at server URL via Settings → Mode → Thin, first login + 2FA. Includes troubleshooting matrix (chunk errors, conflict modal, TOTP fail) + ops section (smoke test, off-site backup, Caddy HTTPS, anomaly grep).

### Bug fixes (Đợt 6)
- **Login screen background "blinking"** — replaced upward-vector stream with v1.0-style constellation particle network. Restored dark blue gradient (`#0a1220 → #13233d`) + dotted blueprint grid + random-velocity dots + thin network lines between nearby pairs. Removed mouse coupling (was causing the perceived flicker as cursor crossed particles).
- **Hardcoded "v1.0" / "v1.1"** — Settings → About panel + LoginPage session-expired card both used hardcoded version strings. Now dynamic from `app.getVersion()` via `serverInfo.version` IPC.
- **Session-expired card stuck top-left** — compact CSS removed `position: fixed` + `min-height` so the card had no viewport to center against. Re-added grid centering + viewport-fill background.
- **smoke-runtime.sh killing user's app** — earlier iteration paired the test with `kill $(lsof -t -iTCP:3100)` cleanup which would unintentionally SIGTERM the desktop app's embedded server. All kill/signal logic removed; script is now strictly READ-ONLY.
- **Thin-mode self-loop → ERR_CONNECTION_REFUSED** — when user picks Thin mode but `remoteUrl` points at this machine's own IP (loopback or local NIC), [main.js](desktop/main.js) now auto-starts the embedded server and uses the loopback URL. Realistic case: one Mac is BOTH server AND client desktop.

### Bug fixes
- LoginPage version + IP hardcoded → dynamic
- Server hot-patch cleanup: bundle structure broken when rsync entire folders into installed .app — switched to granular file copy

### Changed
- `desktop/main.js` — `ops:set-config` IPC handler giờ **dynamic mode swap** giữa `thin ↔ smart` không cần restart full. Chỉ start/stop smart-client engine on-the-fly. Embedded ↔ thin/smart vẫn cần restart (server boot heavy). URL change trong cùng mode vẫn cần restart (cookie/session tied to old URL).

### Planned (still)
- Sprint 5 deployment: nginx update repo + auto-update flow live test
- Pilot rollout 3 máy + feedback collection
- Smart-client mode `smart` end-to-end (Sprint 3 backend done, frontend wire pending)
- Bytenode IP compile in release pipeline (Sprint 4 anti-piracy)
- Windows EXE build + GPO trust push test
- Mode switcher UI trong Settings (embedded/thin/smart)

### Changed
- All `package.json` version bumped 1.1.0 → 1.2.0
- All description "Ops Control v1.1" → "Ops Control v1.2"

---

## [1.1.0] — 2026-04-27

Desktop app release. Web app v1.0 codebase wrapped in Electron 33 với native hardware bridges, smart-client cache, Carbon-style login UI redesign, và one-click data migration từ v1.0.

### Added
- **Electron 33 desktop shell** ([desktop/main.js](desktop/main.js)) — 3-tier smart client (Tier 1 Presentation + Tier 2 Express embedded + Tier 3 SQLite local). 3 modes: `embedded` (in-process server), `thin` (gọi remote), `smart` (hybrid offline-capable, Sprint 3+).
- **Native hardware bridges** ([desktop/native/](desktop/native/)):
  - Zebra/TSC label printer (TCP:9100 raw socket — không cần driver)
  - Office printer A4/A3 (pdf-to-printer + SumatraPDF bundled)
  - Cân điện tử RS232/USB-Serial (serialport + parser regex)
  - Scanner USB-HID raw + keyboard wedge fallback
  - Sandboxed file dialogs với whitelist path
  - SQLite local cache (KV + master_cache + outbox queue + sync_state)
- **Settings → 🔌 Thiết bị phần cứng** ([HardwareSection.jsx](client/src/modules/cost/tabs/HardwareSection.jsx)) — UI cấu hình IP printer, COM port cân, scanner mode, default office printer. Live test: ping printer, đọc weight realtime, scan barcode preview.
- **Settings → 📥 Import data v1.0** ([ImportLegacySection.jsx](client/src/modules/cost/tabs/ImportLegacySection.jsx)) — folder picker → scan + preview (table + sizes) → 1-click copy. Schema validation peek 5 core tables (`quotes`, `materials`, `ifs_inventory`, `bom`, `routing_operations`) trước import — block button + warning nếu folder pick có ops.db sai schema. Skip Users + totp + audit để giữ login + 2FA hiện tại.
- **License manager** ([desktop/license.js](desktop/license.js)) — HW fingerprint SHA256 (CPU + MAC + motherboard SN qua node-machine-id) + HMAC-signed license file + trial 14 ngày auto-issued + boot probe. `OPS_LICENSE_SECRET` env override cho production.
- **Auto-update** ([desktop/auto-update.js](desktop/auto-update.js)) — electron-updater polling `http://10.102.3.61/updates/` (configurable). Background download + restart prompt.
- **Smart-client sync engine** ([desktop/smart-client.js](desktop/smart-client.js)) — pull delta theo `_saved_at`, push outbox FIFO, ping online detection mỗi 15s, broadcast status qua IPC.
- **Server sync routes** ([server/routes/sync.js](server/routes/sync.js)) — `GET /api/sync/{manifest,pull}` + `POST /api/sync/push`. Auth-required.
- **🎨 Carbon split-screen Login UI** ([LoginPage.jsx](client/src/components/Auth/LoginPage.jsx)) — IBM Carbon + IFS Cloud + SAP Fiori inspired. Hero panel bên trái (đen, brand mark + "Pricing & planning, **online or off.**" + version footer) + form card bên phải (sharp corners, monospace accents, big blue Sign in button với arrow). 3 screens cùng style: Login / TOTP / Enrollment. Compact mode (session-expired modal) + responsive < 880px + dark mode auto.
- **30 unit tests**:
  - 7 tests cho `server/routes/sync.js` (route mounting, auth gate, manifest, pull filter, push validation)
  - 10 tests cho `desktop/license.js` (HW fingerprint determinism, sign canonical, verify {bad-sig, hw-mismatch, expired, valid}, trial issue, applyLicense)
  - 13 tests cho `desktop/native/cache.js` (KV roundtrip, master_cache upsert/list, outbox enqueue/markDone/markFailed, sync_state)
- **Free signing scripts** ([scripts/sign-windows.ps1](scripts/sign-windows.ps1) + [scripts/sign-macos.sh](scripts/sign-macos.sh)) — Windows self-signed cert auto-generate (10 năm) + GPO push instructions; macOS ad-hoc sign + clear quarantine. Tiết kiệm 401 USD/năm so với EV cert + Apple Dev ID.
- **Build wrapper** ([scripts/build-desktop.sh](scripts/build-desktop.sh)) — workaround node-gyp space-in-path bug bằng cách sync sang `/tmp/ops-build/` rồi build, copy artifact về.
- **Bytenode IP compile** ([scripts/build-bytecode.js](scripts/build-bytecode.js)) — Sprint 4: compile 4 file IP cốt lõi (`calcEngine`, `inkCalcCore`, `layoutOptimizer`, `printAreaCore`) sang V8 bytecode `.jsc` cho anti-piracy.
- **Release script** ([scripts/release.sh](scripts/release.sh)) — bump version + build client + bytenode + electron-builder + post-build sign + rsync upload tới `10.102.3.61:/var/www/updates/`.
- **Documentation**:
  - [SOLUTION_v1.1.md](SOLUTION_v1.1.md) — kiến trúc 3-tier + roadmap 5-sprint + bug log 19 entries + cost analysis
  - [docs/DESKTOP_DEPLOYMENT.md](docs/DESKTOP_DEPLOYMENT.md) — IT guide deploy 50 máy (firewall, GPO, MDM, troubleshooting matrix)
  - [docs/INTERNAL_TRUST_SETUP.md](docs/INTERNAL_TRUST_SETUP.md) — free signing migration path (self-signed + GPO + ad-hoc + LAN distribution)
  - [desktop/README.md](desktop/README.md) — dev quick-start + 5-step install + hardware compatibility matrix

### Changed
- `server/services/authService.js` — TOTP cipher từ `chacha20-poly1305` → `aes-256-gcm` (Electron BoringSSL compat — bug 18 fix)
- `server/index.js` — mount `/api/sync` + `/api/v1/sync` routes với authMiddleware
- `client/src/services/desktopBridge.js` — abstraction layer Electron API ↔ web fallback. Keyboard wedge mode cho scanner trong web mode.
- `desktop/package.json` — Electron 33.4.11 + electron-store v8.2.0 (downgrade từ v10 ESM-only) + better-sqlite3 + node-hid + serialport + node-machine-id

### Fixed
- 19 bug fixed during PoC (xem [SOLUTION_v1.1.md Section 9.4](SOLUTION_v1.1.md)). Highlights:
  - Bug 7: `ELECTRON_RUN_AS_NODE=1` từ VSCode shell làm Electron chạy như Node thuần — workaround `env -u ELECTRON_RUN_AS_NODE` khi launch
  - Bug 13: Bundled server thiếu `package.json` `"type": "module"` cho ESM — fix bằng extraResources
  - Bug 14: better-sqlite3 không có `.node` binary trong bundle — fix bằng `electron-rebuild --module-dir /tmp/ops-build`
  - Bug 15: EPIPE crash khi launch từ Finder — fix disable console transport khi packaged + uncaughtException guard
  - Bug 18: TOTP enroll cipher unknown — fix swap sang `aes-256-gcm`
  - Bug 19: Dashboard "database_shape_mismatch" — fix Import UI schema validation + restore script

### Performance
- Boot time: **270 ms** (Electron launch → window load) — DoD < 5s ✓
- Embedded server ready: **232 ms** (spawn + Express preflight + SQLite open)
- DMG size: **158 MB** (sau khi clean .pre-sqlite migration backup + broken TOTP files)
- Installed app: **381 MB** (giảm 72 MB so với DMG đầu)

### Cost
- Annual operating cost: **0 USD** (vs 401 USD nếu mua EV cert + Apple Dev ID)
- Free Windows code signing: self-signed cert (10 năm) + GPO Trusted Publishers push
- Free macOS code signing: ad-hoc sign + IT-distributed (no quarantine attribute)

---

## [1.0.x] — 2026-03 → 2026-04 (Web app baseline)

Tham chiếu: web app v1.0 ở [`../Ops Control/`](../Ops%20Control/CLAUDE.md). Sprints 11–14 hardening landed 2026-04-25 với 1,025 tests pass (560 server + 465 client). v1.1 copy nguyên codebase này + thêm desktop layer.
