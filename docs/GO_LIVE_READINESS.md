# Go-Live Readiness Audit & Roadmap

**Phiên bản:** 1.2.0 · **Cập nhật:** 2026-04-27 · **Đối tượng:** vendor + IT lead

Đánh giá readiness cho 6-user LAN deployment. Phân loại P0 (blocker) / P1 (important) / P2 (nice-to-have).

---

## Tóm tắt readiness

| Aspect | Status | Verdict |
|---|---|---|
| Concurrency safety (data integrity) | ✅ 8/8 cơ chế (WAL, mutex, atomic write, optimistic lock, transactions, rate limit) | **Ready** |
| Data backup + recovery | ✅ Manual + cron documented + verify-backup script | **Ready** |
| Auth + 2FA + sessions | ✅ Bcrypt + TOTP + CSRF + session persistence | **Ready** |
| Audit log | ✅ Mọi save / approve / login đều log | **Ready** |
| Permission groups | ✅ 3-layer SAP-style (role + dept + group) | **Ready** |
| HTTPS | ⚠️ Cần Caddy/nginx reverse proxy (15 phút setup, doc đã có) | **P1 — Setup-time** |
| Real-time multi-user UX | ❌ Chỉ chat real-time. Quote/RFQ/Library KHÔNG auto-refresh | **P0 — Blocker** |
| Connection status indicator | ❌ App không báo khi mất kết nối server | **P0 — Blocker** |
| 409 conflict UX | ⚠️ Throw error, chưa có dialog friendly | **P0 — Blocker** |
| Active user awareness | ❌ Không thấy ai đang online ngoài Settings → System Logs | **P1** |
| Edit-lock indicator (ai đang edit quote) | ❌ Chưa có | **P2** |
| Auto-update channel (nginx) | ⚠️ App có sẵn electron-updater. Server-side `/updates/` chưa setup | **P1 — Setup-time** |
| Code-signing thật (EV cert) | ⚠️ Đang ad-hoc/self-signed (FREE path documented) | **OK cho internal** |
| Pilot rollout test | ❌ Chưa pilot 3 máy | **P0 — Process** |

---

## P0 — BLOCKER (phải fix trước go-live)

### P0-1: Auto-refresh trên 4 tab critical

**Vấn đề:** Hiện chỉ Dashboard auto-refresh 60s. Quote History / RFQ Tracker / Sample Tracking / Approvals Inbox KHÔNG auto-refresh → user A save → user B reload thủ công mới thấy. UX kém cho 6-user concurrent.

**Fix (đã implement v1.2 Sprint 2.1):**
- Generic `useAutoRefresh(fetchFn, intervalMs, enabled)` hook
- Apply 4 tabs với interval 30-60s
- Pause polling khi tab hidden (`visibilitychange`)
- Show "Last updated: 14:35" + manual refresh button

**Estimated effort:** 1.5h (hook + apply + tests)

### P0-2: Connection status banner

**Vấn đề:** Khi server crash hoặc mạng LAN down, app im lặng — user gõ form mà save thất bại không hiểu sao. Cần banner đỏ "Mất kết nối server" + retry indicator.

**Fix (đã implement v1.2 Sprint 2.2):**
- `useConnectionHealth()` hook — ping `/health` mỗi 15s
- Top-of-app banner đỏ khi offline > 10s
- Auto-recover xanh lúc reconnected
- Pause polling khi tab hidden

**Estimated effort:** 1h

### P0-3: 409 Conflict modal friendly

**Vấn đề:** Khi 2 user cùng sửa quote, save sau bị 409 → throw error generic. User không biết phải làm gì.

**Fix (đã implement v1.2 Sprint 2.3):**
- Wrap 409 trong `<ConflictModal>` với 2 button: "↻ Reload bản mới" / "⚠ Overwrite (mất sửa kia)"
- Hiển thị who saved + when
- Default focus "Reload" (safer)

**Estimated effort:** 1h

### P0-4: Pilot 3 máy

**Vấn đề:** Chưa test trên môi trường thật.

**Fix:** Process — không phải code. Vendor + IT chọn 3 máy thử nghiệm:
- 1 Mac + 2 Win, hoặc 3 Win, hoặc 3 Mac
- Cài DMG/EXE → mode `thin` → pin về server
- Pilot 3 ngày, daily check log + user feedback
- Fix bug khẩn cấp nếu có
- Sau 3 ngày nếu không bug nghiêm trọng → rollout 6 máy

**Estimated effort:** 3 ngày × 2h/day check + hỗ trợ pilot user

---

## P1 — Important (làm trong tuần đầu sau go-live)

### P1-1: HTTPS qua Caddy

