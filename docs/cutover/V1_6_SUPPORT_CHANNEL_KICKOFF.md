# v1.6 Support Channel Kickoff · Khởi tạo kênh hỗ trợ

> Templates + checklist để mở Slack/Teams channel `#ops-control-v1-6-support` cho 30-day post-go-live monitoring window (2026-07-21 → 2026-08-19).

---

## ① Channel creation checklist · Tạo channel

### Slack

- [ ] Channel name: `#ops-control-v1-6-support`
- [ ] Type: Public (no PII shared — operator screenshots get cropped)
- [ ] Topic: `v1.6 go-live support · Henry on-call · Daily summary at 17:00 ICT`
- [ ] Description: `Bug reports, questions, drift verification. EN+VI both welcome.`
- [ ] Members: All CCL Vietnam Hai Duong operators + Hương + Plant Manager + Henry
- [ ] Reminders: `every weekday at 17:00, send "Daily v1.6 health snapshot" to channel`
- [ ] Auto-archive: 2026-08-21 (30 days after go-live + 2-day grace)

### Teams (alternative)

- [ ] Team: "CCL Vietnam Hai Duong"
- [ ] Channel: `Ops Control v1.6 Support`
- [ ] Privacy: Standard (visible to team)
- [ ] Connectors: None needed (manual updates)
- [ ] Tab: pin [V1_6_OPERATOR_CHEATSHEET.md](./V1_6_OPERATOR_CHEATSHEET.md) for quick access

---

## ② Pinned welcome post · Bài ghim đầu channel

### 🇻🇳 Vietnamese

```
👋 Chào mừng vào kênh hỗ trợ Ops Control v1.6!

📅 Cửa sổ giám sát: 2026-07-21 → 2026-08-19 (30 ngày)
👤 On-call: Henry Dang (Đặng Thế Thiệp)
⏰ Daily summary: 17:00 ICT mỗi ngày làm việc

📝 Khi báo bug, vui lòng kèm:
  • Tên quote (RFQ hoặc internal ID)
  • Tab + sub-tab đang ở
  • Screenshot (CROP customer name + tier pricing trước khi paste)
  • Behavior thấy vs behavior kỳ vọng
  • Operator account đang dùng
  • Build role: SERVER hay CLIENT (xem Settings → About)

🚫 Mức độ:
  🔴 P0 = save/export failing, app crash, cost calc sai → ping Henry trực tiếp + post channel
  🟠 P1 = UX bug, slow load, missing data → post channel
  🟡 P2 = enhancement, "nice to have" → post channel với prefix "[ENH]"

📋 Cheatsheet (xem trước khi hỏi):
  → [V1_6_OPERATOR_CHEATSHEET.md]

📖 Tài liệu đầy đủ:
  • Operator: [PRICING_SNAPSHOT_OPERATOR_GUIDE.md]
  • Admin: [PRICING_SNAPSHOT_ADMIN_GUIDE.md]
```

### 🇬🇧 English

```
👋 Welcome to Ops Control v1.6 support channel!

📅 Monitoring window: 2026-07-21 → 2026-08-19 (30 days)
👤 On-call: Henry Dang
⏰ Daily summary: 17:00 ICT every weekday

📝 When reporting a bug, please include:
  • Quote name (RFQ or internal ID)
  • Tab + sub-tab where you are
  • Screenshot (CROP customer name + tier pricing before pasting)
  • Behavior seen vs expected
  • Operator account in use
  • Build role: SERVER or CLIENT (see Settings → About)

🚫 Severity:
  🔴 P0 = save/export failing, app crash, wrong cost calc → ping Henry directly + post channel
  🟠 P1 = UX bug, slow load, missing data → post channel
  🟡 P2 = enhancement, "nice to have" → post channel with [ENH] prefix

📋 Cheatsheet (check before asking):
  → [V1_6_OPERATOR_CHEATSHEET.md]

📖 Full docs:
  • Operator: [PRICING_SNAPSHOT_OPERATOR_GUIDE.md]
  • Admin: [PRICING_SNAPSHOT_ADMIN_GUIDE.md]
```

