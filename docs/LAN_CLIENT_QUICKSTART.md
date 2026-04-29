# LAN Client Quickstart — Ops Control v1.2

> **Audience:** end users on machine #2-#20 connecting to a Mac/Windows
> machine that's already running Ops Control v1.2 as the LAN server.
> One page. Five minutes.

## What you need from your IT/admin

1. **Server URL** — looks like `http://192.168.1.16:3100` (or HTTPS if Caddy is set up: `https://ops.local`)
2. **Username + password** — the admin creates this in Settings → Users
3. **DMG/EXE installer** — from `\\<server>\Public\OpsControl-1.2.0-arm64.dmg` or shared drive

---

## Install (macOS — Apple Silicon)

```
1. Double-click "Ops Control-1.2.0-arm64.dmg"
2. Drag "Ops Control" → Applications
3. First launch: right-click app → Open (Gatekeeper warning bypass)
   (One-time only; macOS remembers after the first override)
```

If Gatekeeper still blocks:
```
xattr -cr "/Applications/Ops Control.app"
```

## Install (Windows)

```
1. Double-click "Ops Control Setup 1.2.0.exe"
2. Smart Screen: "More info" → "Run anyway" (one-time)
3. Pick install path (default %LOCALAPPDATA%\Programs\OpsControl is fine)
```

If your IT has pushed the publisher cert via GPO Trusted Publishers,
Smart Screen won't appear at all.

---

## Point at the LAN server (3 clicks)

1. Open Ops Control
2. **Settings → 🔁 Chế độ kết nối**
3. Pick **Thin** card → enter URL anh được cung cấp (e.g. `http://192.168.1.16:3100`)
4. Click **Save & restart**

App restarts → login screen now talks to LAN server.

> **Why "Thin"?** Embedded mode runs its own local server (1 user, no
> sharing). Thin mode points at a remote server (many users, shared
> data). Smart mode is hybrid — local cache + sync (advanced; ask IT).

---

## First login

1. Username + password → click Đăng nhập
2. **2FA setup** (one-time): scan QR code with Google Authenticator /
   Microsoft Authenticator → enter 6-digit code
3. You're in. Settings persist; subsequent logins skip 2FA setup.

---

## Health checks anh có thể làm bất cứ lúc nào

| Check | How |
|---|---|
| Server kết nối ổn? | TopBar góc trái: nếu thấy banner đỏ "Mất kết nối server" → server tắt hoặc mạng rớt |
| Bao nhiêu người đang online? | TopBar góc phải: pill "● N online" — click để xem tên |
| Có quote/RFQ mới không? | Tabs auto-refresh trong 30-60s; SSE push tức thì khi user khác save |
| Login từ máy lạ? | Sau login, nếu thấy toast vàng "⚠ Login từ IP mới" mà không phải anh → đổi pwd ngay |

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | Server không chạy / máy server tắt | Liên hệ IT bật server lại |
| `ERR_CERT_AUTHORITY_INVALID` (HTTPS) | CA chưa được trust | Xem [INTERNAL_TRUST_SETUP.md](INTERNAL_TRUST_SETUP.md) |
| Login bị "Too many failed attempts" | 5+ lần nhập sai pwd → khóa 5min | Đợi 5 phút, hoặc admin reset qua Settings → Users |
| TOTP "Invalid code" liên tục | Đồng hồ máy lệch giờ > 30s | Settings → Date & Time → "Set automatically" |
| "Conflict — quote đã bị sửa bởi người khác" modal | 2 người cùng update 1 quote | Chọn "↻ Reload" để lấy bản mới (an toàn) hoặc "⚠ Overwrite" nếu chắc bản mình đúng |
| Tab trắng / chunk loading error | Cache cũ sau update | Cmd+Shift+R (hard reload). Nếu vẫn lỗi: Settings → Logout → Login lại |

---

## Cho IT/admin

Smoke test toàn bộ infra sau install:
```bash
./scripts/smoke-runtime.sh http://<server-ip>:3100
# Verifies /health, /api/events/stream, /api/users/status, …
# Pass: 8/8 green
```

Off-site backup nightly:
```bash
OPS_DATA_DIR=~/Library/Application\ Support/ops-control-desktop/data \
OPS_OFFSITE_TARGET=backup@nas.local:/volume1/ops-backup \
./scripts/backup-offsite.sh
# Add to cron: 30 2 * * *
```

HTTPS via Caddy (one shot):
```bash
brew install caddy
./scripts/setup-https-caddy.sh
sudo caddy run --config ~/.config/ops-control-caddy/Caddyfile
```

Anomaly audit log:
```bash
grep LOGIN_ANOMALY ~/Library/Application\ Support/ops-control-desktop/data/Library/Users/audit_log.json
```