**Vấn đề:** Hiện chạy HTTP. Trong LAN nội bộ chấp nhận được (không có MITM risk thực sự nếu LAN trusted), nhưng best practice + tránh browser warnings.

**Fix:**
1. Server cài Caddy (1 lệnh `brew install caddy` Mac, hoặc download Win binary)
2. Caddyfile (10 dòng) → reverse proxy localhost:3000 + cert tự sinh
3. User thêm `192.168.1.50 ops.local` vào `/etc/hosts` (hoặc cấu hình DNS local)
4. Mode trong Settings: `https://ops.local` thay `http://192.168.1.50:3000`

**Estimated effort:** 30 phút setup + 5 phút mỗi user

### P1-2: Active user list (online indicator)

**Vấn đề:** User không biết ai đang online. Có data trong Settings → System Logs nhưng cần show ngay header.

**Fix:**
- Top-bar status: "👥 3 online" hover → list (Tên + last activity)
- Endpoint `/api/auth/online-users` đã có (Sprint 13)

**Estimated effort:** 2h

### P1-3: Auto-update repo setup

**Vấn đề:** App có electron-updater nhưng server `/updates/` chưa serve manifest.

**Fix:**
1. Trên server, cài nginx (Mac: `brew install nginx` / Win: nssm + nginx.exe) hoặc dùng Caddy thay
2. Config serve `/var/www/updates/` qua port 80
3. CI script `scripts/release.sh` đã có — vendor build + rsync `latest-mac.yml` + DMG lên server
4. App tự check mỗi 6h

**Estimated effort:** 1h server setup + 30 phút test

### P1-4: SSE event stream cho data thay đổi

**Vấn đề:** Polling 30s dùng được nhưng vẫn delay tối đa 30s + tốn CPU/bandwidth nếu nhiều client.

**Fix:**
- Server endpoint `/api/events` (SSE) — emit event khi quote save, RFQ update, library write
- Client subscribe — invalidate cache + show toast "User X vừa save quote Y"
- Chat đã dùng SSE pattern này — replicate cho data tabs
- Ưu điểm: instant push, nhẹ CPU (chỉ emit khi có thay đổi)

**Estimated effort:** 4-6h (server emit hook + client subscribe + test với 6 user)

---

## P2 — Nice-to-have (post-launch)

### P2-1: Edit-lock indicator
"User A đang sửa quote #5" — show banner cho user khác mở cùng quote. Server tracks `currentlyEditing[quoteId] = userId + timestamp`. Auto-release sau 2 phút idle.

### P2-2: Activity feed sidebar
"User X saved quote Y at 14:35" — feed bên phải, last 20 actions. Helps team awareness.

### P2-3: Conflict diff viewer
Khi 409 conflict, hiển thị side-by-side diff giữa "phiên bản tôi" và "phiên bản trên server". Operator pick từng field giữ.

### P2-4: Offline-first mode `smart` end-to-end wire
Sprint 3 backend đã xong (sync routes), Mode UI đã có. Cần wire frontend cache hook + sync queue UI. Cho phép user làm việc offline (mất mạng vẫn save → sync lại khi có mạng).

---

## Tổng kết action items

### Sẵn sàng go-live khi:
- ✅ P0-1, P0-2, P0-3 đã implement (xem v1.2 Sprint 2 changelog)
- 🔲 P0-4: Pilot 3 máy 3 ngày
- 🔲 (Optional) P1-1: HTTPS Caddy

### Sau go-live tuần đầu:
- 🔲 P1-2: Active user list
- 🔲 P1-3: Auto-update repo
- 🔲 P1-4: SSE event stream (replace polling)

### Roadmap v1.3+:
- 🔲 P2-1 → P2-4

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Server crash | Low | All users blocked | NSSM/launchd auto-restart + backup |
| Disk full | Medium | Save fails silent | Monitor `df -h` weekly + log retention 30d |
| TOTP key leak | Low | All 2FA broken | `.env` mode 600 + rotation runbook |
| Concurrent quote conflict | High (6 user team) | UX friction | P0-3 friendly conflict modal |
| Data corruption | Very Low | Rollback to backup | Daily atomic backup + verify-backup |
| Mạng LAN down giữa save | Medium | Save lost | P0-2 connection banner + retry hint |
| User quên password | High | Lock out | Admin reset via `npm run reset-totp` |
| Single point of failure (server) | High | All users blocked | Hot standby (defer to v1.3 — cần PostgreSQL replication) |

---

**Verdict cuối:** v1.2 sau khi P0-1/2/3 + pilot 3 máy = **Production-ready cho 6-user LAN deployment**. Caddy HTTPS + auto-update repo có thể làm tuần đầu sau go-live.