---

## ③ Daily summary template · Template summary hàng ngày

Send mỗi ngày 17:00 ICT (Slack scheduled message HOẶC manual).

### 🇻🇳

```
📊 Daily v1.6 health · {{date}}

✅ Quotes saved hôm nay: {{N}}
   (Frozen: {{N_frozen}} · Live rates resaved: {{N_resaved}} · Empty: {{N_empty}})
🔔 Warnings:
   • site_mismatch: {{N_site}}
   • lib_drift: {{N_drift}}
🚨 Bugs reported: {{N_bugs}} (P0: {{p0}} · P1: {{p1}} · P2: {{p2}})
📈 /metrics tổng tích lũy:
   • Total saves từ go-live: {{cumulative_total}}
   • Synth save rate (alarm signal): {{synth_pct}}%

🔍 Lưu ý:
   • {{any notable item — empty if nothing}}

Mở vấn đề?
   • {{open bug 1 — assigned to / ETA}}
   • {{open bug 2}}
```

### 🇬🇧

```
📊 Daily v1.6 health · {{date}}

✅ Quotes saved today: {{N}}
   (Frozen: {{N_frozen}} · Live rates resaved: {{N_resaved}} · Empty: {{N_empty}})
🔔 Warnings:
   • site_mismatch: {{N_site}}
   • lib_drift: {{N_drift}}
🚨 Bugs reported: {{N_bugs}} (P0: {{p0}} · P1: {{p1}} · P2: {{p2}})
📈 /metrics cumulative since go-live:
   • Total saves: {{cumulative_total}}
   • Synth save rate (alarm signal): {{synth_pct}}%

🔍 Notes:
   • {{any notable item — empty if nothing}}

Open issues?
   • {{open bug 1 — assigned to / ETA}}
   • {{open bug 2}}
```

**Pull numbers from**:

```bash
curl http://10.102.3.61:3100/metrics | grep pricing_snapshot_
```

---

## ④ Bug report template · Template báo bug

Operator paste vào channel. Auto-formatter friendly.

```
🐛 Bug report

Severity · Mức độ: [P0/P1/P2]
Quote · Báo giá: RFQ-XXXX-XXXX (mask customer name)
Tab: [Pricing Std / Cpx / Quote History / Summarize / NPI Parts List / Settings / ...]
Operator: [your username]
Build role · Vai trò: [SERVER / CLIENT]   ← Settings → About
v1.6 build SHA: [from Settings → About]

What happened · Hiện tượng:
[Describe what you saw — 1-2 sentences]

What you expected · Mong đợi:
[What should have happened]

Steps to reproduce · Tái hiện:
1. [step 1]
2. [step 2]
3. [step 3]

Screenshot · Ảnh:
[Attach — CROP customer name + tier pricing first]

Workaround · Cách lách:
[If you found one, otherwise leave blank]
```

---

## ⑤a Known recovery paths · Các đường khôi phục đã biết

Self-serve before pinging Henry — these fixes are baked into v1.6 and the operator can recover without code changes.

### CLIENT DMG: "loadURL failed" / setup wizard can't reach SERVER

**🇻🇳** Trong dialog hiện ra:

- **DÙNG**: nút **"Chạy lại setup wizard"** → wizard mở lại để nhập URL SERVER. CLIENT vẫn ở thin mode.
- **TUYỆT ĐỐI KHÔNG dùng**: nút "Reset về Embedded" → nút này dành cho SERVER build (sẽ silent flip CLIENT thành embedded + tạo phantom local server, ẩn lỗi mạng thật).

**🇬🇧** In the recovery dialog:

- **USE**: **"Chạy lại setup wizard"** button → wizard reopens to re-enter SERVER URL. CLIENT stays in thin mode.
- **DO NOT USE**: "Reset to Embedded" button → that button is for SERVER builds (silently flips CLIENT to embedded + spawns phantom local server, hides real network issues).

**Reference**: Sprint S-DESKTOP-HMAC (PR #132).

### First-install CLIENT login fails after admin creation

`OPS_EXPORT_HMAC_KEY` is now **auto-generated** on first run (64-hex via `crypto.randomBytes`) + persisted to `electron-store`. Operator should NOT need to set it manually. If login still fails:

1. Confirm Settings → About shows `BUILD_ROLE: CLIENT` + `mode: thin` (NOT embedded).
2. If mode = embedded on a CLIENT install → operator hit the dialog flip bug above → reinstall CLIENT DMG.
3. Otherwise → P1 bug report.

**Reference**: Sprint S-DESKTOP-HMAC (PR #132).

### Setup wizard "Failed to fetch" when testing SERVER connection

v1.6 routes the wizard probe through main process (`/__probe__` sentinel) instead of renderer `fetch()` to bypass the data-URL null-origin CORS block. If operator still sees "Failed to fetch":

1. Confirm SERVER URL is reachable from a regular browser (Safari) on the CLIENT Mac.
2. Confirm SERVER `/health` endpoint returns 200.
3. Otherwise → P1 bug report with build SHA + CLIENT macOS log excerpt.

**Reference**: Sprint S-WIZARD-CORS (PR #133).

### CLIENT app bricks at boot with `ERR_INVALID_URL`

If operator closed the setup wizard without saving on a previous run, v1.6's defensive guard at boot detects the invalid state (`firstRunCompleted=true && thin && remoteUrl===''`) + auto-resets the flag to re-open the wizard. No operator action needed beyond re-running the wizard.

**Reference**: Sprint S-WIZARD-CORS (PR #133).

---

## ⑤ Henry's response cadence · Tần suất Henry trả lời

| Severity | Response                                                                           | Resolution target                         |
| -------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| 🔴 P0    | ≤15 min trong giờ làm việc (08:00-18:00 ICT) · Within 15 min during business hours | ≤2h cho hot-fix release · ≤2h for hot-fix |
| 🟠 P1    | ≤2h trong ngày làm việc · Within 2h on business days                               | ≤2 ngày làm việc · ≤2 business days       |
| 🟡 P2    | ≤1 ngày làm việc · ≤1 business day                                                 | v1.6.1 patch batch (2026-08-01 nếu cần)   |

After-hours (18:00-08:00 ICT): chỉ P0 ping Henry phone. P1/P2 đợi sáng.

After-hours (18:00-08:00 ICT): P0 only ping Henry phone. P1/P2 wait until morning.

---

## ⑥ Weekly review template · Review hàng tuần

Mỗi thứ Hai, post tổng kết tuần trước.

```
📊 v1.6 weekly recap · Week of {{week_start}}

📈 Activity:
  • Total saves this week: {{N}}
  • Daily average: {{avg}}
  • Operators active: {{N_ops}}

🐛 Bugs:
  • Filed: {{filed}}
  • Closed: {{closed}}
  • Open: {{open}}
  • Top filer · Người báo nhiều nhất: {{name}} ({{count}})

🟡 Synth rate trend:
  • Mon: {{m}}% · Tue: {{tu}}% · Wed: {{w}}% · Thu: {{th}}% · Fri: {{f}}%
  • Trend: {{rising/falling/stable}} — {{interpretation}}

🔥 Hottest scenarios:
  • {{Site mismatches: count + which sites}}
  • {{Copy quote attempts: count}}

📌 Action items next week:
  • {{item 1}}
  • {{item 2}}
```

---

## ⑦ End-of-window archive · Đóng channel

2026-08-19 (Day +30 from go-live):

- [ ] Post final summary: total saves, total bugs filed, total closed, deferred to v1.6.1.
- [ ] Pin: link to v1.6.1 patch plan (if applicable).
- [ ] Schedule auto-archive 48h later.
- [ ] Migrate ongoing P1/P2 to permanent `#ops-control-general` channel.

---

**Last updated · Cập nhật cuối**: 2026-06-11 (Phase 6 / Day 6-7 deliverable)
